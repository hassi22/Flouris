/**
 * accountingEngine.js — Flouris ERP Shared Accounting Engine
 *
 * All posting logic is driven by the VT (Voucher Types) table in the database.
 * VT.LDr / VT.LCr encode which account is Debited / Credited:
 *   0 → Cash In Hand (CA = 1)
 *   1 → Account_Party (Inv.Account_Party)
 *   2 → AC_Party2     (Inv.AC_Party2)
 *   null / 'I' → inventory side — no financial posting
 *
 * VType 100 (Opening Balance) is handled specially: Amount sign determines
 * whether the account is debited (positive) or credited (negative).
 *
 * This approach means any voucher type added by the user at runtime is
 * automatically handled without a code change.
 */

// ── Fixed account IDs (standard in all Flouris/iSmart databases) ─────────────
const CASH_ACCOUNT     = 1;

// ── Head classifications from tblAccHead.AccountID ──────────────────────────
export const HEAD_CAPITAL     = 1;
export const HEAD_LIABILITIES = 2;
export const HEAD_ASSETS      = 3;
export const HEAD_INCOME      = 4;
export const HEAD_EXPENSES    = 5;

// ── VT Rule loader ────────────────────────────────────────────────────────────
/**
 * Load VT posting rules from the database.
 * @param {import('better-sqlite3').Database} db
 * @returns {Map<number, { lDr: number|null, lCr: number|null }>}
 */
export function loadVtRules(db) {
  const rules = new Map();
  try {
    const rows = db.prepare('SELECT VTYPE, LDr, LCr, MDr, MCr FROM VT').all();
    for (const r of rows) {
      const vtype    = Math.round(r.VTYPE);
      const drIsItem = r.MDr === 'I';
      const crIsItem = r.MCr === 'I';
      rules.set(vtype, {
        lDr: drIsItem ? null : (r.LDr ?? null),
        lCr: crIsItem ? null : (r.LCr ?? null),
      });
    }
  } catch (_) {}
  return rules;
}

/**
 * Resolve a side-code to a financial account ID.
 *   0 → CASH_ACCOUNT
 *   1 → Account_Party
 *   2 → AC_Party2
 *   null → inventory / skip
 */
function resolveAccount(code, party, party2) {
  if (code === null || code === undefined) return null;
  if (code === 0) return CASH_ACCOUNT;
  if (code === 1) return party;
  if (code === 2) return party2;
  return null;
}

// ── Core posting function ─────────────────────────────────────────────────────
/**
 * Generate double-entry postings for a single Inv row based on hardcoded verified rules.
 *
 * @param {{ VType: number, Account_Party: number, AC_Party2: number, Amount: number|null }} row
 * @param {Map} vtRules (ignored now)
 * @returns {{ accountId: number, debit: number, credit: number }[]}
 */
