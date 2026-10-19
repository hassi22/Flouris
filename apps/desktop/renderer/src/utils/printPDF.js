/**
 * printPDF.js — Flouris ERP
 *
 * Compact, multi-table PDF layout. Uses inline CSS so Electron's printToPDF
 * renders it faithfully. Each report type gets a tailored layout:
 *   - Trial Balance  : single wide table, 8pt rows, fits ~60 rows/page
 *   - Balance Sheet  : two side-by-side tables (Assets | Liabilities+Equity)
 *   - Profit & Loss  : two side-by-side columns (Income | Expenses)
 *   - Acct Statement : narrow compact table
 */

const api = window.electronAPI;

const PKR = n => {
  if (n == null || n === 0) return '—';
  return Number(n).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const ESC = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

// ── Shared CSS injected into every PDF ──────────────────────────────────────
function sharedCSS(isUrdu) {
  const dir  = isUrdu ? 'rtl' : 'ltr';
  const font = isUrdu
    ? "'Noto Nastaliq Urdu','Jameel Noori Nastaleeq','Arial Unicode MS',serif"
    : "'Segoe UI','Helvetica Neue',Arial,sans-serif";
  const fs   = isUrdu ? '11pt' : '8.5pt';
  const lh   = isUrdu ? 2.0   : 1.4;

  return `
    @import url('https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;600;700&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}
    @page{margin:10mm 12mm;size:A4}
    body{font-family:${font};font-size:${fs};line-height:${lh};color:#1a1a2e;direction:${dir}}
    .page{padding:6px 0;page-break-after:always}
    .page:last-child{page-break-after:avoid}
    .report-header{border-bottom:2px solid #4f46e5;padding-bottom:6px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:flex-end}
    .report-header .left .company{font-size:${isUrdu?'13pt':'11pt'};font-weight:700;color:#4f46e5}
    .report-header .left .title{font-size:${isUrdu?'11pt':'9.5pt'};font-weight:600;margin-top:2px}
    .report-header .right{font-size:7.5pt;color:#64748b;text-align:${isUrdu?'left':'right'}}
    /* Tables */
    table{width:100%;border-collapse:collapse}
    th{background:#4f46e5;color:#fff;padding:4px 7px;font-size:7.5pt;font-weight:600;
       text-align:${isUrdu?'right':'left'};white-space:nowrap}
    td{padding:3px 7px;border-bottom:1px solid #e2e8f0;font-size:${fs};vertical-align:top}
    tr:nth-child(even) td{background:#f8fafc}
    .tr{text-align:${isUrdu?'left':'right'}}
    .group-row td{background:#e0e7ff;font-weight:700;font-size:7.5pt;color:#3730a3;padding:4px 7px}
    .sub-row td{background:#f0f4ff;font-weight:600;font-size:7.5pt;padding:3px 7px}
    .total-row td{background:#eef2ff;font-weight:700;border-top:2px solid #6366f1;font-size:8pt}
    .grand-total td{background:#4f46e5;color:#fff;font-weight:700;font-size:8.5pt}
    /* Two-column layout for BS and P&L */
    .two-col{display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:start}
    .col-card{border:1px solid #c7d2fe;border-radius:4px;overflow:hidden}
    .col-card-head{background:#4f46e5;color:#fff;font-weight:700;font-size:8pt;
                   padding:5px 8px;text-transform:uppercase;letter-spacing:.03em}
    .col-card-head.assets{background:#1d4ed8}
    .col-card-head.liab{background:#7c3aed}
    .col-card-head.equity{background:#0f766e}
    .col-card-head.income{background:#15803d}
    .col-card-head.expense{background:#b45309}
    /* Summary box */
    .summary-box{margin-top:8px;border:1px solid #c7d2fe;border-radius:4px;overflow:hidden}
    .summary-box table{margin:0}
    .summary-box th{background:#1e1b4b;font-size:7.5pt}
    .summary-box td{padding:4px 10px;font-size:8pt}
    .highlight td{background:#eef2ff;font-weight:700;color:#4f46e5;font-size:9pt}
    /* Mill P&L */
    .amount{text-align:${isUrdu?'left':'right'};white-space:nowrap}
    .muted{color:#64748b;font-size:7.5pt}
    .green{color:#15803d}
    .red{color:#b91c1c}
    .purple{color:#6d28d9}
    .blue{color:#1d4ed8}
    .group-green td{background:#f0fdf4;font-weight:700}
    .group-purple td{background:#faf5ff;font-weight:700}
    .group-red td{background:#fef2f2;font-weight:700}
    .summary-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:8px}
    .summary-card{border:1px solid #c7d2fe;border-radius:4px;padding:6px 8px;background:#fafafa}
    .summary-label{font-size:7pt;color:#64748b}
    .summary-value{font-size:9pt;font-weight:800;margin-top:1px}
    .summary-sub{font-size:6.8pt;color:#64748b;margin-top:1px}
    /* Footer */
    .pdf-footer{margin-top:8px;font-size:7pt;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:4px;display:flex;justify-content:space-between}
  `;
}

// ── Header bar ───────────────────────────────────────────────────────────────
function header(companyName, title, subtitle, generatedAt, isUrdu, logoData) {
  return `
  <div class="report-header">
    <div class="left">${logoData ? `<img src="${logoData}" style="width:42px;height:42px;object-fit:contain;float:${isUrdu?'right':'left'};margin-${isUrdu?'left':'right'}:8px">` : ''}
      <div class="company">${ESC(companyName)}</div>
      <div class="title">${ESC(title)}</div>
      ${subtitle ? `<div style="font-size:7.5pt;color:#64748b;margin-top:1px">${ESC(subtitle)}</div>` : ''}
    </div>
    <div class="right">
      ${isUrdu ? 'تیار کردہ:' : 'Generated:'}<br>${ESC(generatedAt)}
    </div>
  </div>`;
}

// ── Footer ───────────────────────────────────────────────────────────────────
function footer(isUrdu, companyName) {
  return `<div class="pdf-footer">
    <span>${ESC(companyName)} — Flouris ERP</span>
    <span>${isUrdu ? 'تمام حقوق محفوظ ہیں' : 'All rights reserved'}</span>
  </div>`;
}

// ── BUILD: Trial Balance ──────────────────────────────────────────────────────
function buildTrialBalance({ rows, groups, totals, title, subtitle, companyName, isUrdu, generatedAt, t, logoData }) {
  const dir = isUrdu ? 'rtl' : 'ltr';
  const acNo    = isUrdu ? 'کھاتہ نمبر' : 'A/C #';
  const acName  = isUrdu ? 'اکاؤنٹ کا نام' : 'Account Name';
  const drCol   = isUrdu ? 'ڈیبٹ (روپے)' : 'Debit (Rs.)';
  const crCol   = isUrdu ? 'کریڈٹ (روپے)' : 'Credit (Rs.)';
  const totalLbl = isUrdu ? 'کل' : 'Total';
  const balLbl  = totals.difference === 0 ? (isUrdu ? '✓ متوازن' : '✓ Balanced') : `Diff: ${PKR(Math.abs(totals.difference))}`;

  const accountRow = r => `
    <tr>
      <td style="color:#64748b;font-family:monospace;font-size:7.5pt">${r.accountId}</td>
      <td>${ESC(isUrdu ? (r.accountNameUr || r.accountName) : r.accountName)}</td>
      <td class="tr" style="color:${r.debit ? '#dc2626' : '#94a3b8'}">${PKR(r.debit)}</td>
      <td class="tr" style="color:${r.credit ? '#15803d' : '#94a3b8'}">${PKR(r.credit)}</td>
    </tr>`;

  const groupedRows = (groups || []).map(group => `
    <tr class="group-row"><td colspan="2">${ESC(isUrdu ? (group.subNameU || group.subName || group.headName) : (group.subName || group.headName || 'Unclassified'))}</td><td class="tr">${PKR(group.groupDebit)}</td><td class="tr">${PKR(group.groupCredit)}</td></tr>
    ${(group.rows || []).map(accountRow).join('')}
    <tr class="sub-row"><td colspan="2">${ESC(isUrdu ? 'ذیلی کل' : 'Group Subtotal')}</td><td class="tr">${PKR(group.groupDebit)}</td><td class="tr">${PKR(group.groupCredit)}</td></tr>`).join('');
  const tableRows = groupedRows || rows.map(accountRow).join('');

  return `<!DOCTYPE html><html dir="${dir}" lang="${isUrdu?'ur':'en'}">
<head><meta charset="UTF-8"><style>${sharedCSS(isUrdu)}</style></head>
<body>
  <div class="page">
    ${header(companyName, title, subtitle, generatedAt, isUrdu, logoData)}
    <table>
      <thead><tr>
        <th style="width:55px">${acNo}</th><th>${acName}</th>
        <th class="tr" style="width:130px">${drCol}</th>
        <th class="tr" style="width:130px">${crCol}</th>
      </tr></thead>
      <tbody>${tableRows}</tbody>
      <tfoot>
        <tr class="grand-total">
          <td colspan="2">${totalLbl}</td>
          <td class="tr">${PKR(totals.debit)}</td>
          <td class="tr">${PKR(totals.credit)}</td>
        </tr>
      </tfoot>
    </table>
    <div class="summary-box" style="max-width:340px;margin-${isUrdu?'right':'left'}:auto;margin-top:10px">
      <table>
        <thead><tr><th>${isUrdu?'تفصیل':'Description'}</th><th class="tr">${isUrdu?'رقم':'Amount'}</th></tr></thead>
        <tbody>
          <tr><td>${isUrdu?'کل ڈیبٹ':'Total Debit'}</td><td class="tr" style="color:#dc2626">${PKR(totals.debit)}</td></tr>
          <tr><td>${isUrdu?'کل کریڈٹ':'Total Credit'}</td><td class="tr" style="color:#15803d">${PKR(totals.credit)}</td></tr>
        </tbody>
        <tfoot><tr class="highlight"><td>${isUrdu?'فرق':'Difference'}</td><td class="tr">${balLbl}</td></tr></tfoot>
      </table>
    </div>
    ${footer(isUrdu, companyName)}
  </div>
</body></html>`;
}

// ── BUILD: Balance Sheet (side-by-side two-col) ──────────────────────────────
function buildBalanceSheet({ assets, liabilities, equity, totalAssets, totalLE, balanceDiff, title, subtitle, companyName, isUrdu, generatedAt, logoData }) {
  const dir = isUrdu ? 'rtl' : 'ltr';

  function renderGroup(group, showDrCr) {
    return (group || []).map((g, index) => {
      const groupLabel = isUrdu && g.subNameU && g.subNameU.trim() ? g.subNameU.trim() : g.subName;
      return `
      <tr class="group-row"><td colspan="2">${ESC(groupLabel || (isUrdu ? 'غیر درجہ بند' : 'Unclassified'))}</td></tr>
      ${(g.accounts||[]).map(a => {
        const name = isUrdu ? (a.accountNameUr||a.accountName) : a.accountName;
        const bal  = a.balance || 0;
        const disp = `${PKR(Math.abs(bal))}${bal > 0 ? (isUrdu?' ڈی آر':' Dr') : bal < 0 ? (isUrdu?' سی آر':' Cr') : ''}`;
        return `<tr><td style="padding-inline-start:14px">${ESC(name)}</td>
        <td class="tr" style="color:${bal>=0?'#dc2626':'#15803d'}">${disp}</td></tr>`;
      }).join('')}
      <tr class="sub-row">
        <td>${ESC(groupLabel || (isUrdu ? 'غیر درجہ بند' : 'Unclassified'))} ${isUrdu?'ذیلی کل':'Subtotal'}</td>
        <td class="tr">${PKR(Math.abs(g.total))}</td>
      </tr>`;
    }).join('');
  }

  const assetRows  = renderGroup(assets,      false);
  const liabRows   = renderGroup(liabilities, false);
  const equityRows = renderGroup(equity,       false);

  const totalAssetsLbl = isUrdu ? 'کل اثاثے'   : 'Total Assets';
  const totalLELbl     = isUrdu ? 'کل واجبات + سرمایہ' : 'Total Liabilities + Equity';
  const bDiff = balanceDiff ?? Math.abs(Math.abs(totalAssets) - Math.abs(totalLE));
  const balLbl = bDiff < 1 ? (isUrdu ? '✓ متوازن' : '✓ Balanced') : `Diff: ${PKR(bDiff)}`;

  return `<!DOCTYPE html><html dir="${dir}" lang="${isUrdu?'ur':'en'}">
<head><meta charset="UTF-8"><style>${sharedCSS(isUrdu)}</style></head>
<body>
  <div class="page">
    ${header(companyName, title, subtitle, generatedAt, isUrdu, logoData)}
    <div class="two-col">
      <div class="col-card">
        <div class="col-card-head assets">${isUrdu?'اثاثے':'Assets'}</div>
        <table>
          <thead><tr><th>${isUrdu?'اکاؤنٹ':'Account'}</th><th class="tr">${isUrdu?'رقم (روپے)':'Amount (Rs.)'}</th></tr></thead>
          <tbody>${assetRows}</tbody>
          <tfoot><tr class="total-row"><td>${totalAssetsLbl}</td><td class="tr">${PKR(Math.abs(totalAssets))}</td></tr></tfoot>
        </table>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <div class="col-card">
          <div class="col-card-head liab">${isUrdu?'واجبات':'Liabilities'}</div>
          <table>
            <thead><tr><th>${isUrdu?'اکاؤنٹ':'Account'}</th><th class="tr">${isUrdu?'رقم (روپے)':'Amount (Rs.)'}</th></tr></thead>
            <tbody>${liabRows}</tbody>
          </table>
        </div>
        <div class="col-card">
          <div class="col-card-head equity">${isUrdu?'سرمایہ':'Equity / Capital'}</div>
          <table>
            <thead><tr><th>${isUrdu?'اکاؤنٹ':'Account'}</th><th class="tr">${isUrdu?'رقم (روپے)':'Amount (Rs.)'}</th></tr></thead>
            <tbody>${equityRows}</tbody>
          </table>
        </div>
        <table class="summary-box" style="border:1px solid #c7d2fe">
          <tbody>
            <tr><td>${totalLELbl}</td><td class="tr">${PKR(Math.abs(totalLE))}</td></tr>
            <tr class="highlight"><td>${isUrdu?'بیلنس جانچ':'Balance Check'}</td><td class="tr">${balLbl}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
    ${footer(isUrdu, companyName)}
  </div>
</body></html>`;
}
// ── BUILD: Profit & Loss (two-col: Income | Expenses) ────────────────────────
function buildProfitLoss({ income, expenses, totalIncome, totalExpenses, netProfitLoss, title, subtitle, companyName, isUrdu, generatedAt, logoData }) {
  const dir = isUrdu ? 'rtl' : 'ltr';

  function renderPLGroup(groups, amtColor) {
    return groups.map(g => `
      <tr class="group-row"><td colspan="2">${ESC(g.headName)}</td></tr>
      ${(g.accounts||[]).map(a => `
        <tr><td style="padding-inline-start:12px">${ESC(isUrdu ? (a.accountNameUr||a.accountName) : a.accountName)}</td>
        <td class="tr" style="color:${amtColor}">${PKR(a.amount)}</td></tr>
      `).join('')}
      <tr class="sub-row">
        <td>${ESC(g.headName)} ${isUrdu?'ذیلی کل':'Subtotal'}</td>
        <td class="tr">${PKR(g.total)}</td>
      </tr>`).join('');
  }

  const isProfit  = netProfitLoss >= 0;
  const netLabel  = isUrdu ? (isProfit ? 'خالص نفع' : 'خالص نقصان') : (isProfit ? 'Net Profit' : 'Net Loss');
  const netColor  = isProfit ? '#15803d' : '#b91c1c';

  return `<!DOCTYPE html><html dir="${dir}" lang="${isUrdu?'ur':'en'}">
<head><meta charset="UTF-8"><style>${sharedCSS(isUrdu)}</style></head>
<body>
  <div class="page">
    ${header(companyName, title, subtitle, generatedAt, isUrdu, logoData)}
    <div class="two-col">
      <div class="col-card">
        <div class="col-card-head income">${isUrdu?'آمدنی':'Income / Revenue'}</div>
        <table>
          <thead><tr><th>${isUrdu?'اکاؤنٹ':'Account'}</th><th class="tr">${isUrdu?'رقم':'Amount (Rs.)'}</th></tr></thead>
          <tbody>${renderPLGroup(income,'#15803d')}</tbody>
          <tfoot><tr class="total-row"><td>${isUrdu?'کل آمدنی':'Total Income'}</td><td class="tr" style="color:#15803d">${PKR(totalIncome)}</td></tr></tfoot>
        </table>
      </div>
      <div class="col-card">
        <div class="col-card-head expense">${isUrdu?'اخراجات':'Expenses'}</div>
        <table>
          <thead><tr><th>${isUrdu?'اکاؤنٹ':'Account'}</th><th class="tr">${isUrdu?'رقم':'Amount (Rs.)'}</th></tr></thead>
          <tbody>${renderPLGroup(expenses,'#b45309')}</tbody>
          <tfoot><tr class="total-row"><td>${isUrdu?'کل اخراجات':'Total Expenses'}</td><td class="tr" style="color:#b45309">${PKR(totalExpenses)}</td></tr></tfoot>
        </table>
      </div>
    </div>
    <div class="summary-box" style="max-width:380px;margin-${isUrdu?'right':'left'}:auto;margin-top:10px">
      <table>
        <thead><tr><th colspan="2">${isUrdu?'خلاصہ':'Summary'}</th></tr></thead>
        <tbody>
          <tr><td>${isUrdu?'کل آمدنی':'Total Income'}</td><td class="tr" style="color:#15803d">${PKR(totalIncome)}</td></tr>
          <tr><td>${isUrdu?'کل اخراجات':'Total Expenses'}</td><td class="tr" style="color:#b45309">${PKR(totalExpenses)}</td></tr>
        </tbody>
        <tfoot><tr class="highlight"><td>${netLabel}</td><td class="tr" style="color:${netColor}">${PKR(Math.abs(netProfitLoss))}</td></tr></tfoot>
      </table>
    </div>
    ${footer(isUrdu, companyName)}
  </div>
</body></html>`;
}

// ── BUILD: Account Statement ──────────────────────────────────────────────────
function buildAccountStatement({ transactions, accountName, accountNameUr, openingBalance, closingBalance, title, subtitle, companyName, isUrdu, generatedAt, t, logoData }) {
  const dir = isUrdu ? 'rtl' : 'ltr';
  const displayName = isUrdu ? (accountNameUr || accountName) : accountName;
  const drLbl = isUrdu ? 'ڈی آر' : 'Dr';
  const crLbl = isUrdu ? 'سی آر' : 'Cr';

  const rows = (transactions || []).map(tx => {
    const narr = isUrdu ? (tx.narrationUr || tx.narration || '') : (tx.narration || '');
    const vtype = isUrdu ? (tx.voucherTypeUr || tx.voucherType || '') : (tx.voucherType || '');
    const bal = tx.balance || 0;
    return `<tr>
      <td style="white-space:nowrap;font-size:7.5pt">${ESC(tx.date ? new Date(tx.date).toLocaleDateString('en-PK',{day:'2-digit',month:'short',year:'numeric'}) : '')}</td>
      <td style="font-size:7pt;color:#64748b">${ESC(vtype)}</td>
      <td style="font-size:7pt;color:#64748b">${tx.voucherNo || '—'}</td>
      <td style="font-size:7.5pt">${ESC(narr)}</td>
      <td class="tr" style="color:${tx.debit ? '#1d4ed8' : '#94a3b8'}">${PKR(tx.debit)}</td>
      <td class="tr" style="color:${tx.credit ? '#15803d' : '#94a3b8'}">${PKR(tx.credit)}</td>
      <td class="tr" style="font-weight:600;color:${bal>=0?'#1d4ed8':'#7c3aed'}">${PKR(Math.abs(bal))} ${bal>=0?drLbl:crLbl}</td>
    </tr>`;
  }).join('');

  const opBal = openingBalance || 0;

  return `<!DOCTYPE html><html dir="${dir}" lang="${isUrdu?'ur':'en'}">
<head><meta charset="UTF-8"><style>${sharedCSS(isUrdu)}</style></head>
<body>
  <div class="page">
    ${header(companyName, title, subtitle, generatedAt, isUrdu, logoData)}
    <div style="font-size:8.5pt;font-weight:600;margin-bottom:5px;color:#4f46e5">${ESC(displayName)}</div>
    ${opBal !== 0 ? `<div style="font-size:7.5pt;color:#64748b;margin-bottom:4px">${isUrdu?'ابتدائی بیلنس:':'Opening Balance:'} <strong style="color:${opBal>=0?'#1d4ed8':'#7c3aed'}">${PKR(Math.abs(opBal))} ${opBal>=0?drLbl:crLbl}</strong></div>` : ''}
    <table>
      <thead><tr>
        <th style="width:80px">${isUrdu?'تاریخ':'Date'}</th>
        <th style="width:80px">${isUrdu?'قسم':'Type'}</th>
        <th style="width:50px">${isUrdu?'نمبر':'V.No'}</th>
        <th>${isUrdu?'تفصیل':'Narration'}</th>
        <th class="tr" style="width:100px">${isUrdu?'ڈیبٹ':'Debit'}</th>
        <th class="tr" style="width:100px">${isUrdu?'کریڈٹ':'Credit'}</th>
        <th class="tr" style="width:120px">${isUrdu?'بیلنس':'Balance'}</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr class="grand-total">
          <td colspan="3"></td>
          <td>${isUrdu?'اختتامی بیلنس':'Closing Balance'}</td>
          <td></td><td></td>
          <td class="tr" style="font-weight:700">${PKR(Math.abs(closingBalance||0))} ${(closingBalance||0)>=0?drLbl:crLbl}</td>
        </tr>
      </tfoot>
    </table>
    ${footer(isUrdu, companyName)}
  </div>
</body></html>`;
}

function buildMillPL({
  products = [],
  expenses = [],
  wheatMaan = 0,
  wheatKg = 0,
  wheatRate = 0,
  wheatCost = 0,

  totalWeightKg = 0,
  totalWeightMaan = 0,
  totalSales = 0,
  totalPackingExpense = 0,

  millExpenseRate = 0,
  millExpense = 0,
  otherExpenses = 0,
  totalExpense = 0,

  pnl = 0,
  gainRate = 0,
  gainAmount = 0,
  finalProfitLoss = 0,

  profitPerMaan = 0,
  profitPerKg = 0,
  costPerMaan = 0,
  productionPct = 0,
  unaccountedKg = 0,

  batchName = '',
  title,
  subtitle,
  companyName = 'Flouris ERP',
  isUrdu = false,
  generatedAt = '',
  logoData = null,
}) {
  const dir = isUrdu ? 'rtl' : 'ltr';
  const profit = finalProfitLoss >= 0;

  const productRows = products
    .filter(p => p.enabled !== false)
    .map(p => `
      <tr>
        <td>${ESC(isUrdu ? (p.nameUr || p.nameEn) : p.nameEn)}</td>
        <td class="amount">${PKR(p.qty)}</td>
        <td class="amount">${PKR(p.packingKg)}</td>
        <td class="amount">${PKR(p.rate ?? p.saleRateMaan)}</td>
        <td class="amount">${PKR(p.weightKg)}</td>
        <td class="amount green">${PKR(p.amount)}</td>
      </tr>
    `)
    .join('');

  const packingRows = products
    .filter(p => p.enabled !== false)
    .map(p => `
      <tr>
        <td>${ESC(isUrdu ? (p.nameUr || p.nameEn) : p.nameEn)}</td>
        <td class="amount">${PKR(p.qty)}</td>
        <td class="amount">${PKR(p.bagRate)}</td>
        <td class="amount">${PKR(p.packingExpense)}</td>
      </tr>
    `)
    .join('');

  const otherExpenseRows = expenses
    .filter(e => e.id !== 'millExpense' && Number(e.amount || 0) > 0)
    .map(e => `
      <tr>
        <td>${ESC(isUrdu ? (e.nameUr || e.nameEn) : e.nameEn)}</td>
        <td class="amount red">${PKR(e.amount)}</td>
      </tr>
    `)
    .join('');

  const expenseDetail = otherExpenseRows
    ? `
      <tr class="group-red">
        <td colspan="2">
          ${isUrdu ? 'دیگر اخراجات' : 'Other Expenses'}
        </td>
      </tr>
      ${otherExpenseRows}
    `
    : '';

  const productPnlRows = products
    .filter(p => p.enabled !== false)
    .map(p => `
      <tr>
        <td class="muted">
          ${ESC(isUrdu ? (p.nameUr || p.nameEn) : p.nameEn)}
        </td>
        <td class="muted" style="text-align:center">
          ${PKR(p.qty, 0)} × ${PKR(p.packingKg)} KG ×
          Rs.${PKR(p.rate ?? p.saleRateMaan, 0)}/Maan
        </td>
        <td class="amount green">${PKR(p.amount)}</td>
      </tr>
    `)
    .join('');

  const netLabel = profit
    ? isUrdu
      ? 'حتمی خالص نفع'
      : 'Final Net Profit'
    : isUrdu
      ? 'حتمی خالص نقصان'
      : 'Final Net Loss';
        return `
    <!DOCTYPE html>
    <html dir="${dir}" lang="${isUrdu ? 'ur' : 'en'}">
      <head>
        <meta charset="UTF-8">
        <style>${sharedCSS(isUrdu)}</style>
      </head>

      <body>
        <div class="page">
          ${header(
            companyName,
            title ||
              (isUrdu
                ? 'آٹا چکی نفع و نقصان'
                : 'Flour Mill Profit & Loss'),
            subtitle || batchName,
            generatedAt,
            isUrdu,
            logoData
          )}

          <table>
            <thead>
              <tr>
                <th>${isUrdu ? 'پراڈکٹ' : 'Product'}</th>
                <th class="amount">${isUrdu ? 'تعداد' : 'Qty'}</th>
                <th class="amount">${isUrdu ? 'پیکنگ' : 'Packing KG'}</th>
                <th class="amount">${isUrdu ? 'شرح' : 'Rate / Unit'}</th>
                <th class="amount">${isUrdu ? 'وزن KG' : 'Weight KG'}</th>
                <th class="amount">${isUrdu ? 'رقم' : 'Amount'}</th>
              </tr>
            </thead>

            <tbody>
              ${productRows}

              <tr class="total">
                <td colspan="4">
                  ${isUrdu ? 'کل پیداوار / فروخت' : 'Total Production / Sales'}
                </td>
                <td class="amount">
                  ${PKR(totalWeightKg)} KG
                </td>
                <td class="amount green">
                  ${PKR(totalSales)}
                </td>
              </tr>
            </tbody>
          </table>

          <div class="summary-grid">
            <div class="summary-card">
              <div class="summary-label">
                ${isUrdu ? 'گندم' : 'Wheat'}
              </div>
              <div class="summary-value">
                ${PKR(wheatMaan)} Maan
              </div>
              <div class="summary-sub">
                ${PKR(wheatKg)} KG × Rs.${PKR(wheatRate)}/Maan
              </div>
            </div>

            <div class="summary-card">
              <div class="summary-label">
                ${isUrdu ? 'گندم کی لاگت' : 'Wheat Cost'}
              </div>
              <div class="summary-value purple">
                Rs. ${PKR(wheatCost)}
              </div>
            </div>

            <div class="summary-card">
              <div class="summary-label">
                ${isUrdu ? 'پیداوار فیصد' : 'Production %'}
              </div>
              <div class="summary-value">
                ${PKR(productionPct)}%
              </div>
              <div class="summary-sub">
                ${PKR(totalWeightMaan)} Maan output
              </div>
            </div>
          </div>

          <div style="margin-top:8px">
            <table>
              <thead>
                <tr>
                  <th colspan="4">
                    ${isUrdu ? 'پیکنگ خرچ' : 'Packing Cost'}
                  </th>
                </tr>
                <tr>
                  <th>${isUrdu ? 'پراڈکٹ' : 'Product'}</th>
                  <th class="amount">${isUrdu ? 'تعداد' : 'Qty'}</th>
                  <th class="amount">${isUrdu ? 'بیگ ریٹ' : 'Bag Rate'}</th>
                  <th class="amount">${isUrdu ? 'کل خرچ' : 'Expense'}</th>
                </tr>
              </thead>
              <tbody>
                ${packingRows}
                <tr class="total">
                  <td colspan="3">
                    ${isUrdu ? 'کل پیکنگ خرچ' : 'Total Packing Expense'}
                  </td>
                  <td class="amount">
                    ${PKR(totalPackingExpense)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style="margin-top:8px">
            <table>
              <tbody>
                <tr class="group-purple">
                  <td colspan="2">
                    ${isUrdu ? 'گندم کی لاگت' : 'Wheat Cost'}
                  </td>
                  <td class="amount">
                    (${PKR(wheatCost)})
                  </td>
                </tr>

                <tr>
                  <td colspan="2">
                    ${isUrdu ? 'مل اخراجات' : 'Mill Expense'}
                  </td>
                  <td class="amount red">
                    (${PKR(millExpense)})
                  </td>
                </tr>

                <tr>
                  <td colspan="2">
                    ${isUrdu ? 'پیکنگ خرچ' : 'Packing Expense'}
                  </td>
                  <td class="amount red">
                    (${PKR(totalPackingExpense)})
                  </td>
                </tr>

                ${
                  otherExpenses > 0
                    ? `
                      <tr>
                        <td colspan="2">
                          ${isUrdu ? 'دیگر اخراجات' : 'Other Expenses'}
                        </td>
                        <td class="amount red">
                          (${PKR(otherExpenses)})
                        </td>
                      </tr>
                    `
                    : ''
                }

                ${expenseDetail}

                <tr class="total">
                  <td colspan="2">
                    ${isUrdu ? 'کل اخراجات' : 'Total Expenses'}
                  </td>
                  <td class="amount">
                    ${PKR(totalExpense)}
                  </td>
                </tr>

                <tr class="group-green">
                  <td colspan="2">
                    ${isUrdu ? 'فروخت / آمدنی' : 'Sales / Revenue'}
                  </td>
                  <td class="amount green">
                    ${PKR(totalSales)}
                  </td>
                </tr>

                <tr class="total">
                  <td colspan="2">P&L</td>
                  <td class="amount ${pnl >= 0 ? 'green' : 'red'}">
                    ${PKR(Math.abs(pnl))}
                    ${pnl < 0 ? (isUrdu ? ' (نقصان)' : ' (Loss)') : ''}
                  </td>
                </tr>

                <tr>
                  <td colspan="2">
                    ${isUrdu ? '+ گین' : '+ Gain'}
                    (${PKR(gainRate)}%)
                  </td>
                  <td class="amount blue">
                    ${PKR(gainAmount)}
                  </td>
                </tr>

                <tr class="grand">
                  <td colspan="2">${netLabel}</td>
                  <td class="amount">
                    Rs. ${PKR(Math.abs(finalProfitLoss))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="summary-grid">
            <div class="summary-card">
              <div class="summary-label">
                ${isUrdu ? 'فی ماں نفع' : 'Profit / Maan'}
              </div>
              <div class="summary-value ${profit ? 'green' : 'red'}">
                Rs. ${PKR(Math.abs(profitPerMaan))}
              </div>
            </div>

            <div class="summary-card">
              <div class="summary-label">
                ${isUrdu ? 'فی کلو نفع' : 'Profit / KG'}
              </div>
              <div class="summary-value ${profit ? 'green' : 'red'}">
                Rs. ${PKR(Math.abs(profitPerKg))}
              </div>
            </div>

            <div class="summary-card">
              <div class="summary-label">
                ${isUrdu ? 'لاگت فی ماں' : 'Cost / Maan'}
              </div>
              <div class="summary-value">
                Rs. ${PKR(costPerMaan)}
              </div>
            </div>
          </div>

          <div
            style="
              margin-top:7px;
              font-size:7pt;
              color:#64748b;
              padding:5px 7px;
              background:#f8fafc;
              border:1px solid #e2e8f0;
              border-radius:3px;
            "
          >
            ${
              isUrdu
                ? 'پروڈکٹ رقم = تعداد × شرح۔ وزن = تعداد × پیکنگ KG۔'
                : 'Product Amount = Qty × Rate. Weight = Qty × Packing KG.'
            }
          </div>

          ${footer(isUrdu, companyName)}
        </div>
      </body>
    </html>
  `;
}

/**
 * Public calculator PDF API.
 */


export async function printMillPL(opts = {}) {
  const prefs = await api.getPrefs().catch(() => ({}));

  const merged = {
    ...opts,
    ...prefs,
    companyName:
      opts.companyName ||
      prefs.companyName ||
      prefs.businessName ||
      'Flouris ERP',
    logoData:
      opts.logoData ||
      prefs.logoData ||
      null,
  };

  const html = buildMillPL(merged);

  return api.savePDF({
    html,
    defaultFileName:
      opts.defaultFileName ||
      'Mill-Profit-Loss.pdf',
  });
}

// ── Public API ────────────────────────────────────────────────────────────────
export async function printTrialBalance(opts) {
  const html   = buildTrialBalance({ ...opts, ...(await api.getPrefs().catch(() => ({}))) });
  return api.savePDF({ html, defaultFileName: opts.defaultFileName || 'TrialBalance.pdf' });
}

export async function printBalanceSheet(opts) {
  const html = buildBalanceSheet({ ...opts, ...(await api.getPrefs().catch(() => ({}))) });
  return api.savePDF({ html, defaultFileName: opts.defaultFileName || 'BalanceSheet.pdf' });
}

export async function printProfitLoss(opts) {
  const html = buildProfitLoss({ ...opts, ...(await api.getPrefs().catch(() => ({}))) });
  return api.savePDF({ html, defaultFileName: opts.defaultFileName || 'ProfitLoss.pdf' });
}

export async function printAccountStatement(opts) {
  const html = buildAccountStatement({ ...opts, ...(await api.getPrefs().catch(() => ({}))) });
  return api.savePDF({ html, defaultFileName: opts.defaultFileName || 'AccountStatement.pdf' });
}

export async function printRegister(opts) {
  opts = { ...opts, ...(await api.getPrefs().catch(() => ({}))) };
  const dir = opts.isUrdu ? 'rtl' : 'ltr';
  const rows = (opts.rows || []).map(row => opts.balanceMode ? `
    <tr><td>${ESC(row.group || '')}</td><td>${ESC(row.party || '')}</td><td class="tr">${PKR(row.debit)}</td><td class="tr">${PKR(row.credit)}</td><td class="tr">${PKR(Math.abs(row.balance))} ${row.balance >= 0 ? (opts.isUrdu ? 'ڈی آر' : 'Dr') : (opts.isUrdu ? 'سی آر' : 'Cr')}</td></tr>` : `
    <tr>
      <td>${ESC(row.date || '')}</td>
      <td>${ESC(row.voucherType || '')}</td>
      <td>${ESC(row.voucherNo || '')}</td>
      <td>${ESC(row.party || '')}</td>
      <td>${ESC(row.narration || '')}</td>
      <td class="tr">${PKR(row.amount)}</td>
    </tr>`).join('');
  const html = `<!DOCTYPE html><html dir="${dir}"><head><meta charset="UTF-8"><style>${sharedCSS(opts.isUrdu)}</style></head><body>
    <div class="page">${header(opts.companyName, opts.title, opts.subtitle, opts.generatedAt, opts.isUrdu, opts.logoData)}
      <table><thead><tr>
        ${opts.balanceMode ? `<th>${opts.isUrdu ? 'گروپ' : 'Group'}</th><th>${opts.isUrdu ? 'اکاؤنٹ' : 'Account'}</th><th class="tr">${opts.isUrdu ? 'ڈیبٹ' : 'Debit'}</th><th class="tr">${opts.isUrdu ? 'کریڈٹ' : 'Credit'}</th><th class="tr">${opts.isUrdu ? 'بیلنس' : 'Balance'}</th>` : `
        <th>${opts.isUrdu ? 'تاریخ' : 'Date'}</th><th>${opts.isUrdu ? 'قسم' : 'Type'}</th>
        <th>${opts.isUrdu ? 'نمبر' : 'V. No'}</th><th>${opts.isUrdu ? 'پارٹی' : 'Party'}</th>
        <th>${opts.isUrdu ? 'تفصیل' : 'Narration'}</th><th class="tr">${opts.isUrdu ? 'رقم (روپے)' : 'Amount (Rs.)'}</th>`}
      </tr></thead><tbody>${rows}</tbody><tfoot><tr class="grand-total"><td colspan="${opts.balanceMode ? 2 : 5}">${opts.isUrdu ? 'کل' : 'Total'}</td>${opts.balanceMode ? `<td class="tr">${PKR(opts.totalDebit)}</td><td class="tr">${PKR(opts.totalCredit)}</td>` : ''}<td class="tr">${PKR(opts.total)}</td></tr></tfoot></table>
      ${footer(opts.isUrdu, opts.companyName)}</div></body></html>`;
  return api.savePDF({ html, defaultFileName: opts.defaultFileName || 'Register.pdf' });
}

// Generic fallback (used by any page that calls the old API)
export async function printReport(opts) {
  const html = buildTrialBalance(opts);
  return api.savePDF({ html, defaultFileName: opts.defaultFileName || 'report.pdf' });
}

// ════════════════════════════════════════════════════════════════════════════
// ERP EXTENSION — Purchase Invoice, Sales Invoice, Production Slip PDF builders
// ════════════════════════════════════════════════════════════════════════════

const PKR2 = n => { if (!n && n !== 0) return '—'; return Number(n).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };

function invoiceCSS(isUrdu) {
  const dir  = isUrdu ? 'rtl' : 'ltr';
  const font = isUrdu ? "'Noto Nastaliq Urdu','Jameel Noori Nastaleeq','Arial Unicode MS',serif" : "'Segoe UI','Helvetica Neue',Arial,sans-serif";
  return `
    @import url('https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;600;700&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}
    @page{margin:12mm 14mm;size:A4}
    body{font-family:${font};font-size:9pt;color:#1a1a2e;direction:${dir}}
    .inv-outer{max-width:720px;margin:0 auto;padding:0}
    .inv-header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #4f46e5;padding-bottom:10px;margin-bottom:12px}
    .inv-co{font-size:14pt;font-weight:800;color:#4f46e5}
    .inv-co-sub{font-size:8.5pt;color:#64748b;margin-top:2px}
    .inv-title{font-size:18pt;font-weight:800;color:#1e1b4b;text-align:${isUrdu?'left':'right'}}
    .inv-no{font-size:9pt;color:#64748b;margin-top:2px;text-align:${isUrdu?'left':'right'}}
    .inv-meta{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;font-size:8.5pt}
    .inv-meta-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px 12px}
    .inv-meta-title{font-size:7.5pt;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;margin-bottom:4px}
    .inv-meta-val{color:#1e1b4b;font-weight:600}
    .inv-meta-sub{font-size:8pt;color:#64748b;line-height:1.5}
    .inv-meta-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:14px}
    .inv-detail-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px 10px}
    .inv-detail-row{display:flex;justify-content:space-between;gap:8px;padding:2px 0;border-bottom:1px solid #edf2f7;font-size:8pt}
    .inv-detail-row:last-child{border-bottom:none}
    .inv-detail-label{color:#64748b}
    .inv-detail-value{font-weight:700;color:#1e1b4b;text-align:${isUrdu?'left':'right'}}
    table{width:100%;border-collapse:collapse;margin-bottom:12px}
    thead th{background:#4f46e5;color:#fff;padding:6px 10px;font-size:8pt;font-weight:700;text-align:${isUrdu?'right':'left'}}
    tbody td{padding:5px 10px;border-bottom:1px solid #e2e8f0;font-size:8.5pt;vertical-align:top}
    tbody tr:nth-child(even) td{background:#f8fafc}
    .tr{text-align:${isUrdu?'left':'right'}}
    .totals-row td{padding:6px 10px;font-size:8.5pt;border-bottom:1px solid #e2e8f0}
    .grand-total-row td{background:#4f46e5;color:#fff;font-weight:800;font-size:10pt;padding:8px 10px}
    .footer{margin-top:20px;display:flex;justify-content:space-between;font-size:8pt;color:#64748b;border-top:1px solid #e2e8f0;padding-top:10px}
    .sig-box{border-top:1px solid #94a3b8;width:160px;margin-top:28px;padding-top:4px;text-align:center;font-size:8pt;color:#64748b}
    .status-badge{display:inline-block;padding:2px 10px;border-radius:12px;font-size:8pt;font-weight:700}
    .status-posted{background:#dcfce7;color:#15803d}
    .status-draft{background:#fef9c3;color:#ca8a04}
    .status-cancelled{background:#fee2e2;color:#dc2626}
    .invoice-copy{height:132mm;overflow:hidden;padding-bottom:3mm;border-bottom:1px dashed #94a3b8;margin-bottom:3mm}
    .invoice-copy:last-child{border-bottom:none;margin-bottom:0}
    .copy-label{text-align:center;font-size:7pt;font-weight:800;letter-spacing:.08em;color:#64748b;margin-bottom:2px}
    .invoice-copy .inv-header{padding-bottom:5px;margin-bottom:6px;border-bottom-width:2px}
    .invoice-copy .inv-co{font-size:11pt}
    .invoice-copy .inv-title{font-size:13pt}
    .invoice-copy .inv-meta{gap:7px;margin-bottom:7px}
    .invoice-copy .inv-meta-box{padding:5px 7px}
    .invoice-copy .inv-meta-grid{gap:5px;margin-bottom:7px}
    .invoice-copy .inv-detail-box{padding:4px 6px}
    .invoice-copy .inv-detail-row{font-size:6.5pt;padding:1px 0}
    .invoice-copy table{margin-bottom:5px}
    .invoice-copy thead th{padding:3px 6px;font-size:6.5pt}
    .invoice-copy tbody td{padding:2px 6px;font-size:7pt}
    .invoice-copy .totals-row td{padding:3px 6px;font-size:7pt}
    .invoice-copy .grand-total-row td{padding:4px 6px;font-size:8pt}
    .invoice-copy .footer{margin-top:5px;padding-top:4px;font-size:6.5pt}
    .invoice-copy .sig-box{margin-top:10px;font-size:6.5pt}
  `;
}

function invoiceHeaderBlock({ companyName, address, ntn, title, invNo, invDate, statusLabel, statusClass, isUrdu, logoData }) {
  return `
  <div class="inv-header">
    <div>${logoData ? `<img src="${logoData}" style="width:50px;height:50px;object-fit:contain;float:${isUrdu?'right':'left'};margin-${isUrdu?'left':'right'}:10px">` : ''}
      <div class="inv-co">${ESC(companyName)}</div>
      ${address ? `<div class="inv-co-sub">${ESC(address)}</div>` : ''}
      ${ntn ? `<div class="inv-co-sub">NTN: ${ESC(ntn)}</div>` : ''}
    </div>
    <div>
      <div class="inv-title">${ESC(title)}</div>
      <div class="inv-no">#${ESC(invNo)}</div>
      <div class="inv-no">${isUrdu?'تاریخ':'Date'}: ${ESC(invDate)}</div>
      ${statusLabel ? `<div style="margin-top:4px"><span class="status-badge ${statusClass}">${ESC(statusLabel)}</span></div>` : ''}
    </div>
  </div>`;
}

// ── BUILD: Purchase Invoice PDF ───────────────────────────────────────────────
function buildPurchaseInvoice({ header, lines, suppliers, items, warehouses, companyName, isUrdu, logoData, prefs = {} }) {
  const dir = isUrdu ? 'rtl' : 'ltr';
  const supplier = suppliers?.find(s => s.SupplierID === Number(header.SupplierID));
  const wh       = warehouses?.find(w => w.WarehouseID === Number(header.WarehouseID));
  const dateStr  = header.InvoiceDate ? new Date(header.InvoiceDate).toLocaleDateString('en-PK', { day:'2-digit', month:'long', year:'numeric' }) : '';
  const statusLabel = { Draft: isUrdu?'مسودہ':'Draft', Posted: isUrdu?'پوسٹڈ':'Posted', Cancelled: isUrdu?'منسوخ':'Cancelled' }[header.Status] || header.Status;
  const statusClass = { Draft:'status-draft', Posted:'status-posted', Cancelled:'status-cancelled' }[header.Status] || '';
  const paymentType = (header.PaymentType || 'Credit').toString();
  const settlementLabel = header.SettlementAccountCA ? `A/C #${header.SettlementAccountCA}` : (paymentType === 'Credit' ? (isUrdu?'کریڈٹ':'Credit') : (isUrdu?'مستقل':'Settlement'));
  const paymentTypeLabel = isUrdu ? { Cash:'نقد', Credit:'کریڈٹ', Cheque:'چیک', Mixed:'ملایا' }[paymentType] || paymentType : paymentType;
  const bankName = header.BankName || header.Bank || '—';
  const chequeNo = header.ChequeNo || header.ChequeNumber || '—';
  const dueDate = header.DueDate ? new Date(header.DueDate).toLocaleDateString('en-PK', { day:'2-digit', month:'long', year:'numeric' }) : '—';
  const cashAmount = Number(header.CashAmount || 0);
  const chequeAmount = Number(header.ChequeAmount || 0);
  const creditAmount = Number(header.CreditAmount || 0);
  const rowsHtml = (lines || []).map((l, i) => {
    const item = items?.find(it => it.ItemID === Number(l.ItemID));
    return `<tr>
      <td>${i+1}</td>
      <td>${ESC(item?.ItemName || `Item #${l.ItemID}`)}</td>
      <td class="tr">${PKR2(l.Quantity)} ${l.UOM||'KG'}</td>
      <td class="tr">Rs.${PKR2(l.UnitCost)}</td>
      ${l.DiscountPct > 0 ? `<td class="tr">${l.DiscountPct}%</td>` : `<td class="tr">—</td>`}
      <td class="tr" style="font-weight:700">Rs.${PKR2(l.LineTotal)}</td>
    </tr>`;
  }).join('');

  const detailBoxes = `
    <div class="inv-meta-grid">
      <div class="inv-detail-box">
        <div class="inv-detail-row"><span class="inv-detail-label">${isUrdu?'گودام':'Warehouse'}</span><span class="inv-detail-value">${ESC(wh?.WarehouseName || '—')}</span></div>
        <div class="inv-detail-row"><span class="inv-detail-label">${isUrdu?'ادائیگی':'Payment Type'}</span><span class="inv-detail-value">${ESC(paymentTypeLabel)}</span></div>
        <div class="inv-detail-row"><span class="inv-detail-label">${isUrdu?'سیٹلمینٹ':'Settlement'}</span><span class="inv-detail-value">${ESC(settlementLabel)}</span></div>
        <div class="inv-detail-row"><span class="inv-detail-label">${isUrdu?'حوالہ':'Supplier Ref'}</span><span class="inv-detail-value">${ESC(header.SupplierRef || '—')}</span></div>
      </div>
      <div class="inv-detail-box">
        <div class="inv-detail-row"><span class="inv-detail-label">${isUrdu?'کیش':'Cash'}</span><span class="inv-detail-value">Rs.${PKR2(cashAmount)}</span></div>
        <div class="inv-detail-row"><span class="inv-detail-label">${isUrdu?'چیک':'Cheque'}</span><span class="inv-detail-value">${ESC(chequeNo)}</span></div>
        <div class="inv-detail-row"><span class="inv-detail-label">${isUrdu?'چیک تاریخ':'Cheque Date'}</span><span class="inv-detail-value">${ESC(header.ChequeDate ? new Date(header.ChequeDate).toLocaleDateString('en-PK', { day:'2-digit', month:'long', year:'numeric' }) : '—')}</span></div>
        <div class="inv-detail-row"><span class="inv-detail-label">${isUrdu?'بینک':'Bank'}</span><span class="inv-detail-value">${ESC(bankName)}</span></div>
      </div>
      <div class="inv-detail-box">
        <div class="inv-detail-row"><span class="inv-detail-label">${isUrdu?'کریڈٹ':'Credit'}</span><span class="inv-detail-value">Rs.${PKR2(creditAmount)}</span></div>
        <div class="inv-detail-row"><span class="inv-detail-label">${isUrdu?'چیک رقم':'Cheque Amount'}</span><span class="inv-detail-value">Rs.${PKR2(chequeAmount)}</span></div>
        <div class="inv-detail-row"><span class="inv-detail-label">${isUrdu?'واسطہ':'Due Date'}</span><span class="inv-detail-value">${ESC(dueDate)}</span></div>
        <div class="inv-detail-row"><span class="inv-detail-label">${isUrdu?'حالت':'Status'}</span><span class="inv-detail-value">${ESC(statusLabel)}</span></div>
      </div>
      <div class="inv-detail-box">
        <div class="inv-detail-row"><span class="inv-detail-label">${isUrdu?'حوالہ':'Invoice Ref'}</span><span class="inv-detail-value">${ESC(header.InvoiceNo || '—')}</span></div>
        <div class="inv-detail-row"><span class="inv-detail-label">${isUrdu?'نوٹ':'Remarks'}</span><span class="inv-detail-value">${ESC(header.Remarks || '—')}</span></div>
        <div class="inv-detail-row"><span class="inv-detail-label">${isUrdu?'تاریخ':'Date'}</span><span class="inv-detail-value">${ESC(dateStr)}</span></div>
        <div class="inv-detail-row"><span class="inv-detail-label">${isUrdu?'ذمہ':'Payable'}</span><span class="inv-detail-value">Rs.${PKR2(header.NetTotal || 0)}</span></div>
      </div>
    </div>`;

  const renderCopy = copyLabel => `
  <div class="invoice-copy">
    <div class="copy-label">${isUrdu ? (copyLabel === 'CUSTOMER COPY' ? 'کسٹمر کاپی' : 'مل کاپی') : copyLabel}</div>
    <div class="inv-outer">
      ${invoiceHeaderBlock({ companyName, address: prefs.address, ntn: prefs.ntn, title: isUrdu?'خرید انوائس':'PURCHASE INVOICE', invNo: header.InvoiceNo, invDate: dateStr, statusLabel, statusClass, isUrdu, logoData })}
      <div class="inv-meta">
        <div class="inv-meta-box">
          <div class="inv-meta-title">${isUrdu?'سپلائر':'Supplier'}</div>
          <div class="inv-meta-val">${ESC(supplier?.SupplierName || `Supplier #${header.SupplierID}`)}</div>
          ${supplier?.Contact ? `<div class="inv-meta-sub">${ESC(supplier.Contact)}</div>` : ''}
          ${supplier?.Address ? `<div class="inv-meta-sub">${ESC(supplier.Address)}</div>` : ''}
        </div>
        <div class="inv-meta-box">
          <div class="inv-meta-title">${isUrdu?'ڈیلیوری تفصیل':'Delivery Details'}</div>
          ${wh ? `<div class="inv-meta-val">${ESC(wh.WarehouseName)}</div>` : ''}
          <div class="inv-meta-sub">${isUrdu?'حوالہ':'Ref'}: ${ESC(header.InvoiceNo)}</div>
          ${header.Remarks ? `<div class="inv-meta-sub">${ESC(header.Remarks)}</div>` : ''}
        </div>
      </div>
      ${detailBoxes}
      <table>
        <thead><tr>
          <th style="width:32px">#</th>
          <th>${isUrdu?'آئٹم':'Item'}</th>
          <th class="tr" style="width:120px">${isUrdu?'مقدار':'Quantity'}</th>
          <th class="tr" style="width:100px">${isUrdu?'یونٹ لاگت':'Unit Cost'}</th>
          <th class="tr" style="width:70px">${isUrdu?'رعایت':'Disc%'}</th>
          <th class="tr" style="width:110px">${isUrdu?'کل':'Line Total'}</th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot>
          <tr class="totals-row"><td colspan="5" style="text-align:${isUrdu?'left':'right'}">${isUrdu?'ذیلی کل':'Sub Total'}</td><td class="tr">Rs.${PKR2(header.SubTotal)}</td></tr>
          ${header.DiscountAmt > 0 ? `<tr class="totals-row"><td colspan="5" style="text-align:${isUrdu?'left':'right'}">${isUrdu?'رعایت':'Discount'}</td><td class="tr" style="color:#dc2626">(Rs.${PKR2(header.DiscountAmt)})</td></tr>` : ''}
          ${header.TaxAmt > 0 ? `<tr class="totals-row"><td colspan="5" style="text-align:${isUrdu?'left':'right'}">${isUrdu?'ٹیکس':'Tax'}</td><td class="tr">Rs.${PKR2(header.TaxAmt)}</td></tr>` : ''}
          <tr class="grand-total-row"><td colspan="5">${isUrdu?'خالص کل':'NET TOTAL'}</td><td class="tr">Rs.${PKR2(header.NetTotal)}</td></tr>
        </tfoot>
      </table>
      <div class="footer">
        <div>${ESC(companyName)} — ${ESC(companyName)}</div>
        <div style="display:flex;gap:32px">
          <div class="sig-box">${isUrdu?'وصول کنندہ':'Received By'}</div>
          <div class="sig-box">${isUrdu?'مجاز دستخط':'Authorized'}</div>
        </div>
      </div>
    </div>
  </div>`;

  return `<!DOCTYPE html><html dir="${dir}" lang="${isUrdu?'ur':'en'}">
<head><meta charset="UTF-8"><style>${invoiceCSS(isUrdu)}</style></head>
<body>${renderCopy('CUSTOMER COPY')}${renderCopy('MILL COPY')}</body></html>`;
}

// ── BUILD: Sales Invoice PDF ──────────────────────────────────────────────────
function buildSalesInvoice({ header, lines, customers, items, warehouses, companyName, isUrdu, logoData, prefs = {} }) {
  const dir = isUrdu ? 'rtl' : 'ltr';
  const customer = customers?.find(c => c.CustomerID === Number(header.CustomerID));
  const wh       = warehouses?.find(w => w.WarehouseID === Number(header.WarehouseID));
  const dateStr  = header.InvoiceDate ? new Date(header.InvoiceDate).toLocaleDateString('en-PK', { day:'2-digit', month:'long', year:'numeric' }) : '';
  const statusLabel = { Draft: isUrdu?'مسودہ':'Draft', Posted: isUrdu?'پوسٹڈ':'Posted', Cancelled: isUrdu?'منسوخ':'Cancelled' }[header.Status] || header.Status;
  const statusClass = { Draft:'status-draft', Posted:'status-posted', Cancelled:'status-cancelled' }[header.Status] || '';
  const paymentType = (header.PaymentType || 'Credit').toString();
  const settlementLabel = header.SettlementAccountCA ? `A/C #${header.SettlementAccountCA}` : (paymentType === 'Credit' ? (isUrdu?'کریڈٹ':'Credit') : (isUrdu?'مستقل':'Settlement'));
  const paymentTypeLabel = isUrdu ? { Cash:'نقد', Credit:'کریڈٹ', Cheque:'چیک', Mixed:'ملایا' }[paymentType] || paymentType : paymentType;
  const dueDate = header.DueDate ? new Date(header.DueDate).toLocaleDateString('en-PK', { day:'2-digit', month:'long', year:'numeric' }) : '—';
  const cashAmount = Number(header.CashAmount || 0);
  const vehicleNo = header.VehicleNo || '—';
  const driverName = header.DriverName || '—';
  const rowsHtml = (lines || []).map((l, i) => {
    const item = items?.find(it => it.ItemID === Number(l.ItemID));
    return `<tr>
      <td>${i+1}</td>
      <td>${ESC(item?.ItemName || `Item #${l.ItemID}`)}</td>
      <td class="tr">${PKR2(l.Quantity)} ${l.UOM||'KG'}</td>
      <td class="tr">Rs.${PKR2(l.UnitPrice)}</td>
      ${l.DiscountPct > 0 ? `<td class="tr">${l.DiscountPct}%</td>` : `<td class="tr">—</td>`}
      <td class="tr" style="font-weight:700">Rs.${PKR2(l.LineTotal)}</td>
    </tr>`;
  }).join('');

  const detailBoxes = `
    <div class="inv-meta-grid">
      <div class="inv-detail-box">
        <div class="inv-detail-row"><span class="inv-detail-label">${isUrdu?'گودام':'Warehouse'}</span><span class="inv-detail-value">${ESC(wh?.WarehouseName || '—')}</span></div>
        <div class="inv-detail-row"><span class="inv-detail-label">${isUrdu?'ادائیگی':'Payment Type'}</span><span class="inv-detail-value">${ESC(paymentTypeLabel)}</span></div>
        <div class="inv-detail-row"><span class="inv-detail-label">${isUrdu?'سیٹلمینٹ':'Settlement'}</span><span class="inv-detail-value">${ESC(settlementLabel)}</span></div>
        <div class="inv-detail-row"><span class="inv-detail-label">${isUrdu?'واسطہ':'Due Date'}</span><span class="inv-detail-value">${ESC(dueDate)}</span></div>
      </div>
      <div class="inv-detail-box">
        <div class="inv-detail-row"><span class="inv-detail-label">${isUrdu?'کیش':'Cash'}</span><span class="inv-detail-value">Rs.${PKR2(cashAmount)}</span></div>
        <div class="inv-detail-row"><span class="inv-detail-label">${isUrdu?'گاڑی':'Vehicle No'}</span><span class="inv-detail-value">${ESC(vehicleNo)}</span></div>
        <div class="inv-detail-row"><span class="inv-detail-label">${isUrdu?'ڈرائیور':'Driver'}</span><span class="inv-detail-value">${ESC(driverName)}</span></div>
        <div class="inv-detail-row"><span class="inv-detail-label">${isUrdu?'حالت':'Status'}</span><span class="inv-detail-value">${ESC(statusLabel)}</span></div>
      </div>
      <div class="inv-detail-box">
        <div class="inv-detail-row"><span class="inv-detail-label">${isUrdu?'اشاریہ':'Invoice No'}</span><span class="inv-detail-value">${ESC(header.InvoiceNo || '—')}</span></div>
        <div class="inv-detail-row"><span class="inv-detail-label">${isUrdu?'تاریخ':'Date'}</span><span class="inv-detail-value">${ESC(dateStr)}</span></div>
        <div class="inv-detail-row"><span class="inv-detail-label">${isUrdu?'نوٹ':'Remarks'}</span><span class="inv-detail-value">${ESC(header.Remarks || '—')}</span></div>
        <div class="inv-detail-row"><span class="inv-detail-label">${isUrdu?'کل':'Net Total'}</span><span class="inv-detail-value">Rs.${PKR2(header.NetTotal || 0)}</span></div>
      </div>
      <div class="inv-detail-box">
        <div class="inv-detail-row"><span class="inv-detail-label">${isUrdu?'تسلیم':'Dispatch'}</span><span class="inv-detail-value">${ESC(wh?.WarehouseName || '—')}</span></div>
        <div class="inv-detail-row"><span class="inv-detail-label">${isUrdu?'بل':'Bill To'}</span><span class="inv-detail-value">${ESC(customer?.CustomerName || header.CustomerName || `Customer #${header.CustomerID}`)}</span></div>
        <div class="inv-detail-row"><span class="inv-detail-label">${isUrdu?'رابطہ':'Contact'}</span><span class="inv-detail-value">${ESC(customer?.Contact || '—')}</span></div>
        <div class="inv-detail-row"><span class="inv-detail-label">${isUrdu?'تاکیدی':'Reference'}</span><span class="inv-detail-value">${ESC(header.SupplierRef || header.CustomerRef || '—')}</span></div>
      </div>
    </div>`;

  const renderCopy = copyLabel => `
  <div class="invoice-copy">
    <div class="copy-label">${isUrdu ? (copyLabel === 'CUSTOMER COPY' ? 'کسٹمر کاپی' : 'مل کاپی') : copyLabel}</div>
    <div class="inv-outer">
      ${invoiceHeaderBlock({ companyName, address: prefs.address, ntn: prefs.ntn, title: isUrdu?'فروخت انوائس':'SALES INVOICE', invNo: header.InvoiceNo, invDate: dateStr, statusLabel, statusClass, isUrdu, logoData })}
      <div class="inv-meta">
        <div class="inv-meta-box">
          <div class="inv-meta-title">${isUrdu?'کسٹمر':'Bill To'}</div>
          <div class="inv-meta-val">${ESC(customer?.CustomerName || header.CustomerName || `Customer #${header.CustomerID}`)}</div>
          ${customer?.Contact ? `<div class="inv-meta-sub">${ESC(customer.Contact)}</div>` : ''}
          ${customer?.Address ? `<div class="inv-meta-sub">${ESC(customer.Address)}</div>` : ''}
        </div>
        <div class="inv-meta-box">
          <div class="inv-meta-title">${isUrdu?'ڈسپیچ تفصیل':'Dispatch Details'}</div>
          ${wh ? `<div class="inv-meta-val">${ESC(wh.WarehouseName)}</div>` : ''}
          <div class="inv-meta-sub">${isUrdu?'انوائس نمبر':'Invoice No'}: ${ESC(header.InvoiceNo)}</div>
          ${header.Remarks ? `<div class="inv-meta-sub">${ESC(header.Remarks)}</div>` : ''}
        </div>
      </div>
      ${detailBoxes}
      <table>
        <thead><tr>
          <th style="width:32px">#</th>
          <th>${isUrdu?'آئٹم':'Item'}</th>
          <th class="tr" style="width:120px">${isUrdu?'مقدار':'Quantity'}</th>
          <th class="tr" style="width:100px">${isUrdu?'قیمت/یونٹ':'Unit Price'}</th>
          <th class="tr" style="width:70px">${isUrdu?'رعایت':'Disc%'}</th>
          <th class="tr" style="width:110px">${isUrdu?'کل':'Line Total'}</th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot>
          <tr class="totals-row"><td colspan="5" style="text-align:${isUrdu?'left':'right'}">${isUrdu?'ذیلی کل':'Sub Total'}</td><td class="tr">Rs.${PKR2(header.SubTotal)}</td></tr>
          ${header.DiscountAmt > 0 ? `<tr class="totals-row"><td colspan="5" style="text-align:${isUrdu?'left':'right'}">${isUrdu?'رعایت':'Discount'}</td><td class="tr" style="color:#dc2626">(Rs.${PKR2(header.DiscountAmt)})</td></tr>` : ''}
          ${header.TaxAmt > 0 ? `<tr class="totals-row"><td colspan="5" style="text-align:${isUrdu?'left':'right'}">${isUrdu?'ٹیکس':'Tax'}</td><td class="tr">Rs.${PKR2(header.TaxAmt)}</td></tr>` : ''}
          <tr class="grand-total-row"><td colspan="5">${isUrdu?'خالص کل':'NET TOTAL'}</td><td class="tr">Rs.${PKR2(header.NetTotal)}</td></tr>
        </tfoot>
      </table>
      <div class="footer">
        <div style="font-style:italic;font-size:8pt">${isUrdu?'شکریہ — دوبارہ تشریف لائیں':'Thank you for your business!'}</div>
        <div style="display:flex;gap:32px">
          <div class="sig-box">${isUrdu?'وصول کنندہ':'Received By'}</div>
          <div class="sig-box">${isUrdu?'مجاز دستخط':'Authorized'}</div>
        </div>
      </div>
    </div>
  </div>`;

  return `<!DOCTYPE html><html dir="${dir}" lang="${isUrdu?'ur':'en'}">
<head><meta charset="UTF-8"><style>${invoiceCSS(isUrdu)}</style></head>
<body>${renderCopy('CUSTOMER COPY')}${renderCopy('MILL COPY')}</body></html>`;
}

// ── BUILD: Production Slip PDF ────────────────────────────────────────────────
function buildProductionSlip({ batch, items, warehouses, companyName, isUrdu, logoData }) {
  const dir = isUrdu ? 'rtl' : 'ltr';
  const inputItem = items?.find(i => i.ItemID === Number(batch.InputItemID));
  const wh        = warehouses?.find(w => w.WarehouseID === Number(batch.WarehouseID));
  const dateStr   = batch.BatchDate ? new Date(batch.BatchDate).toLocaleDateString('en-PK', { day:'2-digit', month:'long', year:'numeric' }) : '';
  const outputs   = (batch.lines || []).filter(l => !l.IsLoss);
  const losses    = (batch.lines || []).filter(l =>  l.IsLoss);
  const totalOut  = outputs.reduce((s, l) => s + Number(l.Quantity || 0), 0);
  const totalLoss = losses.reduce((s, l)  => s + Number(l.Quantity || 0), 0);
  const recovery  = batch.InputQty > 0 ? (totalOut / batch.InputQty * 100).toFixed(1) : '—';

  const outRows = outputs.map(l => {
    const item = items?.find(i => i.ItemID === Number(l.ItemID));
    return `<tr>
      <td>${ESC(item?.ItemName || `Item #${l.ItemID}`)}</td>
      <td class="tr">${PKR2(l.Quantity)} KG</td>
      <td class="tr">${batch.InputQty > 0 ? (l.Quantity / batch.InputQty * 100).toFixed(1)+'%' : '—'}</td>
      <td class="tr">${l.AllocatedCost > 0 ? `Rs.${PKR2(l.AllocatedCost)}` : '—'}</td>
      <td class="tr">${l.CostPerUnit > 0 ? `Rs.${PKR2(l.CostPerUnit)}/KG` : '—'}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html><html dir="${dir}" lang="${isUrdu?'ur':'en'}">
<head><meta charset="UTF-8"><style>${invoiceCSS(isUrdu)}
  .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px}
  .kpi-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px;text-align:center}
  .kpi-label{font-size:7.5pt;color:#94a3b8;text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px}
  .kpi-val{font-size:12pt;font-weight:800;color:#1e1b4b}
</style></head>
<body><div class="inv-outer">
  <div class="inv-header" style="border-color:#16a34a">
    <div>${logoData?`<img src="${logoData}" style="width:44px;height:44px;object-fit:contain;float:${isUrdu?'right':'left'};margin-${isUrdu?'left':'right'}:10px">`:''}
      <div class="inv-co" style="color:#16a34a">${ESC(companyName)}</div>
    </div>
    <div>
      <div class="inv-title" style="color:#166534">${isUrdu?'پیداواری سلپ':'PRODUCTION SLIP'}</div>
      <div class="inv-no">${ESC(batch.BatchNo)}</div>
      <div class="inv-no">${dateStr}</div>
      <div style="margin-top:4px"><span class="status-badge ${batch.Status==='Posted'?'status-posted':'status-draft'}">${batch.Status==='Posted'?(isUrdu?'پوسٹڈ':'Posted'):(isUrdu?'مسودہ':'Draft')}</span></div>
    </div>
  </div>
  <div class="kpi-grid">
    <div class="kpi-box"><div class="kpi-label">${isUrdu?'خام مال':'Input'}</div><div class="kpi-val">${PKR2(batch.InputQty)} KG</div><div style="font-size:8pt;color:#64748b">${ESC(inputItem?.ItemName||'—')}</div></div>
    <div class="kpi-box"><div class="kpi-label">${isUrdu?'پیداوار':'Output'}</div><div class="kpi-val" style="color:#16a34a">${PKR2(totalOut)} KG</div></div>
    <div class="kpi-box"><div class="kpi-label">${isUrdu?'ضائع':'Loss'}</div><div class="kpi-val" style="color:#dc2626">${PKR2(totalLoss)} KG</div></div>
    <div class="kpi-box"><div class="kpi-label">${isUrdu?'ریکوری':'Recovery'}</div><div class="kpi-val">${recovery}%</div></div>
  </div>
  ${batch.TotalInputCost > 0 ? `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:10px 12px;margin-bottom:12px;font-size:8.5pt;display:flex;gap:24px">
    <span>${isUrdu?'کل لاگت':'Total Cost'}: <strong>Rs.${PKR2(batch.TotalInputCost)}</strong></span>
    <span>${isUrdu?'اوسط لاگت':'Avg Cost'}: <strong>Rs.${PKR2(batch.InputCostPerUnit)}/KG</strong></span>
    ${wh ? `<span>${isUrdu?'گودام':'Warehouse'}: <strong>${ESC(wh.WarehouseName)}</strong></span>` : ''}
    ${batch.RecipeName ? `<span>${isUrdu?'ریسیپی':'Recipe'}: <strong>${ESC(batch.RecipeName)}</strong></span>` : ''}
  </div>` : ''}
  <table>
    <thead><tr>
      <th>${isUrdu?'پیداوار آئٹم':'Output Item'}</th>
      <th class="tr">${isUrdu?'مقدار':'Quantity'}</th>
      <th class="tr">${isUrdu?'فیصد':'Yield%'}</th>
      <th class="tr">${isUrdu?'مختص لاگت':'Allocated Cost'}</th>
      <th class="tr">${isUrdu?'فی KG':'Per KG'}</th>
    </tr></thead>
    <tbody>${outRows}
    ${losses.map(l => { const item = items?.find(i => i.ItemID === Number(l.ItemID)); return `<tr style="color:#dc2626"><td>🗑️ ${ESC(item?.ItemName||`#${l.ItemID}`)} (${isUrdu?'ضائع':'Loss'})</td><td class="tr">${PKR2(l.Quantity)} KG</td><td class="tr">${batch.InputQty>0?(l.Quantity/batch.InputQty*100).toFixed(1)+'%':'—'}</td><td class="tr">—</td><td class="tr">—</td></tr>`; }).join('')}
    </tbody>
    <tfoot><tr class="grand-total-row" style="background:#166534"><td>${isUrdu?'کل پیداوار':'Total Output'}</td><td class="tr">${PKR2(totalOut)} KG</td><td class="tr">${recovery}%</td><td colspan="2"></td></tr></tfoot>
  </table>
  ${batch.Narration ? `<div style="font-size:8pt;color:#64748b;margin-top:6px">${isUrdu?'نوٹ':'Note'}: ${ESC(batch.Narration)}</div>` : ''}
  <div class="footer">
    <div>${ESC(companyName)} — Flouris ERP</div>
    <div style="display:flex;gap:32px">
      <div class="sig-box">${isUrdu?'پیداوار انچارج':'Production In-Charge'}</div>
      <div class="sig-box">${isUrdu?'مجاز دستخط':'Authorized'}</div>
    </div>
  </div>
</div></body></html>`;
}

// ── Public ERP PDF exports ────────────────────────────────────────────────────
export async function printPurchaseInvoice(opts = {}) {
  const prefs = await api.getPrefs().catch(() => ({}));
  const dbName = opts.dbName || (opts.dbPath ? String(opts.dbPath).split('/').pop().replace(/\.sqlite$/i, '') : 'Database');
  const companyName = opts.companyName || prefs.companyName || dbName || 'Flouris ERP';
  const html  = buildPurchaseInvoice({ ...opts, prefs, companyName, logoData: opts.logoData || prefs.logoData });
  return api.savePDF({ html, defaultFileName: `Purchase-${opts.header?.InvoiceNo || 'Invoice'}.pdf` });
}

export async function printSalesInvoice(opts = {}) {
  const prefs = await api.getPrefs().catch(() => ({}));
  const dbName = opts.dbName || (opts.dbPath ? String(opts.dbPath).split('/').pop().replace(/\.sqlite$/i, '') : 'Database');
  const companyName = opts.companyName || prefs.companyName || dbName || 'Flouris ERP';
  const html  = buildSalesInvoice({ ...opts, prefs, companyName, logoData: opts.logoData || prefs.logoData });
  return api.savePDF({ html, defaultFileName: `Sales-${opts.header?.InvoiceNo || 'Invoice'}.pdf` });
}

export async function printProductionSlip(opts = {}) {
  const prefs = await api.getPrefs().catch(() => ({}));
  const html  = buildProductionSlip({ ...opts, companyName: opts.companyName || prefs.companyName || 'Flouris ERP', logoData: opts.logoData || prefs.logoData });
  return api.savePDF({ html, defaultFileName: `Production-${opts.batch?.BatchNo || 'Slip'}.pdf` });
}
