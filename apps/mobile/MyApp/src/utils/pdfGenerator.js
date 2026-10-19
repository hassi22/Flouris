/**
 * pdfGenerator.js — Flouris ERP Mobile (bare RN)
 * Builds HTML → PDF using react-native-html-to-pdf,
 * then shares via react-native-share.
 *
 * react-native-html-to-pdf is a native module — it must be linked:
 *   iOS:    cd ios && pod install
 *   Android: auto-linked by React Native >= 0.60
 * If the native module is unavailable at runtime we throw a clear message
 * instead of "Object is not a function".
 */

import { Platform, NativeModules } from 'react-native';
import { PKR } from './accountingEngine';

// ── Safe native module accessor ───────────────────────────────────────────────
// react-native-html-to-pdf exposes itself as NativeModules.RNHTMLtoPDF.
// The JS default-export import fails silently on some Metro versions when the
// native side isn't linked, returning an empty object or null.
// We resolve it safely here and surface a helpful error at call time.
let _RNHTMLtoPDF = null;
let _Share = null;

function getHTMLtoPDF() {
  if (_RNHTMLtoPDF) return _RNHTMLtoPDF;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('react-native-html-to-pdf');
    _RNHTMLtoPDF = mod?.default ?? mod;
  } catch (_) {}
  // Fallback: check NativeModules directly (handles some Metro edge cases)
  if (!_RNHTMLtoPDF || typeof _RNHTMLtoPDF.convert !== 'function') {
    const nm = NativeModules.RNHTMLtoPDF;
    if (nm && typeof nm.convert === 'function') _RNHTMLtoPDF = nm;
  }
  if (!_RNHTMLtoPDF || typeof _RNHTMLtoPDF.convert !== 'function') {
    throw new Error(
      'react-native-html-to-pdf native module is not available.\n' +
      'iOS: run  cd ios && pod install  then rebuild.\n' +
      'Android: rebuild with  npx react-native run-android.'
    );
  }
  return _RNHTMLtoPDF;
}

function getShare() {
  if (_Share) return _Share;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('react-native-share');
    _Share = mod?.default ?? mod;
  } catch (_) {}
  if (!_Share || typeof _Share.open !== 'function') {
    throw new Error(
      'react-native-share native module is not available.\n' +
      'iOS: run  cd ios && pod install  then rebuild.\n' +
      'Android: rebuild with  npx react-native run-android.'
    );
  }
  return _Share;
}