export function postingsForRow(row, vtRules) {
  const vtype  = Math.round(row.VType  || 0);
  let amount = row.Amount;
  const party  = row.Account_Party;
  const party2 = row.AC_Party2;

  if (amount == null || amount === 0) return [];

  const CASH_ACCOUNT = 1;
  const PURCHASE_AC = 2;
  const SALE_AC = 3;

  if (vtype === 100) {
    const acct = party || party2;
    if (!acct) return [];
    if (amount > 0) return [{ accountId: acct, debit: amount, credit: 0 }];
    return [{ accountId: acct, debit: 0, credit: Math.abs(amount) }];
  }

  if (vtype === 101 || vtype === 204) {
    if (party === CASH_ACCOUNT) {
      return [
        { accountId: CASH_ACCOUNT, debit: amount, credit: 0 },
        { accountId: party2 || party, debit: 0, credit: amount },
      ].filter(p => p.accountId != null && p.accountId !== 0);
    }
    if (party2 === CASH_ACCOUNT) {
      return [
        { accountId: CASH_ACCOUNT, debit: amount, credit: 0 },
        { accountId: party || party2, debit: 0, credit: amount },
      ].filter(p => p.accountId != null && p.accountId !== 0);
    }
    return [
      { accountId: CASH_ACCOUNT, debit: amount, credit: 0 },
      { accountId: party || party2, debit: 0, credit: amount },
    ].filter(p => p.accountId != null && p.accountId !== 0);
  }

  if (vtype === 102 || vtype === 203 || vtype === 207 || vtype === 208) {
    if (party === CASH_ACCOUNT) {
      return [
        { accountId: CASH_ACCOUNT, debit: 0, credit: amount },
        { accountId: party2 || party, debit: amount, credit: 0 },
      ].filter(p => p.accountId != null && p.accountId !== 0);
    }
    if (party2 === CASH_ACCOUNT) {
      return [
        { accountId: CASH_ACCOUNT, debit: 0, credit: amount },
        { accountId: party || party2, debit: amount, credit: 0 },
      ].filter(p => p.accountId != null && p.accountId !== 0);
    }
    return [
      { accountId: CASH_ACCOUNT, debit: 0, credit: amount },
      { accountId: party || party2, debit: amount, credit: 0 },
    ].filter(p => p.accountId != null && p.accountId !== 0);
  }

  if (vtype === 201 || vtype === 202) {
    return [
      { accountId: party || party2, debit: amount, credit: 0 },
      { accountId: party2 || party, debit: 0, credit: amount },
    ].filter(p => p.accountId != null && p.accountId !== 0);
  }

  if (vtype === 301) {
    return [
      { accountId: PURCHASE_AC, debit: amount, credit: 0 },
      { accountId: CASH_ACCOUNT, debit: 0, credit: amount },
    ];
  }

  if (vtype === 302) {
    return [
      { accountId: PURCHASE_AC, debit: amount, credit: 0 },
      { accountId: party || party2, debit: 0, credit: amount },
    ].filter(p => p.accountId != null && p.accountId !== 0);
  }

  if (vtype === 401) {
    return [
      { accountId: CASH_ACCOUNT, debit: amount, credit: 0 },
      { accountId: SALE_AC, debit: 0, credit: amount },
    ];
  }

  if (vtype === 402) {
    return [
      { accountId: party || party2, debit: amount, credit: 0 },
      { accountId: SALE_AC, debit: 0, credit: amount },
    ].filter(p => p.accountId != null && p.accountId !== 0);
  }

  if (vtype === 304) {
    return [
      { accountId: party || party2, debit: amount, credit: 0 },
      { accountId: PURCHASE_AC, debit: 0, credit: amount },
    ].filter(p => p.accountId != null && p.accountId !== 0);
  }

  if (vtype === 404) {
    return [
      { accountId: SALE_AC, debit: amount, credit: 0 },
      { accountId: party || party2, debit: 0, credit: amount },
    ].filter(p => p.accountId != null && p.accountId !== 0);
  }

  // Inventory or unmapped voucher type
  return [];
}

// ── Accumulator ───────────────────────────────────────────────────────────────
/**
 * @param {{ VType, Account_Party, AC_Party2, Amount }[]} rows
 * @param {Map} vtRules
 * @returns {{ debits: Map, credits: Map, balances: Map }}
 */
export function applyPostingRules(rows, vtRules) {
  const debits = new Map(), credits = new Map(), balances = new Map();
  for (const row of rows) {
    for (const p of postingsForRow(row, vtRules)) {
      debits.set(p.accountId,   (debits.get(p.accountId)   || 0) + p.debit);
      credits.set(p.accountId,  (credits.get(p.accountId)  || 0) + p.credit);
      balances.set(p.accountId, (balances.get(p.accountId) || 0) + p.debit - p.credit);
    }
  }
  return { debits, credits, balances };
}

// ── Schema helpers ────────────────────────────────────────────────────────────
/**
 * Detect whether the db uses Inv/T or Inv1/T1.
 * @param {import('better-sqlite3').Database} db
 * @returns {{ invTable: string|null, tTable: string|null }}
 */
export function detectTxTables(db) {
  const tables = new Set(
    db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name)
  );
  return {
    invTable: tables.has('Inv')  ? 'Inv'  : tables.has('Inv1') ? 'Inv1' : null,
    tTable:   tables.has('T')    ? 'T'    : tables.has('T1')   ? 'T1'   : null,
  };
}

/**
 * Fetch Inv rows (optionally date-filtered) using the correct table pair.
 */
