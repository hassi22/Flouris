/**
 * ERA Accounting – Electron Main Process
 * Schema-adaptive: handles Inv/Inv1, T/T1, various tblAccHead layouts
 */

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path     = require('path');
const fs       = require('fs');
const os       = require('os');
const crypto   = require('crypto');
const Database = require('better-sqlite3');
const { DriveSync } = require('./driveSync');

// ── Accounting constants ──────────────────────────────────────────────────────
// NOTE: CASH_ACCOUNT / PURCHASE_ACCOUNT / SALES_ACCOUNT constants have been
// intentionally removed. Account identity is now always driven by the explicit
// party/party2 fields on each voucher line, optionally guided by Role tags
// ('cash', 'purchase', 'sales') stored in the AC table.
// The only remaining constants are the five tblAccHead head IDs.
const HEAD_CAPITAL     = 1;
const HEAD_LIABILITIES = 2;
const HEAD_ASSETS      = 3;
const HEAD_INCOME      = 4;
const HEAD_EXPENSES    = 5;

// ── Globals ───────────────────────────────────────────────────────────────────
let mainWindow    = null;
const driveSync   = new DriveSync();
let currentDbPath = null;
const isDev       = !app.isPackaged;

// ── Persistent store for user prefs (Google Drive path etc.) ─────────────────
const PREFS_FILE = path.join(app.getPath('userData'), 'era_prefs.json');
function loadPrefs() {
  try { return JSON.parse(fs.readFileSync(PREFS_FILE, 'utf8')); } catch { return {}; }
}
function savePrefs(prefs) {
  fs.writeFileSync(PREFS_FILE, JSON.stringify(prefs, null, 2));
}

// ── Password hashing helpers (using crypto.scrypt) ────────────────────────────
// Format stored: "scrypt:salt:hash" (all hex)
function hashPassword(plaintext) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(plaintext, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}
function verifyPasswordHash(plaintext, stored) {
  try {
    const [scheme, salt, hash] = stored.split(':');
    if (scheme !== 'scrypt') return false;
    const derived = crypto.scryptSync(plaintext, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(derived, 'hex'));
  } catch { return false; }
}

// Per-session unlocked databases: Set of dbPaths
const unlockedDbs = new Set();

// ── Google Drive detection ────────────────────────────────────────────────────
function detectGoogleDrivePath() {
  // 1. User-saved manual override
  const prefs = loadPrefs();
  if (prefs.googleDrivePath && fs.existsSync(prefs.googleDrivePath)) {
    return prefs.googleDrivePath;
  }

  const home = os.homedir();

  // 2. macOS new Google Drive client: ~/Library/CloudStorage/GoogleDrive-*/My Drive
  const cloudStorage = path.join(home, 'Library', 'CloudStorage');
  if (fs.existsSync(cloudStorage)) {
    try {
      const entries = fs.readdirSync(cloudStorage);
      for (const entry of entries) {
        if (entry.startsWith('GoogleDrive-')) {
          const myDrive = path.join(cloudStorage, entry, 'My Drive');
          if (fs.existsSync(myDrive)) return myDrive;
          return path.join(cloudStorage, entry);
        }
      }
    } catch (_) {}
  }

  // 3. Legacy macOS paths
  for (const p of [
    path.join(home, 'Google Drive', 'My Drive'),
    path.join(home, 'Google Drive'),
    path.join(home, 'GoogleDrive'),
  ]) {
    if (fs.existsSync(p)) return p;
  }

  // 4. Windows
  const username = os.userInfo().username;
  for (const p of [
    `C:\\Users\\${username}\\Google Drive\\My Drive`,
    `C:\\Users\\${username}\\Google Drive`,
    path.join(home, 'Google Drive'),
  ]) {
    if (fs.existsSync(p)) return p;
  }

  return null;
}

// ── Schema detection helpers ──────────────────────────────────────────────────
/**
 * Returns the names of tables that actually exist in this DB.
 */
function getTables(db) {
  return new Set(
    db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name)
  );
}

/**
 * Returns the column names of a table.
 */
function getCols(db, table) {
  try {
    return db.prepare(`PRAGMA table_info("${table}")`).all().map(r => r.name);
  } catch { return []; }
}

function hasColumn(cols, names) {
  const norm = new Set((cols || []).map(c => String(c).toLowerCase()));
  return (names || []).some(name => norm.has(String(name).toLowerCase()));
}

function findColumn(cols, names) {
  const lower = (cols || []).map(c => String(c).toLowerCase());
  for (const name of names || []) {
    const idx = lower.indexOf(String(name).toLowerCase());
    if (idx >= 0) return (cols || [])[idx];
  }
  return null;
}

/**
 * Detect which transaction tables this DB uses.
 * Returns { invTable, tTable } – either 'Inv'/'T' or 'Inv1'/'T1'
 */
function detectTxTables(db) {
  const tables = getTables(db);
  const invTable = tables.has('Inv')  ? 'Inv'  : tables.has('Inv1') ? 'Inv1' : null;
  const tTable   = tables.has('T')    ? 'T'    : tables.has('T1')   ? 'T1'   : null;
  return { invTable, tTable };
}

/**
 * Detect which accounts table and columns to use.
 * Some DBs have AC with SubAccID, others have AC with PRTCODE hierarchy.
 * Returns { acTable, hasSub }
 */
function detectAcTable(db) {
  const tables = getTables(db);
  const acTable = tables.has('AC') ? 'AC' : null;
  if (!acTable) return { acTable: null, hasSub: false };
  const cols = getCols(db, 'AC');
  return { acTable, hasSub: hasColumn(cols, ['SubAccID', 'subAccID']) };
}

/**
 * Detect tblAccHead schema.
 * Variants:
 *  A) AccountID + AccountHead   (HDData, 2019-20)
 *  B) SubAccH_ID + SubAccHead   (SFMDB, SFMDB 24-25)
 *  C) missing                   (2020-21, 2022)
 */
function detectAccHeadSchema(db) {
  const tables = getTables(db);
  if (!tables.has('tblAccHead')) return { exists: false };
  const cols = getCols(db, 'tblAccHead');
  if (hasColumn(cols, ['AccountHead'])) return { exists: true, idCol: 'AccountID',  nameCol: findColumn(cols, ['AccountHead']) };
  if (hasColumn(cols, ['SubAccHead']))  return { exists: true, idCol: 'SubAccH_ID', nameCol: findColumn(cols, ['SubAccHead']) };
  return { exists: false };
}

/**
 * Build account metadata – works across all schema variants.
 * Returns array of { CA, AC_TITLE1, UAC_TITLE, headId, subName, headName }
 */
function buildAccountMeta(db) {
  const { acTable, hasSub } = detectAcTable(db);
  if (!acTable) return [];

  const acCols      = getCols(db, acTable);
  const hasUAC      = hasColumn(acCols, ['UAC_Title', 'UAC_TITLE', 'UAC Title']);
  const uacCol      = findColumn(acCols, ['UAC_Title', 'UAC_TITLE', 'UAC Title']);
  const accHeadInfo = detectAccHeadSchema(db);
  const tables      = getTables(db);
  const hasSubAcc   = tables.has('tblSubAcc');

  // --- Schema variant A/B: AC has SubAccID + tblSubAcc + tblAccHead ---
  if (hasSub && hasSubAcc && accHeadInfo.exists) {
    const subCols = getCols(db, 'tblSubAcc');
    const hasSubNameU = hasColumn(subCols, ['SubAccountNAmeU', 'SubAccountNAmeu', 'SubAccountNameU']);
    const subNameUCol = findColumn(subCols, ['SubAccountNAmeU', 'SubAccountNAmeu', 'SubAccountNameU']);
    const { idCol, nameCol } = accHeadInfo;

    try {
      return db.prepare(`
        SELECT AC.CA,
               TRIM(REPLACE(REPLACE(COALESCE(AC.AC_TITLE1,''),char(39)||char(39),''),char(39),'')) AS AC_TITLE1,
               ${uacCol ? `TRIM(REPLACE(REPLACE(COALESCE(AC.${uacCol},''),char(39)||char(39),''),char(39),'')) AS UAC_TITLE,` : "'',"}
               tblSubAcc.AccountID AS headId,
               TRIM(REPLACE(REPLACE(COALESCE(tblSubAcc.SubAccountNAme,''),char(39)||char(39),''),char(39),'')) AS subName,
               ${hasSubNameU && subNameUCol ? `TRIM(REPLACE(REPLACE(COALESCE(tblSubAcc.${subNameUCol},''),char(39)||char(39),''),char(39),'')) AS subNameU,` : "'',"}
               tblAccHead.${nameCol} AS headName
        FROM "${acTable}" AS AC
        LEFT JOIN tblSubAcc ON AC.SubAccID = tblSubAcc.SubAccID
        LEFT JOIN tblAccHead ON tblSubAcc.AccountID = tblAccHead.${idCol}
      `).all();
    } catch (_) {}
  }

  // --- Schema variant B: tblSubAcc has AccountHead column directly (SFMDB) ---
  if (hasSub && hasSubAcc) {
    const subCols = getCols(db, 'tblSubAcc');
    const hasAH = hasColumn(subCols, ['AccountHead', 'accounthead']);
    const ahCol = findColumn(subCols, ['AccountHead', 'accounthead']);
    try {
      return db.prepare(`
        SELECT AC.CA,
               TRIM(REPLACE(REPLACE(COALESCE(AC.AC_TITLE1,''),char(39)||char(39),''),char(39),'')) AS AC_TITLE1,
               ${uacCol ? `TRIM(REPLACE(REPLACE(COALESCE(AC.${uacCol},''),char(39)||char(39),''),char(39),'')) AS UAC_TITLE,` : "'',"}
               tblSubAcc.AccountID AS headId,
               TRIM(REPLACE(REPLACE(COALESCE(tblSubAcc.SubAccountNAme,''),char(39)||char(39),''),char(39),'')) AS subName,
               ${hasAH && ahCol ? `tblSubAcc.${ahCol} AS headName` : "'' AS headName"}
        FROM "${acTable}" AS AC
        LEFT JOIN tblSubAcc ON AC.SubAccID = tblSubAcc.SubAccID
      `).all();
    } catch (_) {}
  }

  // --- Schema variant C: AC has PRTCODE hierarchy (2020-21, 2022) ---
  // PRTCODE encodes the BS/PL classification via Step columns
  // BS=1 → Assets/Liabilities/Equity; PLA=1 → Income/Expense
  if (acCols.includes('PRTCODE')) {
    const hasBS  = acCols.includes('BS');
    const hasPLA = acCols.includes('PLA');
    try {
      return db.prepare(`
        SELECT CA,
               AC_TITLE1,
               ${uacCol ? `${uacCol} AS UAC_TITLE,` : "'',"}
               CASE
                 WHEN ${hasPLA ? 'PLA' : '0'} = 1 THEN 4
                 WHEN ${hasBS  ? 'BS'  : '0'} = 1 THEN 3
                 ELSE 0
               END AS headId,
               AC_TITLE1 AS subName,
               '' AS headName
        FROM "${acTable}"
      `).all();
    } catch (_) {}
  }

  // --- Fallback: just return accounts with no classification ---
  try {
    return db.prepare(`SELECT CA, AC_TITLE1, '' AS UAC_TITLE, 0 AS headId, '' AS subName, '' AS headName FROM "${acTable}"`).all();
  } catch { return []; }
}

/**
 * Get inv rows from the correct table pair, with date filtering.
 * Fetches both legacy columns (Account_Party, AC_Party2, Amount) AND
 * new explicit Dr/Cr columns (DrAmount, CrAmount, DrAccountCA, CrAccountCA)
 * so postingsForRow can use whichever are present.
 */