const ESC = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ── Shared CSS ────────────────────────────────────────────────────────────────
function sharedCSS(isUrdu) {
  const dir  = isUrdu ? 'rtl' : 'ltr';
  const font = isUrdu
    ? "'Noto Nastaliq Urdu','Arial Unicode MS',serif"
    : "'Segoe UI','Helvetica Neue',Arial,sans-serif";
  const fs = isUrdu ? '11pt' : '8.5pt';
  const lh = isUrdu ? 2.0 : 1.4;

  return `
    *{box-sizing:border-box;margin:0;padding:0}
    @page{margin:10mm 12mm;size:A4}
    body{font-family:${font};font-size:${fs};line-height:${lh};color:#1a1a2e;direction:${dir}}
    .page{padding:6px 0}
    .report-header{border-bottom:2px solid #4f46e5;padding-bottom:6px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:flex-end}
    .report-header .left .company{font-size:${isUrdu ? '13pt' : '11pt'};font-weight:700;color:#4f46e5}
    .report-header .left .title{font-size:${isUrdu ? '11pt' : '9.5pt'};font-weight:600;margin-top:2px}
    .report-header .right{font-size:7.5pt;color:#64748b;text-align:${isUrdu ? 'left' : 'right'}}
    table{width:100%;border-collapse:collapse}
    th{background:#4f46e5;color:#fff;padding:4px 7px;font-size:7.5pt;font-weight:600;text-align:${isUrdu ? 'right' : 'left'};white-space:nowrap}
    td{padding:3px 7px;border-bottom:1px solid #e2e8f0;font-size:${fs};vertical-align:top}
    tr:nth-child(even) td{background:#f8fafc}
    .tr{text-align:${isUrdu ? 'left' : 'right'}}
    .group-row td{background:#e0e7ff;font-weight:700;font-size:7.5pt;color:#3730a3;padding:4px 7px}
    .sub-row td{background:#f0f4ff;font-weight:600;font-size:7.5pt;padding:3px 7px}
    .total-row td{background:#eef2ff;font-weight:700;border-top:2px solid #6366f1;font-size:8pt}
    .grand-total td{background:#4f46e5;color:#fff;font-weight:700;font-size:8.5pt}
    .two-col{display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:start}
    .col-card{border:1px solid #c7d2fe;border-radius:4px;overflow:hidden}
    .col-card-head{background:#4f46e5;color:#fff;font-weight:700;font-size:8pt;padding:5px 8px}
    .col-card-head.assets{background:#1d4ed8}
    .col-card-head.liab{background:#7c3aed}
    .col-card-head.equity{background:#0f766e}
    .col-card-head.income{background:#15803d}
    .col-card-head.expense{background:#b45309}
    .summary-box{margin-top:8px;border:1px solid #c7d2fe;border-radius:4px;overflow:hidden}
    .summary-box th{background:#1e1b4b;font-size:7.5pt}
    .summary-box td{padding:4px 10px;font-size:8pt}
    .highlight td{background:#eef2ff;font-weight:700;color:#4f46e5;font-size:9pt}
    .pdf-footer{margin-top:8px;font-size:7pt;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:4px;display:flex;justify-content:space-between}
  `;
}

function header(companyName, title, subtitle, generatedAt, isUrdu, logoData) {
  return `
  <div class="report-header">
    <div class="left">
      ${logoData ? `<img src="${logoData}" style="width:42px;height:42px;object-fit:contain;float:${isUrdu ? 'right' : 'left'};margin-${isUrdu ? 'left' : 'right'}:8px">` : ''}
      <div class="company">${ESC(companyName)}</div>
      <div class="title">${ESC(title)}</div>
      ${subtitle ? `<div style="font-size:7.5pt;color:#64748b;margin-top:1px">${ESC(subtitle)}</div>` : ''}
    </div>
    <div class="right">${isUrdu ? 'تیار کردہ:' : 'Generated:'}<br>${ESC(generatedAt)}</div>
  </div>`;
}

function footer(isUrdu, companyName) {
  return `<div class="pdf-footer">
    <span>${ESC(companyName)} — Flouris ERP</span>
    <span>${isUrdu ? 'تمام حقوق محفوظ ہیں' : 'All rights reserved'}</span>
  </div>`;
}