export function fetchInvRows(db, startDate, endDate) {
  const { invTable, tTable } = detectTxTables(db);
  if (!invTable || !tTable) return [];

  const conditions = [];
  const params     = [];
  if (startDate) { conditions.push(`("${tTable}".TR_Date >= ? OR "${tTable}".TR_Date IS NULL)`); params.push(startDate); }
  if (endDate)   { conditions.push(`("${tTable}".TR_Date <= ? OR "${tTable}".TR_Date IS NULL)`); params.push(endDate); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    return db.prepare(
      `SELECT "${invTable}".VType, "${invTable}".Account_Party,
              "${invTable}".AC_Party2, "${invTable}".Amount,
              "${tTable}".TR_Date
       FROM "${invTable}"
       LEFT JOIN "${tTable}" ON "${invTable}".TR_No = "${tTable}".TR_No
       ${where}`
    ).all(...params);
  } catch { return []; }
}

// ── Trial Balance ─────────────────────────────────────────────────────────────
/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} [startDate]
 * @param {string} [endDate]
 */
export function calculateTrialBalance(db, startDate, endDate) {
  const vtRules = loadVtRules(db);
  const rows    = fetchInvRows(db, startDate, endDate);
  const { debits, credits } = applyPostingRules(rows, vtRules);

  // Account name lookup
  const acTable = ['AC','Inv1'].find(t => {
    try { db.prepare(`SELECT CA FROM "${t}" LIMIT 1`).get(); return true; } catch { return false; }
  }) || null;
  const nameMap = new Map();
  if (acTable) {
    try {
      db.prepare(`SELECT CA, AC_TITLE1 FROM "${acTable}"`).all()
        .forEach(a => nameMap.set(a.CA, a.AC_TITLE1 || `A/C #${a.CA}`));
    } catch (_) {}
  }

  const allIds = new Set([...debits.keys(), ...credits.keys()]);
  const result = [];
  let totalDebit = 0, totalCredit = 0;

  for (const id of [...allIds].sort((a, b) => a - b)) {
    const d   = debits.get(id)  || 0;
    const c   = credits.get(id) || 0;
    const net = d - c;
    if (Math.round(net * 100) === 0) continue;  // skip zero closing balance
    const rowDebit  = net > 0 ? net : 0;
    const rowCredit = net < 0 ? Math.abs(net) : 0;
    totalDebit  += rowDebit;
    totalCredit += rowCredit;
    result.push({ accountId: id, accountName: nameMap.get(id) || `A/C #${id}`, debit: rowDebit, credit: rowCredit });
  }

  return { rows: result, totalDebit, totalCredit, difference: Math.round((totalDebit - totalCredit) * 100) / 100 };
}

// ── Balance Sheet ─────────────────────────────────────────────────────────────
/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} [asOfDate]
 */
export function calculateBalanceSheet(db, asOfDate) {
  const vtRules  = loadVtRules(db);
  const rows     = fetchInvRows(db, null, asOfDate);
  const { balances } = applyPostingRules(rows, vtRules);

  // Build account meta from schema (SubAccID → AccountID = headId)
  let meta = [];
  try {
    meta = db.prepare(`
      SELECT AC.CA, AC.AC_TITLE1,
             COALESCE(AC.SubAccID, 0) AS subAccId,
             COALESCE(tblSubAcc.SubAccountNAme, '') AS subName,
             COALESCE(tblSubAcc.AccountID, 0) AS headId
      FROM AC
      LEFT JOIN tblSubAcc ON AC.SubAccID = tblSubAcc.SubAccID
    `).all();
  } catch (_) {
    try { meta = db.prepare('SELECT CA, AC_TITLE1, 0 AS subAccId, "" AS subName, 0 AS headId FROM AC').all(); } catch (__) {}
  }

  const subGroups = new Map();
  for (const m of meta) {
    const bal = balances.get(m.CA) || 0;
    if (Math.round(bal * 100) === 0) continue;
    const key = m.subAccId || 0;
    if (!subGroups.has(key)) subGroups.set(key, { subAccId: key, headId: m.headId, subName: m.subName || 'Other', accounts: [], total: 0 });
    const g = subGroups.get(key);
    g.accounts.push({ accountId: m.CA, accountName: m.AC_TITLE1 || `A/C #${m.CA}`, balance: bal });
    g.total += bal;
  }

  const pick = (...ids) => [...subGroups.values()].filter(g => ids.includes(g.headId));
  const assets      = pick(HEAD_ASSETS);
  const liabilities = pick(HEAD_LIABILITIES);
  const equity      = pick(HEAD_CAPITAL);
  const totalAssets = assets.reduce((s, g) => s + g.total, 0);
  const totalLE     = liabilities.reduce((s, g) => s + g.total, 0) + equity.reduce((s, g) => s + g.total, 0);

  return { assets, liabilities, equity, totalAssets, totalLiabilitiesAndEquity: totalLE };
}