function invRows(db, startDate, endDate) {
  const { invTable, tTable } = detectTxTables(db);
  if (!invTable || !tTable) return [];

  const conditions = [];
  const params     = [];
  if (startDate) { conditions.push(`("${tTable}".TR_Date >= ? OR "${tTable}".TR_Date IS NULL)`); params.push(startDate); }
  if (endDate)   { conditions.push(`("${tTable}".TR_Date <= ? OR "${tTable}".TR_Date IS NULL)`); params.push(endDate); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  // Detect whether new Dr/Cr explicit columns exist
  const invCols = getCols(db, invTable);
  const hasDrAmt    = invCols.includes('DrAmount');
  const hasCrAmt    = invCols.includes('CrAmount');
  const hasDrAcct   = invCols.includes('DrAccountCA');
  const hasCrAcct   = invCols.includes('CrAccountCA');

  const extraCols = [
    hasDrAmt  ? `"${invTable}".DrAmount`    : 'NULL AS DrAmount',
    hasCrAmt  ? `"${invTable}".CrAmount`    : 'NULL AS CrAmount',
    hasDrAcct ? `"${invTable}".DrAccountCA` : 'NULL AS DrAccountCA',
    hasCrAcct ? `"${invTable}".CrAccountCA` : 'NULL AS CrAccountCA',
  ].join(', ');

  try {
    return db.prepare(
      `SELECT "${invTable}".VType,
              "${invTable}".Account_Party,
              "${invTable}".AC_Party2,
              "${invTable}".Amount,
              ${extraCols}
       FROM "${invTable}"
       LEFT JOIN "${tTable}" ON "${invTable}".TR_No = "${tTable}".TR_No
       ${where}`
    ).all(...params);
  } catch (e) {
    return [];
  }
}

const accountNames = (db) => {
  const { acTable } = detectAcTable(db);
  const map = new Map();
  if (!acTable) return map;
  try {
    db.prepare(`SELECT CA, AC_TITLE1 FROM "${acTable}"`).all()
      .forEach(a => map.set(a.CA, a.AC_TITLE1 || `A/C #${a.CA}`));
  } catch (_) {}
  return map;
};

/**
 * Return the lowest-CA account that has the given Role value.
 * Used ONLY as a backward-compatibility fallback for old/legacy voucher rows
 * that were saved before the two-account-explicit workflow was enforced.
 * Returns null if no account with that role exists.
 */
function lowestRoleAccount(db, role) {
  const { acTable } = detectAcTable(db);
  if (!acTable) return null;
  try {
    const cols = getCols(db, acTable);
    if (!hasColumn(cols, ['Role'])) return null;
    const row = db.prepare(
      `SELECT CA FROM "${acTable}" WHERE lower(Role) = ? ORDER BY CA LIMIT 1`
    ).get(role.toLowerCase());
    return row ? row.CA : null;
  } catch (_) { return null; }
}

/**
 * In-memory role map: CA → Role string (loaded once per report call).
 * Returns a Map<CA, roleString>.
 */
function buildRoleMap(db) {
  const { acTable } = detectAcTable(db);
  const map = new Map();
  if (!acTable) return map;
  try {
    const cols = getCols(db, acTable);
    if (!hasColumn(cols, ['Role'])) return map;
    db.prepare(`SELECT CA, Role FROM "${acTable}" WHERE Role IS NOT NULL AND Role != ''`).all()
      .forEach(r => map.set(Number(r.CA), (r.Role || '').toLowerCase()));
  } catch (_) {}
  return map;
}

// ── Posting engine ─────────────────────────────────────────────────────────────
/**
 * Generate postings for a single Inv row.
 *
 * Prefer explicit Dr/Cr line-entry fields when they are present, but do not
 * drop the row if only one side of the explicit pair is populated. In those
 * mixed-schema cases, the legacy party fields are used to fill the missing side,
 * preserving compatibility with older vouchers and keeping reports aligned.
 */
function postingsForRow(row) {
  const drAmt = Number(row.DrAmount || 0);
  const crAmt = Number(row.CrAmount || 0);
  const legacyAmt = Number(row.Amount || 0);
  const legacyParty = Number(row.Account_Party || 0);
  const legacyParty2 = Number(row.AC_Party2 || 0);

  // Explicit Dr/Cr columns are preferred when complete, but mixed-schema rows
  // often have only one side populated. In that case, use the legacy party
  // fields only to fill the missing side, instead of returning early or double
  // posting the same account.
  const drAcct = Number(row.DrAccountCA || 0);
  const crAcct = Number(row.CrAccountCA || 0);

  const postingsMap = new Map();

  function addPosting(accountId, debit, credit) {
    if (!(accountId > 0) || (debit <= 0 && credit <= 0)) return;
    const existing = postingsMap.get(accountId) || { accountId, debit: 0, credit: 0 };
    existing.debit += debit;
    existing.credit += credit;
    postingsMap.set(accountId, existing);
  }

  function normalizeSameAccountPostings(map) {
    const final = new Map();
    for (const p of map.values()) {
      const existing = final.get(p.accountId) || { accountId: p.accountId, debit: 0, credit: 0 };
      existing.debit += p.debit;
      existing.credit += p.credit;
      final.set(p.accountId, existing);
    }

    return [...final.values()].map(p => {
      if (p.debit > 0 && p.credit > 0) {
        if (p.debit >= p.credit) {
          return { ...p, credit: 0 };
        }
        return { ...p, debit: 0 };
      }
      return p;
    }).filter(p => p.debit > 0 || p.credit > 0);
  }

  const hasExplicitDr = drAmt > 0 && drAcct > 0;
  const hasExplicitCr = crAmt > 0 && crAcct > 0;

  if (hasExplicitDr) addPosting(drAcct, drAmt, 0);
  if (hasExplicitCr) addPosting(crAcct, 0, crAmt);

  // Legacy fields are used only to fill the missing side of a partially
  // migrated explicit row. If the row already has explicit Dr/Cr values, the
  // legacy values must not be re-posted as a second set of entries.
  if (hasExplicitDr && !hasExplicitCr && legacyParty2 > 0 && legacyParty2 !== drAcct && legacyAmt > 0) {
    addPosting(legacyParty2, 0, legacyAmt);
  }

  if (hasExplicitCr && !hasExplicitDr && legacyParty > 0 && legacyParty !== crAcct && legacyAmt > 0) {
    addPosting(legacyParty, legacyAmt, 0);
  }

  // If there are no explicit fields at all, fall back to the original legacy
  // semantics where a two-account legacy line posts as one debit and one credit.
  if (!hasExplicitDr && !hasExplicitCr && legacyAmt > 0) {
    if (legacyParty > 0 && legacyParty2 > 0 && legacyParty !== legacyParty2) {
      addPosting(legacyParty, legacyAmt, 0);
      addPosting(legacyParty2, 0, legacyAmt);
    } else if (legacyParty > 0) {
      addPosting(legacyParty, legacyAmt, 0);
    } else if (legacyParty2 > 0) {
      addPosting(legacyParty2, 0, legacyAmt);
    }
  }

  return normalizeSameAccountPostings(postingsMap);
}

/**
 * Apply postings to all rows, accumulating per-account debit/credit/balance.
 * @param {object[]} rows – Inv rows
 */
function applyPostings(rows) {
  const debits = new Map(), credits = new Map(), balances = new Map();
  for (const row of rows) {
    for (const p of postingsForRow(row)) {
      debits.set(p.accountId,   (debits.get(p.accountId)   || 0) + p.debit);
      credits.set(p.accountId,  (credits.get(p.accountId)  || 0) + p.credit);
      balances.set(p.accountId, (balances.get(p.accountId) || 0) + p.debit - p.credit);
    }
  }
  return { debits, credits, balances };
}

function applyLinkedPartyFallbacks(db, asOfDate, debits, credits, balances) {
  const tables = getTables(db);
  const addPosting = (accountId, debit, credit) => {
    if (!(Number(accountId) > 0)) return;
    const d = Number(debit || 0);
    const c = Number(credit || 0);
    if (d === 0 && c === 0) return;

    // Keep the same customer/supplier invoice and payment logic used by the
    // account statement across all reports. Do not short-circuit when the GL
    // balance is already non-zero, otherwise the linked-party totals are silently
    // dropped and the reports diverge.
    debits.set(accountId, (debits.get(accountId) || 0) + d);
    credits.set(accountId, (credits.get(accountId) || 0) + c);
    balances.set(accountId, (balances.get(accountId) || 0) + d - c);
  };

  const addCustomerFallback = (party) => {
    const accountId = Number(party.LinkedAccountCA || 0);
    if (!accountId) return;
    let invoiceTotal = 0;
    let paidTotal = 0;
    if (tables.has('Sales_Invoice_Headers')) {
      const where = ["CustomerID=?", "Status='Posted'"], params = [Number(party.CustomerID)];
      if (asOfDate) { where.push('InvoiceDate<=?'); params.push(asOfDate); }
      const r = db.prepare(`SELECT COALESCE(SUM(NetTotal),0) AS v FROM Sales_Invoice_Headers WHERE ${where.join(' AND ')}`).get(...params);
      invoiceTotal = Number(r && r.v ? r.v : 0);
    }
    if (tables.has('Party_Payments')) {
      const where = ["PartyType='Customer'", 'PartyID=?', "Status='Posted'"], params = [Number(party.CustomerID)];
      if (asOfDate) { where.push('PaymentDate<=?'); params.push(asOfDate); }
      const r = db.prepare(`SELECT COALESCE(SUM(Amount),0) AS v FROM Party_Payments WHERE ${where.join(' AND ')}`).get(...params);
      paidTotal = Number(r && r.v ? r.v : 0);
    }
    if (invoiceTotal === 0 && paidTotal === 0 && Math.abs(Number(party.OpeningBalance || 0)) <= 0.01) return;
    addPosting(accountId, Number(party.OpeningBalance || 0) + invoiceTotal, paidTotal);
  };

  const addSupplierFallback = (party) => {
    const accountId = Number(party.LinkedAccountCA || 0);
    if (!accountId) return;
    let invoiceTotal = 0;
    let paidTotal = 0;
    if (tables.has('Purchase_Invoice_Headers')) {
      const where = ["SupplierID=?", "Status='Posted'"], params = [Number(party.SupplierID)];
      if (asOfDate) { where.push('InvoiceDate<=?'); params.push(asOfDate); }
      const r = db.prepare(`SELECT COALESCE(SUM(NetTotal),0) AS v FROM Purchase_Invoice_Headers WHERE ${where.join(' AND ')}`).get(...params);
      invoiceTotal = Number(r && r.v ? r.v : 0);
    }
    if (tables.has('Party_Payments')) {
      const where = ["PartyType='Supplier'", 'PartyID=?', "Status='Posted'"], params = [Number(party.SupplierID)];
      if (asOfDate) { where.push('PaymentDate<=?'); params.push(asOfDate); }
      const r = db.prepare(`SELECT COALESCE(SUM(Amount),0) AS v FROM Party_Payments WHERE ${where.join(' AND ')}`).get(...params);
      paidTotal = Number(r && r.v ? r.v : 0);
    }
    if (invoiceTotal === 0 && paidTotal === 0 && Math.abs(Number(party.OpeningBalance || 0)) <= 0.01) return;
    addPosting(accountId, paidTotal, Number(party.OpeningBalance || 0) + invoiceTotal);
  };

  if (tables.has('Customers')) {
    db.prepare('SELECT CustomerID, LinkedAccountCA, OpeningBalance FROM Customers WHERE Active IS NULL OR Active=1').all()
      .forEach(addCustomerFallback);
  }

  if (tables.has('Suppliers')) {
    db.prepare('SELECT SupplierID, LinkedAccountCA, OpeningBalance FROM Suppliers WHERE Active IS NULL OR Active=1').all()
      .forEach(addSupplierFallback);
  }
}

// ── Window ────────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 1024, minHeight: 700,
    title: 'Flouris — Flour Mill ERP',
    backgroundColor: '#f0f4f8',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'dist', 'index.html'));
  }
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── IPC: database list ────────────────────────────────────────────────────────
ipcMain.handle('listDatabases', () => {
  const root = path.resolve(__dirname, '..', '..');
  const scan = (dir, source) => {
    try {
      return fs.readdirSync(dir)
        .filter(f => f.endsWith('.sqlite') && f !== 'test_diag.sqlite' && !f.startsWith('tmp'))
        .map(f => ({
          name: f.replace('.sqlite', ''),
          filename: f,
          path: path.join(dir, f),
          source: source || 'local',
          size: fs.statSync(path.join(dir, f)).size,
          modified: fs.statSync(path.join(dir, f)).mtime.toISOString(),
        }));
    } catch (_) { return []; }
  };

  const dbs = scan(root, 'local');
  const gdrive = detectGoogleDrivePath();
  if (gdrive) {
    const eraDir = path.join(gdrive, 'ERA Accounting');
    if (!fs.existsSync(eraDir)) { try { fs.mkdirSync(eraDir, { recursive: true }); } catch (_) {} }
    scan(eraDir, 'google-drive').forEach(d => dbs.push(d));
  }
  return dbs;
});

// ── IPC: open database ────────────────────────────────────────────────────────
ipcMain.handle('openDatabase', (_e, dbPath) => {
  try {
    const db     = new Database(dbPath, { readonly: true, fileMustExist: true });
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
    const { invTable, tTable } = detectTxTables(db);
    const { acTable }          = detectAcTable(db);
    // Check password protection
    let passwordProtected = false;
    try {
      if (tables.includes('Company_Info')) {
        const ci = db.prepare('SELECT Password FROM Company_Info LIMIT 1').get();
        passwordProtected = !!(ci && ci.Password && ci.Password.trim() !== '');
      }
    } catch (_) {}
    db.close();
    currentDbPath = dbPath;
    driveSync.watch(dbPath, p => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('db-changed', { path: p });
    });
    return { success: true, tables, path: dbPath, schema: { invTable, tTable, acTable }, passwordProtected };
  } catch (e) { return { success: false, error: e.message }; }
});