// ── Trial Balance HTML ────────────────────────────────────────────────────────
function buildTrialBalanceHTML({ rows, groups, totalDebit, totalCredit, difference, title, subtitle, companyName, isUrdu, generatedAt, logoData }) {
  const dir    = isUrdu ? 'rtl' : 'ltr';
  const balLbl = difference === 0 ? (isUrdu ? '✓ متوازن' : '✓ Balanced') : `Diff: ${PKR(Math.abs(difference))}`;

  const accountRow = r => `
    <tr>
      <td style="color:#64748b;font-size:7.5pt">${r.accountId}</td>
      <td>${ESC(isUrdu ? (r.accountNameUr || r.accountName) : r.accountName)}</td>
      <td class="tr" style="color:${r.debit ? '#dc2626' : '#94a3b8'}">${PKR(r.debit)}</td>
      <td class="tr" style="color:${r.credit ? '#15803d' : '#94a3b8'}">${PKR(r.credit)}</td>
    </tr>`;

  const tableRows = (groups || []).length
    ? (groups || []).map(g => `
      <tr class="group-row"><td colspan="2">${ESC(isUrdu ? (g.subNameU || g.subName) : (g.subName || 'Unclassified'))}</td>
        <td class="tr">${PKR(g.groupDebit)}</td><td class="tr">${PKR(g.groupCredit)}</td></tr>
      ${(g.rows || []).map(accountRow).join('')}
      <tr class="sub-row"><td colspan="2">${isUrdu ? 'ذیلی کل' : 'Group Subtotal'}</td>
        <td class="tr">${PKR(g.groupDebit)}</td><td class="tr">${PKR(g.groupCredit)}</td></tr>`).join('')
    : (rows || []).map(accountRow).join('');

  return `<!DOCTYPE html><html dir="${dir}" lang="${isUrdu ? 'ur' : 'en'}">
<head><meta charset="UTF-8"><style>${sharedCSS(isUrdu)}</style></head>
<body><div class="page">
  ${header(companyName, title, subtitle, generatedAt, isUrdu, logoData)}
  <table>
    <thead><tr>
      <th style="width:55px">${isUrdu ? 'کھاتہ نمبر' : 'A/C #'}</th>
      <th>${isUrdu ? 'اکاؤنٹ کا نام' : 'Account Name'}</th>
      <th class="tr" style="width:130px">${isUrdu ? 'ڈیبٹ (روپے)' : 'Debit (Rs.)'}</th>
      <th class="tr" style="width:130px">${isUrdu ? 'کریڈٹ (روپے)' : 'Credit (Rs.)'}</th>
    </tr></thead>
    <tbody>${tableRows}</tbody>
    <tfoot>
      <tr class="grand-total">
        <td colspan="2">${isUrdu ? 'کل' : 'Total'}</td>
        <td class="tr">${PKR(totalDebit)}</td>
        <td class="tr">${PKR(totalCredit)}</td>
      </tr>
    </tfoot>
  </table>
  <div class="summary-box" style="max-width:340px;margin-left:auto;margin-top:10px">
    <table>
      <thead><tr><th>${isUrdu ? 'تفصیل' : 'Description'}</th><th class="tr">${isUrdu ? 'رقم' : 'Amount'}</th></tr></thead>
      <tbody>
        <tr><td>${isUrdu ? 'کل ڈیبٹ' : 'Total Debit'}</td><td class="tr" style="color:#dc2626">${PKR(totalDebit)}</td></tr>
        <tr><td>${isUrdu ? 'کل کریڈٹ' : 'Total Credit'}</td><td class="tr" style="color:#15803d">${PKR(totalCredit)}</td></tr>
      </tbody>
      <tfoot><tr class="highlight"><td>${isUrdu ? 'فرق' : 'Difference'}</td><td class="tr">${balLbl}</td></tr></tfoot>
    </table>
  </div>
  ${footer(isUrdu, companyName)}
</div></body></html>`;
}

