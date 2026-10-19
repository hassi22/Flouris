/**
 * googleDriveService.js — Flouris ERP Mobile (bare RN)
 * Google Drive REST API via native Google Sign-In SDK.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

// ── OAuth config ──────────────────────────────────────────────────────────────
// Web client ID (used by the SDK to request an ID token / offline access).
const WEB_CLIENT_ID =
  '428686801277-nsvmtnfaj747lomev9r65res0cav3d5v.apps.googleusercontent.com';

// iOS client ID — fill in after creating the iOS OAuth client in Console.
const IOS_CLIENT_ID = 'REPLACE_WITH_IOS_CLIENT_ID.apps.googleusercontent.com';

const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
];

const ERA_FOLDER_NAME = 'ERA Accounting';

const KEYS = {
  USER_INFO: '@flouris/gdrive_user_info',
  FILE_MAP:  '@flouris/gdrive_file_map', // { [filename]: driveFileId }
};

const DRIVE_API  = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

let _configured = false;

function configureOnce() {
  if (_configured) return;
  GoogleSignin.configure({
    webClientId: WEB_CLIENT_ID,
    iosClientId: IOS_CLIENT_ID,
    scopes: SCOPES,
    offlineAccess: true, // lets you get a serverAuthCode if you ever add a backend
  });
  _configured = true;
}

// ── Token access ──────────────────────────────────────────────────────────────
export async function getStoredToken() {
  configureOnce();
  try {
    const hasPrev = await GoogleSignin.hasPreviousSignIn();
    if (!hasPrev) return null;
    const { accessToken } = await GoogleSignin.getTokens();
    return accessToken || null;
  } catch {
    return null;
  }
}

export async function isSignedIn() {
  configureOnce();
  try {
    return await GoogleSignin.hasPreviousSignIn();
  } catch {
    return false;
  }
}

// ── signIn ────────────────────────────────────────────────────────────────────
/**
 * Runs the native Google Sign-In flow and returns { success, error? }.
 * No WebView, no redirect URI, no PKCE bookkeeping needed.
 */
export async function signIn() {
  configureOnce();
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const userInfo = await GoogleSignin.signIn();
    if (userInfo?.data?.user) {
      await AsyncStorage.setItem(KEYS.USER_INFO, JSON.stringify(userInfo.data.user));
    }
    return { success: true };
  } catch (e) {
    if (e.code === 'SIGN_IN_CANCELLED' || e.code === '-5') {
      return { success: false, error: 'Sign-in cancelled by user' };
    }
    return { success: false, error: e.message || 'Sign-in failed' };
  }
}

export async function clearTokens() {
  try {
    await GoogleSignin.signOut();
  } catch (_) {}
  await AsyncStorage.removeItem(KEYS.USER_INFO);
}

// ── Drive API helper ──────────────────────────────────────────────────────────
async function driveGet(endpoint, params = {}) {
  const token = await getStoredToken();
  if (!token) throw new Error('Not signed in to Google Drive');
  const url = new URL(DRIVE_API + endpoint);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) { const e = await res.text(); throw new Error(`Drive ${res.status}: ${e}`); }
  return res.json();
}

