/**
 * ERA Google Drive Sync
 *
 * Monitors a SQLite file inside the user's Google Drive folder.
 * Google Drive's desktop client handles the actual cloud sync transparently.
 * This module watches the local file for changes and notifies the renderer.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const chokidar = require('chokidar');

const ERA_DB_FILENAME = 'era_ledger.sqlite';

/**
 * Detect the local Google Drive root on macOS or Windows.
 * @returns {string|null}
 */
function detectGoogleDrivePath() {
  const home = os.homedir();

  // macOS: new Google Drive client mounts under ~/Library/CloudStorage/GoogleDrive-<email>
  const cloudStorage = path.join(home, 'Library', 'CloudStorage');
  if (fs.existsSync(cloudStorage)) {
    try {
      const entries = fs.readdirSync(cloudStorage);
      for (const entry of entries) {
        if (entry.startsWith('GoogleDrive-')) {
          const myDrivePath = path.join(cloudStorage, entry, 'My Drive');
          if (fs.existsSync(myDrivePath)) return myDrivePath;
          return path.join(cloudStorage, entry);
        }
      }
    } catch (_) {}
  }

  // macOS: legacy Google Drive streaming
  const legacyMac = path.join(home, 'Google Drive', 'My Drive');
  if (fs.existsSync(legacyMac)) return legacyMac;
  if (fs.existsSync(path.join(home, 'Google Drive'))) return path.join(home, 'Google Drive');

  // Windows typical paths
  const winCandidates = [
    path.join(home, 'Google Drive'),
    'C:\\Users\\' + os.userInfo().username + '\\Google Drive',
    path.join(home, 'My Drive'),
  ];
  for (const c of winCandidates) {
    if (fs.existsSync(c)) return c;
  }

  return null;
}

/**
 * Get (or create) the ERA Accounting subfolder inside Google Drive.
 * @param {string} drivePath  Root of the Google Drive folder
 * @returns {string}  Path to the ERA folder
 */
function getEraDriveFolder(drivePath) {
  const eraDir = path.join(drivePath, 'ERA Accounting');
  if (!fs.existsSync(eraDir)) {
    fs.mkdirSync(eraDir, { recursive: true });
  }
  return eraDir;
}

/**
 * DriveSync manages watching a SQLite file and triggering UI refreshes.
 */
class DriveSync {
  constructor() {
    this._watcher = null;
    this._onChange = null;
    this._watchedPath = null;
  }

  /**
   * Start watching a SQLite file.
   * @param {string} sqlitePath  Absolute path to the .sqlite file
   * @param {Function} onChange  Callback when the file changes: (path) => void
   */
  watch(sqlitePath, onChange) {
    this.stop();
    this._watchedPath = sqlitePath;
    this._onChange = onChange;

    this._watcher = chokidar.watch(sqlitePath, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 600, pollInterval: 100 },
    });

    this._watcher.on('change', () => {
      if (this._onChange) this._onChange(sqlitePath);
    });
  }

  /**
   * Stop any active file watcher.
   */
  stop() {
    if (this._watcher) {
      this._watcher.close();
      this._watcher = null;
    }
  }

  get watchedPath() { return this._watchedPath; }
}

module.exports = { detectGoogleDrivePath, getEraDriveFolder, DriveSync, ERA_DB_FILENAME };