// ── Balance Sheet HTML ────────────────────────────────────────────────────────
function buildBalanceSheetHTML({ assets, liabilities, equity, totalAssets, totalLE, balanceDiff, title, subtitle, companyName, isUrdu, generatedAt, logoData }) {
  const dir = isUrdu ? 'rtl' : 'ltr';

  const renderGroup = (groups) => (groups || []).map(g => {
    const label = isUrdu && g.subNameU && g.subNameU.trim() ? g.subNameU.trim() : g.subName;
    return `
    <tr class="group-row"><td colspan="2">${ESC(label || (isUrdu ? 'غیر درجہ بند' : 'Unclassified'))}</td></tr>
    ${(g.accounts || []).map(a => `
      <tr><td style="padding-left:14px">${ESC(isUrdu ? (a.accountNameUr || a.accountName) : a.accountName)}</td>
      <td class="tr">${PKR(Math.abs(a.balance))}</td></tr>`).join('')}
    <tr class="sub-row">
      <td>${ESC(label)} ${isUrdu ? 'ذیلی کل' : 'Subtotal'}</td>
      <td class="tr">${PKR(Math.abs(g.total))}</td>
    </tr>`;
  }).join('');

  const balLbl = (balanceDiff || 0) < 1 ? (isUrdu ? '✓ متوازن' : '✓ Balanced') : `Diff: ${PKR(balanceDiff)}`;

  return `<!DOCTYPE html><html dir="${dir}" lang="${isUrdu ? 'ur' : 'en'}">
<head><meta charset="UTF-8"><style>${sharedCSS(isUrdu)}</style></head>
<body><div class="page">
  ${header(companyName, title, subtitle, generatedAt, isUrdu, logoData)}
  <div class="two-col">
    <div class="col-card">
      <div class="col-card-head assets">${isUrdu ? 'اثاثے' : 'Assets'}</div>
      <table>
        <thead><tr><th>${isUrdu ? 'اکاؤنٹ' : 'Account'}</th><th class="tr">${isUrdu ? 'رقم (روپے)' : 'Amount (Rs.)'}</th></tr></thead>
        <tbody>${renderGroup(assets)}</tbody>
        <tfoot><tr class="total-row"><td>${isUrdu ? 'کل اثاثے' : 'Total Assets'}</td><td class="tr">${PKR(Math.abs(totalAssets))}</td></tr></tfoot>
      </table>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px">
      <div class="col-card">
        <div class="col-card-head liab">${isUrdu ? 'واجبات' : 'Liabilities'}</div>
        <table>
          <thead><tr><th>${isUrdu ? 'اکاؤنٹ' : 'Account'}</th><th class="tr">${isUrdu ? 'رقم (روپے)' : 'Amount (Rs.)'}</th></tr></thead>
          <tbody>${renderGroup(liabilities)}</tbody>
        </table>
      </div>
      <div class="col-card">
        <div class="col-card-head equity">${isUrdu ? 'سرمایہ' : 'Equity / Capital'}</div>
        <table>
          <thead><tr><th>${isUrdu ? 'اکاؤنٹ' : 'Account'}</th><th class="tr">${isUrdu ? 'رقم (روپے)' : 'Amount (Rs.)'}</th></tr></thead>
          <tbody>${renderGroup(equity)}</tbody>
        </table>
      </div>
      <table class="summary-box" style="border:1px solid #c7d2fe">
        <tbody>
          <tr><td>${isUrdu ? 'کل واجبات + سرمایہ' : 'Total Liabilities + Equity'}</td><td class="tr">${PKR(Math.abs(totalLE))}</td></tr>
          <tr class="highlight"><td>${isUrdu ? 'بیلنس جانچ' : 'Balance Check'}</td><td class="tr">${balLbl}</td></tr>
        </tbody>
      </table>
    </div>
  </div>
  ${footer(isUrdu, companyName)}
</div></body></html>`;
}

