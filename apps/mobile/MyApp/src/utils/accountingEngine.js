/**
 * accountingEngine.js — Flouris ERP Mobile (bare RN)
 * Pure JS double-entry accounting engine. No dependencies.
 */

// ── Fixed account IDs ─────────────────────────────────────────────────────────
export const CASH_ACCOUNT     = 1;
export const PURCHASE_ACCOUNT = 2;
export const SALES_ACCOUNT    = 3;

// ── Head classifications ──────────────────────────────────────────────────────
export const HEAD_CAPITAL     = 1;
export const HEAD_LIABILITIES = 2;
export const HEAD_ASSETS      = 3;
export const HEAD_INCOME      = 4;
export const HEAD_EXPENSES    = 5;

// ── Currency formatter ────────────────────────────────────────────────────────
export const PKR = (n) => {
  if (n == null || n === 0) return '—';
  return Number(n).toLocaleString('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

// ── Posting rules ─────────────────────────────────────────────────────────────
export function postingsForRow(row) {
  const vtype  = Math.round(row.VType || 0);
  const amount = row.Amount;
  const party  = row.Account_Party;
  const party2 = row.AC_Party2;

  if (amount == null || amount === 0) return [];

  if (vtype === 100) {
    const acct = party || party2;
    if (!acct) return [];
    if (amount > 0) return [{ accountId: acct, debit: amount, credit: 0 }];
    return [{ accountId: acct, debit: 0, credit: Math.abs(amount) }];
  }

  if (vtype === 101 || vtype === 204 || vtype === 207) {
    return [
      { accountId: CASH_ACCOUNT,        debit: amount, credit: 0 },
      { accountId: party || party2,     debit: 0,      credit: amount },
    ].filter(p => p.accountId != null && p.accountId !== 0);
  }

  if (vtype === 102 || vtype === 203 || vtype === 208) {
    return [
      { accountId: CASH_ACCOUNT,        debit: 0,      credit: amount },
      { accountId: party || party2,     debit: amount, credit: 0 },
    ].filter(p => p.accountId != null && p.accountId !== 0);
  }

  if (vtype === 201 || vtype === 202) {
    return [
      { accountId: party  || party2, debit: amount, credit: 0 },
      { accountId: party2 || party,  debit: 0,      credit: amount },
    ].filter(p => p.accountId != null && p.accountId !== 0);
  }

  if (vtype === 301) {
    return [
      { accountId: PURCHASE_ACCOUNT, debit: amount, credit: 0 },
      { accountId: CASH_ACCOUNT,     debit: 0,      credit: amount },
    ];
  }

  if (vtype === 302) {
    return [
      { accountId: PURCHASE_ACCOUNT,    debit: amount, credit: 0 },
      { accountId: party || party2,     debit: 0,      credit: amount },
    ].filter(p => p.accountId != null && p.accountId !== 0);
  }

  if (vtype === 304) {
    return [
      { accountId: party || party2,     debit: amount, credit: 0 },
      { accountId: PURCHASE_ACCOUNT,    debit: 0,      credit: amount },
    ].filter(p => p.accountId != null && p.accountId !== 0);
  }

  if (vtype === 401) {
    return [
      { accountId: CASH_ACCOUNT,  debit: amount, credit: 0 },
      { accountId: SALES_ACCOUNT, debit: 0,      credit: amount },
    ];
  }

  if (vtype === 402) {
    return [
      { accountId: party || party2, debit: amount, credit: 0 },
      { accountId: SALES_ACCOUNT,   debit: 0,      credit: amount },
    ].filter(p => p.accountId != null && p.accountId !== 0);
  }

  if (vtype === 404) {
    return [
      { accountId: SALES_ACCOUNT,   debit: amount, credit: 0 },
      { accountId: party || party2, debit: 0,      credit: amount },
    ].filter(p => p.accountId != null && p.accountId !== 0);
  }

  return [];
}

// ── Accumulate postings ───────────────────────────────────────────────────────
export function applyPostings(rows) {
  const debits   = new Map();
  const credits  = new Map();
  const balances = new Map();

  for (const row of rows) {
    for (const p of postingsForRow(row)) {
      debits.set(p.accountId,   (debits.get(p.accountId)   || 0) + p.debit);
      credits.set(p.accountId,  (credits.get(p.accountId)  || 0) + p.credit);
      balances.set(p.accountId, (balances.get(p.accountId) || 0) + p.debit - p.credit);
    }
  }
  return { debits, credits, balances };
}

// ── Trial Balance ─────────────────────────────────────────────────────────────
export function calculateTrialBalance(invRows, acMeta) {
  const { debits, credits } = applyPostings(invRows);
  const allIds = new Set([...debits.keys(), ...credits.keys()]);

  let totalDebit = 0, totalCredit = 0;
  const subGroups = new Map();
  const flatRows  = [];
  const metaMap   = new Map((acMeta || []).map(a => [Number(a.CA), a]));

  for (const id of [...allIds].sort((a, b) => a - b)) {
    const d   = debits.get(id)  || 0;
    const c   = credits.get(id) || 0;
    const net = d - c;
    if (Math.round(net * 100) === 0) continue;

    const rowDebit  = net > 0 ? net : 0;
    const rowCredit = net < 0 ? Math.abs(net) : 0;
    totalDebit  += rowDebit;
    totalCredit += rowCredit;

    const meta   = metaMap.get(id) || {};
    const subKey = meta.subAccId || 0;

    if (!subGroups.has(subKey)) {
      subGroups.set(subKey, {
        subAccId: subKey,
        subName:  meta.subName  || 'Unclassified',
        subNameU: meta.subNameU || '',
        headId:   meta.headId   || 0,
        headName: meta.headName || '',
        rows: [], groupDebit: 0, groupCredit: 0,
      });
    }
    const g = subGroups.get(subKey);
    g.rows.push({
      accountId:     id,
      accountName:   meta.AC_TITLE1 || `A/C #${id}`,
      accountNameUr: meta.uacTitle  || meta.AC_TITLE1 || `A/C #${id}`,
      debit: rowDebit, credit: rowCredit,
    });
    g.groupDebit  += rowDebit;
    g.groupCredit += rowCredit;

    flatRows.push({
      accountId:     id,
      accountName:   meta.AC_TITLE1 || `A/C #${id}`,
      accountNameUr: meta.uacTitle  || meta.AC_TITLE1 || `A/C #${id}`,
      headId: meta.headId || 0, subAccId: meta.subAccId || 0,
      subName: meta.subName || '',
      debit: rowDebit, credit: rowCredit,
    });
  }

  const groups = [...subGroups.values()].filter(g => g.rows.length > 0);
  return {
    rows: flatRows, groups, totalDebit, totalCredit,
    difference: Math.round((totalDebit - totalCredit) * 100) / 100,
  };
}

// ── Balance Sheet ─────────────────────────────────────────────────────────────
export function calculateBalanceSheet(invRows, acMeta) {
  const { balances } = applyPostings(invRows);
  const metaMap = new Map((acMeta || []).map(a => [Number(a.CA), a]));

  const assetGroupsMap  = new Map();
  const liabGroupsMap   = new Map();
  const equityGroupsMap = new Map();

  const ensureGroup = (map, key, m, headId, headName) => {
    if (!map.has(key)) {
      map.set(key, {
        subAccId: m.subAccId || 0,
        headId, headName,
        subName:  m.subName  || 'Other',
        subNameU: m.subNameU || '',
        accounts: [], total: 0,
      });
    }
    return map.get(key);
  };

  let netIncome = 0, netExpense = 0;

  for (const [CA, m] of metaMap) {
    const bal = balances.get(CA) || 0;
    if (Math.round(bal * 100) === 0) continue;

    if (m.headId === HEAD_INCOME)   { netIncome  += (-bal); continue; }
    if (m.headId === HEAD_EXPENSES) { netExpense += bal;    continue; }
    if (m.headId < 1 || m.headId > 3) continue;

    const absBal = Math.abs(bal);
    const subKey = `${m.headId}_${m.subAccId || 0}`;
    const acEntry = {
      accountId:     CA,
      accountName:   m.AC_TITLE1 || `A/C #${CA}`,
      accountNameUr: m.uacTitle  || m.AC_TITLE1 || `A/C #${CA}`,
      balance: absBal,
    };

    if (m.headId === HEAD_ASSETS) {
      const g = ensureGroup(assetGroupsMap, subKey, m, HEAD_ASSETS, 'Assets');
      g.accounts.push(acEntry); g.total += absBal;
    } else if (m.headId === HEAD_LIABILITIES) {
      const g = ensureGroup(liabGroupsMap, subKey, m, HEAD_LIABILITIES, 'Liabilities');
      g.accounts.push(acEntry); g.total += absBal;
    } else if (m.headId === HEAD_CAPITAL) {
      const g = ensureGroup(equityGroupsMap, subKey, m, HEAD_CAPITAL, 'Equity/Capital');
      g.accounts.push(acEntry); g.total += absBal;
    }
  }

  const netPL = netIncome - netExpense;
  if (Math.round(Math.abs(netPL) * 100) > 0) {
    const plLabel = netPL >= 0 ? 'Net Profit' : 'Net Loss';
    const plKey   = 'equity_pl';
    if (!equityGroupsMap.has(plKey)) {
      equityGroupsMap.set(plKey, { subAccId: 0, headId: HEAD_CAPITAL, headName: 'Equity/Capital', subName: 'P&L', subNameU: 'نفع/نقصان', accounts: [], total: 0 });
    }
    const g = equityGroupsMap.get(plKey);
    g.accounts.push({ accountId: 0, accountName: plLabel, accountNameUr: netPL >= 0 ? 'خالص نفع' : 'خالص نقصان', balance: Math.abs(netPL) });
    g.total += Math.abs(netPL);
  }

  const assets      = [...assetGroupsMap.values()];
  const liabilities = [...liabGroupsMap.values()];
  const equity      = [...equityGroupsMap.values()];

  const totalAssets = assets.reduce((s, g) => s + g.total, 0);
  const totalLE     = liabilities.reduce((s, g) => s + g.total, 0) + equity.reduce((s, g) => s + g.total, 0);
  const totalLiab   = liabilities.reduce((s, g) => s + g.total, 0);

  return {
    assets, liabilities, equity,
    totalAssets, totalLE, totalLiab,
    balanceDiff: Math.round(Math.abs(totalAssets - totalLE) * 100) / 100,
  };
}

// ── Profit & Loss ─────────────────────────────────────────────────────────────
export function calculateProfitLoss(invRows, acMeta) {
  const { balances } = applyPostings(invRows);
  const metaMap = new Map((acMeta || []).map(a => [Number(a.CA), a]));

  const incomeGroups  = new Map();
  const expenseGroups = new Map();

  for (const [CA, m] of metaMap) {
    const bal = balances.get(CA) || 0;
    if (Math.round(bal * 100) === 0) continue;

    if (m.headId === HEAD_INCOME) {
      const amount = Math.abs(bal);
      const key = m.subAccId || 0;
      if (!incomeGroups.has(key)) {
        incomeGroups.set(key, { headName: m.subName || 'Income', headNameU: m.subNameU || '', accounts: [], total: 0 });
      }
      const g = incomeGroups.get(key);
      g.accounts.push({ accountId: CA, accountName: m.AC_TITLE1 || `A/C #${CA}`, accountNameUr: m.uacTitle || m.AC_TITLE1 || `A/C #${CA}`, amount });
      g.total += amount;
    }

    if (m.headId === HEAD_EXPENSES) {
      const amount = Math.abs(bal);
      const key = m.subAccId || 0;
      if (!expenseGroups.has(key)) {
        expenseGroups.set(key, { headName: m.subName || 'Expenses', headNameU: m.subNameU || '', accounts: [], total: 0 });
      }
      const g = expenseGroups.get(key);
      g.accounts.push({ accountId: CA, accountName: m.AC_TITLE1 || `A/C #${CA}`, accountNameUr: m.uacTitle || m.AC_TITLE1 || `A/C #${CA}`, amount });
      g.total += amount;
    }
  }

  const income       = [...incomeGroups.values()];
  const expenses     = [...expenseGroups.values()];
  const totalIncome  = income.reduce((s, g) => s + g.total, 0);
  const totalExpenses = expenses.reduce((s, g) => s + g.total, 0);

  return { income, expenses, totalIncome, totalExpenses, netProfitLoss: totalIncome - totalExpenses };
}

// ── Account Statement ─────────────────────────────────────────────────────────
export function calculateAccountStatement(openingRows, txRows, accountId, openingBalance, acNameMap, vtMapEn, vtMapUr) {
  let runningBal = openingBalance || 0;

  // Apply opening rows to get opening balance
  for (const row of openingRows) {
    for (const p of postingsForRow(row)) {
      if (p.accountId === accountId) {
        runningBal += p.debit - p.credit;
      }
    }
  }

  const transactions = [];
  for (const row of txRows) {
    let debit = 0, credit = 0;
    for (const p of postingsForRow(row)) {
      if (p.accountId === accountId) {
        debit  += p.debit;
        credit += p.credit;
      }
    }
    if (debit === 0 && credit === 0) continue;
    runningBal += debit - credit;

    const counterParty = row.Account_Party === accountId ? row.AC_Party2 : row.Account_Party;
    const cpMeta = acNameMap ? acNameMap.get(counterParty) : null;

    transactions.push({
      date:          row.TR_Date,
      voucherNo:     row.V_No   || row.TR_No,
      voucherType:   vtMapEn ? vtMapEn.get(row.VType) || `V${row.VType}` : `V${row.VType}`,
      voucherTypeUr: vtMapUr ? vtMapUr.get(row.VType) || `V${row.VType}` : `V${row.VType}`,
      narration:     row.Narration || (cpMeta ? cpMeta.en : '') || '',
      narrationUr:   row.Narration || (cpMeta ? cpMeta.ur : '') || '',
      debit, credit,
      balance: runningBal,
    });
  }

  return { transactions, closingBalance: runningBal };
}