// ── Lightweight metadata check (for polling) ──────────────────────────────────
// Cheap single-file check: just id + modifiedTime, no download, no folder list.
// Safe to call frequently (e.g. every 10-15s) while a screen is focused.
export async function getFileMetadata(fileId) {
  try {
    const data = await driveGet(`/files/${fileId}`, { fields: 'id,modifiedTime,size' });
    return { success: true, modified: data.modifiedTime, size: data.size };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── Look up which Drive file a local filename came from (for polling) ─────────
export async function getFileIdForFilename(filename) {
  try {
    const raw = await AsyncStorage.getItem(KEYS.FILE_MAP);
    const map = raw ? JSON.parse(raw) : {};
    return map[filename] || null;
  } catch {
    return null;
  }
}

// ── ERA Accounting folder ─────────────────────────────────────────────────────
export async function getOrCreateEraFolder() {
  const data = await driveGet('/files', {
    q:      `name='${ERA_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id,name)',
  });
  if (data.files?.length > 0) return data.files[0].id;
  const token = await getStoredToken();
  const res   = await fetch(`${DRIVE_API}/files`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ name: ERA_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
  });
  const folder = await res.json();
  if (!folder.id) throw new Error('Failed to create ERA Accounting folder in Drive');
  return folder.id;
}

// ── List Drive databases ──────────────────────────────────────────────────────
export async function listDrivedatabases() {
  try {
    const folderId = await getOrCreateEraFolder();
    const data     = await driveGet('/files', {
      q:       `'${folderId}' in parents and name contains '.sqlite' and trashed=false`,
      fields:  'files(id,name,size,modifiedTime)',
      orderBy: 'modifiedTime desc',
    });
    return (data.files || []).map(f => ({
      id: f.id, name: f.name.replace('.sqlite', ''), filename: f.name,
      source: 'google-drive', size: f.size, modified: f.modifiedTime,
    }));
  } catch (e) { console.warn('listDrivedatabases:', e.message); return []; }
}

// ── Download from Drive ───────────────────────────────────────────────────────
// SQLite files always begin with this 16-byte magic header.
const SQLITE_MAGIC = 'SQLite format 3\u0000';

export async function downloadDatabaseFromDrive(fileId, filename) {
  const destDir  = RNFS.DocumentDirectoryPath + '/databases/';
  const destPath = destDir + filename;
  try {
    // 1. Fail fast if there's no usable token — otherwise RNFS.downloadFile
    //    will happily "succeed" while writing a 401 error body to disk.
    const token = await getStoredToken();
    if (!token) {
      return { success: false, error: 'Not signed in to Google Drive. Please sign in again.' };
    }

    await RNFS.mkdir(destDir).catch(() => {});

    // 2. RNFS.downloadFile does NOT reject on HTTP error status codes
    //    (401/403/404) — it only rejects on network-level failures. We must
    //    check statusCode ourselves.
    const { statusCode } = await RNFS.downloadFile({
      fromUrl: `${DRIVE_API}/files/${fileId}?alt=media`,
      toFile:  destPath,
      headers: { Authorization: `Bearer ${token}` },
    }).promise;

    if (statusCode !== 200) {
      await RNFS.unlink(destPath).catch(() => {});
      if (statusCode === 401 || statusCode === 403) {
        return { success: false, error: 'Google Drive session expired. Please sign in again.' };
      }
      if (statusCode === 404) {
        return { success: false, error: 'File not found on Google Drive (it may have been deleted or moved).' };
      }
      return { success: false, error: `Drive download failed (HTTP ${statusCode}).` };
    }

    // 3. Belt-and-braces: confirm what we wrote is actually a SQLite file,
    //    not an HTML/JSON error page that slipped through with a 200.
    const header = await RNFS.read(destPath, SQLITE_MAGIC.length, 0, 'ascii').catch(() => '');
    if (header !== SQLITE_MAGIC) {
      await RNFS.unlink(destPath).catch(() => {});
      return { success: false, error: 'Downloaded file is not a valid database. Please try again.' };
    }

    // Remember which Drive file this local filename came from, so polling
    // (useDriveSync) can look up the fileId later without another folder listing.
    try {
      const raw = await AsyncStorage.getItem(KEYS.FILE_MAP);
      const map = raw ? JSON.parse(raw) : {};
      map[filename] = fileId;
      await AsyncStorage.setItem(KEYS.FILE_MAP, JSON.stringify(map));
    } catch (_) {}

    return { success: true, localPath: destPath };
  } catch (e) {
    await RNFS.unlink(destPath).catch(() => {});
    return { success: false, error: e.message || 'Download failed' };
  }
}

// ── Upload to Drive ───────────────────────────────────────────────────────────
export async function uploadDatabaseToDrive(localPath, filename, existingFileId = null) {
  try {
    const token       = await getStoredToken();
    const folderId    = await getOrCreateEraFolder();
    const fileContent = await RNFS.readFile(localPath, 'base64');
    const metadata    = {
      name: filename, mimeType: 'application/octet-stream',
      ...(existingFileId ? {} : { parents: [folderId] }),
    };
    const boundary = '-------314159265358979323846';
    const body =
      `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
      JSON.stringify(metadata) +
      `\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\nContent-Transfer-Encoding: base64\r\n\r\n` +
      fileContent +
      `\r\n--${boundary}--`;
    const url = existingFileId
      ? `${UPLOAD_API}/files/${existingFileId}?uploadType=multipart`
      : `${UPLOAD_API}/files?uploadType=multipart`;
    const res = await fetch(url, {
      method:  existingFileId ? 'PATCH' : 'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary="${boundary}"`,
      },
      body,
    });
    if (!res.ok) { const e = await res.text(); return { success: false, error: `Upload ${res.status}: ${e}` }; }
    const data = await res.json();
    return { success: true, fileId: data.id };
  } catch (e) { return { success: false, error: e.message }; }
}

// ── Sync local DB → Drive ─────────────────────────────────────────────────────
export async function syncDatabaseToDrive(localDbName) {
  try {
    const candidates = [
      RNFS.DocumentDirectoryPath + '/databases/' + localDbName,
      RNFS.DocumentDirectoryPath + '/' + localDbName,
    ];
    let localPath = null;
    for (const c of candidates) {
      if (await RNFS.exists(c).catch(() => false)) { localPath = c; break; }
    }
    if (!localPath) return { success: false, error: 'Local database file not found' };
    const dbs      = await listDrivedatabases();
    const existing = dbs.find(d => d.filename === localDbName);
    return uploadDatabaseToDrive(localPath, localDbName, existing?.id || null);
  } catch (e) { return { success: false, error: e.message }; }
}

// ── User info ─────────────────────────────────────────────────────────────────
export async function getUserInfo() {
  try {
    const raw = await AsyncStorage.getItem(KEYS.USER_INFO);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}