// ── Profit & Loss HTML ────────────────────────────────────────────────────────
function buildProfitLossHTML({ income, expenses, totalIncome, totalExpenses, netProfitLoss, title, subtitle, companyName, isUrdu, generatedAt, logoData }) {
  const dir = isUrdu ? 'rtl' : 'ltr';

  const renderPLGroup = (groups, amtColor) => (groups || []).map(g => `
    <tr class="group-row"><td colspan="2">${ESC(g.headName)}</td></tr>
    ${(g.accounts || []).map(a => `
      <tr><td style="padding-left:12px">${ESC(isUrdu ? (a.accountNameUr || a.accountName) : a.accountName)}</td>
      <td class="tr" style="color:${amtColor}">${PKR(a.amount)}</td></tr>`).join('')}
    <tr class="sub-row"><td>${ESC(g.headName)} ${isUrdu ? 'ذیلی کل' : 'Subtotal'}</td><td class="tr">${PKR(g.total)}</td></tr>`).join('');

  const isProfit = netProfitLoss >= 0;
  const netLabel = isUrdu ? (isProfit ? 'خالص نفع' : 'خالص نقصان') : (isProfit ? 'Net Profit' : 'Net Loss');
  const netColor = isProfit ? '#15803d' : '#b91c1c';

  return `<!DOCTYPE html><html dir="${dir}" lang="${isUrdu ? 'ur' : 'en'}">
<head><meta charset="UTF-8"><style>${sharedCSS(isUrdu)}</style></head>
<body><div class="page">
  ${header(companyName, title, subtitle, generatedAt, isUrdu, logoData)}
  <div class="two-col">
    <div class="col-card">
      <div class="col-card-head income">${isUrdu ? 'آمدنی' : 'Income / Revenue'}</div>
      <table>
        <thead><tr><th>${isUrdu ? 'اکاؤنٹ' : 'Account'}</th><th class="tr">${isUrdu ? 'رقم' : 'Amount (Rs.)'}</th></tr></thead>
        <tbody>${renderPLGroup(income, '#15803d')}</tbody>
        <tfoot><tr class="total-row"><td>${isUrdu ? 'کل آمدنی' : 'Total Income'}</td><td class="tr" style="color:#15803d">${PKR(totalIncome)}</td></tr></tfoot>
      </table>
    </div>
    <div class="col-card">
      <div class="col-card-head expense">${isUrdu ? 'اخراجات' : 'Expenses'}</div>
      <table>
        <thead><tr><th>${isUrdu ? 'اکاؤنٹ' : 'Account'}</th><th class="tr">${isUrdu ? 'رقم' : 'Amount (Rs.)'}</th></tr></thead>
        <tbody>${renderPLGroup(expenses, '#b45309')}</tbody>
        <tfoot><tr class="total-row"><td>${isUrdu ? 'کل اخراجات' : 'Total Expenses'}</td><td class="tr" style="color:#b45309">${PKR(totalExpenses)}</td></tr></tfoot>
      </table>
    </div>
  </div>
  <div class="summary-box" style="max-width:380px;margin-left:auto;margin-top:10px">
    <table>
      <thead><tr><th colspan="2">${isUrdu ? 'خلاصہ' : 'Summary'}</th></tr></thead>
      <tbody>
        <tr><td>${isUrdu ? 'کل آمدنی' : 'Total Income'}</td><td class="tr" style="color:#15803d">${PKR(totalIncome)}</td></tr>
        <tr><td>${isUrdu ? 'کل اخراجات' : 'Total Expenses'}</td><td class="tr" style="color:#b45309">${PKR(totalExpenses)}</td></tr>
      </tbody>
      <tfoot><tr class="highlight"><td>${netLabel}</td><td class="tr" style="color:${netColor}">${PKR(Math.abs(netProfitLoss))}</td></tr></tfoot>
    </table>
  </div>
  ${footer(isUrdu, companyName)}
</div></body></html>`;
}