// ── IPC: migrate schema (run once per DB to add Role column, password col, etc.)
ipcMain.handle('migrateSchema', (_e, dbPath) => {
  try {
    const dp = dbPath || currentDbPath;
    const db = new Database(dp, { fileMustExist: true });
    db.pragma('journal_mode = WAL');

    db.transaction(() => {
      const { acTable } = detectAcTable(db);

      // 1. Add Role column to AC table if missing
      if (acTable) {
        const acCols = getCols(db, acTable);
        if (!hasColumn(acCols, ['Role'])) {
          db.prepare(`ALTER TABLE "${acTable}" ADD COLUMN Role TEXT`).run();
          // Seed roles for the three standard seed accounts (CA 1/2/3)
          db.prepare(`UPDATE "${acTable}" SET Role='cash'     WHERE CA=1 AND (Role IS NULL OR Role='')`).run();
          db.prepare(`UPDATE "${acTable}" SET Role='purchase' WHERE CA=2 AND (Role IS NULL OR Role='')`).run();
          db.prepare(`UPDATE "${acTable}" SET Role='sales'    WHERE CA=3 AND (Role IS NULL OR Role='')`).run();
        }
      }

      // 2. Add VoucherRef column to Stock_Movements if missing
      const tables = getTables(db);
      if (tables.has('Stock_Movements')) {
        const smCols = getCols(db, 'Stock_Movements');
        if (!hasColumn(smCols, ['VoucherRef', 'TR_No_Ref'])) {
          db.prepare('ALTER TABLE Stock_Movements ADD COLUMN VoucherRef INTEGER').run();
        }
      }

      // 3. Ensure Company_Info has Password column (it already does in new DBs)
      if (tables.has('Company_Info')) {
        const ciCols = getCols(db, 'Company_Info');
        if (!hasColumn(ciCols, ['Password'])) {
          db.prepare('ALTER TABLE Company_Info ADD COLUMN Password TEXT').run();
        }
        // Ensure mill_type column for future use
        if (!hasColumn(ciCols, ['mill_type'])) {
          db.prepare('ALTER TABLE Company_Info ADD COLUMN mill_type TEXT DEFAULT \'flour\'').run();
        }
      }
    })();

    db.close();
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
});

// ── IPC: verify database password ────────────────────────────────────────────
ipcMain.handle('verifyPassword', (_e, { dbPath, password }) => {
  try {
    const dp = dbPath || currentDbPath;
    const db = new Database(dp, { readonly: true, fileMustExist: true });
    const ci = db.prepare('SELECT Password FROM Company_Info LIMIT 1').get();
    db.close();
    if (!ci || !ci.Password || ci.Password.trim() === '') {
      // No password set — consider verified
      unlockedDbs.add(dp);
      return { success: true };
    }
    const ok = verifyPasswordHash(password, ci.Password);
    if (ok) unlockedDbs.add(dp);
    return { success: ok, error: ok ? undefined : 'Incorrect password.' };
  } catch (e) { return { success: false, error: e.message }; }
});

// ── IPC: set / change database password ──────────────────────────────────────
ipcMain.handle('setPassword', (_e, { dbPath, currentPassword, newPassword }) => {
  try {
    const dp = dbPath || currentDbPath;
    const db = new Database(dp, { fileMustExist: true });
    db.pragma('journal_mode = WAL');

    const ci = db.prepare('SELECT Password FROM Company_Info LIMIT 1').get();
    const existingHash = ci ? (ci.Password || '') : '';

    // If there is an existing password, verify current password first
    if (existingHash && existingHash.trim() !== '') {
      if (!currentPassword || !verifyPasswordHash(currentPassword, existingHash)) {
        db.close();
        return { success: false, error: 'Current password is incorrect.' };
      }
    }

    let newHash = null;
    if (newPassword && newPassword.trim() !== '') {
      newHash = hashPassword(newPassword);
    }

    db.prepare('UPDATE Company_Info SET Password = ?').run(newHash);
    db.close();

    // If password removed, unlock; if set, require re-verify
    if (!newHash) unlockedDbs.add(dp);
    else unlockedDbs.delete(dp);

    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
});

// ── IPC: select file / folder dialog ─────────────────────────────────────────
ipcMain.handle('selectFile', async (_e, opts = {}) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: opts.filters || [{ name: 'Database Files', extensions: ['accdb', 'sqlite', 'mdb'] }],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('getImageData', (_e, imagePath) => {
  try {
    if (!imagePath || !fs.existsSync(imagePath)) return { success: false, error: 'Logo file not found' };
    const ext = path.extname(imagePath).toLowerCase();
    const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }[ext];
    if (!mime) return { success: false, error: 'Use a PNG, JPG, JPEG, or WEBP logo' };
    return { success: true, data: `data:${mime};base64,${fs.readFileSync(imagePath).toString('base64')}` };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('selectFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select Google Drive Folder',
  });
  return result.canceled ? null : result.filePaths[0];
});

// ── IPC: prefs ────────────────────────────────────────────────────────────────
ipcMain.handle('getPrefs', () => loadPrefs());
ipcMain.handle('savePrefs', (_e, prefs) => {
  const current = loadPrefs();
  savePrefs({ ...current, ...prefs });
  return { success: true };
});

// ── IPC: chart of accounts ────────────────────────────────────────────────────
ipcMain.handle('getChartOfAccounts', (_e, dbPath) => {
  try {
    const db = new Database(dbPath || currentDbPath, { readonly: true, fileMustExist: true });
    const { acTable } = detectAcTable(db);
    if (!acTable) { db.close(); return { success: true, data: [] }; }
    const cols   = getCols(db, acTable);
    const uacCol = findColumn(cols, ['UAC_Title', 'UAC_TITLE', 'UAC Title', 'uac_title']);

    // Strip surrounding single-quotes from Urdu name stored by Access (.mdb style)
    const cleanQ = `(val) => (val||'').replace(/^'+|'+$/g,'').replace(/\\s+/g,' ').trim()`;

    const data = db.prepare(
      `SELECT CA, AC_TITLE1,
              ${uacCol
                ? `TRIM(REPLACE(REPLACE(COALESCE(${uacCol},''),char(39)||char(39),''),char(39),'')) AS UAC_TITLE`
                : "'' AS UAC_TITLE"},
              ${cols.includes('SubAccID') ? 'SubAccID' : '0 AS SubAccID'},
              ${cols.includes('Cell1') ? 'Cell1' : "'' AS Cell1"},
              ${cols.includes('Role') ? 'Role' : "NULL AS Role"}
       FROM "${acTable}" ORDER BY CA`
    ).all();
    db.close();
    return { success: true, data };
  } catch (e) { return { success: false, error: e.message, data: [] }; }
});

// ── IPC: get voucher types ────────────────────────────────────────────────────
ipcMain.handle('getVoucherTypes', (_e, dbPath) => {
  try {
    const db   = new Database(dbPath || currentDbPath, { readonly: true, fileMustExist: true });
    const tbl  = getTables(db);
    if (!tbl.has('VT')) { db.close(); return { success: true, data: [] }; }
    const cols = getCols(db, 'VT');
    const uvTitleCol = findColumn(cols, ['UVTITLE', 'UVTitle', 'uvtitle']);
    const hasUV = !!uvTitleCol;
    const data  = db.prepare(
      `SELECT VTYPE, VTITLE,
              ${hasUV
                ? `TRIM(REPLACE(REPLACE(COALESCE(${uvTitleCol},''),char(39)||char(39),''),char(39),'')) AS UVTITLE`
                : "'' AS UVTITLE"},
              LDr, LCr, MDr, MCr
       FROM VT ORDER BY VTYPE`
    ).all();
    db.close();
    return { success: true, data };
  } catch (e) { return { success: false, error: e.message, data: [] }; }
});

// ── IPC: save voucher type ────────────────────────────────────────────────────
ipcMain.handle('saveVoucherType', (_e, { dbPath, vt }) => {
  // Voucher types are classification labels only — no LDr/LCr posting rules.
  // Dr/Cr posting is always determined by the explicit DrAccountCA/CrAccountCA
  // and DrAmount/CrAmount on each voucher line.
  try {
    const dp = dbPath || currentDbPath;
    const db = new Database(dp, { fileMustExist: true });
    db.pragma('journal_mode = WAL');
    const tbl = getTables(db);
    if (!tbl.has('VT')) throw new Error('VT table not found in this database.');

    const cols    = getCols(db, 'VT');
    const hasUV   = hasColumn(cols, ['UVTITLE', 'UVTitle', 'uvtitle']);

    const vtypeValue   = Number(vt.VTYPE);
    const vtitleValue  = String(vt.VTITLE || '').trim();
    const uvtitleValue = String(vt.UVTITLE || '').trim();

    if (!vtypeValue || !vtitleValue) {
      throw new Error('Voucher type code and name are required.');
    }

    if (vt.isEdit) {
      const parts  = ['VTITLE = ?'];
      const params = [vtitleValue];
      if (hasUV) { parts.push('UVTITLE = ?'); params.push(uvtitleValue); }
      params.push(vtypeValue);
      db.prepare(`UPDATE VT SET ${parts.join(', ')} WHERE VTYPE = ?`).run(...params);
    } else {
      const colsList  = ['VTYPE', 'VTITLE'];
      const valueList = ['?', '?'];
      const params    = [vtypeValue, vtitleValue];
      if (hasUV) { colsList.push('UVTITLE'); valueList.push('?'); params.push(uvtitleValue); }
      db.prepare(`INSERT INTO VT (${colsList.join(', ')}) VALUES (${valueList.join(', ')})`).run(...params);
    }

    db.close();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('db-changed', { path: dp });
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('deleteVoucherType', (_e, { dbPath, VTYPE }) => {
  try {
    const dp = dbPath || currentDbPath;
    const db = new Database(dp, { fileMustExist: true });
    db.pragma('journal_mode = WAL');
    const value = Number(VTYPE);
    const tbl = getTables(db);
    db.prepare('DELETE FROM VT WHERE VTYPE = ?').run(value);
    if (tbl.has('5VT')) db.prepare('DELETE FROM "5VT" WHERE VTYPE = ?').run(value);
    db.close();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('db-changed', { path: dp });
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
});

// ── IPC: get account head groups (tblSubAcc) ──────────────────────────────────
ipcMain.handle('getAccountHeads', (_e, dbPath) => {
  try {
    const db  = new Database(dbPath || currentDbPath, { readonly: true, fileMustExist: true });
    const tbl = getTables(db);
    const accHeadInfo = detectAccHeadSchema(db);

    if (!tbl.has('tblSubAcc')) { db.close(); return { success: true, data: [], heads: [] }; }
    const subCols = getCols(db, 'tblSubAcc');
    const subNameUCol = findColumn(subCols, ['SubAccountNAmeU', 'SubAccountNAmeu', 'SubAccountNameU']);
    const hasU   = !!subNameUCol;

    const { idCol, nameCol } = accHeadInfo.exists
      ? accHeadInfo
      : { idCol: 'AccountID', nameCol: 'AccountHead' };

    const heads = tbl.has('tblAccHead')
      ? db.prepare(`SELECT ${idCol} AS id, ${nameCol} AS name FROM tblAccHead ORDER BY ${idCol}`).all()
      : [];

    const data = db.prepare(`
      SELECT tblSubAcc.SubAccID,
             tblSubAcc.AccountID,
             TRIM(REPLACE(REPLACE(COALESCE(tblSubAcc.SubAccountNAme,''),char(39)||char(39),''),char(39),'')) AS SubAccountNAme,
             ${hasU
               ? `TRIM(REPLACE(REPLACE(COALESCE(tblSubAcc.${subNameUCol},''),char(39)||char(39),''),char(39),'')) AS SubAccountNAmeU`
               : "'' AS SubAccountNAmeU"}
      FROM tblSubAcc
      ORDER BY tblSubAcc.AccountID, tblSubAcc.SubAccID
    `).all();
    db.close();
    return { success: true, data, heads };
  } catch (e) { return { success: false, error: e.message, data: [], heads: [] }; }
});

ipcMain.handle('saveAccountGroup', (_e, { dbPath, group }) => {
  try {
    const dp = dbPath || currentDbPath;
    const db = new Database(dp, { fileMustExist: true });
    db.pragma('journal_mode = WAL');
    const tbl = getTables(db);
    if (!tbl.has('tblSubAcc')) throw new Error('tblSubAcc not found.');

    // ── Backend validation: AccountID must be a valid head (1–5) ────────────
    const headId = Number(group.AccountID);
    if (!headId || headId < 1 || headId > 5) {
      db.close();
      throw new Error('A valid section (head 1–5) must be selected for this group.');
    }

    const cols = getCols(db, 'tblSubAcc');
    const subNameUCol = findColumn(cols, ['SubAccountNAmeU', 'SubAccountNAmeu', 'SubAccountNameU']);
    const hasU = !!subNameUCol;

    if (group.isEdit) {
      db.prepare(`UPDATE tblSubAcc SET AccountID=?, SubAccountNAme=?${hasU?', SubAccountNAmeU=?':''} WHERE SubAccID=?`)
        .run(...(hasU ? [group.AccountID, group.SubAccountNAme, group.SubAccountNAmeU||'', group.SubAccID]
                      : [group.AccountID, group.SubAccountNAme, group.SubAccID]));
    } else {
      const maxRow = db.prepare('SELECT COALESCE(MAX(SubAccID),0)+1 AS next FROM tblSubAcc').get();
      group.SubAccID = maxRow.next;
      db.prepare(`INSERT INTO tblSubAcc (SubAccID, AccountID, SubAccountNAme${hasU?', SubAccountNAmeU':''}) VALUES (?,?,?${hasU?',?':''})`)
        .run(...(hasU ? [group.SubAccID, group.AccountID, group.SubAccountNAme, group.SubAccountNAmeU||'']
                      : [group.SubAccID, group.AccountID, group.SubAccountNAme]));
    }
    db.close();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('db-changed', { path: dp });
    return { success: true, SubAccID: group.SubAccID };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('deleteAccountGroup', (_e, { dbPath, SubAccID }) => {
  try {
    const dp = dbPath || currentDbPath;
    const db = new Database(dp, { fileMustExist: true });
    db.pragma('journal_mode = WAL');
    // Check if any accounts use this group
    const { acTable } = detectAcTable(db);
    if (acTable) {
      const used = db.prepare(`SELECT COUNT(*) AS c FROM "${acTable}" WHERE SubAccID=?`).get(SubAccID);
      if (used.c > 0) { db.close(); return { success: false, error: `Cannot delete: ${used.c} account(s) use this group.` }; }
    }
    db.prepare('DELETE FROM tblSubAcc WHERE SubAccID=?').run(SubAccID);
    db.close();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('db-changed', { path: dp });
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
});

// ── IPC: find account groups with invalid/missing AccountID ──────────────────
ipcMain.handle('findUnclassifiedGroups', (_e, dbPath) => {
  try {
    const db  = new Database(dbPath || currentDbPath, { readonly: true, fileMustExist: true });
    const tbl = getTables(db);
    if (!tbl.has('tblSubAcc')) { db.close(); return { success: true, data: [] }; }
    const data = db.prepare(
      `SELECT SubAccID, SubAccountNAme, AccountID
       FROM tblSubAcc
       WHERE AccountID IS NULL OR AccountID NOT IN (1,2,3,4,5)
       ORDER BY SubAccID`
    ).all();
    db.close();
    return { success: true, data };
  } catch (e) { return { success: false, error: e.message, data: [] }; }
});

// ── IPC: get all vouchers (for Voucher Entry page) ────────────────────────────
ipcMain.handle('getVouchers', (_e, { dbPath, startDate, endDate, vtype }) => {
  try {
    const db = new Database(dbPath || currentDbPath, { readonly: true, fileMustExist: true });
    const { invTable, tTable } = detectTxTables(db);
    if (!invTable || !tTable) { db.close(); return { success: true, data: [] }; }

    const conditions = [];
    const params     = [];
    if (startDate) { conditions.push(`T.TR_Date >= ?`);             params.push(startDate); }
    if (endDate)   { conditions.push(`T.TR_Date <= ?`);             params.push(endDate); }
    // Filter on Inv.VType (not T.V_Typ which is NULL in many databases)
    if (vtype)     { conditions.push(`"${invTable}".VType = ?`);    params.push(vtype); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const invCols = getCols(db, invTable);
    const hasDrAmt  = invCols.includes('DrAmount');
    const hasCrAmt  = invCols.includes('CrAmount');
    const hasDrAcct = invCols.includes('DrAccountCA');
    const hasCrAcct = invCols.includes('CrAccountCA');

    const rows = db.prepare(`
      SELECT T.TR_No, T.TR_Date, T.V_Typ, T.V_No,
             TRIM(REPLACE(REPLACE(T.Remarks, char(39)||char(39), ''), char(39), '')) AS Remarks,
             T.AccountParty, T.ACParty2, T.Amont,
             "${invTable}".SL, "${invTable}".VType,
             "${invTable}".Account_Party, "${invTable}".AC_Party2,
             "${invTable}".Amount,
             ${hasDrAmt ? `"${invTable}".DrAmount` : 'NULL AS DrAmount'},
             ${hasCrAmt ? `"${invTable}".CrAmount` : 'NULL AS CrAmount'},
             ${hasDrAcct ? `"${invTable}".DrAccountCA` : 'NULL AS DrAccountCA'},
             ${hasCrAcct ? `"${invTable}".CrAccountCA` : 'NULL AS CrAccountCA'},
             TRIM(REPLACE(REPLACE(COALESCE("${invTable}".Narration,''), char(39)||char(39), ''), char(39), '')) AS Narration
      FROM "${tTable}" AS T
      INNER JOIN "${invTable}" ON "${invTable}".TR_No = T.TR_No
      ${where}
      ORDER BY T.TR_Date DESC, T.TR_No DESC, "${invTable}".SL
    `).all(...params);
    db.close();
    return { success: true, data: rows };
  } catch (e) { return { success: false, error: e.message, data: [] }; }
});

// ── IPC: mill items (for voucher entry item picker) ───────────────────────────
ipcMain.handle('getMillItems', (_e, dbPath) => {
  try {
    const db  = new Database(dbPath || currentDbPath, { readonly: true, fileMustExist: true });
    const tbl = getTables(db);
    if (!tbl.has('Mill_Items')) { db.close(); return { success: true, data: [] }; }
    const data = db.prepare(
      'SELECT ItemID, ItemCode, ItemName, ItemNameUr, Category, UOM, ReorderLevel, IsBardana, BardanaType, BardanaCost FROM Mill_Items WHERE Active=1 ORDER BY ItemName'
    ).all();
    db.close();
    return { success: true, data };
  } catch (e) { return { success: false, error: e.message, data: [] }; }
});

// ── IPC: save mill item ───────────────────────────────────────────────────────
ipcMain.handle('saveMillItem', (_e, { dbPath, item }) => {
  try {
    const dp = dbPath || currentDbPath;
    const db = new Database(dp, { fileMustExist: true });
    db.pragma('journal_mode = WAL');
    const tbl = getTables(db);
    if (!tbl.has('Mill_Items')) throw new Error('Mill_Items table not found. Run schema migration first.');
    if (item.ItemID) {
      db.prepare('UPDATE Mill_Items SET ItemCode=?, ItemName=?, ItemNameUr=?, Category=?, UOM=?, ReorderLevel=?, IsBardana=?, BardanaType=?, BardanaCost=?, Active=? WHERE ItemID=?')
        .run(item.ItemCode||null, item.ItemName, item.ItemNameUr||null, item.Category||null, item.UOM||'KG', Number(item.ReorderLevel)||0, item.IsBardana ? 1 : 0, item.BardanaType||null, Number(item.BardanaCost||0), item.Active !== false ? 1 : 0, item.ItemID);
    } else {
      const next = (db.prepare('SELECT COALESCE(MAX(ItemID),0)+1 AS n FROM Mill_Items').get()).n;
      db.prepare('INSERT INTO Mill_Items (ItemID,ItemCode,ItemName,ItemNameUr,Category,UOM,ReorderLevel,IsBardana,BardanaType,BardanaCost,Active) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
        .run(next, item.ItemCode||null, item.ItemName, item.ItemNameUr||null, item.Category||null, item.UOM||'KG', Number(item.ReorderLevel)||0, item.IsBardana ? 1 : 0, item.BardanaType||null, Number(item.BardanaCost||0), 1);
      item.ItemID = next;
    }
    db.close();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('db-changed', { path: dp });
    return { success: true, ItemID: item.ItemID };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('deleteMillItem', (_e, { dbPath, ItemID }) => {
  try {
    const dp = dbPath || currentDbPath;
    const db = new Database(dp, { fileMustExist: true });
    db.pragma('journal_mode = WAL');
    // Check if item has stock movements
    const used = db.prepare('SELECT COUNT(*) AS c FROM Stock_Movements WHERE ItemID=?').get(ItemID);
    if (used.c > 0) { db.close(); return { success: false, error: `Cannot delete: ${used.c} stock movement(s) reference this item.` }; }
    db.prepare('DELETE FROM Mill_Items WHERE ItemID=?').run(ItemID);
    db.close();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('db-changed', { path: dp });
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
});

// ── IPC: warehouses ───────────────────────────────────────────────────────────
ipcMain.handle('getWarehouses', (_e, dbPath) => {
  try {
    const db = new Database(dbPath || currentDbPath, { readonly: true, fileMustExist: true });
    const tbl = getTables(db);
    if (!tbl.has('Warehouses')) { db.close(); return { success: true, data: [] }; }
    const data = db.prepare('SELECT * FROM Warehouses WHERE Active=1 ORDER BY WarehouseName').all();
    db.close();
    return { success: true, data };
  } catch (e) { return { success: false, error: e.message, data: [] }; }
});

ipcMain.handle('saveWarehouse', (_e, { dbPath, warehouse }) => {
  try {
    const dp = dbPath || currentDbPath;
    const db = new Database(dp, { fileMustExist: true });
    db.pragma('journal_mode = WAL');
    if (warehouse.WarehouseID) {
      db.prepare('UPDATE Warehouses SET WarehouseName=?, WarehouseNameUr=?, Active=? WHERE WarehouseID=?')
        .run(warehouse.WarehouseName, warehouse.WarehouseNameUr||null, warehouse.Active !== false ? 1 : 0, warehouse.WarehouseID);
    } else {
      const next = (db.prepare('SELECT COALESCE(MAX(WarehouseID),0)+1 AS n FROM Warehouses').get()).n;
      db.prepare('INSERT INTO Warehouses (WarehouseID,WarehouseName,WarehouseNameUr,Active) VALUES (?,?,?,1)')
        .run(next, warehouse.WarehouseName, warehouse.WarehouseNameUr||null);
      warehouse.WarehouseID = next;
    }
    db.close();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('db-changed', { path: dp });
    return { success: true, WarehouseID: warehouse.WarehouseID };
  } catch (e) { return { success: false, error: e.message }; }
});

// ── IPC: stock movements ──────────────────────────────────────────────────────
ipcMain.handle('getStockMovements', (_e, { dbPath, itemId, startDate, endDate }) => {
  try {
    const db = new Database(dbPath || currentDbPath, { readonly: true, fileMustExist: true });
    const tbl = getTables(db);
    if (!tbl.has('Stock_Movements')) { db.close(); return { success: true, data: [], summary: [] }; }
    const where = ['1=1'], params = [];
    if (itemId)    { where.push('S.ItemID = ?');           params.push(itemId); }
    if (startDate) { where.push('S.MovementDate >= ?');    params.push(startDate); }
    if (endDate)   { where.push('S.MovementDate <= ?');    params.push(endDate); }
    const data = db.prepare(`
      SELECT S.*, I.ItemName, I.UOM, W.WarehouseName
      FROM Stock_Movements S
      LEFT JOIN Mill_Items  I ON I.ItemID    = S.ItemID
      LEFT JOIN Warehouses  W ON W.WarehouseID = S.WarehouseID
      WHERE ${where.join(' AND ')}
      ORDER BY S.MovementDate DESC, S.MovementID DESC
    `).all(...params);
    // Per-item balance summary
    const summary = db.prepare(`
      SELECT I.ItemID, I.ItemName, I.UOM,
        SUM(CASE WHEN S.MovementType IN ('IN', 'OPENING') THEN S.Quantity ELSE 0 END) AS totalIn,
        SUM(CASE WHEN S.MovementType='OUT' THEN S.Quantity ELSE 0 END) AS totalOut,
        SUM(CASE WHEN S.MovementType IN ('IN', 'OPENING') THEN S.Quantity ELSE -S.Quantity END) AS balance,
        SUM(CASE WHEN S.MovementType IN ('IN', 'OPENING') THEN S.Quantity*S.Rate ELSE -S.Quantity*S.Rate END) AS balanceValue
      FROM Mill_Items I
      LEFT JOIN Stock_Movements S ON S.ItemID = I.ItemID
      GROUP BY I.ItemID, I.ItemName, I.UOM
      ORDER BY I.ItemName
    `).all();
    db.close();
    return { success: true, data, summary };
  } catch (e) { return { success: false, error: e.message, data: [], summary: [] }; }
});

ipcMain.handle('saveStockMovement', (_e, { dbPath, movement }) => {
  try {
    const dp = dbPath || currentDbPath;
    const db = new Database(dp, { fileMustExist: true });
    db.pragma('journal_mode = WAL');
    const tbl = getTables(db);
    if (!tbl.has('Stock_Movements')) throw new Error('Stock_Movements table not found.');
    const smCols = getCols(db, 'Stock_Movements');
    const hasVRef = hasColumn(smCols, ['VoucherRef']);
    if (movement.MovementID) {
      db.prepare(`UPDATE Stock_Movements SET MovementDate=?, ItemID=?, WarehouseID=?, MovementType=?, Quantity=?, Rate=?, ReferenceNo=?, Narration=? WHERE MovementID=?`)
        .run(movement.MovementDate, movement.ItemID, movement.WarehouseID||null, movement.MovementType, movement.Quantity, movement.Rate||0, movement.ReferenceNo||null, movement.Narration||null, movement.MovementID);
    } else {
      const cols = ['MovementDate','ItemID','WarehouseID','MovementType','Quantity','Rate','ReferenceNo','Narration'];
      const vals = [movement.MovementDate, movement.ItemID, movement.WarehouseID||null, movement.MovementType, movement.Quantity, movement.Rate||0, movement.ReferenceNo||null, movement.Narration||null];
      if (hasVRef) { cols.push('VoucherRef'); vals.push(movement.VoucherRef||null); }
      db.prepare(`INSERT INTO Stock_Movements (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...vals);
    }
    db.close();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('db-changed', { path: dp });
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('deleteStockMovement', (_e, { dbPath, MovementID }) => {
  try {
    const dp = dbPath || currentDbPath;
    const db = new Database(dp, { fileMustExist: true });
    db.pragma('journal_mode = WAL');
    db.prepare('DELETE FROM Stock_Movements WHERE MovementID=?').run(MovementID);
    db.close();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('db-changed', { path: dp });
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
});
ipcMain.handle('getOperationalReport', (_e, { dbPath, startDate, endDate, codes, reportId }) => {
  try {
    const db = new Database(dbPath || currentDbPath, { readonly: true, fileMustExist: true });
    const { invTable, tTable } = detectTxTables(db);
    if (!invTable || !tTable) throw new Error('No transaction tables found.');
    const invCols = getCols(db, invTable), tCols = getCols(db, tTable);
    const narration = invCols.includes('Narration') ? `I.Narration` : `''`;
    const remarks = tCols.includes('Remarks') ? `T.Remarks` : `''`;
    const vno = tCols.includes('V_No') ? `T.V_No` : 'NULL';
    const where = [], params = [];
    if (startDate) { where.push('(T.TR_Date >= ? OR T.TR_Date IS NULL)'); params.push(startDate); }
    if (endDate) { where.push('(T.TR_Date <= ? OR T.TR_Date IS NULL)'); params.push(endDate); }
    if (Array.isArray(codes) && codes.length) { where.push(`I.VType IN (${codes.map(() => '?').join(',')})`); params.push(...codes); }
    let rows = db.prepare(`SELECT T.TR_No, T.TR_Date, ${vno} AS V_No, I.SL, I.VType, I.Account_Party, I.AC_Party2, I.Amount, ${narration} AS Narration, ${remarks} AS Remarks FROM "${tTable}" T JOIN "${invTable}" I ON I.TR_No=T.TR_No ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY T.TR_Date, T.TR_No, I.SL`).all(...params);
    const tables = getTables(db);
    if (['stock-register', 'opening-stock', 'quantitative-ledger'].includes(reportId) && tables.has('Stock_Movements')) {
      const stockWhere = ['1=1'], stockParams = [];
      if (startDate) { stockWhere.push('S.MovementDate >= ?'); stockParams.push(startDate); }
      if (endDate) { stockWhere.push('S.MovementDate <= ?'); stockParams.push(endDate); }
      if (reportId === 'opening-stock') stockWhere.push("lower(S.MovementType) = 'opening'");
      rows = db.prepare(`SELECT S.MovementID AS TR_No, S.MovementDate AS TR_Date, S.ReferenceNo AS V_No, S.MovementID AS SL, 0 AS VType, 0 AS Account_Party, 0 AS AC_Party2, (S.Quantity * COALESCE(S.Rate, 0)) AS Amount, S.Narration, S.MovementType, S.Quantity, S.Rate, I.ItemName, I.UOM AS Unit, W.WarehouseName FROM Stock_Movements S LEFT JOIN Mill_Items I ON I.ItemID=S.ItemID LEFT JOIN Warehouses W ON W.WarehouseID=S.WarehouseID WHERE ${stockWhere.join(' AND ')} ORDER BY S.MovementDate, S.MovementID`).all(...stockParams);
    } else if (reportId === 'production' && tables.has('Production_Batches')) {
      rows = db.prepare(`SELECT B.BatchID AS TR_No, B.BatchDate AS TR_Date, B.BatchNo AS V_No, B.BatchID AS SL, 0 AS VType, 0 AS Account_Party, 0 AS AC_Party2, 0 AS Amount, B.Narration, B.Status AS MovementType, B.OutputQuantity AS Quantity, 0 AS Rate, I.ItemName, I.UOM AS Unit, W.WarehouseName FROM Production_Batches B LEFT JOIN Mill_Items I ON I.ItemID=B.OutputItemID LEFT JOIN Warehouses W ON W.WarehouseID=B.WarehouseID ORDER BY B.BatchDate, B.BatchID`).all();
    } else if (reportId === 'salary' && tables.has('Payroll')) {
      rows = db.prepare(`SELECT P.PayrollID AS TR_No, P.PayDate AS TR_Date, P.PayPeriod AS V_No, P.PayrollID AS SL, 0 AS VType, 0 AS Account_Party, 0 AS AC_Party2, P.NetSalary AS Amount, P.Status AS Narration, 'Salary' AS MovementType, 1 AS Quantity, P.NetSalary AS Rate, E.EmployeeName AS ItemName, 'Employee' AS Unit, E.Department AS WarehouseName FROM Payroll P LEFT JOIN Employees E ON E.EmployeeID=P.EmployeeID ORDER BY P.PayDate, P.PayrollID`).all();
    } else if (reportId === 'bardana' && tables.has('Packaging_Transactions')) {
      rows = db.prepare(`SELECT P.PackagingID AS TR_No, P.TransactionDate AS TR_Date, P.ReferenceNo AS V_No, P.PackagingID AS SL, 0 AS VType, 0 AS Account_Party, 0 AS AC_Party2, (COALESCE(P.CostPerUnit,0) * COALESCE(P.Quantity,0)) AS Amount, P.Narration, P.MovementType, P.Quantity, COALESCE(P.CostPerUnit,0) AS Rate, I.ItemName, I.UOM AS Unit, '' AS WarehouseName FROM Packaging_Transactions P LEFT JOIN Mill_Items I ON I.ItemID=P.ItemID ORDER BY P.TransactionDate, P.PackagingID`).all();
    }
    const accountMeta = buildAccountMeta(db);
    const accounts = new Map(accountMeta.map(a => [Number(a.CA), a]));
    const allRows = invRows(db, null, endDate);
    const posting = applyPostings(allRows);
    const balances = accountMeta.map(a => ({ accountId: Number(a.CA), accountName: a.AC_TITLE1, accountNameUr: a.UAC_TITLE || a.AC_TITLE1, groupId: a.headId, groupName: a.subName || a.headName || 'Unclassified', debit: posting.debits.get(Number(a.CA)) || 0, credit: posting.credits.get(Number(a.CA)) || 0, balance: posting.balances.get(Number(a.CA)) || 0 }));
    const groupMap = new Map();
    for (const row of balances) { const groupKey = `${row.groupId}:${row.groupName}`; if (!groupMap.has(groupKey)) groupMap.set(groupKey, { groupId: row.groupId, groupName: row.groupName, totalDebit: 0, totalCredit: 0, balance: 0, accounts: [] }); const group = groupMap.get(groupKey); group.totalDebit += row.debit; group.totalCredit += row.credit; group.balance += row.balance; group.accounts.push(row); }
    const quantityTables = [...tables].filter(name => /stock|item|product|inventory|production|salary|payroll|bardana|packaging/i.test(name));
    const quantityColumns = quantityTables.flatMap(table => getCols(db, table).filter(col => /qty|quantity|weight|rate|unit|uom|stock|item/i.test(col)).map(col => `${table}.${col}`));
    db.close();
    return { success: true, data: { rows, balances, groups: [...groupMap.values()], quantitySupported: quantityColumns.length > 0, quantityTables, quantityColumns, reportId } };
  } catch (e) { return { success: false, error: e.message, data: { rows: [], balances: [], groups: [], quantitySupported: false } }; }
});

// ── IPC: save voucher (add / edit) ────────────────────────────────────────────
ipcMain.handle('saveVoucher', (_e, { dbPath, voucher }) => {
  try {
    const dp = dbPath || currentDbPath;
    const db = new Database(dp, { fileMustExist: true });
    db.pragma('journal_mode = WAL');
    const { invTable, tTable } = detectTxTables(db);
    if (!invTable || !tTable) throw new Error('No transaction tables found in this database.');

    const tCols   = getCols(db, tTable);
    const invCols = getCols(db, invTable);
    const hasVNo  = tCols.includes('V_No');

    const now = new Date().toISOString().replace('T', ' ').replace('Z', '');

    // Header voucher type is intentionally not authoritative.
    // Only the individual line VType drives posting logic.
    const headerVType = 0;

    db.transaction(() => {
      if (voucher.TR_No) {
        db.prepare(`
          UPDATE "${tTable}" SET
            TR_Date = ?, V_Typ = ?,
            ${hasVNo ? 'V_No = ?,' : ''}
            Remarks = ?,
            AccountParty = ?, ACParty2 = ?, Amont = ?
          WHERE TR_No = ?
        `).run(
          ...(hasVNo
            ? [voucher.TR_Date, headerVType, voucher.V_No, voucher.Remarks, voucher.AccountParty, voucher.ACParty2, voucher.Amont, voucher.TR_No]
            : [voucher.TR_Date, headerVType, voucher.Remarks, voucher.AccountParty, voucher.ACParty2, voucher.Amont, voucher.TR_No]
          )
        );
        db.prepare(`DELETE FROM "${invTable}" WHERE TR_No = ?`).run(voucher.TR_No);
      } else {
        const maxRow = db.prepare(`SELECT COALESCE(MAX(TR_No),0)+1 AS next FROM "${tTable}"`).get();
        voucher.TR_No = maxRow.next;
        db.prepare(`
          INSERT INTO "${tTable}" (TR_No, TR_Date, V_Typ ${hasVNo ? ', V_No' : ''}, Remarks, AccountParty, ACParty2, Amont, P)
          VALUES (?, ?, ? ${hasVNo ? ', ?' : ''}, ?, ?, ?, ?, 0)
        `).run(
          ...(hasVNo
            ? [voucher.TR_No, voucher.TR_Date, headerVType, voucher.V_No, voucher.Remarks, voucher.AccountParty, voucher.ACParty2, voucher.Amont]
            : [voucher.TR_No, voucher.TR_Date, headerVType, voucher.Remarks, voucher.AccountParty, voucher.ACParty2, voucher.Amont]
          )
        );
      }

      const maxSlRow = db.prepare(`SELECT COALESCE(MAX(SL),0) AS maxSL FROM "${invTable}"`).get();
      let sl = (maxSlRow?.maxSL || 0) + 1;

      // Ensure new Dr/Cr columns exist (safe migration on first use)
      for (const col of ['DrAmount','CrAmount','DrAccountCA','CrAccountCA']) {
        if (!invCols.includes(col)) {
          try {
            const def = col.endsWith('CA') ? 'INTEGER' : 'REAL DEFAULT 0';
            db.prepare(`ALTER TABLE "${invTable}" ADD COLUMN ${col} ${def}`).run();
            invCols.push(col);
          } catch(_) {}
        }
      }
      const hasDrAmt  = invCols.includes('DrAmount');
      const hasCrAmt  = invCols.includes('CrAmount');
      const hasDrAcct = invCols.includes('DrAccountCA');
      const hasCrAcct = invCols.includes('CrAccountCA');

      for (const line of (voucher.lines || [])) {
        const hasNarration = invCols.includes('Narration');
        const hasControl   = invCols.includes('Control_Code');
        const lineVType = Number(line.VType && Number(line.VType) > 0 ? line.VType : 0);

        // Determine Dr/Cr accounts and amounts for the new explicit storage
        const drAcctVal = line.DrAccountCA || line.Account_Party || 0;
        const crAcctVal = line.CrAccountCA || line.AC_Party2 || 0;
        const drAmtVal  = line.DrAmount != null ? Number(line.DrAmount) : (drAcctVal && !crAcctVal ? Number(line.Amount || 0) : 0);
        const crAmtVal  = line.CrAmount != null ? Number(line.CrAmount) : (crAcctVal && !drAcctVal ? Number(line.Amount || 0) : 0);
        // Legacy Amount: keep as max of Dr/Cr for backward compat
        const legacyAmt = Math.max(drAmtVal, crAmtVal) || Number(line.Amount || 0);

        const newCols = [
          ...(hasDrAmt  ? [', DrAmount']    : []),
          ...(hasCrAmt  ? [', CrAmount']    : []),
          ...(hasDrAcct ? [', DrAccountCA'] : []),
          ...(hasCrAcct ? [', CrAccountCA'] : []),
        ].join('');
        const newVals = [
          ...(hasDrAmt  ? [drAmtVal]  : []),
          ...(hasCrAmt  ? [crAmtVal]  : []),
          ...(hasDrAcct ? [drAcctVal || null] : []),
          ...(hasCrAcct ? [crAcctVal || null] : []),
        ];
        const newPlaceholders = newCols ? newCols.replace(/, /g, ',').split(',').filter(Boolean).map(() => '?').join(',') : '';

        db.prepare(`
          INSERT INTO "${invTable}"
            (TR_No, SL, VType, Account_Party, AC_Party2, Amount
             ${hasNarration ? ', Narration' : ''}
             ${hasControl   ? ', Control_Code' : ''}
             ${newCols})
          VALUES (?, ?, ?, ?, ?, ?
             ${hasNarration ? ', ?' : ''}
             ${hasControl   ? ', 0' : ''}
             ${newPlaceholders ? ', ' + newPlaceholders.split(',').map(()=>'?').join(',') : ''})
        `).run(
          voucher.TR_No, sl++, lineVType,
          drAcctVal || 0, crAcctVal || 0, legacyAmt,
          ...(hasNarration ? [line.Narration || ''] : []),
          ...newVals,
        );

        // ── Stock movement ──────────────────────────────────────────────────────
        const tables = getTables(db);
        if (
          tables.has('Stock_Movements') && tables.has('Mill_Items') &&
          line.ItemID && line.Quantity && Number(line.Quantity) !== 0
        ) {
          const smCols = getCols(db, 'Stock_Movements');
          const hasVRef = hasColumn(smCols, ['VoucherRef']);
          const isPurchase = [301, 302].includes(lineVType);
          const isSaleRet  = [304].includes(lineVType);
          const isSale     = [401, 402].includes(lineVType);
          const isPurRet   = [404].includes(lineVType);
          let movType = null;
          if (isPurchase || isSaleRet) movType = 'IN';
          if (isSale     || isPurRet)  movType = 'OUT';
          if (movType) {
            const rate = line.Rate || (legacyAmt / Number(line.Quantity)) || 0;
            db.prepare(`
              INSERT INTO Stock_Movements
                (MovementDate, ItemID, WarehouseID, MovementType, Quantity, Rate, ReferenceNo, Narration
                 ${hasVRef ? ', VoucherRef' : ''})
              VALUES (?, ?, ?, ?, ?, ?, ?, ? ${hasVRef ? ', ?' : ''})
            `).run(
              voucher.TR_Date, line.ItemID, line.WarehouseID || null,
              movType, Math.abs(Number(line.Quantity)), rate,
              String(voucher.TR_No), line.Narration || '',
              ...(hasVRef ? [voucher.TR_No] : [])
            );
          }
        }
      }
    })();

    db.close();

    // notify renderer of change
    if (mainWindow && !mainWindow.isDestroyed())
      mainWindow.webContents.send('db-changed', { path: dp });

    return { success: true, TR_No: voucher.TR_No };
  } catch (e) { return { success: false, error: e.message }; }
});

// ── IPC: delete voucher ───────────────────────────────────────────────────────
ipcMain.handle('deleteVoucher', (_e, { dbPath, TR_No }) => {
  try {
    const dp = dbPath || currentDbPath;
    const db = new Database(dp, { fileMustExist: true });
    db.pragma('journal_mode = WAL');
    const { invTable, tTable } = detectTxTables(db);
    if (!invTable || !tTable) throw new Error('No transaction tables found.');
    const tables = getTables(db);

    db.transaction(() => {
      db.prepare(`DELETE FROM "${invTable}" WHERE TR_No = ?`).run(TR_No);
      db.prepare(`DELETE FROM "${tTable}"   WHERE TR_No = ?`).run(TR_No);
      // Remove associated stock movements if table exists and has VoucherRef
      if (tables.has('Stock_Movements')) {
        try {
          const smCols = getCols(db, 'Stock_Movements');
          if (hasColumn(smCols, ['VoucherRef'])) {
            db.prepare('DELETE FROM Stock_Movements WHERE VoucherRef = ?').run(TR_No);
          }
        } catch (_) {}
      }
    })();
    db.close();

    if (mainWindow && !mainWindow.isDestroyed())
      mainWindow.webContents.send('db-changed', { path: dp });

    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
});

// ── IPC: Trial Balance ────────────────────────────────────────────────────────
ipcMain.handle('getTrialBalance', (_e, { dbPath, startDate, endDate }) => {
  try {
    const db    = new Database(dbPath || currentDbPath, { readonly: true, fileMustExist: true });
    // Trial Balance represents CLOSING balances as of endDate.
    // So we fetch all transactions up to endDate, ignoring startDate so opening balances are included.
    const rows  = invRows(db, null, endDate);

    // --- Build full account + classification map in one query ---
    const { acTable, hasSub } = detectAcTable(db);
    const acCols  = acTable ? getCols(db, acTable) : [];
    const uacCol  = findColumn(acCols, ['UAC_Title', 'UAC_TITLE', 'UAC Title', 'uac_title']);
    const hasUAC  = !!uacCol;
    const tables  = getTables(db);
    const hasSubAcc = tables.has('tblSubAcc');
    const accHeadInfo = detectAccHeadSchema(db);

    // Map: CA → { name, subAccId, subName, headId, headName }
    const acMeta = new Map();
    if (acTable && hasSub && hasSubAcc && accHeadInfo.exists) {
      const { idCol, nameCol } = accHeadInfo;
      // Use idCol (not hardcoded 'AccountID') so SFMDB (SubAccH_ID) works too
      db.prepare(`
        SELECT AC.CA, AC.AC_TITLE1,
               ${hasUAC
                 ? `TRIM(REPLACE(REPLACE(COALESCE(AC.${uacCol},''),char(39)||char(39),''),char(39),'')) AS uacTitle,`
                 : "'' AS uacTitle,"}
               COALESCE(AC.SubAccID, 0) AS subAccId,
               TRIM(REPLACE(REPLACE(COALESCE(tblSubAcc.SubAccountNAme,''),char(39)||char(39),''),char(39),'')) AS subName,
               COALESCE(sub_head.${idCol}, 0) AS headId,
               COALESCE(sub_head.${nameCol}, '') AS headName
        FROM "${acTable}" AS AC
        LEFT JOIN tblSubAcc ON AC.SubAccID = tblSubAcc.SubAccID
        LEFT JOIN tblAccHead AS sub_head ON tblSubAcc.AccountID = sub_head.${idCol}
        ORDER BY sub_head.${idCol}, tblSubAcc.SubAccID, AC.CA
      `).all().forEach(a => acMeta.set(a.CA, a));
    } else if (acTable) {
      db.prepare(`SELECT CA,
              TRIM(REPLACE(REPLACE(COALESCE(AC_TITLE1,''),char(39)||char(39),''),char(39),'')) AS AC_TITLE1
              ${hasUAC
                ? `, TRIM(REPLACE(REPLACE(COALESCE(${uacCol},''),char(39)||char(39),''),char(39),'')) AS uacTitle`
                : ", '' AS uacTitle"}
       FROM "${acTable}" ORDER BY CA`).all()
        .forEach(a => acMeta.set(a.CA, { ...a, subAccId: 0, subName: '', headId: 0, headName: '' }));
    }

    const { debits, credits, balances } = applyPostings(rows);
    applyLinkedPartyFallbacks(db, endDate, debits, credits, balances);

    // Collect all account IDs that have a balance
    const allIds = new Set([...debits.keys(), ...credits.keys()]);
    let totalDebit = 0, totalCredit = 0;

    // Group by SubAccID for the grouped Trial Balance layout (old app style)
    // SubAccID 0 = unclassified
    const subGroups = new Map(); // subAccId → { subName, headName, headId, rows[], groupDebit, groupCredit }

    for (const id of [...allIds].sort((a, b) => a - b)) {
      const d   = debits.get(id)  || 0;
      const c   = credits.get(id) || 0;
      const net = d - c;
      const rowDebit  = net > 0 ? net : 0;
      const rowCredit = net < 0 ? Math.abs(net) : 0;
      totalDebit  += rowDebit;
      totalCredit += rowCredit;

      const meta = acMeta.get(id) || { CA: id, AC_TITLE1: `A/C #${id}`, uacTitle: '', subAccId: 0, subName: 'Unclassified', headId: 0, headName: '' };
      const subKey = meta.subAccId || 0;

      if (!subGroups.has(subKey)) {
        subGroups.set(subKey, {
          subAccId:   subKey,
          subName:    meta.subName   || 'Unclassified',
          headId:     meta.headId    || 0,
          headName:   meta.headName  || '',
          rows:       [],
          groupDebit: 0,
          groupCredit: 0,
        });
      }
      const g = subGroups.get(subKey);
      g.rows.push({
        accountId:    id,
        accountName:  meta.AC_TITLE1  || `A/C #${id}`,
        accountNameUr: meta.uacTitle  || meta.AC_TITLE1 || `A/C #${id}`,
        debit:  rowDebit,
        credit: rowCredit,
      });
      g.groupDebit  += rowDebit;
      g.groupCredit += rowCredit;
    }

    // Flat rows list — only include accounts with a non-zero closing balance
    const flatRows = [];
    for (const id of [...allIds].sort((a, b) => a - b)) {
      const d   = debits.get(id)  || 0;
      const c   = credits.get(id) || 0;
      const net = d - c;
      // Skip accounts with zero net (no closing balance)
      if (Math.round(net * 100) === 0) continue;
      const meta = acMeta.get(id) || {};
      flatRows.push({
        accountId:     id,
        accountName:   meta.AC_TITLE1  || `A/C #${id}`,
        accountNameUr: meta.uacTitle   || meta.AC_TITLE1 || `A/C #${id}`,
        headId:        meta.headId     || 0,
        headName:      meta.headName   || '',
        subAccId:      meta.subAccId   || 0,
        subName:       meta.subName    || '',
        debit:  net > 0 ? net : 0,
        credit: net < 0 ? Math.abs(net) : 0,
      });
    }

    // Also filter groups to only include rows with non-zero balance
    const filteredGroups = [...subGroups.values()].map(g => ({
      ...g,
      rows: g.rows.filter(r => r.debit > 0 || r.credit > 0),
    })).filter(g => g.rows.length > 0);

    db.close();

    return { success: true, data: {
      rows: flatRows,
      groups: filteredGroups,
      totalDebit,
      totalCredit,
      difference: Math.round((totalDebit - totalCredit) * 100) / 100,
    }};
  } catch (e) {
    return { success: false, error: e.message, data: { rows: [], groups: [], totalDebit: 0, totalCredit: 0, difference: 0 } };
  }
});

// ── IPC: Balance Sheet ────────────────────────────────────────────────────────
ipcMain.handle('getBalanceSheet', (_e, { dbPath, asOfDate }) => {
  try {
    const db = new Database(dbPath || currentDbPath, { readonly: true, fileMustExist: true });
    const rows = invRows(db, null, asOfDate);

    const { acTable, hasSub } = detectAcTable(db);
    const acCols      = acTable ? getCols(db, acTable) : [];
    const hasUAC      = hasColumn(acCols, ['UAC_Title', 'UAC_TITLE', 'UAC Title', 'uac_title']);
    const uacCol      = findColumn(acCols, ['UAC_Title', 'UAC_TITLE', 'UAC Title', 'uac_title']);
    const tables      = getTables(db);
    const hasSubAcc   = tables.has('tblSubAcc');
    const accHeadInfo = detectAccHeadSchema(db);

    // meta: CA → { AC_TITLE1, uacTitle, subAccId, subName, subNameU, headId }
    const acMeta = new Map();
    if (acTable && hasSub && hasSubAcc && accHeadInfo.exists) {
      const { idCol, nameCol } = accHeadInfo;
      const subCols = getCols(db, 'tblSubAcc');
      const subNameUCol = findColumn(subCols, ['SubAccountNAmeU', 'SubAccountNAmeu', 'SubAccountNameU', 'subaccountnameu']);
      const hasSubU = !!subNameUCol;
      db.prepare(`
        SELECT AC.CA,
               TRIM(REPLACE(REPLACE(COALESCE(AC.AC_TITLE1,''),char(39)||char(39),''),char(39),''))     AS AC_TITLE1,
               ${hasUAC
                 ? `TRIM(REPLACE(REPLACE(COALESCE(AC.${uacCol},''),char(39)||char(39),''),char(39),'')) AS uacTitle,`
                 : "'' AS uacTitle,"}
               COALESCE(AC.SubAccID, 0)  AS subAccId,
               TRIM(REPLACE(REPLACE(COALESCE(tblSubAcc.SubAccountNAme,''),char(39)||char(39),''),char(39),''))   AS subName,
               ${hasSubU
                 ? `TRIM(REPLACE(REPLACE(COALESCE(tblSubAcc.${subNameUCol},''),char(39)||char(39),''),char(39),'')) AS subNameU,`
                 : "'' AS subNameU,"}
               COALESCE(sub_head.${idCol}, 0)    AS headId,
               COALESCE(sub_head.${nameCol}, '') AS headName
        FROM "${acTable}" AS AC
        LEFT JOIN tblSubAcc ON AC.SubAccID = tblSubAcc.SubAccID
        LEFT JOIN tblAccHead AS sub_head ON tblSubAcc.AccountID = sub_head.${idCol}
      `).all().forEach(a => acMeta.set(a.CA, a));
    } else if (acTable) {
      db.prepare(`SELECT CA,
              TRIM(REPLACE(REPLACE(COALESCE(AC_TITLE1,''),char(39)||char(39),''),char(39),'')) AS AC_TITLE1
              ${hasUAC
                ? `, TRIM(REPLACE(REPLACE(COALESCE(${uacCol},''),char(39)||char(39),''),char(39),'')) AS uacTitle`
                : ", '' AS uacTitle"}
        FROM "${acTable}"`).all()
        .forEach(a => acMeta.set(a.CA, { ...a, subAccId: 0, subName: 'Other', subNameU: '', headId: 0, headName: '' }));
    }

    const tablesBsRef = getTables(db);
    // Grab Stock_Movements data before closing
    let smRowsForBs = [];
    if (tablesBsRef.has('Stock_Movements')) {
      try {
        smRowsForBs = db.prepare(
          asOfDate
            ? 'SELECT MovementType, Quantity, COALESCE(Rate,0) AS Rate FROM Stock_Movements WHERE MovementDate <= ?'
            : 'SELECT MovementType, Quantity, COALESCE(Rate,0) AS Rate FROM Stock_Movements'
        ).all(...(asOfDate ? [asOfDate] : []));
      } catch (_) {}
    }

    const { debits, credits, balances } = applyPostings(rows);
    applyLinkedPartyFallbacks(db, asOfDate, debits, credits, balances);

    // ── Balance Sheet placement rules ────────────────────────────────────────
    // headId=1 (Capital/Equity): ALWAYS on L&E side (both drawings & capital)
    // headId=2 (Liabilities):    net credit → Liabilities;  net debit → Assets
    // headId=3 (Assets):         net debit  → Assets;       net credit → Liabilities
    // headId=4/5 (Income/Expense): skip — not on Balance Sheet
    //
    // Within each section the sub-group label (subName) comes from the schema.
    // All displayed balances are POSITIVE amounts; the section determines Dr/Cr nature.

    const assetGroupsMap  = new Map();
    const liabGroupsMap   = new Map();
    const equityGroupsMap = new Map();

    const ensureGroup = (map, key, m, sectionHeadId, sectionHeadName) => {
      if (!map.has(key)) {
        map.set(key, {
          subAccId: m.subAccId || 0,
          headId:   sectionHeadId,
          headName: sectionHeadName,
          subName:  m.subName  || 'Other',
          subNameU: m.subNameU || '',
          accounts: [],
          total:    0,
        });
      }
      return map.get(key);
    };

    for (const [CA, m] of acMeta) {
      // Skip Income/Expense accounts (headId 4/5) — handled separately as net P&L
      if (m.headId < 1 || m.headId > 3) continue;

      const bal = balances.get(CA) || 0;
      if (Math.round(bal * 100) === 0) continue;

      const absBal = Math.abs(bal);
      const subKey = `${m.headId}_${m.subAccId || 0}`;

      const acEntry = {
        accountId:     CA,
        accountName:   m.AC_TITLE1 || `A/C #${CA}`,
        accountNameUr: m.uacTitle  || m.AC_TITLE1 || `A/C #${CA}`,
        balance:       absBal,  // always positive; section determines Dr/Cr nature
      };

      if (m.headId === 1) {
        // EQUITY — always on L&E side.
        // Credit balance = equity/capital (positive for L&E side)
        // Debit balance = drawings (reduces equity, shown negative)
        const g = ensureGroup(equityGroupsMap, subKey, m, HEAD_CAPITAL, 'Capital / Equity');
        g.accounts.push(acEntry);
        g.total += (bal < 0 ? absBal : -absBal);  // credit→+equity, debit→−drawings
      } else if (bal > 0) {
        // Debit balance → ASSETS side (regardless of headId 2 or 3)
        const g = ensureGroup(assetGroupsMap, subKey, m, HEAD_ASSETS, 'Assets');
        g.accounts.push(acEntry);
        g.total += absBal;
      } else {
        // Credit balance → LIABILITIES side (regardless of headId 2 or 3)
        const g = ensureGroup(liabGroupsMap, subKey, m, HEAD_LIABILITIES, 'Liabilities');
        g.accounts.push(acEntry);
        g.total += absBal;
      }
    }

    // ── Compute net P&L from Income (headId=4) and Expense (headId=5) accounts ──
    // Net Profit = Income credits − Expense debits
    // A positive net (profit) increases equity; a negative net (loss) reduces it.
    let netIncome = 0, netExpense = 0;
    for (const [CA, m] of acMeta) {
      if (m.headId !== HEAD_INCOME && m.headId !== HEAD_EXPENSES) continue;
      const bal = balances.get(CA) || 0;
      if (m.headId === HEAD_INCOME)   netIncome  += (-bal);  // income is credit (negative bal)
      if (m.headId === HEAD_EXPENSES) netExpense += bal;     // expense is debit (positive bal)
    }
    const netPL = netIncome - netExpense;  // positive = profit, negative = loss

    // ── Inventory asset: computed from Stock_Movements ONLY if no GL inventory account is mapped ──
    // Prevents double-counting when ERP invoice posting has already posted
    // Dr Inventory Account (GL) entries.
    function _getMapping(d, purpose) {
      try {
        const t = getTables(d);
        if (!t.has('Account_Mappings')) return null;
        const row = d.prepare('SELECT AccountCA FROM Account_Mappings WHERE Purpose=?').get(purpose);
        return row ? row.AccountCA : null;
      } catch(_) { return null; }
    }
    const invCA = _getMapping(db, 'RAW_MATERIAL_INVENTORY') || _getMapping(db, 'FINISHED_GOODS_INVENTORY');
    const skipComputedInv = invCA ? glHasInventoryBalance(db, invCA) : false;

    if (!skipComputedInv && smRowsForBs.length > 0) {
      let invValue = 0;
      for (const r of smRowsForBs) {
        invValue += (r.MovementType === 'IN' ? 1 : -1) * r.Quantity * r.Rate;
      }
      if (Math.round(Math.abs(invValue) * 100) > 0) {
        const invGroup = ensureGroup(assetGroupsMap, 'inventory_computed', { subAccId: 0, subName: 'Inventory / Stock', subNameU: 'انوینٹری / اسٹاک' }, HEAD_ASSETS, 'Assets');
        invGroup.accounts.push({
          accountId:     -1,
          accountName:   'Inventory (Computed)',
          accountNameUr: 'انوینٹری (حساب شدہ)',
          balance:       Math.max(0, invValue),
        });
        invGroup.total += Math.max(0, invValue);
      }
    }

    // Add net P&L to equity section if non-zero    }

    // Add net P&L to equity section if non-zero
    const PL_KEY = 'pl_period';
    if (Math.round(Math.abs(netPL) * 100) > 0) {
      equityGroupsMap.set(PL_KEY, {
        subAccId: 0,
        headId:   HEAD_CAPITAL,
        headName: 'Capital / Equity',
        subName:  'Net Profit / Loss',
        subNameU: 'خالص نفع / نقصان',
        accounts: [{
          accountId:     0,
          accountName:   netPL >= 0 ? 'Net Profit for Period' : 'Net Loss for Period',
          accountNameUr: netPL >= 0 ? 'خالص نفع' : 'خالص نقصان',
          balance:       Math.abs(netPL),
        }],
        total: netPL,  // positive profit adds to equity; negative loss reduces equity
      });
    }

    const assetGroups  = [...assetGroupsMap.values()];
    const liabGroups   = [...liabGroupsMap.values()];
    const equityGroups = [...equityGroupsMap.values()];

    const totalAssets  = assetGroups.reduce((s, g) => s + g.total, 0);
    const totalLiab    = liabGroups.reduce((s, g)  => s + g.total, 0);
    // Equity uses signed totals (credit contributes +, debit drawings −)
    const totalEquity  = equityGroups.reduce((s, g) => s + g.total, 0);
    const totalLE      = totalLiab + totalEquity;

    const balanceDiff  = Math.round(Math.abs(totalAssets - totalLE) * 100) / 100;

    db.close();

    return { success: true, data: {
      assets:      assetGroups,
      liabilities: liabGroups,
      equity:      equityGroups,
      totalAssets,
      totalLiab,
      totalEquity,
      totalLiabilitiesAndEquity: totalLE,
      balanceDiff,
      netPL,
    }};
  } catch (e) {
    return { success: false, error: e.message, data: { assets: [], liabilities: [], equity: [], totalAssets: 0, totalLiabilitiesAndEquity: 0, balanceDiff: 0 } };
  }
});

// ── IPC: Profit & Loss ────────────────────────────────────────────────────────
ipcMain.handle('getProfitLoss', (_e, { dbPath, startDate, endDate }) => {
  try {
    const db   = new Database(dbPath || currentDbPath, { readonly: true, fileMustExist: true });
    const rows = invRows(db, startDate, endDate);
    const meta = buildAccountMeta(db);

    // Build Urdu name map
    const { acTable } = detectAcTable(db);
    const acCols  = acTable ? getCols(db, acTable) : [];
    const hasUAC  = hasColumn(acCols, ['UAC_Title', 'UAC_TITLE', 'UAC Title']);
    const uacCol  = findColumn(acCols, ['UAC_Title', 'UAC_TITLE', 'UAC Title']);
    const uacMap  = new Map();
    if (acTable && hasUAC) {
      db.prepare(`SELECT CA,
              TRIM(REPLACE(REPLACE(COALESCE(${uacCol},''),char(39)||char(39),''),char(39),'')) AS uacTitle
       FROM "${acTable}" WHERE ${uacCol} IS NOT NULL AND ${uacCol} != '' AND ${uacCol} != ''''`).all()
        .forEach(a => uacMap.set(a.CA, a.uacTitle));
    }

    // Build role map for COGS identification
    const roleMap = buildRoleMap(db);

    // ── COGS: inventory-based calculation ────────────────────────────────────
    const tables = getTables(db);
    let openingInventoryValue = 0;
    let closingInventoryValue = 0;
    let hasInventoryData = false;

    if (tables.has('Stock_Movements') && tables.has('Mill_Items')) {
      try {
        // Opening stock: all movements strictly before startDate
        if (startDate) {
          const obRows = db.prepare(
            `SELECT S.MovementType, S.Quantity, COALESCE(S.Rate, 0) AS Rate
             FROM Stock_Movements S
             WHERE S.MovementDate < ?`
          ).all(startDate);
          let openQty = 0, openVal = 0;
          for (const r of obRows) {
            const dir = r.MovementType === 'IN' ? 1 : -1;
            openQty += dir * r.Quantity;
            openVal += dir * r.Quantity * r.Rate;
          }
          openingInventoryValue = Math.max(0, openVal);
        }

        // Closing stock: all movements up to and including endDate (or all if no endDate)
        const closeWhere = endDate ? 'S.MovementDate <= ?' : '1=1';
        const closeParam = endDate ? [endDate] : [];
        const clRows = db.prepare(
          `SELECT S.MovementType, S.Quantity, COALESCE(S.Rate, 0) AS Rate
           FROM Stock_Movements S WHERE ${closeWhere}`
        ).all(...closeParam);
        let closeQty = 0, closeVal = 0;
        for (const r of clRows) {
          const dir = r.MovementType === 'IN' ? 1 : -1;
          closeQty += dir * r.Quantity;
          closeVal += dir * r.Quantity * r.Rate;
        }
        closingInventoryValue = Math.max(0, closeVal);
        hasInventoryData = (obRows?.length > 0 || clRows.length > 0) || false;
      } catch (_) {}
    }

    const { balances } = applyPostings(rows);
    db.close();

    const incomeGroups  = new Map();
    const expenseGroups = new Map();
    // Purchase-role accounts go into COGS, not regular expenses
    const purchaseGroups = new Map();

    for (const m of meta) {
      const bal = balances.get(m.CA) || 0;
      if (Math.round(bal * 100) === 0) continue;

      const acNameEn = m.AC_TITLE1 || `A/C #${m.CA}`;
      const acNameUr = uacMap.get(m.CA) || acNameEn;
      const role     = roleMap.get(Number(m.CA));

      if (m.headId === HEAD_INCOME) {
        const amount = Math.abs(bal);
        if (amount < 0.01) continue;
        const key = m.subName || 'Income';
        if (!incomeGroups.has(key)) incomeGroups.set(key, { headName: key, accounts: [], total: 0 });
        const g = incomeGroups.get(key);
        g.accounts.push({ accountId: m.CA, accountName: acNameEn, accountNameUr: acNameUr, amount });
        g.total += amount;
      } else if (m.headId === HEAD_EXPENSES) {
        const amount = Math.abs(bal);
        if (amount < 0.01) continue;

        // Route purchase-role accounts into COGS calculation
        if (role === 'purchase') {
          const key = m.subName || 'Purchases';
          if (!purchaseGroups.has(key)) purchaseGroups.set(key, { headName: key, accounts: [], total: 0 });
          const g = purchaseGroups.get(key);
          g.accounts.push({ accountId: m.CA, accountName: acNameEn, accountNameUr: acNameUr, amount });
          g.total += amount;
        } else {
          const key = m.subName || 'Expenses';
          if (!expenseGroups.has(key)) expenseGroups.set(key, { headName: key, accounts: [], total: 0 });
          const g = expenseGroups.get(key);
          g.accounts.push({ accountId: m.CA, accountName: acNameEn, accountNameUr: acNameUr, amount });
          g.total += amount;
        }
      }
    }

    const income   = [...incomeGroups.values()];
    const expenses = [...expenseGroups.values()];
    const purchases = [...purchaseGroups.values()];

    const totalIncome    = income.reduce((s, g) => s + g.total, 0);
    const totalPurchases = purchases.reduce((s, g) => s + g.total, 0);
    const totalExpenses  = expenses.reduce((s, g) => s + g.total, 0);

    // COGS = Opening Inventory + Purchases − Closing Inventory
    const cogs = openingInventoryValue + totalPurchases - closingInventoryValue;
    const grossProfit = totalIncome - cogs;
    const netProfitLoss = grossProfit - totalExpenses;

    return {
      success: true,
      data: {
        income, expenses, purchases,
        totalIncome, totalPurchases, totalExpenses,
        openingInventoryValue, closingInventoryValue,
        cogs, grossProfit, netProfitLoss,
        hasInventoryData,
        // legacy alias
        netProfit: netProfitLoss,
      }
    };
  } catch (e) {
    return { success: false, error: e.message, data: { income: [], expenses: [], purchases: [], totalIncome: 0, totalExpenses: 0, totalPurchases: 0, cogs: 0, grossProfit: 0, netProfitLoss: 0, hasInventoryData: false } };
  }
});

// ── IPC: Account Statement ────────────────────────────────────────────────────
ipcMain.handle('getAccountStatement', (_e, { dbPath, accountId, startDate, endDate }) => {
  try {
    const db = new Database(dbPath || currentDbPath, { readonly: true, fileMustExist: true });
    const { invTable, tTable } = detectTxTables(db);
    if (!invTable || !tTable) throw new Error('No transaction tables found.');

    // ── Helpers ──────────────────────────────────────────────────────────────
    const cleanStr = s => (s || '').replace(/^'+|'+$/g, '').replace(/\s+/g, ' ').trim();

    // Build account name map for contra-account labels
    const { acTable }  = detectAcTable(db);
    const acCols       = acTable ? getCols(db, acTable) : [];
    const uacCol       = findColumn(acCols, ['UAC_Title', 'UAC_TITLE', 'UAC Title', 'uac_title']);
    const hasUAC       = !!uacCol;
    const acNameMap    = new Map(); // CA → { en, ur }
    if (acTable) {
      db.prepare(
        `SELECT CA,
                TRIM(REPLACE(REPLACE(COALESCE(AC_TITLE1,''),char(39)||char(39),''),char(39),'')) AS AC_TITLE1,
                ${hasUAC
                  ? `TRIM(REPLACE(REPLACE(COALESCE(${uacCol},''),char(39)||char(39),''),char(39),'')) AS UAC_TITLE`
                  : "'' AS UAC_TITLE"}
         FROM "${acTable}"`
      ).all().forEach(a => acNameMap.set(a.CA, {
        en: a.AC_TITLE1 || `A/C #${a.CA}`,
        ur: a.UAC_TITLE || a.AC_TITLE1 || `A/C #${a.CA}`,
      }));
    }

    const acName = (id, urdu) => {
      const n = acNameMap.get(id);
      if (!n) return `A/C #${id}`;
      return urdu ? (n.ur || n.en) : n.en;
    };

    // VT map
    const vtMapEn = new Map(), vtMapUr = new Map();
    try {
      db.prepare(
        `SELECT VTYPE,
                TRIM(REPLACE(REPLACE(COALESCE(VTITLE,''),char(39)||char(39),''),char(39),''))  AS VTITLE,
                TRIM(REPLACE(REPLACE(COALESCE(UVTITLE,''),char(39)||char(39),''),char(39),'')) AS UVTITLE
         FROM VT`
      ).all().forEach(v => {
        vtMapEn.set(v.VTYPE, v.VTITLE  || `V${v.VTYPE}`);
        vtMapUr.set(v.VTYPE, v.UVTITLE || v.VTITLE || `V${v.VTYPE}`);
      });
    } catch (_) {}

    function addDay(dateStr, delta) {
      if (!dateStr) return null;
      const d = new Date(`${dateStr}T00:00:00`);
      d.setDate(d.getDate() + delta);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }

    // ── Opening balance (all txns before startDate for this account) ─────────
    const invCols = getCols(db, invTable);
    const hasDrAmt  = invCols.includes('DrAmount');
    const hasCrAmt  = invCols.includes('CrAmount');
    const hasDrAcct = invCols.includes('DrAccountCA');
    const hasCrAcct = invCols.includes('CrAccountCA');

    const openingAsOf = startDate ? addDay(startDate, -1) : null;
    const openingRows = openingAsOf
      ? invRows(db, null, openingAsOf)
      : [];

    const openingPostings = applyPostings(openingRows);
    applyLinkedPartyFallbacks(db, openingAsOf || undefined, openingPostings.debits, openingPostings.credits, openingPostings.balances);
    const openingBalance = openingPostings.balances.get(accountId) || 0;

    // ── Fetch transaction rows ────────────────────────────────────────────────
    // We fetch ALL inv lines for every TR_No that touches this account,
    // so we can resolve the contra-account for each line.
    // Match both the legacy party fields and the new explicit Dr/Cr account
    // fields so account statements stay aligned with the shared postings engine.
    const acParts = [`("${invTable}".Account_Party = ? OR "${invTable}".AC_Party2 = ?)`];
    const params = [accountId, accountId];

    if (hasDrAcct) {
      acParts.push(`"${invTable}".DrAccountCA = ?`);
      params.push(accountId);
    }
    if (hasCrAcct) {
      acParts.push(`"${invTable}".CrAccountCA = ?`);
      params.push(accountId);
    }

    const conditions = [acParts.join(' OR ')];
    if (startDate) { conditions.push(`("${tTable}".TR_Date >= ? OR "${tTable}".TR_Date IS NULL)`); params.push(startDate); }
    if (endDate)   { conditions.push(`("${tTable}".TR_Date <= ? OR "${tTable}".TR_Date IS NULL)`); params.push(endDate); }

    // Check whether T has a Remarks column
    const tCols      = getCols(db, tTable);
    const hasRemarks = tCols.includes('Remarks');
    const hasVNo     = tCols.includes('V_No');

    const txRows = db.prepare(
      `SELECT "${invTable}".TR_No, "${invTable}".SL, "${invTable}".VType,
              "${invTable}".Account_Party, "${invTable}".AC_Party2,
              "${invTable}".Amount, "${invTable}".Narration,
              ${hasDrAmt ? `"${invTable}".DrAmount` : 'NULL AS DrAmount'},
              ${hasCrAmt ? `"${invTable}".CrAmount` : 'NULL AS CrAmount'},
              ${hasDrAcct ? `"${invTable}".DrAccountCA` : 'NULL AS DrAccountCA'},
              ${hasCrAcct ? `"${invTable}".CrAccountCA` : 'NULL AS CrAccountCA'},
              "${tTable}".TR_Date,
              ${hasVNo     ? `"${tTable}".V_No`     : 'NULL AS V_No'},
              ${hasRemarks ? `"${tTable}".Remarks`  : "'' AS Remarks"}
       FROM "${invTable}"
       LEFT JOIN "${tTable}" ON "${invTable}".TR_No = "${tTable}".TR_No
       WHERE ${conditions.join(' AND ')}
       ORDER BY "${tTable}".TR_Date, "${tTable}".TR_No, "${invTable}".SL`
    ).all(...params);

    // Account statements should reflect the same posting source used by trial balance
    // and balance sheet: the GL journal rows already capture posted invoice/payment
    // activity. Appending linked customer/supplier invoice tables here duplicates
    // those entries and causes the statement total to diverge from the reports.

    // ── Build transaction list ─────────────────────────────────────────────────
    // For each Inv line that touches accountId, compute debit/credit and build narration.
    const transactions = [];
    const seenTxKeys = new Set();

    const pushTx = (entry) => {
      const key = `${entry.date || ''}|${entry.voucherType || ''}|${entry.voucherNo || ''}|${Number(entry.debit || 0).toFixed(2)}|${Number(entry.credit || 0).toFixed(2)}|${(entry.narration || '').trim()}`;
      if (seenTxKeys.has(key)) return;
      seenTxKeys.add(key);
      transactions.push(entry);
    };

    for (const tx of txRows) {
      const postings = postingsForRow(tx);
      let debit = 0, credit = 0;
      for (const p of postings) {
        if (p.accountId === accountId) { debit += p.debit; credit += p.credit; }
      }
      if (!debit && !credit) continue;

      // ── Narration assembly ─────────────────────────────────────────────────
      // Priority: Inv.Narration → T.Remarks → auto-generated from contra-account
      const rawNarr    = cleanStr(tx.Narration);
      const rawRemarks = cleanStr(tx.Remarks);

      // Identify the contra-account for this line using the actual party fields
      let contraId = null;
      const a1 = Number(tx.Account_Party || 0);
      const a2 = Number(tx.AC_Party2 || 0);
      // The contra is whichever party field is NOT the account we're looking at
      if (a1 === accountId && a2 && a2 !== accountId) contraId = a2;
      else if (a2 === accountId && a1 && a1 !== accountId) contraId = a1;
      else if (a1 && a1 !== accountId) contraId = a1;
      else if (a2 && a2 !== accountId) contraId = a2;

      const contraNameEn = contraId ? acName(contraId, false) : '';
      const contraNameUr = contraId ? acName(contraId, true)  : '';

      // Build bilingual narration strings
      const buildNarr = (raw, remarks, contraEn, contraUr) => {
        // Prefer explicit narration, then remarks, then "To/By ContraAccount"
        const base = raw || remarks;
        const toByEn = debit  > 0 ? `To ${contraEn}`   : `By ${contraEn}`;
        const toByUr = debit  > 0 ? `${contraUr} بہ`   : `${contraUr} از`;
        return {
          en: base   ? `${base}${contraEn ? ` (${contraEn})` : ''}` : toByEn,
          ur: remarks ? `${remarks}${contraUr ? ` (${contraUr})` : ''}` : (raw ? `${raw}${contraUr ? ` (${contraUr})` : ''}` : toByUr),
        };
      };

      const narr = buildNarr(rawNarr, rawRemarks, contraNameEn, contraNameUr);

      pushTx({
        date:           tx.TR_Date,
        voucherType:    vtMapEn.get(tx.VType) || `V${tx.VType}`,
        voucherTypeUr:  vtMapUr.get(tx.VType) || `V${tx.VType}`,
        voucherNo:      tx.V_No || '',
        narration:      narr.en,
        narrationUr:    narr.ur,
        contraAccount:  contraNameEn,
        contraAccountUr:contraNameUr,
        debit, credit,
      });
    }

    transactions.sort((a, b) => {
      if ((a.date || '') < (b.date || '')) return -1;
      if ((a.date || '') > (b.date || '')) return 1;
      return 0;
    });

    let runningPostings = openingBalance;
    for (const tx of transactions) {
      runningPostings += (tx.debit || 0) - (tx.credit || 0);
      tx.balance = runningPostings;
    }

    const closingRows = invRows(db, null, endDate || undefined);
    const closingPostings = applyPostings(closingRows);
    applyLinkedPartyFallbacks(db, endDate || undefined, closingPostings.debits, closingPostings.credits, closingPostings.balances);
    const closingBalance = closingPostings.balances.get(accountId) || 0;

    db.close();

    const acRow = acNameMap.get(accountId);
    return { success: true, data: {
      accountId,
      accountName:   acRow ? acRow.en : `A/C #${accountId}`,
      accountNameUr: acRow ? acRow.ur : `A/C #${accountId}`,
      openingBalance, transactions,
      closingBalance,
    }};
  } catch (e) { return { success: false, error: e.message, data: [] }; }
});

// ── IPC: Import .accdb ────────────────────────────────────────────────────────
ipcMain.handle('importAccdb', async (_e, accdbPath) => {
  try {
    const { default: MDBReader } = await import('mdb-reader');
    const buffer     = fs.readFileSync(accdbPath);
    const mdb        = new MDBReader(buffer);
    const tableNames = mdb.getTableNames();
    const baseName   = path.basename(accdbPath, path.extname(accdbPath));
    const outputDir  = path.resolve(__dirname, '..', '..');
    const sqlitePath = path.join(outputDir, `${baseName}.sqlite`);

    const db = new Database(sqlitePath);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');

    const typeMap = {
      boolean: 'INTEGER', byte: 'INTEGER', integer: 'INTEGER', long: 'INTEGER', repid: 'INTEGER',
      single: 'REAL', double: 'REAL', numeric: 'REAL', currency: 'REAL',
      datetime: 'DateTime', text: 'TEXT', memo: 'TEXT', binary: 'BLOB', ole: 'BLOB',
    };

    db.transaction(() => {
      for (const tableName of tableNames) {
        const table   = mdb.getTable(tableName);
        const columns = table.getColumns();
        if (!columns.length) continue;
        const colDefs = columns.map(c => `\`${c.name.replace(/`/g, '``')}\` ${typeMap[c.type] || 'TEXT'}`).join(', ');
        const esc     = `\`${tableName.replace(/`/g, '``')}\``;
        db.prepare(`DROP TABLE IF EXISTS ${esc}`).run();
        db.prepare(`CREATE TABLE IF NOT EXISTS ${esc} (${colDefs})`).run();
        const data = table.getData();
        if (!data.length) continue;
        const stmt = db.prepare(`INSERT INTO ${esc} VALUES (${columns.map(() => '?').join(', ')})`);
        for (const row of data) {
          stmt.run(...columns.map(c => {
            const v = row[c.name];
            if (v == null) return null;
            if (v instanceof Date) return v.toISOString().replace('T', ' ').replace('Z', '');
            if (c.type === 'boolean') return v ? 1 : 0;
            return v;
          }));
        }
      }
    })();
    db.close();

    driveSync.watch(sqlitePath, p => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('db-changed', { path: p });
    });
    return { success: true, sqlitePath, tables: tableNames };
  } catch (e) { return { success: false, error: e.message }; }
});

// ── IPC: Save PDF ─────────────────────────────────────────────────────────────
ipcMain.handle('savePDF', async (_e, { html, defaultFileName }) => {
  try {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Save PDF Report',
      defaultPath: defaultFileName || 'report.pdf',
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
    });
    if (canceled || !filePath) return { success: false, canceled: true };

    const pdfWin = new BrowserWindow({
      width: 1200, height: 900, show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    });
    await pdfWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    await new Promise(r => setTimeout(r, 700));
    const pdfData = await pdfWin.webContents.printToPDF({
      printBackground: true, pageSize: 'A4',
      margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
    });
    pdfWin.destroy();
    fs.writeFileSync(filePath, pdfData);
    shell.openPath(filePath);
    return { success: true, filePath };
  } catch (e) { return { success: false, error: e.message }; }
});

// ── IPC: Create new database from template ────────────────────────────────────
ipcMain.handle('createDatabase', async (_e, { companyName, companyNameUr, fileName }) => {
  try {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Create New Flouris Database',
      defaultPath: fileName ? `${fileName}.sqlite` : `${companyName || 'NewCompany'}.sqlite`,
      filters: [{ name: 'SQLite Database', extensions: ['sqlite'] }],
    });
    if (canceled || !filePath) return { success: false, canceled: true };

    const db = new Database(filePath);
    db.pragma('journal_mode = WAL');

    db.transaction(() => {
      // Account hierarchy
      db.prepare(`CREATE TABLE IF NOT EXISTS tblAccHead (
        AccountID INTEGER PRIMARY KEY, AccountHead TEXT)`).run();
      db.prepare(`CREATE TABLE IF NOT EXISTS tblSubAcc (
        SubAccID INTEGER PRIMARY KEY, AccountID INTEGER,
        SubAccountNAme TEXT, SubAccountNAmeU TEXT)`).run();
      db.prepare(`CREATE TABLE IF NOT EXISTS AC (
        CA INTEGER PRIMARY KEY, SubAccID INTEGER,
        AC_TITLE1 TEXT, AC_TITLE2 TEXT, UAC_Title TEXT,
        STNo TEXT, Cell1 TEXT, Cell2 TEXT, Remarks TEXT, S_C_F INTEGER DEFAULT 0,
        Role TEXT)`).run();

      // Voucher types
      db.prepare(`CREATE TABLE IF NOT EXISTS VT (
        VTYPE REAL PRIMARY KEY, VTITLE TEXT, UVTITLE TEXT,
        LDr INTEGER, LCr INTEGER, Cash_Book INTEGER, Inv_Book INTEGER,
        MDr TEXT, MCr TEXT, VT TEXT)`).run();

      // Transactions
      db.prepare(`CREATE TABLE IF NOT EXISTS T (
        TR_No INTEGER PRIMARY KEY, TR_Date DateTime,
        V_Typ INTEGER, V_No INTEGER,
        AccountParty INTEGER DEFAULT 0, ACParty2 INTEGER DEFAULT 0,
        Amont REAL DEFAULT 0, Remarks TEXT, P INTEGER DEFAULT 0)`).run();
      db.prepare(`CREATE TABLE IF NOT EXISTS Inv (
        TR_No INTEGER, SL INTEGER,
        VType INTEGER, Account_Party INTEGER, AC_Party2 INTEGER DEFAULT 0,
        Amount REAL, Narration TEXT, Control_Code INTEGER DEFAULT 0)`).run();

      // Optional flour-mill operational layer. Legacy imported databases are
      // never altered; new databases receive these tables for future item,
      // stock, production, payroll, and packaging workflows.
      db.prepare(`CREATE TABLE IF NOT EXISTS Mill_Items (
        ItemID INTEGER PRIMARY KEY, ItemCode TEXT UNIQUE, ItemName TEXT NOT NULL,
        ItemNameUr TEXT, Category TEXT, UOM TEXT DEFAULT 'KG',
        ReorderLevel REAL DEFAULT 0, Active INTEGER DEFAULT 1)`).run();
      db.prepare(`CREATE TABLE IF NOT EXISTS Warehouses (
        WarehouseID INTEGER PRIMARY KEY, WarehouseName TEXT NOT NULL,
        WarehouseNameUr TEXT, Active INTEGER DEFAULT 1)`).run();
      db.prepare(`CREATE TABLE IF NOT EXISTS Stock_Movements (
        MovementID INTEGER PRIMARY KEY, MovementDate DateTime NOT NULL,
        ItemID INTEGER NOT NULL, WarehouseID INTEGER, MovementType TEXT NOT NULL,
        Quantity REAL NOT NULL, Rate REAL DEFAULT 0, ReferenceNo TEXT, Narration TEXT,
        VoucherRef INTEGER)`).run();
      db.prepare(`CREATE TABLE IF NOT EXISTS Production_Batches (
        BatchID INTEGER PRIMARY KEY, BatchDate DateTime NOT NULL,
        BatchNo TEXT UNIQUE, WarehouseID INTEGER, OutputItemID INTEGER,
        OutputQuantity REAL DEFAULT 0, WasteQuantity REAL DEFAULT 0,
        Status TEXT DEFAULT 'Posted', Narration TEXT)`).run();
      db.prepare(`CREATE TABLE IF NOT EXISTS Production_Lines (
        LineID INTEGER PRIMARY KEY, BatchID INTEGER NOT NULL, ItemID INTEGER NOT NULL,
        Quantity REAL NOT NULL, Rate REAL DEFAULT 0, LineType TEXT NOT NULL)`).run();
      db.prepare(`CREATE TABLE IF NOT EXISTS Employees (
        EmployeeID INTEGER PRIMARY KEY, EmployeeCode TEXT UNIQUE, EmployeeName TEXT NOT NULL,
        EmployeeNameUr TEXT, Department TEXT, Designation TEXT, JoinDate DateTime,
        BasicSalary REAL DEFAULT 0, Active INTEGER DEFAULT 1)`).run();
      db.prepare(`CREATE TABLE IF NOT EXISTS Payroll (
        PayrollID INTEGER PRIMARY KEY, EmployeeID INTEGER NOT NULL, PayPeriod TEXT NOT NULL,
        PayDate DateTime, BasicSalary REAL DEFAULT 0, Allowances REAL DEFAULT 0,
        Deductions REAL DEFAULT 0, NetSalary REAL DEFAULT 0, Status TEXT DEFAULT 'Draft')`).run();
      db.prepare(`CREATE TABLE IF NOT EXISTS Packaging_Transactions (
        PackagingID INTEGER PRIMARY KEY, TransactionDate DateTime NOT NULL,
        ItemID INTEGER NOT NULL, PackUnitID INTEGER, WarehouseID INTEGER,
        Quantity REAL NOT NULL, MovementType TEXT NOT NULL,
        CostPerUnit REAL DEFAULT 0,
        ReferenceNo TEXT, Narration TEXT,
        SourceType TEXT, SourceID INTEGER, VoucherRef INTEGER)`).run();
      db.prepare('CREATE INDEX IF NOT EXISTS idx_stock_date_item ON Stock_Movements (MovementDate, ItemID)').run();
      db.prepare('CREATE INDEX IF NOT EXISTS idx_production_date ON Production_Batches (BatchDate)').run();
      db.prepare('CREATE INDEX IF NOT EXISTS idx_payroll_period ON Payroll (PayPeriod)').run();

      // Company info
      db.prepare(`CREATE TABLE IF NOT EXISTS Company_Info (
        CompanyName TEXT, UCompanyName TEXT, Address TEXT, PhoneNos TEXT,
        FY_StartDate DateTime, FY_EndDate DateTime, UserName TEXT, Password TEXT,
        mill_type TEXT DEFAULT 'flour')`).run();

      // Seed account heads (matches HDData schema)
      const heads = [
        [1,'Capital / Equity'],[2,'Liabilities'],[3,'ASSETS'],
        [4,'Sales and Revenue'],[5,'Expenses'],
      ];
      const stmtH = db.prepare('INSERT INTO tblAccHead VALUES (?,?)');
      heads.forEach(h => stmtH.run(...h));

      // Seed voucher types (same as HDData)
      const vtypes = [
        [100,'Opening Balance','اوپنگ بیلنس',null,null,null,null,null,null,'Opg'],
        [101,'Received Cash','نقد وصولی',0,2,1,0,null,'P2','CRV'],
        [102,'Payment in Cash','نقد ادائیگی',1,0,2,0,'P',null,'CPV'],
        [201,'Journal Voucher','جنرل ووچر',1,2,3,null,'P','P2','JV'],
        [301,'Net Purchase','نقد خرید',1,2,2,1,'I','P2','Purchase'],
        [302,'Purchase on Account','ادھار خرید',0,2,0,1,'I','P2','Purchase'],
        [304,'Purchase Reverse','واپسی خرید',1,0,2,2,'P','I','Sale'],
        [401,'Cash Sale','نقد فروخت',1,2,1,2,'P','I','Sale'],
        [402,'Sale on Account','ادھار فروختگی',1,0,0,2,'P','I','Sale'],
        [404,'Sale Reverse','واپسی فروخت',0,2,1,1,'I','P2','Reverse'],
      ];
      const stmtV = db.prepare('INSERT INTO VT (VTYPE,VTITLE,UVTITLE,LDr,LCr,Cash_Book,Inv_Book,MDr,MCr,VT) VALUES (?,?,?,?,?,?,?,?,?,?)');
      vtypes.forEach(v => stmtV.run(...v));

      // Seed standard sub-accounts
      const subs = [
        [1,1,'Accumulated Profit & Loss','اکاموليٹڈ نفع اینڈ نقصان'],
        [2,1,'Directors Account','ڈائريکٹرز اکاؤنٹ'],
        [3,2,'Bank Borrowings','بنک باروانگ'],
        [4,2,'Special Creditors','سپيشل کريڈيٹرز'],
        [5,2,'Purchase Parties','خريد پارٹيز'],
        [7,2,'Other Parties Receiveable','دوسرے پارٹيز'],
        [9,3,'Office Equipments','آفس ايکوپمنٹس'],
        [11,3,'Sale Parties','فروختگى پارٹيز'],
        [12,3,'Cash at Banks','بنک کيش'],
        [13,3,'Cash Account','کيش اکاؤنٹ'],
        [14,4,'Sale of Product','پروڈکٹ فروخت'],
        [15,4,'Other Income','دیگر آمدنی'],
        [17,5,'Direct Expenses','براہ راست اخراجات'],
        [18,5,'Salaries and Wages','تنخواہ و اجرت'],
        [29,5,'Others Expenses','دیگر اخراجات'],
      ];
      const stmtS = db.prepare('INSERT INTO tblSubAcc (SubAccID,AccountID,SubAccountNAme,SubAccountNAmeU) VALUES (?,?,?,?)');
      subs.forEach(s => stmtS.run(...s));

      // Seed essential accounts (with role tags)
      const acs = [
        [1,13,'Cash In Hand',null,'نقد رقم','cash'],
        [2,17,'Purchase Account',null,'خريد اکاؤنٹ','purchase'],
        [3,14,'Sales Account',null,'فروخت اکاؤنٹ','sales'],
      ];
      const stmtA = db.prepare('INSERT INTO AC (CA,SubAccID,AC_TITLE1,AC_TITLE2,UAC_Title,Role) VALUES (?,?,?,?,?,?)');
      acs.forEach(a => stmtA.run(...a));

      // Company info
      db.prepare('INSERT INTO Company_Info (CompanyName, UCompanyName) VALUES (?,?)').run(
        companyName || 'New Company', companyNameUr || ''
      );
    })();
    db.close();
    return { success: true, filePath };
  } catch (e) { return { success: false, error: e.message }; }
});

// ── IPC: Rename database file ─────────────────────────────────────────────────
ipcMain.handle('renameDatabase', async (_e, { oldPath, newName }) => {
  try {
    const dir     = path.dirname(oldPath);
    const newPath = path.join(dir, `${newName}.sqlite`);
    if (fs.existsSync(newPath)) throw new Error('A database with that name already exists.');
    fs.renameSync(oldPath, newPath);
    // Also rename WAL/SHM files if they exist
    for (const ext of ['-wal', '-shm']) {
      const old = oldPath + ext, nw = newPath + ext;
      if (fs.existsSync(old)) fs.renameSync(old, nw);
    }
    if (currentDbPath === oldPath) currentDbPath = newPath;
    return { success: true, newPath };
  } catch (e) { return { success: false, error: e.message }; }
});

// ── IPC: Account CRUD ─────────────────────────────────────────────────────────
ipcMain.handle('getSubAccounts', (_e, dbPath) => {
  try {
    const db = new Database(dbPath || currentDbPath, { readonly: true, fileMustExist: true });
    const tables = getTables(db);
    if (!tables.has('tblSubAcc')) { db.close(); return { success: true, data: [] }; }
    const cols = getCols(db, 'tblSubAcc');
    const subNameUCol = findColumn(cols, ['SubAccountNAmeU', 'SubAccountNAmeu', 'SubAccountNameU', 'subaccountnameu']);
    const hasU = !!subNameUCol;
    const accountHeadCol = findColumn(cols, ['AccountHead', 'accounthead']);
    const hasAH = !!accountHeadCol;

    // Use the detected tblAccHead schema (idCol/nameCol) instead of hardcoding
    // AccountID/AccountHead, so this also works on imported legacy databases
    // whose head table uses SubAccH_ID/SubAccHead (schema variant B).
    const accHeadInfo = detectAccHeadSchema(db);
    const hasHeadTable = tables.has('tblAccHead');
    const { idCol, nameCol } = accHeadInfo.exists
      ? accHeadInfo
      : { idCol: 'AccountID', nameCol: 'AccountHead' };

    const data = db.prepare(
      `SELECT tblSubAcc.SubAccID, tblSubAcc.AccountID,
              tblSubAcc.SubAccountNAme,
              ${hasU  ? `tblSubAcc.${subNameUCol} AS SubAccountNAmeU` : "'' AS SubAccountNAmeU"},
              ${hasAH ? `tblSubAcc.${accountHeadCol} AS AccountHead` : "'' AS AccountHead"},
              ${hasHeadTable ? `tblAccHead.${nameCol} AS headName` : "'' AS headName"}
       FROM tblSubAcc
       ${hasHeadTable ? `LEFT JOIN tblAccHead ON tblSubAcc.AccountID = tblAccHead.${idCol}` : ''}
       ORDER BY tblSubAcc.AccountID, tblSubAcc.SubAccID`
    ).all();
    db.close();
    return { success: true, data };
  } catch (e) { return { success: false, error: e.message, data: [] }; }
});

ipcMain.handle('saveAccount', (_e, { dbPath, account }) => {
  try {
    const dp = dbPath || currentDbPath;
    const db = new Database(dp, { fileMustExist: true });
    db.pragma('journal_mode = WAL');
    const { acTable } = detectAcTable(db);
    if (!acTable) throw new Error('No accounts table found.');
    const cols = getCols(db, acTable);
    const uacCol = findColumn(cols, ['UAC_Title', 'UAC_TITLE', 'UAC Title', 'uac_title']);
    const hasUAC  = !!uacCol;
    const hasRole = hasColumn(cols, ['Role']);

    // Allowed Role values
    const allowedRoles = ['cash','purchase','sales','customer','supplier'];
    const roleVal = account.Role && allowedRoles.includes(account.Role.toLowerCase())
      ? account.Role.toLowerCase()
      : null;

    if (account.CA) {
      // Update
      const setParts = ['SubAccID=?', 'AC_TITLE1=?'];
      const setVals  = [account.SubAccID || 0, account.AC_TITLE1];
      if (hasUAC)  { setParts.push('UAC_Title=?');  setVals.push(account.UAC_Title  || ''); }
      if (hasRole) { setParts.push('Role=?');        setVals.push(roleVal); }
      setParts.push('Cell1=?', 'Remarks=?');
      setVals.push(account.Cell1 || '', account.Remarks || '', account.CA);
      db.prepare(`UPDATE "${acTable}" SET ${setParts.join(', ')} WHERE CA=?`).run(...setVals);
    } else {
      // Insert
      const maxRow = db.prepare(`SELECT COALESCE(MAX(CA),0)+1 AS next FROM "${acTable}"`).get();
      account.CA = maxRow.next;
      const colsList  = ['CA', 'SubAccID', 'AC_TITLE1'];
      const valsList  = ['?', '?', '?'];
      const insVals   = [account.CA, account.SubAccID || 0, account.AC_TITLE1];
      if (hasUAC)  { colsList.push('UAC_Title'); valsList.push('?'); insVals.push(account.UAC_Title  || ''); }
      if (hasRole) { colsList.push('Role');      valsList.push('?'); insVals.push(roleVal); }
      colsList.push('Cell1', 'Remarks');
      valsList.push('?', '?');
      insVals.push(account.Cell1 || '', account.Remarks || '');
      db.prepare(`INSERT INTO "${acTable}" (${colsList.join(', ')}) VALUES (${valsList.join(', ')})`).run(...insVals);
    }
    db.close();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('db-changed', { path: dp });

    // ── Auto-create Customer / Supplier when role requires it ───────────────
    if (roleVal === 'customer' || roleVal === 'sales' || roleVal === 'supplier' || roleVal === 'purchase') {
      try {
        const db2 = new Database(dp, { fileMustExist: true });
        db2.pragma('journal_mode = WAL');
        const tables2 = getTables(db2);
        const accName = account.AC_TITLE1;
        const caId    = account.CA;

        if ((roleVal === 'customer' || roleVal === 'sales') && tables2.has('Customers')) {
          // Only create if no customer with this LinkedAccountCA already exists
          const existing = db2.prepare('SELECT CustomerID FROM Customers WHERE LinkedAccountCA=? LIMIT 1').get(caId);
          if (!existing) {
            const next2 = (db2.prepare('SELECT COALESCE(MAX(CustomerID),0)+1 AS n FROM Customers').get()).n;
            db2.prepare('INSERT INTO Customers (CustomerID,CustomerName,CustomerNameUr,LinkedAccountCA,Active) VALUES (?,?,?,?,1)')
              .run(next2, accName, account.UAC_Title || accName, caId);
          }
        }
        if ((roleVal === 'supplier' || roleVal === 'purchase') && tables2.has('Suppliers')) {
          const existing = db2.prepare('SELECT SupplierID FROM Suppliers WHERE LinkedAccountCA=? LIMIT 1').get(caId);
          if (!existing) {
            const next2 = (db2.prepare('SELECT COALESCE(MAX(SupplierID),0)+1 AS n FROM Suppliers').get()).n;
            db2.prepare('INSERT INTO Suppliers (SupplierID,SupplierName,SupplierNameUr,LinkedAccountCA,Active) VALUES (?,?,?,?,1)')
              .run(next2, accName, account.UAC_Title || accName, caId);
          }
        }
        db2.close();
      } catch(_) {}
    }

    return { success: true, CA: account.CA };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('deleteAccount', (_e, { dbPath, CA }) => {
  try {
    const dp = dbPath || currentDbPath;
    const db = new Database(dp, { fileMustExist: true });
    db.pragma('journal_mode = WAL');
    const { acTable, invTable } = { ...detectAcTable(db), ...detectTxTables(db) };
    if (!acTable) throw new Error('No accounts table found.');

    // Safety check — don't delete accounts that have transactions
    if (invTable) {
      const used = db.prepare(
        `SELECT COUNT(*) as c FROM "${invTable}" WHERE Account_Party=? OR AC_Party2=?`
      ).get(CA, CA);
      if (used.c > 0) {
        db.close();
        return { success: false, error: `Cannot delete: account has ${used.c} transaction entries.` };
      }
    }
    db.prepare(`DELETE FROM "${acTable}" WHERE CA=?`).run(CA);
    db.close();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('db-changed', { path: dp });
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
});

// ── IPC: Google Drive sync helpers ───────────────────────────────────────────
/**
 * syncToGDrive — copy the active (or specified) .sqlite file into the local
 * "ERA Accounting" folder inside Google Drive.  The Drive desktop client
 * then pushes it to the cloud automatically.
 *
 * Params: { dbPath? }   (defaults to currentDbPath)
 * Returns: { success, destPath?, error? }
 */
ipcMain.handle('syncToGDrive', (_e, { dbPath } = {}) => {
  try {
    const srcPath = dbPath || currentDbPath;
    if (!srcPath) throw new Error('No database is currently open.');
    if (!fs.existsSync(srcPath)) throw new Error(`Database file not found: ${srcPath}`);

    const drivePath = detectGoogleDrivePath();
    if (!drivePath) throw new Error(
      'Google Drive folder not detected. ' +
      'Install the Google Drive desktop app and sign in, or set the folder manually in Settings.'
    );

    const eraDir  = path.join(drivePath, 'ERA Accounting');
    if (!fs.existsSync(eraDir)) fs.mkdirSync(eraDir, { recursive: true });

    const filename = path.basename(srcPath);
    const destPath = path.join(eraDir, filename);

    // Copy main file
    fs.copyFileSync(srcPath, destPath);

    // Copy WAL / SHM sidecar files if they exist (important for SQLite integrity)
    for (const ext of ['-wal', '-shm']) {
      const src = srcPath + ext;
      if (fs.existsSync(src)) {
        try { fs.copyFileSync(src, destPath + ext); } catch (_) {}
      }
    }

    return { success: true, destPath };
  } catch (e) { return { success: false, error: e.message }; }
});

/**
 * syncFromGDrive — copy a .sqlite file from the "ERA Accounting" Drive folder
 * into the project root so it appears in the database list.
 *
 * Params: { filename }   e.g. "MyCompany.sqlite"
 * Returns: { success, destPath?, error? }
 */
ipcMain.handle('syncFromGDrive', (_e, { filename }) => {
  try {
    if (!filename) throw new Error('filename is required.');

    const drivePath = detectGoogleDrivePath();
    if (!drivePath) throw new Error(
      'Google Drive folder not detected. ' +
      'Install the Google Drive desktop app and sign in, or set the folder manually in Settings.'
    );

    const srcPath  = path.join(drivePath, 'ERA Accounting', filename);
    if (!fs.existsSync(srcPath)) throw new Error(`File not found in Drive folder: ${filename}`);

    const destDir  = path.resolve(__dirname, '..', '..');
    const destPath = path.join(destDir, filename);

    fs.copyFileSync(srcPath, destPath);

    // Copy WAL / SHM sidecar files if present
    for (const ext of ['-wal', '-shm']) {
      const src = srcPath + ext;
      if (fs.existsSync(src)) {
        try { fs.copyFileSync(src, destPath + ext); } catch (_) {}
      }
    }

    return { success: true, destPath };
  } catch (e) { return { success: false, error: e.message }; }
});

/**
 * listGDriveDatabases — list .sqlite files in the local ERA Accounting folder.
 * Separate from listDatabases so the renderer can call it on-demand.
 * Returns: { success, files: [{ filename, path, size, modified }] }
 */
ipcMain.handle('listGDriveDatabases', () => {
  try {
    const drivePath = detectGoogleDrivePath();
    if (!drivePath) return { success: true, files: [], drivePath: null };

    const eraDir = path.join(drivePath, 'ERA Accounting');
    if (!fs.existsSync(eraDir)) {
      try { fs.mkdirSync(eraDir, { recursive: true }); } catch (_) {}
      return { success: true, files: [], drivePath };
    }

    const files = fs.readdirSync(eraDir)
      .filter(f => f.endsWith('.sqlite') && !f.startsWith('tmp'))
      .map(f => {
        const fp   = path.join(eraDir, f);
        const stat = fs.statSync(fp);
        return {
          filename: f,
          name:     f.replace('.sqlite', ''),
          path:     fp,
          size:     stat.size,
          modified: stat.mtime.toISOString(),
          source:   'google-drive',
        };
      });

    return { success: true, files, drivePath };
  } catch (e) { return { success: false, error: e.message, files: [] }; }
});

// ── IPC: misc ─────────────────────────────────────────────────────────────────
ipcMain.handle('getGoogleDrivePath', () => detectGoogleDrivePath());

ipcMain.handle('getAppInfo', () => ({
  version:         app.getVersion(),
  platform:        process.platform,
  arch:            process.arch,
  electronVersion: process.versions.electron,
  nodeVersion:     process.versions.node,
  projectRoot:     path.resolve(__dirname, '..', '..'),
}));

// ── ERP Extension Handlers ────────────────────────────────────────────────────
const {
  runErpMigrations, registerErpHandlers,
  runPackagingMigrations, registerErpHandlers2,
  runFlourMillMigrations, registerFlourMillHandlers,
  glHasInventoryBalance,
} = require('./erpHandlers');

const _broadcastChange = (dbPath) => {
  if (mainWindow && !mainWindow.isDestroyed())
    mainWindow.webContents.send('db-changed', { path: dbPath });
};

registerErpHandlers(ipcMain, () => currentDbPath, _broadcastChange);
registerErpHandlers2(ipcMain, () => currentDbPath, _broadcastChange);
registerFlourMillHandlers(ipcMain, () => currentDbPath, _broadcastChange);

// Also extend the existing migrateSchema handler to run ERP migrations
// (we wrap the existing handler by adding ERP tables to what's already migrated)
ipcMain.removeHandler('migrateSchema');
ipcMain.handle('migrateSchema', (_e, dbPath) => {
  try {
    const dp = dbPath || currentDbPath;
    const db = new Database(dp, { fileMustExist: true });
    db.pragma('journal_mode = WAL');
    db.transaction(() => {
      const { acTable } = detectAcTable(db);
      if (acTable) {
        const acCols = getCols(db, acTable);
        if (!hasColumn(acCols, ['Role'])) {
          db.prepare(`ALTER TABLE "${acTable}" ADD COLUMN Role TEXT`).run();
          db.prepare(`UPDATE "${acTable}" SET Role='cash'     WHERE CA=1 AND (Role IS NULL OR Role='')`).run();
          db.prepare(`UPDATE "${acTable}" SET Role='purchase' WHERE CA=2 AND (Role IS NULL OR Role='')`).run();
          db.prepare(`UPDATE "${acTable}" SET Role='sales'    WHERE CA=3 AND (Role IS NULL OR Role='')`).run();
        }
      }
      const tables = getTables(db);
      if (tables.has('Stock_Movements')) {
        const smCols = getCols(db, 'Stock_Movements');
        if (!hasColumn(smCols, ['VoucherRef', 'TR_No_Ref'])) {
          db.prepare('ALTER TABLE Stock_Movements ADD COLUMN VoucherRef INTEGER').run();
        }
      }
      if (tables.has('Company_Info')) {
        const ciCols = getCols(db, 'Company_Info');
        if (!hasColumn(ciCols, ['Password'])) {
          db.prepare('ALTER TABLE Company_Info ADD COLUMN Password TEXT').run();
        }
        if (!hasColumn(ciCols, ['mill_type'])) {
          db.prepare('ALTER TABLE Company_Info ADD COLUMN mill_type TEXT DEFAULT \'flour\'').run();
        }
      }
      // Run full ERP migrations + packaging + flour-mill Phase 2
      runErpMigrations(db);
      runPackagingMigrations(db);
      runFlourMillMigrations(db);

      // Add new explicit Dr/Cr columns to Inv table if needed
      const { invTable: inv2 } = detectTxTables(db);
      if (inv2) {
        for (const [col, def] of [['DrAmount','REAL DEFAULT 0'],['CrAmount','REAL DEFAULT 0'],['DrAccountCA','INTEGER'],['CrAccountCA','INTEGER']]) {
          const cols2 = getCols(db, inv2);
          if (!cols2.includes(col)) {
            try { db.prepare(`ALTER TABLE "${inv2}" ADD COLUMN ${col} ${def}`).run(); } catch(_) {}
          }
        }
      }
    })();
    db.close();
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
});

// ── Lifecycle ─────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => {
  driveSync.stop();
  if (process.platform !== 'darwin') app.quit();
});
