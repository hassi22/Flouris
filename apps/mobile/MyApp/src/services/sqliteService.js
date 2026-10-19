/**
 * sqliteService.js — Flouris ERP Mobile (bare RN)
 * All SQLite operations using @op-engineering/op-sqlite v9.
 * Schema-adaptive — handles Inv/T, Inv1/T1, and AC variants.
 *
 * op-sqlite v9 API:
 *   open({ name, location? })  → DB handle (no executeSync — fully async)
 *   db.execute(sql, params)    → Promise<{ rows: any[], rowsAffected, insertId }>
 *
 * IMPORTANT: op-sqlite does NOT default to RNFS.DocumentDirectoryPath — it
 * defaults to its own internal database directory, a different path from
 * where googleDriveService.js downloads files
 * (RNFS.DocumentDirectoryPath + '/databases/'). Every open({ name }) call
 * below passes an explicit `location` matching that folder, or a DB
 * downloaded from Drive will silently open as an empty/stale file instead
 * of the one that was just downloaded.
 */

import { open } from '@op-engineering/op-sqlite';
import RNFS from 'react-native-fs';

// Must match the download destination in googleDriveService.js:
// RNFS.DocumentDirectoryPath + '/databases/'
const DB_LOCATION = RNFS.DocumentDirectoryPath + '/databases';

// Best-effort, fire-and-forget: createNewDatabase() can call openDb() before
// googleDriveService.js's own RNFS.mkdir(destDir) ever runs (e.g. first launch,
// no Drive sign-in yet), so make sure the folder exists here too.
RNFS.mkdir(DB_LOCATION).catch(() => {});
import {
  calculateTrialBalance,
  calculateBalanceSheet,
  calculateProfitLoss,
  calculateAccountStatement,
} from '../utils/accountingEngine';

// ── DB handle cache ───────────────────────────────────────────────────────────
const dbCache = new Map();

export function openDb(name) {
  if (dbCache.has(name)) return dbCache.get(name);
  // op-sqlite v9: open() is synchronous but returns an async-only DB handle.
  // `location` MUST match RNFS.DocumentDirectoryPath + '/databases/' (see
  // googleDriveService.js) — without it, op-sqlite opens/creates the file in
  // its own default directory, not the one Drive downloads into.
  const db = open({ name, location: DB_LOCATION });
  dbCache.set(name, db);
  return db;
}

export function closeDb(name) {
  if (dbCache.has(name)) {
    try { dbCache.get(name).close(); } catch (_) {}
    dbCache.delete(name);
  }
}

// ── op-sqlite v9 query helpers ────────────────────────────────────────────────
// op-sqlite v9 returns result.rows as a plain array directly.
async function all(db, sql, params = []) {
  try {
    const result = await db.execute(sql, params);
    const rows = result?.rows;
    if (Array.isArray(rows)) return rows;
    if (rows && Array.isArray(rows._array)) return rows._array;
    return [];
  } catch (_) { return []; }
}

async function first(db, sql, params = []) {
  const rows = await all(db, sql, params);
  return rows[0] || null;
}

async function run(db, sql, params = []) {
  return db.execute(sql, params);
}

// ── Async transaction helper ──────────────────────────────────────────────────
async function withTx(db, fn) {
  await db.execute('BEGIN TRANSACTION');
  try {
    await fn();
    await db.execute('COMMIT');
  } catch (e) {
    try { await db.execute('ROLLBACK'); } catch (_) {}
    throw e;
  }
}

// ── Schema helpers (async) ────────────────────────────────────────────────────
async function getTables(db) {
  const rows = await all(db, "SELECT name FROM sqlite_master WHERE type='table'");
  return new Set(rows.map(r => r.name));
}

async function getCols(db, table) {
  try {
    const rows = await all(db, `PRAGMA table_info("${table}")`);
    return rows.map(r => r.name);
  } catch { return []; }
}

function findColumn(cols, names) {
  const lower = (cols || []).map(c => String(c).toLowerCase());
  for (const name of names || []) {
    const idx = lower.indexOf(String(name).toLowerCase());
    if (idx >= 0) return (cols || [])[idx];
  }
  return null;
}

function hasColumn(cols, names) {
  const norm = new Set((cols || []).map(c => String(c).toLowerCase()));
  return (names || []).some(name => norm.has(String(name).toLowerCase()));
}

async function detectTxTables(db) {
  const tables = await getTables(db);
  return {
    invTable: tables.has('Inv') ? 'Inv' : tables.has('Inv1') ? 'Inv1' : null,
    tTable:   tables.has('T')   ? 'T'   : tables.has('T1')   ? 'T1'   : null,
  };
}

async function detectAcTable(db) {
  const tables = await getTables(db);
  const acTable = tables.has('AC') ? 'AC' : null;
  if (!acTable) return { acTable: null, hasSub: false };
  const cols = await getCols(db, 'AC');
  return { acTable, hasSub: hasColumn(cols, ['SubAccID', 'subAccID']) };
}

