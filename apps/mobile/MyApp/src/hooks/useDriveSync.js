/**
 * useDriveSync.js — Flouris ERP Mobile (bare RN)
 *
 * Polls Google Drive for changes to the currently-open database and
 * silently re-downloads + reloads it when Drive has a newer version.
 * Gives a "feels real-time" experience (10-15s lag) without a backend.
 *
 * Usage (inside DatabaseContext, where currentDb / selectDatabase live):
 *
 *   useDriveSync({
 *     enabled: driveSignedIn && !!currentDb,
 *     driveFileId: currentDriveFileId,       // Drive file id for currentDb, if known
 *     filename: currentDb,                   // e.g. "SFMDB.sqlite"
 *     onUpdated: async () => {
 *       closeDb(currentDb);                  // op-sqlite must release the old handle first
 *       await selectDatabase(currentDb);      // re-open the freshly downloaded file
 *       loadStats?.();                        // refresh whatever screen data depends on it
 *     },
 *   });
 *
 * Notes:
 * - Only polls while `enabled` is true — pass false when the app is
 *   backgrounded or no DB is open, to avoid wasting API calls / battery.
 * - Uses getFileMetadata (cheap: id + modifiedTime only) every poll tick,
 *   and only calls downloadDatabaseFromDrive when modifiedTime actually
 *   changed — so most ticks cost a single tiny Drive API call.
 * - Any in-flight local write should finish before onUpdated swaps the
 *   file; if your app allows local edits mixed with Drive sync, you'll
 *   want to gate this against "dirty" local state — see note at bottom.
 */

import { useEffect, useRef, useCallback } from 'react';
import { AppState } from 'react-native';
import { getFileMetadata, downloadDatabaseFromDrive } from '../services/googleDriveService';

const POLL_INTERVAL_MS = 12000; // 12s — a reasonable balance of "feels live" vs API usage

export function useDriveSync({ enabled, driveFileId, filename, onUpdated, onError }) {
  const lastModifiedRef = useRef(null);
  const timerRef        = useRef(null);
  const inFlightRef     = useRef(false);
  const appStateRef     = useRef(AppState.currentState);

  const checkOnce = useCallback(async () => {
    if (!enabled || !driveFileId || !filename) return;
    if (inFlightRef.current) return; // don't overlap checks
    inFlightRef.current = true;
    try {
      const meta = await getFileMetadata(driveFileId);
      if (!meta.success) {
        onError?.(meta.error);
        return;
      }
      // First check after mount/focus: just record the baseline, don't re-download
      // (we assume the currently-open local copy matches what's on Drive already).
      if (lastModifiedRef.current === null) {
        lastModifiedRef.current = meta.modified;
        return;
      }
      if (meta.modified && meta.modified !== lastModifiedRef.current) {
        const result = await downloadDatabaseFromDrive(driveFileId, filename);
        if (result.success) {
          lastModifiedRef.current = meta.modified;
          await onUpdated?.();
        } else {
          // Download failed validation (see googleDriveService fix) — surface it,
          // but don't update lastModifiedRef so we retry on the next tick.
          onError?.(result.error);
        }
      }
    } finally {
      inFlightRef.current = false;
    }
  }, [enabled, driveFileId, filename, onUpdated, onError]);

  useEffect(() => {
    // Reset baseline whenever we switch to a different file.
    lastModifiedRef.current = null;
  }, [driveFileId, filename]);

  useEffect(() => {
    if (!enabled) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    checkOnce(); // establish baseline / catch changes immediately on enable
    timerRef.current = setInterval(checkOnce, POLL_INTERVAL_MS);

    // Pause polling while app is backgrounded; re-check immediately on foreground.
    const sub = AppState.addEventListener('change', (next) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if (prev.match(/inactive|background/) && next === 'active') {
        checkOnce();
      }
    });

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      sub.remove();
    };
  }, [enabled, checkOnce]);
}

/**
 * IMPORTANT — local-write conflict note:
 * This hook assumes the phone is a READ-ONLY consumer of the synced database
 * (Electron is the source of truth). If the mobile app can also create/edit
 * vouchers locally before they're synced back to Drive, silently overwriting
 * the local file out from under an in-progress edit will lose that edit.
 * In that case, gate onUpdated behind a "no unsaved local changes" check,
 * or queue the incoming update until the user finishes their current screen.
 */