// ── Account Statement HTML ────────────────────────────────────────────────────
function buildAccountStatementHTML({ transactions, accountName, accountNameUr, openingBalance, closingBalance, title, subtitle, companyName, isUrdu, generatedAt, logoData }) {
  const dir   = isUrdu ? 'rtl' : 'ltr';
  const name  = isUrdu ? (accountNameUr || accountName) : accountName;
  const drLbl = isUrdu ? 'ڈی آر' : 'Dr';
  const crLbl = isUrdu ? 'سی آر' : 'Cr';
  const opBal = openingBalance || 0;

  const rows = (transactions || []).map(tx => {
    const narr    = isUrdu ? (tx.narrationUr || tx.narration || '') : (tx.narration || '');
    const vtype   = isUrdu ? (tx.voucherTypeUr || tx.voucherType || '') : (tx.voucherType || '');
    const bal     = tx.balance || 0;
    const dateStr = tx.date ? new Date(tx.date).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
    return `<tr>
      <td style="white-space:nowrap;font-size:7.5pt">${ESC(dateStr)}</td>
      <td style="font-size:7pt;color:#64748b">${ESC(vtype)}</td>
      <td style="font-size:7pt">${tx.voucherNo || '—'}</td>
      <td style="font-size:7.5pt">${ESC(narr)}</td>
      <td class="tr" style="color:${tx.debit ? '#1d4ed8' : '#94a3b8'}">${PKR(tx.debit)}</td>
      <td class="tr" style="color:${tx.credit ? '#15803d' : '#94a3b8'}">${PKR(tx.credit)}</td>
      <td class="tr" style="font-weight:600;color:${bal >= 0 ? '#1d4ed8' : '#7c3aed'}">${PKR(Math.abs(bal))} ${bal >= 0 ? drLbl : crLbl}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html><html dir="${dir}" lang="${isUrdu ? 'ur' : 'en'}">
<head><meta charset="UTF-8"><style>${sharedCSS(isUrdu)}</style></head>
<body><div class="page">
  ${header(companyName, title, subtitle, generatedAt, isUrdu, logoData)}
  <div style="font-size:8.5pt;font-weight:600;margin-bottom:5px;color:#4f46e5">${ESC(name)}</div>
  ${opBal !== 0 ? `<div style="font-size:7.5pt;color:#64748b;margin-bottom:4px">${isUrdu ? 'ابتدائی بیلنس:' : 'Opening Balance:'} <strong style="color:${opBal >= 0 ? '#1d4ed8' : '#7c3aed'}">${PKR(Math.abs(opBal))} ${opBal >= 0 ? drLbl : crLbl}</strong></div>` : ''}
  <table>
    <thead><tr>
      <th style="width:80px">${isUrdu ? 'تاریخ' : 'Date'}</th>
      <th style="width:80px">${isUrdu ? 'قسم' : 'Type'}</th>
      <th style="width:50px">${isUrdu ? 'نمبر' : 'V.No'}</th>
      <th>${isUrdu ? 'تفصیل' : 'Narration'}</th>
      <th class="tr" style="width:100px">${isUrdu ? 'ڈیبٹ' : 'Debit'}</th>
      <th class="tr" style="width:100px">${isUrdu ? 'کریڈٹ' : 'Credit'}</th>
      <th class="tr" style="width:120px">${isUrdu ? 'بیلنس' : 'Balance'}</th>
    </tr></thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr class="grand-total">
        <td colspan="3"></td>
        <td>${isUrdu ? 'اختتامی بیلنس' : 'Closing Balance'}</td>
        <td></td><td></td>
        <td class="tr">${PKR(Math.abs(closingBalance || 0))} ${(closingBalance || 0) >= 0 ? drLbl : crLbl}</td>
      </tr>
    </tfoot>
  </table>
  ${footer(isUrdu, companyName)}
</div></body></html>`;
}

// ── Register HTML ─────────────────────────────────────────────────────────────
function buildRegisterHTML({ rows, title, subtitle, companyName, isUrdu, generatedAt, logoData, total, balanceMode, totalDebit, totalCredit }) {
  const dir = isUrdu ? 'rtl' : 'ltr';

  const tableRows = (rows || []).map(row => balanceMode ? `
    <tr>
      <td>${ESC(row.group || '')}</td>
      <td>${ESC(isUrdu ? (row.partyUr || row.party) : row.party)}</td>
      <td class="tr">${PKR(row.debit)}</td>
      <td class="tr">${PKR(row.credit)}</td>
      <td class="tr">${PKR(Math.abs(row.balance))} ${row.balance >= 0 ? (isUrdu ? 'ڈی آر' : 'Dr') : (isUrdu ? 'سی آر' : 'Cr')}</td>
    </tr>` : `
    <tr>
      <td>${ESC(row.date || '')}</td>
      <td>${ESC(isUrdu ? (row.vtypeNameUr || row.vtypeName) : row.vtypeName)}</td>
      <td>${ESC(row.voucherNo || '')}</td>
      <td>${ESC(isUrdu ? (row.partyNameUr || row.partyName) : row.partyName)}</td>
      <td>${ESC(isUrdu ? (row.Narration || row.Remarks) : (row.Narration || row.Remarks))}</td>
      <td class="tr">${PKR(row.Amount)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html><html dir="${dir}" lang="${isUrdu ? 'ur' : 'en'}">
<head><meta charset="UTF-8"><style>${sharedCSS(isUrdu)}</style></head>
<body><div class="page">
  ${header(companyName, title, subtitle, generatedAt, isUrdu, logoData)}
  <table>
    <thead><tr>
      ${balanceMode ? `
        <th>${isUrdu ? 'گروپ' : 'Group'}</th>
        <th>${isUrdu ? 'اکاؤنٹ' : 'Account'}</th>
        <th class="tr">${isUrdu ? 'ڈیبٹ' : 'Debit'}</th>
        <th class="tr">${isUrdu ? 'کریڈٹ' : 'Credit'}</th>
        <th class="tr">${isUrdu ? 'بیلنس' : 'Balance'}</th>` : `
        <th>${isUrdu ? 'تاریخ' : 'Date'}</th>
        <th>${isUrdu ? 'قسم' : 'Type'}</th>
        <th>${isUrdu ? 'نمبر' : 'V.No'}</th>
        <th>${isUrdu ? 'پارٹی' : 'Party'}</th>
        <th>${isUrdu ? 'تفصیل' : 'Narration'}</th>
        <th class="tr">${isUrdu ? 'رقم (روپے)' : 'Amount (Rs.)'}</th>`}
    </tr></thead>
    <tbody>${tableRows}</tbody>
    <tfoot>
      <tr class="grand-total">
        <td colspan="${balanceMode ? 2 : 5}">${isUrdu ? 'کل' : 'Total'}</td>
        ${balanceMode ? `<td class="tr">${PKR(totalDebit)}</td><td class="tr">${PKR(totalCredit)}</td>` : ''}
        <td class="tr">${PKR(total)}</td>
      </tr>
    </tfoot>
  </table>
  ${footer(isUrdu, companyName)}
</div></body></html>`;
}

// ── Core: generate PDF + share ────────────────────────────────────────────────
async function generateAndShare(html, filename) {
  const RNHTMLtoPDF = getHTMLtoPDF();
  const Share = getShare();

  const options = {
    html,
    fileName: filename.replace(/\.pdf$/i, ''),
    directory: Platform.OS === 'ios' ? 'Documents' : 'Download',
  };

  const file = await RNHTMLtoPDF.convert(options);

  if (!file?.filePath) {
    throw new Error('PDF was not created — the native PDF engine returned no file path.');
  }

  // react-native-html-to-pdf returns a bare path on Android (no file:// prefix)
  // and a full path on iOS. Normalise to always have the scheme for Share.
  const uri = file.filePath.startsWith('file://')
    ? file.filePath
    : `file://${file.filePath}`;

  await Share.open({
    url: uri,
    type: 'application/pdf',
    title: filename,
    failOnCancel: false,
  });

  return file.filePath;
}

// ── Public API ────────────────────────────────────────────────────────────────
export async function printTrialBalance(opts) {
  return generateAndShare(buildTrialBalanceHTML(opts), opts.defaultFileName || 'TrialBalance.pdf');
}

export async function printBalanceSheet(opts) {
  return generateAndShare(buildBalanceSheetHTML(opts), opts.defaultFileName || 'BalanceSheet.pdf');
}

export async function printProfitLoss(opts) {
  return generateAndShare(buildProfitLossHTML(opts), opts.defaultFileName || 'ProfitLoss.pdf');
}

export async function printAccountStatement(opts) {
  return generateAndShare(buildAccountStatementHTML(opts), opts.defaultFileName || 'AccountStatement.pdf');
}

export async function printRegister(opts) {
  return generateAndShare(buildRegisterHTML(opts), opts.defaultFileName || 'Register.pdf');
}