// ── Account metadata builder (async) ─────────────────────────────────────────
async function buildAccountMeta(db) {
  const { acTable } = await detectAcTable(db);
  if (!acTable) return [];

  const tables    = await getTables(db);
  const acCols    = await getCols(db, acTable);
  const uacCol    = findColumn(acCols, ['UAC_Title', 'UAC_TITLE', 'UAC Title', 'uac_title']);
  const hasUAC    = !!uacCol;
  const hasSubAcc = tables.has('tblSubAcc') && tables.has('tblAccHead');

  try {
    if (hasSubAcc) {
      return all(db, `
        SELECT AC.CA,
               TRIM(REPLACE(REPLACE(COALESCE(AC.AC_TITLE1,''),char(39)||char(39),''),char(39),'')) AS AC_TITLE1,
               ${hasUAC ? `TRIM(REPLACE(REPLACE(COALESCE(AC.${uacCol},''),char(39)||char(39),''),char(39),'')) AS uacTitle,` : "'' AS uacTitle,"}
               COALESCE(AC.SubAccID, 0) AS subAccId,
               TRIM(REPLACE(REPLACE(COALESCE(tblSubAcc.SubAccountNAme,''),char(39)||char(39),''),char(39),'')) AS subName,
               COALESCE(tblSubAcc.SubAccountNAmeU, '') AS subNameU,
               COALESCE(h.AccountID, 0) AS headId,
               COALESCE(h.AccountHead, '') AS headName
        FROM "${acTable}" AS AC
        LEFT JOIN tblSubAcc ON AC.SubAccID = tblSubAcc.SubAccID
        LEFT JOIN tblAccHead AS h ON tblSubAcc.AccountID = h.AccountID
        ORDER BY h.AccountID, tblSubAcc.SubAccID, AC.CA
      `);
    }
    return all(db, `
      SELECT CA,
             TRIM(REPLACE(REPLACE(COALESCE(AC_TITLE1,''),char(39)||char(39),''),char(39),'')) AS AC_TITLE1,
             ${hasUAC ? `TRIM(REPLACE(REPLACE(COALESCE(${uacCol},''),char(39)||char(39),''),char(39),'')) AS uacTitle,` : "'' AS uacTitle,"}
             0 AS subAccId, '' AS subName, '' AS subNameU, 0 AS headId, '' AS headName
      FROM "${acTable}" ORDER BY CA
    `);
  } catch (_) { return []; }
}

// ── Fetch Inv rows for report calculations (async) ────────────────────────────
async function fetchInvRows(db, startDate, endDate) {
  const { invTable, tTable } = await detectTxTables(db);
  if (!invTable || !tTable) return [];

  const conditions = [], params = [];
  if (startDate) { conditions.push(`("${tTable}".TR_Date >= ? OR "${tTable}".TR_Date IS NULL)`); params.push(startDate); }
  if (endDate)   { conditions.push(`("${tTable}".TR_Date <= ? OR "${tTable}".TR_Date IS NULL)`); params.push(endDate); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    return all(db,
      `SELECT "${invTable}".VType, "${invTable}".Account_Party,
              "${invTable}".AC_Party2, "${invTable}".Amount, "${tTable}".TR_Date
       FROM "${invTable}"
       LEFT JOIN "${tTable}" ON "${invTable}".TR_No = "${tTable}".TR_No
       ${where}`,
      params
    );
  } catch { return []; }
}

// ── List local databases ──────────────────────────────────────────────────────
export async function listLocalDatabases() {
  try {
    const candidates = [
      RNFS.DocumentDirectoryPath + '/databases',
      RNFS.DocumentDirectoryPath,
      RNFS.LibraryDirectoryPath,
    ];
    const dbs = [];
    for (const dir of candidates) {
      const exists = await RNFS.exists(dir).catch(() => false);
      if (!exists) continue;
      const files = await RNFS.readDir(dir).catch(() => []);
      for (const f of files) {
        if (f.name.endsWith('.sqlite') && !f.name.startsWith('tmp')) {
          dbs.push({ name: f.name.replace('.sqlite', ''), filename: f.name, path: f.path, source: 'local' });
        }
      }
    }
    const seen = new Set();
    return dbs.filter(d => { if (seen.has(d.filename)) return false; seen.add(d.filename); return true; });
  } catch { return []; }
}