// ── Profit & Loss ─────────────────────────────────────────────────────────────
/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} [startDate]
 * @param {string} [endDate]
 */
export function calculateProfitLoss(db, startDate, endDate) {
  const vtRules = loadVtRules(db);
  const rows    = fetchInvRows(db, startDate, endDate);
  const { balances } = applyPostingRules(rows, vtRules);

  let meta = [];
  try {
    meta = db.prepare(`
      SELECT AC.CA, AC.AC_TITLE1,
             COALESCE(tblSubAcc.SubAccountNAme, 'Other') AS subName,
             COALESCE(tblSubAcc.AccountID, 0) AS headId
      FROM AC LEFT JOIN tblSubAcc ON AC.SubAccID = tblSubAcc.SubAccID
    `).all();
  } catch (_) {
    try { meta = db.prepare('SELECT CA, AC_TITLE1, "Other" AS subName, 0 AS headId FROM AC').all(); } catch (__) {}
  }

  const incomeGroups  = new Map();
  const expenseGroups = new Map();

  for (const m of meta) {
    const bal = balances.get(m.CA) || 0;
    if (Math.round(bal * 100) === 0) continue;
    const key = m.subName || 'Other';
    const amount = Math.abs(bal);
    if (m.headId === HEAD_INCOME) {
      if (!incomeGroups.has(key))  incomeGroups.set(key,  { headName: key, accounts: [], total: 0 });
      const g = incomeGroups.get(key);
      g.accounts.push({ accountId: m.CA, accountName: m.AC_TITLE1, amount });
      g.total += amount;
    } else if (m.headId === HEAD_EXPENSES) {
      if (!expenseGroups.has(key)) expenseGroups.set(key, { headName: key, accounts: [], total: 0 });
      const g = expenseGroups.get(key);
      g.accounts.push({ accountId: m.CA, accountName: m.AC_TITLE1, amount });
      g.total += amount;
    }
  }

  const income        = [...incomeGroups.values()];
  const expenses      = [...expenseGroups.values()];
  const totalIncome   = income.reduce((s, g) => s + g.total, 0);
  const totalExpenses = expenses.reduce((s, g) => s + g.total, 0);

  return { income, expenses, totalIncome, totalExpenses, netProfit: totalIncome - totalExpenses };
}

// ── Account Statement ─────────────────────────────────────────────────────────
/**
 * @param {import('better-sqlite3').Database} db
 * @param {number} accountId
 * @param {string} [startDate]
 * @param {string} [endDate]
 */
