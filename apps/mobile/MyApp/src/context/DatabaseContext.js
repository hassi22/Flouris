/**
 * DatabaseContext.js — Flouris ERP Mobile (bare RN)
 * Global state: current database, list of databases, notifications, prefs.
 * Uses react-native-fs instead of expo-file-system.
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';
import { listLocalDatabases, validateAndOpenDb, getCompanyInfo, closeDb } from '../services/sqliteService';
import { listDrivedatabases, isSignedIn, getFileIdForFilename } from '../services/googleDriveService';
import { useDriveSync } from '../hooks/useDriveSync';

const DatabaseContext = createContext(null);
const PREFS_KEY = '@flouris/prefs';

export function DatabaseProvider({ children }) {
  const [databases,     setDatabases]     = useState([]);
  const [currentDb,     setCurrentDb]     = useState(null);
  const [dbInfo,        setDbInfo]        = useState(null);
  const [companyInfo,   setCompanyInfo]   = useState({});
  const [loading,       setLoading]       = useState(false);
  const [notification,  setNotification]  = useState(null);
  const [prefs,         setPrefsState]    = useState({});
  const [driveSignedIn, setDriveSignedIn] = useState(false);
  const [currentDriveFileId, setCurrentDriveFileId] = useState(null);

  const currentDbRef = useRef(currentDb);
  useEffect(() => { currentDbRef.current = currentDb; }, [currentDb]);

  // ── Load prefs on mount ───────────────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(PREFS_KEY)
      .then(v => v ? setPrefsState(JSON.parse(v)) : null)
      .catch(() => {});
    isSignedIn().then(setDriveSignedIn).catch(() => {});
  }, []);

  // ── Notification helper ───────────────────────────────────────────────────
  const showNotification = useCallback((message, type = 'info') => {
    setNotification({ message, type, id: Date.now() });
    setTimeout(() => setNotification(null), 4000);
  }, []);

  // ── Save prefs ────────────────────────────────────────────────────────────
  const savePrefs = useCallback(async (newPrefs) => {
    const merged = { ...prefs, ...newPrefs };
    setPrefsState(merged);
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(merged)).catch(() => {});
  }, [prefs]);

  // ── Select / open a database ──────────────────────────────────────────────
  const selectDatabase = useCallback(async (dbName) => {
    if (!dbName) return;
    setLoading(true);
    try {
      const result = await validateAndOpenDb(dbName);
      if (result.success) {
        setCurrentDb(dbName);
        setDbInfo({ ...result, lastRefresh: Date.now() });
        const ci = await getCompanyInfo(dbName);
        setCompanyInfo(ci.data || {});
        // Look up whether this file was downloaded from Drive, so the
        // background poller (useDriveSync) knows which fileId to watch.
        // Not every local DB will have one (e.g. locally-created DBs never synced).
        const fileId = await getFileIdForFilename(dbName).catch(() => null);
        setCurrentDriveFileId(fileId);
        showNotification(`Opened: ${dbName.replace('.sqlite', '')}`, 'success');
      } else {
        showNotification(`Error: ${result.error}`, 'error');
      }
    } catch (err) {
      showNotification(`Failed to open: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  const activateDatabase = useCallback((dbName, info = {}) => {
    if (!dbName) return;
    setCurrentDb(dbName);
    setDbInfo({ success: true, dbName, lastRefresh: Date.now() });
    setCompanyInfo(info);
  }, []);

  // ── Refresh db info (e.g. after sync) ─────────────────────────────────────
  const refreshDb = useCallback(() => {
    if (currentDbRef.current) {
      setDbInfo(prev => ({ ...prev, lastRefresh: Date.now() }));
    }
  }, []);

  // ── Load all databases (local + Drive) ────────────────────────────────────
  const loadDatabases = useCallback(async () => {
    try {
      const local  = await listLocalDatabases();
      let drive    = [];
      const signed = await isSignedIn();
      setDriveSignedIn(signed);
      if (signed) {
        drive = await listDrivedatabases().catch(() => []);
      }
      const all = [...local, ...drive];
      setDatabases(all);
      // Auto-select first local DB if none open
      if (!currentDbRef.current && local.length > 0) {
        await selectDatabase(local[0].filename || local[0].name + '.sqlite');
      }
      return all;
    } catch (err) {
      console.warn('loadDatabases error:', err);
      return [];
    }
  }, [selectDatabase]);

  // ── Load on mount ─────────────────────────────────────────────────────────
  useEffect(() => { loadDatabases(); }, []); // eslint-disable-line

  // ── Background poll: pick up Electron-side changes from Drive ────────────
  // Only watches the currently-open DB, and only when it's known to have
  // come from Drive (currentDriveFileId is set). Silent unless something
  // actually changes; safe no-op otherwise.
  const handleDriveUpdate = useCallback(async () => {
    if (!currentDbRef.current) return;
    // Release the existing op-sqlite handle before the underlying file was
    // overwritten by the poller's download, so the reopen gets a clean handle
    // rather than one pointing at now-stale/replaced file data.
    closeDb(currentDbRef.current);
    await selectDatabase(currentDbRef.current);
    showNotification('Database updated from Google Drive', 'info');
  }, [selectDatabase, showNotification]);

  const handleDriveSyncError = useCallback((error) => {
    // Keep this quiet by default — a transient network blip every 12s
    // shouldn't spam the user. Surface only if you want to debug.
    console.warn('Drive sync check failed:', error);
  }, []);

  useDriveSync({
    enabled:     driveSignedIn && !!currentDb && !!currentDriveFileId,
    driveFileId: currentDriveFileId,
    filename:    currentDb,
    onUpdated:   handleDriveUpdate,
    onError:     handleDriveSyncError,
  });

  const value = {
    databases, currentDb, dbInfo, companyInfo, loading, notification,
    prefs, driveSignedIn, currentDriveFileId,
    setDriveSignedIn, showNotification, savePrefs, selectDatabase,
    loadDatabases, refreshDb, activateDatabase,
  };

  return (
    <DatabaseContext.Provider value={value}>
      {children}
    </DatabaseContext.Provider>
  );
}

export function useDatabase() {
  return useContext(DatabaseContext);
}