// ── Open / validate a database ────────────────────────────────────────────────
export async function validateAndOpenDb(dbName) {
  try {
    const db                   = openDb(dbName);
    const tables               = await getTables(db);
    const { invTable, tTable } = await detectTxTables(db);
    const { acTable }          = await detectAcTable(db);
    return { success: true, tables: [...tables], schema: { invTable, tTable, acTable }, dbName };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── Chart of Accounts ─────────────────────────────────────────────────────────
export async function getChartOfAccounts(dbName) {
  try {
    const db = openDb(dbName);
    const { acTable } = await detectAcTable(db);
    if (!acTable) return { success: true, data: [] };
    const cols   = await getCols(db, acTable);
    const uacCol = findColumn(cols, ['UAC_Title', 'UAC_TITLE', 'UAC Title', 'uac_title']);
    const data   = await all(db,
      `SELECT CA, AC_TITLE1,
              ${uacCol ? `TRIM(REPLACE(REPLACE(COALESCE(${uacCol},''),char(39)||char(39),''),char(39),'')) AS UAC_TITLE` : "'' AS UAC_TITLE"},
              ${cols.includes('SubAccID') ? 'SubAccID' : '0 AS SubAccID'},
              ${cols.includes('Cell1')    ? 'Cell1'    : "'' AS Cell1"}
       FROM "${acTable}" ORDER BY CA`
    );
    return { success: true, data };
  } catch (e) { return { success: false, error: e.message, data: [] }; }
}

// ── Voucher Types ─────────────────────────────────────────────────────────────
export async function getVoucherTypes(dbName) {
  try {
    const db     = openDb(dbName);
    const tables = await getTables(db);
    if (!tables.has('VT')) return { success: true, data: [] };
    const cols  = await getCols(db, 'VT');
    const uvCol = findColumn(cols, ['UVTITLE', 'UVTitle', 'uvtitle']);
    const data  = await all(db,
      `SELECT VTYPE, VTITLE,
              ${uvCol ? `TRIM(REPLACE(REPLACE(COALESCE(${uvCol},''),char(39)||char(39),''),char(39),'')) AS UVTITLE` : "'' AS UVTITLE"},
              LDr, LCr, MDr, MCr
       FROM VT ORDER BY VTYPE`
    );
    return { success: true, data };
  } catch (e) { return { success: false, error: e.message, data: [] }; }
}

// ── Account Groups ────────────────────────────────────────────────────────────
export async function getAccountHeads(dbName) {
  try {
    const db     = openDb(dbName);
    const tables = await getTables(db);
    if (!tables.has('tblSubAcc')) return { success: true, data: [], heads: [] };

    const subCols     = await getCols(db, 'tblSubAcc');
    const subNameUCol = findColumn(subCols, ['SubAccountNAmeU', 'SubAccountNAmeu', 'SubAccountNameU']);
    const hasU        = !!subNameUCol;

    const heads = tables.has('tblAccHead')
      ? await all(db, 'SELECT AccountID AS id, AccountHead AS name FROM tblAccHead ORDER BY AccountID')
      : [];

    const data = await all(db,
      `SELECT SubAccID, AccountID,
              TRIM(REPLACE(REPLACE(COALESCE(SubAccountNAme,''),char(39)||char(39),''),char(39),'')) AS SubAccountNAme,
              ${hasU ? `TRIM(REPLACE(REPLACE(COALESCE(${subNameUCol},''),char(39)||char(39),''),char(39),'')) AS SubAccountNAmeU` : "'' AS SubAccountNAmeU"}
       FROM tblSubAcc ORDER BY AccountID, SubAccID`
    );
    return { success: true, data, heads };
  } catch (e) { return { success: false, error: e.message, data: [], heads: [] }; }
}

// ── Vouchers ──────────────────────────────────────────────────────────────────
export async function getVouchers(dbName, { startDate, endDate, vtype } = {}) {
  try {
    const db = openDb(dbName);
    const { invTable, tTable } = await detectTxTables(db);
    if (!invTable || !tTable) return { success: true, data: [] };

    const conditions = [], params = [];
    if (startDate) { conditions.push(`T.TR_Date >= ?`);             params.push(startDate); }
    if (endDate)   { conditions.push(`T.TR_Date <= ?`);             params.push(endDate); }
    if (vtype)     { conditions.push(`"${invTable}".VType = ?`);    params.push(vtype); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const tCols      = await getCols(db, tTable);
    const hasVNo     = tCols.includes('V_No');
    const hasRemarks = tCols.includes('Remarks');

    const rows = await all(db,
      `SELECT T.TR_No, T.TR_Date, T.V_Typ, ${hasVNo ? 'T.V_No,' : 'NULL AS V_No,'}
              ${hasRemarks ? `TRIM(REPLACE(REPLACE(T.Remarks, char(39)||char(39), ''), char(39), '')) AS Remarks,` : "'' AS Remarks,"}
              "${invTable}".SL, "${invTable}".VType, "${invTable}".Account_Party,
              "${invTable}".AC_Party2, "${invTable}".Amount,
              TRIM(REPLACE(REPLACE(COALESCE("${invTable}".Narration,''), char(39)||char(39), ''), char(39), '')) AS Narration
       FROM "${tTable}" AS T
       INNER JOIN "${invTable}" ON "${invTable}".TR_No = T.TR_No
       ${where}
       ORDER BY T.TR_Date DESC, T.TR_No DESC, "${invTable}".SL`,
      params
    );
    return { success: true, data: rows };
  } catch (e) { return { success: false, error: e.message, data: [] }; }
}

// ── Save Voucher ──────────────────────────────────────────────────────────────
export async function saveVoucher(dbName, voucher) {
  try {
    const db = openDb(dbName);
    const { invTable, tTable } = await detectTxTables(db);
    if (!invTable || !tTable) throw new Error('No transaction tables found.');

    const tCols      = await getCols(db, tTable);
    const hasVNo     = tCols.includes('V_No');
    const hasRemarks = tCols.includes('Remarks');
    const hasVTyp    = tCols.includes('V_Typ');
    const hasAP      = tCols.includes('AccountParty');
    const hasAP2     = tCols.includes('ACParty2');
    const hasAmont   = tCols.includes('Amont');

    const invCols = await getCols(db, invTable);
    const hasNarr = invCols.includes('Narration');

    await withTx(db, async () => {
      const isEdit = !!voucher.TR_No;
      if (isEdit) {
        await run(db, `DELETE FROM "${invTable}" WHERE TR_No=?`, [voucher.TR_No]);
        const setParts = ['TR_Date=?'];
        const setParams = [voucher.TR_Date];
        if (hasVNo)     { setParts.push('V_No=?');         setParams.push(voucher.V_No || null); }
        if (hasRemarks) { setParts.push('Remarks=?');      setParams.push(voucher.Remarks || ''); }
        if (hasVTyp)    { setParts.push('V_Typ=?');        setParams.push(voucher.lines?.[0]?.VType || 0); }
        if (hasAP)      { setParts.push('AccountParty=?'); setParams.push(voucher.AccountParty || 0); }
        if (hasAP2)     { setParts.push('ACParty2=?');     setParams.push(voucher.ACParty2 || 0); }
        if (hasAmont)   { setParts.push('Amont=?');        setParams.push(voucher.Amont || 0); }
        setParams.push(voucher.TR_No);
        await run(db, `UPDATE "${tTable}" SET ${setParts.join(',')} WHERE TR_No=?`, setParams);
      } else {
        const maxRow = await first(db, `SELECT COALESCE(MAX(TR_No),0)+1 AS next FROM "${tTable}"`);
        voucher.TR_No = maxRow ? maxRow.next : 1;
        const cols = ['TR_No', 'TR_Date'], vals = ['?', '?'], params = [voucher.TR_No, voucher.TR_Date];
        if (hasVNo)     { cols.push('V_No');         vals.push('?'); params.push(voucher.V_No || null); }
        if (hasRemarks) { cols.push('Remarks');      vals.push('?'); params.push(voucher.Remarks || ''); }
        if (hasVTyp)    { cols.push('V_Typ');        vals.push('?'); params.push(voucher.lines?.[0]?.VType || 0); }
        if (hasAP)      { cols.push('AccountParty'); vals.push('?'); params.push(voucher.AccountParty || 0); }
        if (hasAP2)     { cols.push('ACParty2');     vals.push('?'); params.push(voucher.ACParty2 || 0); }
        if (hasAmont)   { cols.push('Amont');        vals.push('?'); params.push(voucher.Amont || 0); }
        await run(db, `INSERT INTO "${tTable}" (${cols.join(',')}) VALUES (${vals.join(',')})`, params);
      }
      for (const [idx, line] of (voucher.lines || []).entries()) {
        const sl = idx + 1;
        if (hasNarr) {
          await run(db,
            `INSERT INTO "${invTable}" (TR_No,SL,VType,Account_Party,AC_Party2,Amount,Narration) VALUES (?,?,?,?,?,?,?)`,
            [voucher.TR_No, sl, line.VType||0, line.Account_Party||0, line.AC_Party2||0, line.Amount||0, line.Narration||'']
          );
        } else {
          await run(db,
            `INSERT INTO "${invTable}" (TR_No,SL,VType,Account_Party,AC_Party2,Amount) VALUES (?,?,?,?,?,?)`,
            [voucher.TR_No, sl, line.VType||0, line.Account_Party||0, line.AC_Party2||0, line.Amount||0]
          );
        }
      }
    });
    return { success: true, TR_No: voucher.TR_No };
  } catch (e) { return { success: false, error: e.message }; }
}

// ── Delete Voucher ────────────────────────────────────────────────────────────
export async function deleteVoucher(dbName, TR_No) {
  try {
    const db = openDb(dbName);
    const { invTable, tTable } = await detectTxTables(db);
    if (!invTable || !tTable) throw new Error('No transaction tables found.');
    await withTx(db, async () => {
      await run(db, `DELETE FROM "${invTable}" WHERE TR_No=?`, [TR_No]);
      await run(db, `DELETE FROM "${tTable}"   WHERE TR_No=?`, [TR_No]);
    });
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
}

// ── Save Account ──────────────────────────────────────────────────────────────
export async function saveAccount(dbName, account) {
  try {
    const db = openDb(dbName);
    const { acTable } = await detectAcTable(db);
    if (!acTable) throw new Error('No accounts table found.');
    const cols   = await getCols(db, acTable);
    const uacCol = findColumn(cols, ['UAC_Title', 'UAC_TITLE', 'UAC Title', 'uac_title']);
    const hasUAC = !!uacCol;

    if (account.CA) {
      await run(db,
        `UPDATE "${acTable}" SET SubAccID=?, AC_TITLE1=?${hasUAC ? `, ${uacCol}=?` : ''}, Cell1=?, Remarks=? WHERE CA=?`,
        [account.SubAccID||0, account.AC_TITLE1, ...(hasUAC ? [account.UAC_Title||''] : []), account.Cell1||'', account.Remarks||'', account.CA]
      );
    } else {
      const maxRow  = await first(db, `SELECT COALESCE(MAX(CA),0)+1 AS next FROM "${acTable}"`);
      account.CA    = maxRow ? maxRow.next : 1;
      await run(db,
        `INSERT INTO "${acTable}" (CA,SubAccID,AC_TITLE1${hasUAC ? `,${uacCol}` : ''},Cell1,Remarks) VALUES (?,?,?${hasUAC ? ',?' : ''},?,?)`,
        [account.CA, account.SubAccID||0, account.AC_TITLE1, ...(hasUAC ? [account.UAC_Title||''] : []), account.Cell1||'', account.Remarks||'']
      );
    }
    return { success: true, CA: account.CA };
  } catch (e) { return { success: false, error: e.message }; }
}

// ── Delete Account ────────────────────────────────────────────────────────────
export async function deleteAccount(dbName, CA) {
  try {
    const db = openDb(dbName);
    const { acTable }  = await detectAcTable(db);
    const { invTable } = await detectTxTables(db);
    if (!acTable) throw new Error('No accounts table found.');
    if (invTable) {
      const used = await first(db, `SELECT COUNT(*) AS c FROM "${invTable}" WHERE Account_Party=? OR AC_Party2=?`, [CA, CA]);
      if (used && used.c > 0) return { success: false, error: `Cannot delete: account has ${used.c} transaction entries.` };
    }
    await run(db, `DELETE FROM "${acTable}" WHERE CA=?`, [CA]);
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
}

// ── Save Account Group ────────────────────────────────────────────────────────
export async function saveAccountGroup(dbName, group) {
  try {
    const db     = openDb(dbName);
    const tables = await getTables(db);
    if (!tables.has('tblSubAcc')) throw new Error('tblSubAcc not found.');
    const cols = await getCols(db, 'tblSubAcc');
    const uCol = findColumn(cols, ['SubAccountNAmeU', 'SubAccountNAmeu', 'SubAccountNameU']);
    const hasU = !!uCol;

    if (group.isEdit) {
      await run(db,
        `UPDATE tblSubAcc SET AccountID=?, SubAccountNAme=?${hasU ? `, ${uCol}=?` : ''} WHERE SubAccID=?`,
        hasU ? [group.AccountID, group.SubAccountNAme, group.SubAccountNAmeU||'', group.SubAccID]
             : [group.AccountID, group.SubAccountNAme, group.SubAccID]
      );
    } else {
      const maxRow    = await first(db, 'SELECT COALESCE(MAX(SubAccID),0)+1 AS next FROM tblSubAcc');
      group.SubAccID  = maxRow ? maxRow.next : 1;
      await run(db,
        `INSERT INTO tblSubAcc (SubAccID,AccountID,SubAccountNAme${hasU ? `,${uCol}` : ''}) VALUES (?,?,?${hasU ? ',?' : ''})`,
        hasU ? [group.SubAccID, group.AccountID, group.SubAccountNAme, group.SubAccountNAmeU||'']
             : [group.SubAccID, group.AccountID, group.SubAccountNAme]
      );
    }
    return { success: true, SubAccID: group.SubAccID };
  } catch (e) { return { success: false, error: e.message }; }
}

// ── Save / Delete Voucher Type ────────────────────────────────────────────────
export async function saveVoucherType(dbName, vt) {
  try {
    const db     = openDb(dbName);
    const tables = await getTables(db);
    if (!tables.has('VT')) throw new Error('VT table not found.');
    const cols  = await getCols(db, 'VT');
    const hasUV = hasColumn(cols, ['UVTITLE', 'UVTitle', 'uvtitle']);
    const uvCol = findColumn(cols, ['UVTITLE', 'UVTitle', 'uvtitle']);
    const hasLDr = hasColumn(cols, ['LDr', 'LDR', 'ldr']);
    const hasLCr = hasColumn(cols, ['LCr', 'LCR', 'lcr']);

    const vtypeValue  = Number(vt.VTYPE);
    const vtitleValue = String(vt.VTITLE || '').trim();
    const uvtitle     = String(vt.UVTITLE || '').trim();
    const lDrValue    = vt.LDr === '' || vt.LDr == null ? null : Number(vt.LDr);
    const lCrValue    = vt.LCr === '' || vt.LCr == null ? null : Number(vt.LCr);

    if (vt.isEdit) {
      const parts = ['VTITLE=?'], params = [vtitleValue];
      if (hasUV)  { parts.push(`${uvCol}=?`); params.push(uvtitle); }
      if (hasLDr) { parts.push('LDr=?');      params.push(lDrValue); }
      if (hasLCr) { parts.push('LCr=?');      params.push(lCrValue); }
      params.push(vtypeValue);
      await run(db, `UPDATE VT SET ${parts.join(',')} WHERE VTYPE=?`, params);
    } else {
      const colsList = ['VTYPE','VTITLE'], valueList = ['?','?'], params = [vtypeValue, vtitleValue];
      if (hasUV)  { colsList.push(uvCol);  valueList.push('?'); params.push(uvtitle); }
      if (hasLDr) { colsList.push('LDr');  valueList.push('?'); params.push(lDrValue); }
      if (hasLCr) { colsList.push('LCr');  valueList.push('?'); params.push(lCrValue); }
      await run(db, `INSERT INTO VT (${colsList.join(',')}) VALUES (${valueList.join(',')})`, params);
    }
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
}

export async function deleteVoucherType(dbName, VTYPE) {
  try {
    const db = openDb(dbName);
    await run(db, 'DELETE FROM VT WHERE VTYPE=?', [Number(VTYPE)]);
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
}

// ── Reports ───────────────────────────────────────────────────────────────────
export async function getTrialBalance(dbName, { endDate } = {}) {
  try {
    const db     = openDb(dbName);
    const rows   = await fetchInvRows(db, null, endDate);
    const acMeta = await buildAccountMeta(db);
    return { success: true, data: calculateTrialBalance(rows, acMeta) };
  } catch (e) { return { success: false, error: e.message, data: { rows: [], groups: [], totalDebit: 0, totalCredit: 0, difference: 0 } }; }
}

export async function getBalanceSheet(dbName, { asOfDate } = {}) {
  try {
    const db     = openDb(dbName);
    const rows   = await fetchInvRows(db, null, asOfDate);
    const acMeta = await buildAccountMeta(db);
    return { success: true, data: calculateBalanceSheet(rows, acMeta) };
  } catch (e) { return { success: false, error: e.message, data: { assets: [], liabilities: [], equity: [], totalAssets: 0, totalLE: 0 } }; }
}

export async function getProfitLoss(dbName, { startDate, endDate } = {}) {
  try {
    const db     = openDb(dbName);
    const rows   = await fetchInvRows(db, startDate, endDate);
    const acMeta = await buildAccountMeta(db);
    return { success: true, data: calculateProfitLoss(rows, acMeta) };
  } catch (e) { return { success: false, error: e.message, data: { income: [], expenses: [], totalIncome: 0, totalExpenses: 0, netProfitLoss: 0 } }; }
}

export async function getAccountStatement(dbName, { accountId, startDate, endDate } = {}) {
  try {
    const db = openDb(dbName);
    const { invTable, tTable } = await detectTxTables(db);
    if (!invTable || !tTable) throw new Error('No transaction tables found.');

    const tCols      = await getCols(db, tTable);
    const hasRemarks = tCols.includes('Remarks');
    const hasVNo     = tCols.includes('V_No');

    const { acTable } = await detectAcTable(db);
    const acNameMap   = new Map();
    if (acTable) {
      const acCols = await getCols(db, acTable);
      const uacCol = findColumn(acCols, ['UAC_Title', 'UAC_TITLE', 'UAC Title', 'uac_title']);
      const acRows = await all(db,
        `SELECT CA,
                TRIM(REPLACE(REPLACE(COALESCE(AC_TITLE1,''),char(39)||char(39),''),char(39),'')) AS AC_TITLE1,
                ${uacCol ? `TRIM(REPLACE(REPLACE(COALESCE(${uacCol},''),char(39)||char(39),''),char(39),'')) AS UAC_TITLE` : "'' AS UAC_TITLE"}
         FROM "${acTable}"`
      );
      acRows.forEach(a => acNameMap.set(a.CA, { en: a.AC_TITLE1 || `A/C #${a.CA}`, ur: a.UAC_TITLE || a.AC_TITLE1 || `A/C #${a.CA}` }));
    }

    const vtMapEn = new Map(), vtMapUr = new Map();
    try {
      const vtRows = await all(db, "SELECT VTYPE, VTITLE, COALESCE(UVTITLE,'') AS UVTITLE FROM VT");
      vtRows.forEach(v => { vtMapEn.set(v.VTYPE, v.VTITLE); vtMapUr.set(v.VTYPE, v.UVTITLE || v.VTITLE); });
    } catch (_) {}

    const openingBalance = 0;
    const openingRows = startDate
      ? await fetchInvRows(db, null, (() => {
          const d = new Date(startDate); d.setDate(d.getDate() - 1);
          return d.toISOString().slice(0, 10);
        })())
      : [];

    const conditions = [], params = [];
    if (startDate) { conditions.push(`("${tTable}".TR_Date >= ? OR "${tTable}".TR_Date IS NULL)`); params.push(startDate); }
    if (endDate)   { conditions.push(`("${tTable}".TR_Date <= ? OR "${tTable}".TR_Date IS NULL)`); params.push(endDate); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const txRows = await all(db,
      `SELECT "${tTable}".TR_No, "${tTable}".TR_Date,
              ${hasVNo ? `"${tTable}".V_No` : 'NULL AS V_No'},
              "${invTable}".SL, "${invTable}".VType,
              "${invTable}".Account_Party, "${invTable}".AC_Party2, "${invTable}".Amount,
              TRIM(REPLACE(REPLACE(COALESCE("${invTable}".Narration,''), char(39)||char(39), ''), char(39), '')) AS Narration,
              ${hasRemarks ? `TRIM(REPLACE(REPLACE(COALESCE("${tTable}".Remarks,''), char(39)||char(39), ''), char(39), '')) AS Remarks` : "'' AS Remarks"}
       FROM "${tTable}"
       JOIN "${invTable}" ON "${invTable}".TR_No = "${tTable}".TR_No
       ${where}
       ORDER BY "${tTable}".TR_Date, "${tTable}".TR_No, "${invTable}".SL`,
      params
    );

    const acRow = acNameMap.get(accountId);
    const { transactions, closingBalance } = calculateAccountStatement(
      openingRows, txRows, accountId, openingBalance, acNameMap, vtMapEn, vtMapUr
    );

    return { success: true, data: {
      accountId,
      accountName:   acRow ? acRow.en : `A/C #${accountId}`,
      accountNameUr: acRow ? acRow.ur : `A/C #${accountId}`,
      openingBalance, transactions, closingBalance,
    }};
  } catch (e) { return { success: false, error: e.message, data: { transactions: [], openingBalance: 0, closingBalance: 0 } }; }
}

// ── Operational Reports ───────────────────────────────────────────────────────
export async function getOperationalReport(dbName, { startDate, endDate, codes, reportId } = {}) {
  try {
    const db = openDb(dbName);
    const { invTable, tTable } = await detectTxTables(db);
    if (!invTable || !tTable) throw new Error('No transaction tables found.');

    const invCols = await getCols(db, invTable);
    const tCols   = await getCols(db, tTable);
    const hasNarr = invCols.includes('Narration');
    const hasRem  = tCols.includes('Remarks');
    const hasVNo  = tCols.includes('V_No');

    const where = [], params = [];
    if (startDate) { where.push('(T.TR_Date >= ? OR T.TR_Date IS NULL)'); params.push(startDate); }
    if (endDate)   { where.push('(T.TR_Date <= ? OR T.TR_Date IS NULL)'); params.push(endDate); }
    if (Array.isArray(codes) && codes.length) {
      where.push(`I.VType IN (${codes.map(() => '?').join(',')})`);
      params.push(...codes);
    }

    const rows = await all(db,
      `SELECT T.TR_No, T.TR_Date, ${hasVNo ? 'T.V_No' : 'NULL AS V_No'}, I.SL, I.VType,
              I.Account_Party, I.AC_Party2, I.Amount,
              ${hasNarr ? 'I.Narration' : "'' AS Narration"},
              ${hasRem  ? 'T.Remarks'   : "'' AS Remarks"}
       FROM "${tTable}" T
       JOIN "${invTable}" I ON I.TR_No = T.TR_No
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY T.TR_Date, T.TR_No, I.SL`,
      params
    );

    const acMeta   = await buildAccountMeta(db);
    const acMap    = new Map(acMeta.map(a => [Number(a.CA), a]));
    const vtMapEn  = new Map(), vtMapUr = new Map();
    try {
      const vtRows = await all(db, "SELECT VTYPE, VTITLE, COALESCE(UVTITLE,'') AS UVTITLE FROM VT");
      vtRows.forEach(v => { vtMapEn.set(v.VTYPE, v.VTITLE); vtMapUr.set(v.VTYPE, v.UVTITLE || v.VTITLE); });
    } catch (_) {}

    const enriched = rows.map(r => ({
      ...r,
      partyName:   (acMap.get(r.Account_Party) || {}).AC_TITLE1 || '',
      partyNameUr: (acMap.get(r.Account_Party) || {}).uacTitle  || '',
      party2Name:  (acMap.get(r.AC_Party2)      || {}).AC_TITLE1 || '',
      vtypeName:   vtMapEn.get(r.VType) || `V${r.VType}`,
      vtypeNameUr: vtMapUr.get(r.VType) || `V${r.VType}`,
    }));

    return { success: true, data: { rows: enriched, acMap: [...acMap.entries()] } };
  } catch (e) { return { success: false, error: e.message, data: { rows: [] } }; }
}

// ── Create new database ───────────────────────────────────────────────────────
export async function createNewDatabase(dbName, companyName, companyNameUr) {
  try {
    const fullName = dbName.endsWith('.sqlite') ? dbName : dbName + '.sqlite';
    const db = openDb(fullName);

    // Create all tables (idempotent)
    await run(db, `CREATE TABLE IF NOT EXISTS tblAccHead (AccountID INTEGER PRIMARY KEY, AccountHead TEXT)`);
    await run(db, `CREATE TABLE IF NOT EXISTS tblSubAcc (SubAccID INTEGER PRIMARY KEY, AccountID INTEGER, SubAccountNAme TEXT, SubAccountNAmeU TEXT)`);
    await run(db, `CREATE TABLE IF NOT EXISTS AC (CA INTEGER PRIMARY KEY, SubAccID INTEGER, AC_TITLE1 TEXT, AC_TITLE2 TEXT, UAC_Title TEXT, STNo TEXT, Cell1 TEXT, Cell2 TEXT, Remarks TEXT, S_C_F INTEGER DEFAULT 0)`);
    await run(db, `CREATE TABLE IF NOT EXISTS VT (VTYPE REAL PRIMARY KEY, VTITLE TEXT, UVTITLE TEXT, LDr INTEGER, LCr INTEGER, Cash_Book INTEGER, Inv_Book INTEGER, MDr TEXT, MCr TEXT, VT TEXT)`);
    await run(db, `CREATE TABLE IF NOT EXISTS T (TR_No INTEGER PRIMARY KEY, TR_Date DateTime, V_Typ INTEGER, V_No INTEGER, AccountParty INTEGER DEFAULT 0, ACParty2 INTEGER DEFAULT 0, Amont REAL DEFAULT 0, Remarks TEXT, P INTEGER DEFAULT 0)`);
    await run(db, `CREATE TABLE IF NOT EXISTS Inv (TR_No INTEGER, SL INTEGER, VType INTEGER, Account_Party INTEGER, AC_Party2 INTEGER DEFAULT 0, Amount REAL, Narration TEXT, Control_Code INTEGER DEFAULT 0)`);
    await run(db, `CREATE TABLE IF NOT EXISTS Company_Info (CompanyName TEXT, UCompanyName TEXT, Address TEXT, PhoneNos TEXT, FY_StartDate DateTime, FY_EndDate DateTime, UserName TEXT, Password TEXT)`);

    // Seed all data in a single transaction
    await withTx(db, async () => {
      const heads = [
        [1,'Capital / Equity'],[2,'Liabilities'],[3,'ASSETS'],
        [4,'Sales and Revenue'],[5,'Expenses'],
      ];
      for (const h of heads) {
        await run(db, 'INSERT OR IGNORE INTO tblAccHead (AccountID,AccountHead) VALUES (?,?)', h);
      }

      const vtypes = [
        [100,'Opening Balance','اوپنگ بیلنس'],
        [101,'Received Cash','نقد وصولی'],
        [102,'Payment in Cash','نقد ادائیگی'],
        [201,'Journal Voucher','جنرل ووچر'],
        [301,'Net Purchase','نقد خرید'],
        [302,'Purchase on Account','ادھار خرید'],
        [304,'Purchase Reverse','واپسی خرید'],
        [401,'Cash Sale','نقد فروخت'],
        [402,'Sale on Account','ادھار فروختگی'],
        [404,'Sale Reverse','واپسی فروخت'],
      ];
      for (const vt of vtypes) {
        await run(db, 'INSERT OR IGNORE INTO VT (VTYPE,VTITLE,UVTITLE) VALUES (?,?,?)', vt);
      }

      const subs = [
        [1,1,'Accumulated Profit & Loss','اکاموليٹڈ نفع اینڈ نقصان'],
        [2,1,'Directors Account','ڈائريکٹرز اکاؤنٹ'],
        [3,2,'Bank Borrowings','بنک باروانگ'],
        [5,2,'Purchase Parties','خريد پارٹيز'],
        [11,3,'Sale Parties','فروختگى پارٹيز'],
        [12,3,'Cash at Banks','بنک کيش'],
        [13,3,'Cash Account','کيش اکاؤنٹ'],
        [14,4,'Sale of Product','پروڈکٹ فروخت'],
        [17,5,'Direct Expenses','براہ راست اخراجات'],
        [18,5,'Salaries and Wages','تنخواہ و اجرت'],
      ];
      for (const s of subs) {
        await run(db, 'INSERT OR IGNORE INTO tblSubAcc (SubAccID,AccountID,SubAccountNAme,SubAccountNAmeU) VALUES (?,?,?,?)', s);
      }

      await run(db, 'INSERT OR IGNORE INTO AC (CA,SubAccID,AC_TITLE1,UAC_Title) VALUES (?,?,?,?)', [1,13,'Cash In Hand','نقد رقم']);
      await run(db, 'INSERT OR IGNORE INTO AC (CA,SubAccID,AC_TITLE1,UAC_Title) VALUES (?,?,?,?)', [2,17,'Purchase Account','خريد اکاؤنٹ']);
      await run(db, 'INSERT OR IGNORE INTO AC (CA,SubAccID,AC_TITLE1,UAC_Title) VALUES (?,?,?,?)', [3,14,'Sales Account','فروخت اکاؤنٹ']);
      await run(db, 'INSERT OR IGNORE INTO Company_Info (CompanyName,UCompanyName) VALUES (?,?)',   [companyName||'New Company', companyNameUr||'']);
    });

    return { success: true, dbName: fullName };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── Company info ──────────────────────────────────────────────────────────────
export async function getCompanyInfo(dbName) {
  try {
    const db     = openDb(dbName);
    const tables = await getTables(db);
    if (!tables.has('Company_Info')) return { success: true, data: {} };
    const row = await first(db, 'SELECT * FROM Company_Info LIMIT 1');
    return { success: true, data: row || {} };
  } catch (e) { return { success: false, error: e.message, data: {} }; }
}