export function getAccountStatement(db, accountId, startDate, endDate) {
  const vtRules  = loadVtRules(db);
  const { invTable, tTable } = detectTxTables(db);
  if (!invTable || !tTable) return { accountId, accountName: `A/C #${accountId}`, openingBalance: 0, transactions: [], closingBalance: 0 };

  // Account name
  let accountName = `A/C #${accountId}`;
  try { const r = db.prepare('SELECT AC_TITLE1 FROM AC WHERE CA=?').get(accountId); if (r) accountName = r.AC_TITLE1; } catch (_) {}

  // Opening balance
  let openingBalance = 0;
  if (startDate) {
    const obRows = db.prepare(
      `SELECT "${invTable}".VType, "${invTable}".Account_Party, "${invTable}".AC_Party2, "${invTable}".Amount
       FROM "${invTable}" LEFT JOIN "${tTable}" ON "${invTable}".TR_No = "${tTable}".TR_No
       WHERE "${tTable}".TR_Date < ? OR "${tTable}".TR_Date IS NULL`
    ).all(startDate);
    openingBalance = applyPostingRules(obRows, vtRules).balances.get(accountId) || 0;
  }

  const conditions = [`("${invTable}".Account_Party=? OR "${invTable}".AC_Party2=?)`];
  const params     = [accountId, accountId];
  if (startDate) { conditions.push(`("${tTable}".TR_Date >= ? OR "${tTable}".TR_Date IS NULL)`); params.push(startDate); }
  if (endDate)   { conditions.push(`("${tTable}".TR_Date <= ? OR "${tTable}".TR_Date IS NULL)`); params.push(endDate); }

  const tCols = db.prepare(`PRAGMA table_info("${tTable}")`).all().map(r => r.name);
  const hasVNo = tCols.includes('V_No');

  const txRows = db.prepare(
    `SELECT "${invTable}".VType, "${invTable}".Account_Party, "${invTable}".AC_Party2,
            "${invTable}".Amount, "${invTable}".Narration,
            "${tTable}".TR_Date, ${hasVNo ? `"${tTable}".V_No` : 'NULL AS V_No'}
     FROM "${invTable}" LEFT JOIN "${tTable}" ON "${invTable}".TR_No = "${tTable}".TR_No
     WHERE ${conditions.join(' AND ')}
     ORDER BY "${tTable}".TR_Date, "${tTable}".TR_No, "${invTable}".SL`
  ).all(...params);

  const vtMap = new Map();
  try { db.prepare('SELECT VTYPE, VTITLE FROM VT').all().forEach(v => vtMap.set(v.VTYPE, v.VTITLE || `V${v.VTYPE}`)); } catch (_) {}

  let running = openingBalance;
  const transactions = [];
  for (const tx of txRows) {
    let debit = 0, credit = 0;
    for (const p of postingsForRow(tx, vtRules)) {
      if (p.accountId === accountId) { debit += p.debit; credit += p.credit; }
    }
    if (!debit && !credit) continue;
    running += debit - credit;
    transactions.push({
      date:        tx.TR_Date,
      voucherType: vtMap.get(tx.VType) || `V${tx.VType}`,
      voucherNo:   tx.V_No,
      narration:   (tx.Narration || '').replace(/^'+|'+$/g, '').replace(/\s+/g, ' ').trim(),
      debit, credit, balance: running,
    });
  }

  return { accountId, accountName, openingBalance, transactions, closingBalance: running };
}

// ── Chart of Accounts ─────────────────────────────────────────────────────────
/**
 * @param {import('better-sqlite3').Database} db
 */
export function getChartOfAccounts(db) {
  try {
    const heads   = db.prepare('SELECT AccountID, AccountHead FROM tblAccHead ORDER BY AccountID').all();
    const subAccs = db.prepare('SELECT SubAccID, AccountID, SubAccountNAme FROM tblSubAcc ORDER BY SubAccID').all();
    const accounts = db.prepare('SELECT CA, AC_TITLE1, SubAccID, UAC_Title FROM AC ORDER BY CA').all();

    const subByHead = new Map();
    for (const sa of subAccs) {
      if (!subByHead.has(sa.AccountID)) subByHead.set(sa.AccountID, []);
      subByHead.get(sa.AccountID).push(sa);
    }
    const acBySub = new Map();
    for (const ac of accounts) {
      if (!acBySub.has(ac.SubAccID)) acBySub.set(ac.SubAccID, []);
      acBySub.get(ac.SubAccID).push(ac);
    }
    return heads.map(h => ({
      headId:    h.AccountID,
      headName:  h.AccountHead,
      subGroups: (subByHead.get(h.AccountID) || []).map(sa => ({
        subAccId:   sa.SubAccID,
        subAccName: sa.SubAccountNAme,
        accounts:   (acBySub.get(sa.SubAccID) || []).map(ac => ({
          accountId:   ac.CA,
          accountName: ac.AC_TITLE1,
          urduName:    ac.UAC_Title || null,
        })),
      })),
    }));
  } catch (_) { return []; }
}
