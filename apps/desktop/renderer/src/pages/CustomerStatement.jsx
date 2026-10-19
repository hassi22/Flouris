/**
 * CustomerStatement.jsx
 * Full account statement for a customer — all sales invoices + payments received
 * with running balance.  Mirrors the GL Account Statement but for ERP parties.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Printer, Plus, X, Save, Search, Users } from 'lucide-react';
import { useLang } from '../context/LanguageContext';

const api = window.electronAPI;

function fmt(n) {
  if (n == null || n === 0) return '—';
  return Number(n).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtD(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return d; }
}

const EMPTY_PMT = () => ({
  PaymentDate: new Date().toISOString().slice(0, 10),
  PaymentRef: '', Amount: '', PaymentMode: 'Cash', BankAccount: '', Narration: '',
});

export default function CustomerStatement({ currentDb, dbInfo, showNotification }) {
  const { isUrdu } = useLang();
  const dir = isUrdu ? 'rtl' : 'ltr';

  const [customers,   setCustomers]   = useState([]);
  const [selectedId,  setSelectedId]  = useState('');
  const [statement,   setStatement]   = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [startDate,   setStartDate]   = useState('');
  const [endDate,     setEndDate]     = useState('');
  const [search,      setSearch]      = useState('');
  const [showPmtForm, setShowPmtForm] = useState(false);
  const [pmtForm,     setPmtForm]     = useState(EMPTY_PMT());
  const [saving,      setSaving]      = useState(false);

  // Load customers list
  useEffect(() => {
    if (!currentDb) return;
    api.getCustomers({ dbPath: currentDb }).then(r => { if (r.success) setCustomers(r.data); });
  }, [currentDb]);

  const loadStatement = useCallback(async () => {
    if (!currentDb || !selectedId) return;
    setLoading(true);
    try {
      const res = await api.getCustomerStatement({
        dbPath: currentDb, customerId: Number(selectedId),
        startDate: startDate || undefined, endDate: endDate || undefined,
      });
      if (res.success) setStatement(res.data);
      else showNotification(res.error || 'Load failed', 'error');
    } finally { setLoading(false); }
  }, [currentDb, selectedId, startDate, endDate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (selectedId) loadStatement(); }, [loadStatement, dbInfo?.lastRefresh]);

  const filtered = (statement?.transactions || []).filter(tx => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (tx.txType || '').toLowerCase().includes(s) || (tx.narration || '').toLowerCase().includes(s) || (tx.txRef || '').toLowerCase().includes(s);
  });

  // ── Save payment ──────────────────────────────────────────────────────────
  async function handleSavePayment() {
    if (!pmtForm.Amount || Number(pmtForm.Amount) <= 0) {
      showNotification(isUrdu ? 'رقم درج کریں' : 'Enter amount', 'error'); return;
    }
    setSaving(true);
    try {
      // Auto-generate ref if empty
      let ref = pmtForm.PaymentRef;
      if (!ref) {
        const r = await api.getNextPaymentRef({ dbPath: currentDb, partyType: 'Customer' });
        ref = r.nextRef || `RCV-${Date.now()}`;
      }
      const res = await api.savePartyPayment({
        dbPath: currentDb,
        payment: {
          ...pmtForm, PaymentRef: ref,
          PartyType: 'Customer', PartyID: Number(selectedId),
          Amount: Number(pmtForm.Amount),
        },
      });
      if (res.success) {
        showNotification(isUrdu ? 'ادائیگی محفوظ اور اکاؤنٹنگ پوسٹ ہو گئی' : 'Payment saved & accounting posted', 'success');
        setShowPmtForm(false); setPmtForm(EMPTY_PMT()); loadStatement();
      } else showNotification(res.error || 'Save failed', 'error');
    } finally { setSaving(false); }
  }

  // ── Print ─────────────────────────────────────────────────────────────────
  async function handlePrint() {
    if (!statement || !filtered.length) return;
    const prefs = await api.getPrefs().catch(() => ({}));
    const co = prefs.companyName || currentDb?.split('/').pop().replace('.sqlite', '') || 'Flouris';
    const cust = statement.customer;
    const dateRange = startDate || endDate ? `${startDate || '—'} → ${endDate || '—'}` : (isUrdu ? 'تمام تاریخیں' : 'All Dates');

    const rows = filtered.map(tx => `
      <tr>
        <td>${fmtD(tx.txDate)}</td>
        <td>${tx.txType}</td>
        <td>${tx.txRef || '—'}</td>
        <td>${tx.narration || ''}</td>
        <td style="text-align:right">${tx.debit ? fmt(tx.debit) : ''}</td>
        <td style="text-align:right">${tx.credit ? fmt(tx.credit) : ''}</td>
        <td style="text-align:right">${fmt(Math.abs(tx.balance))} ${tx.balance >= 0 ? 'Dr' : 'Cr'}</td>
      </tr>`).join('');

    const html = `<html><head><meta charset="utf-8"><style>
      body{font-family:Arial,sans-serif;font-size:12px;margin:24px}
      h2{margin:0 0 4px}p{margin:0 0 12px;color:#555}
      table{width:100%;border-collapse:collapse}
      th{background:#334155;color:#fff;padding:7px 10px;text-align:left}
      td{padding:6px 10px;border-bottom:1px solid #e5e7eb}
      tr:nth-child(even){background:#f8fafc}
      .totals{margin-top:16px;display:flex;gap:32px}
      .total-box{background:#f1f5f9;padding:10px 16px;border-radius:6px}
      .total-label{font-size:11px;color:#64748b}
      .total-value{font-size:16px;font-weight:700}
    </style></head><body>
      <h2>${co}</h2>
      <p>${isUrdu ? 'کسٹمر اکاؤنٹ بیان' : 'Customer Account Statement'}</p>
      <p><strong>${isUrdu ? 'کسٹمر:' : 'Customer:'}</strong> ${cust?.CustomerName || ''} &nbsp;|&nbsp;
         <strong>${isUrdu ? 'تاریخ:' : 'Period:'}</strong> ${dateRange}</p>
      <table>
        <thead><tr>
          <th>${isUrdu ? 'تاریخ' : 'Date'}</th><th>${isUrdu ? 'قسم' : 'Type'}</th>
          <th>${isUrdu ? 'حوالہ' : 'Ref'}</th><th>${isUrdu ? 'تفصیل' : 'Narration'}</th>
          <th>${isUrdu ? 'ڈیبٹ' : 'Debit (Rs.)'}</th><th>${isUrdu ? 'کریڈٹ' : 'Credit (Rs.)'}</th>
          <th>${isUrdu ? 'بیلنس' : 'Balance (Rs.)'}</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="totals">
        <div class="total-box"><div class="total-label">${isUrdu ? 'ابتدائی بیلنس' : 'Opening Balance'}</div><div class="total-value">Rs. ${fmt(Math.abs(statement.openingBalance))} ${statement.openingBalance >= 0 ? 'Dr' : 'Cr'}</div></div>
        <div class="total-box"><div class="total-label">${isUrdu ? 'کل انوائس' : 'Total Invoiced'}</div><div class="total-value">Rs. ${fmt(statement.totalInvoiced)}</div></div>
        <div class="total-box"><div class="total-label">${isUrdu ? 'کل ادائیگی' : 'Total Paid'}</div><div class="total-value">Rs. ${fmt(statement.totalPaid)}</div></div>
        <div class="total-box"><div class="total-label">${isUrdu ? 'بقایہ رقم' : 'Closing Balance'}</div><div class="total-value">Rs. ${fmt(Math.abs(statement.closingBalance))} ${statement.closingBalance >= 0 ? 'Dr' : 'Cr'}</div></div>
      </div>
    </body></html>`;

    const res = await api.savePDF({ html, defaultFileName: `CustomerStatement_${cust?.CustomerName || selectedId}_${new Date().toISOString().slice(0,10)}.pdf` });
    if (res.success) showNotification(isUrdu ? 'پی ڈی ایف محفوظ ہو گئی' : 'PDF saved', 'success');
    else if (!res.canceled) showNotification(res.error || 'PDF failed', 'error');
  }

  const openingBalance = statement?.openingBalance || 0;
  const closingBalance = statement?.closingBalance || 0;

  return (
    <div className="page" dir={dir}>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Users size={20} style={{ display:'inline', marginInlineEnd:8 }} />
            {isUrdu ? 'کسٹمر اکاؤنٹ بیان' : 'Customer Account Statement'}
          </h1>
          <p className="page-subtitle">
            {isUrdu ? 'فروخت انوائس + وصولیاں — چلتا بیلنس' : 'Sales invoices + receipts — running balance'}
          </p>
        </div>
        <div className="header-actions">
          {statement && (
            <button className="btn btn-primary" onClick={() => { setPmtForm(EMPTY_PMT()); setShowPmtForm(true); }} disabled={!selectedId}>
              <Plus size={14} /> {isUrdu ? 'وصولی درج کریں' : 'Record Receipt'}
            </button>
          )}
          <button className="btn btn-accent" onClick={handlePrint} disabled={!statement || !filtered.length}>
            <Printer size={14} /> {isUrdu ? 'پرنٹ' : 'Print PDF'}
          </button>
          <button className="btn btn-secondary" onClick={loadStatement} disabled={loading || !selectedId}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="account-select-row" style={{ flexWrap: 'wrap', gap: 10 }}>
        <select className="select-field" style={{ minWidth: 220 }} value={selectedId} onChange={e => { setSelectedId(e.target.value); setStatement(null); }}>
          <option value="">{isUrdu ? '— کسٹمر منتخب کریں —' : '— Select Customer —'}</option>
          {customers.map(c => <option key={c.CustomerID} value={c.CustomerID}>{c.CustomerName}</option>)}
        </select>
        <div className="date-group"><span className="date-label">{isUrdu ? 'سے' : 'From'}</span>
          <input type="date" className="input-field" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
        <div className="date-group"><span className="date-label">{isUrdu ? 'تک' : 'To'}</span>
          <input type="date" className="input-field" value={endDate} onChange={e => setEndDate(e.target.value)} /></div>
        <button className="btn btn-primary" onClick={loadStatement} disabled={!selectedId || loading}>{isUrdu ? 'لوڈ' : 'Load'}</button>
        <button className="btn btn-ghost" onClick={() => { setStartDate(''); setEndDate(''); setStatement(null); setSelectedId(''); }}>{isUrdu ? 'صاف' : 'Clear'}</button>
      </div>

      {/* Search within loaded statement */}
      {statement && (
        <div style={{ position: 'relative', margin: '12px 0' }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input type="text" className="input-field" style={{ paddingLeft: 30, width: 340 }}
            placeholder={isUrdu ? 'قسم / حوالہ / تفصیل سے تلاش…' : 'Filter by type / ref / narration…'}
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      )}

      {/* State rendering */}
      {!currentDb ? (
        <div className="empty-state"><div className="empty-state-icon"><Users size={40} /></div><h3>{isUrdu ? 'ڈیٹا بیس منتخب نہیں' : 'No Database Selected'}</h3></div>
      ) : !selectedId ? (
        <div className="empty-state"><div className="empty-state-icon">👤</div><h3>{isUrdu ? 'کسٹمر منتخب کریں' : 'Select a customer'}</h3><p>{isUrdu ? 'اوپر سے کسٹمر منتخب کریں پھر لوڈ کریں' : 'Choose a customer above then click Load'}</p></div>
      ) : loading ? (
        <div className="empty-state"><div className="loading-spinner" style={{ margin: '0 auto' }} /></div>
      ) : !statement ? null : (
        <>
          {/* Summary cards */}
          <div className="report-summary" style={{ marginBottom: 16 }}>
            <div className="summary-pill">
              <div className="summary-pill-label">{isUrdu ? 'کسٹمر' : 'Customer'}</div>
              <div className="summary-pill-value" style={{ color: 'var(--text-primary)', fontSize: 14 }}>
                {statement.customer?.CustomerName}
              </div>
            </div>
            <div className="summary-pill">
              <div className="summary-pill-label">{isUrdu ? 'ابتدائی بیلنس' : 'Opening Balance'}</div>
              <div className={`summary-pill-value ${openingBalance >= 0 ? 'pill-debit' : 'pill-credit'}`}>
                Rs.&nbsp;{fmt(Math.abs(openingBalance))} {openingBalance >= 0 ? 'Dr' : 'Cr'}
              </div>
            </div>
            <div className="summary-pill">
              <div className="summary-pill-label">{isUrdu ? 'کل انوائس' : 'Total Invoiced'}</div>
              <div className="summary-pill-value pill-debit">Rs.&nbsp;{fmt(statement.totalInvoiced)}</div>
            </div>
            <div className="summary-pill">
              <div className="summary-pill-label">{isUrdu ? 'کل وصول' : 'Total Received'}</div>
              <div className="summary-pill-value pill-credit">Rs.&nbsp;{fmt(statement.totalPaid)}</div>
            </div>
            <div className="summary-pill" style={{ flex: 2 }}>
              <div className="summary-pill-label">{isUrdu ? 'بقایہ' : 'Closing Balance'}</div>
              <div className={`summary-pill-value ${closingBalance >= 0 ? 'pill-debit' : 'pill-credit'}`} style={{ fontSize: 20 }}>
                Rs.&nbsp;{fmt(Math.abs(closingBalance))} {closingBalance >= 0 ? 'Dr' : 'Cr'}
              </div>
            </div>
          </div>

          {/* Transaction table */}
          {filtered.length === 0 ? (
            <div className="empty-state"><div className="empty-state-icon">🔍</div><h3>{isUrdu ? 'کوئی لین دین نہیں' : 'No transactions found'}</h3></div>
          ) : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 110 }}>{isUrdu ? 'تاریخ' : 'Date'}</th>
                    <th style={{ width: 130 }}>{isUrdu ? 'قسم' : 'Type'}</th>
                    <th style={{ width: 110 }}>{isUrdu ? 'حوالہ' : 'Ref'}</th>
                    <th>{isUrdu ? 'تفصیل' : 'Narration'}</th>
                    <th className="text-right" style={{ width: 140 }}>{isUrdu ? 'ڈیبٹ' : 'Debit (Rs.)'}</th>
                    <th className="text-right" style={{ width: 140 }}>{isUrdu ? 'کریڈٹ' : 'Credit (Rs.)'}</th>
                    <th className="text-right" style={{ width: 160 }}>{isUrdu ? 'بیلنس' : 'Balance (Rs.)'}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((tx, i) => (
                    <tr key={i}>
                      <td style={{ fontSize: 12 }}>{fmtD(tx.txDate)}</td>
                      <td>
                        <span style={{
                          fontSize: 11, padding: '2px 8px', borderRadius: 10,
                          background: tx.txType === 'Payment Received' ? 'rgba(16,185,129,0.12)' : 'rgba(59,130,246,0.12)',
                          color: tx.txType === 'Payment Received' ? 'var(--emerald)' : 'var(--blue)',
                        }}>{tx.txType}</span>
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--accent)' }}>{tx.txRef || '—'}</td>
                      <td className="account-name">{tx.narration || '—'}</td>
                      <td className={`text-right ${tx.debit > 0 ? 'amount-debit' : ''}`}>{tx.debit > 0 ? fmt(tx.debit) : '—'}</td>
                      <td className={`text-right ${tx.credit > 0 ? 'amount-credit' : ''}`}>{tx.credit > 0 ? fmt(tx.credit) : '—'}</td>
                      <td className="text-right">
                        <span className={`balance-pill ${tx.balance >= 0 ? 'balance-positive' : 'balance-negative'}`}>
                          {fmt(Math.abs(tx.balance))} {tx.balance >= 0 ? 'Dr' : 'Cr'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── Payment Modal ── */}
      {showPmtForm && (
        <div className="modal-overlay" onClick={() => setShowPmtForm(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} dir={dir} style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <h3>{isUrdu ? 'کسٹمر وصولی' : 'Record Customer Receipt'}</h3>
              <button className="btn-icon" onClick={() => setShowPmtForm(false)}><X size={16} /></button>
            </div>
            <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field-group">
                <label>{isUrdu ? 'تاریخ *' : 'Date *'}</label>
                <input type="date" className="input-field" value={pmtForm.PaymentDate} onChange={e => setPmtForm(f => ({ ...f, PaymentDate: e.target.value }))} />
              </div>
              <div className="field-group">
                <label>{isUrdu ? 'رسید نمبر' : 'Receipt Ref'}</label>
                <input type="text" className="input-field" placeholder={isUrdu ? 'خودکار' : 'Auto'} value={pmtForm.PaymentRef} onChange={e => setPmtForm(f => ({ ...f, PaymentRef: e.target.value }))} />
              </div>
              <div className="field-group" style={{ gridColumn: 'span 2' }}>
                <label>{isUrdu ? 'رقم *' : 'Amount (Rs.) *'}</label>
                <input type="number" min="0.01" step="0.01" className="input-field" style={{ fontSize: 18, fontWeight: 700 }}
                  placeholder="0.00" value={pmtForm.Amount} onChange={e => setPmtForm(f => ({ ...f, Amount: e.target.value }))} />
              </div>
              <div className="field-group">
                <label>{isUrdu ? 'ادائیگی کا طریقہ' : 'Payment Mode'}</label>
                <select className="select-field" value={pmtForm.PaymentMode} onChange={e => setPmtForm(f => ({ ...f, PaymentMode: e.target.value }))}>
                  <option value="Cash">{isUrdu ? 'نقد' : 'Cash'}</option>
                  <option value="Bank">{isUrdu ? 'بنک' : 'Bank Transfer'}</option>
                  <option value="Cheque">{isUrdu ? 'چیک' : 'Cheque'}</option>
                  <option value="Online">{isUrdu ? 'آن لائن' : 'Online'}</option>
                </select>
              </div>
              <div className="field-group">
                <label>{isUrdu ? 'بنک / اکاؤنٹ' : 'Bank / Account'}</label>
                <input type="text" className="input-field" placeholder="HBL / MCB" value={pmtForm.BankAccount} onChange={e => setPmtForm(f => ({ ...f, BankAccount: e.target.value }))} />
              </div>
              <div className="field-group" style={{ gridColumn: 'span 2' }}>
                <label>{isUrdu ? 'نوٹ' : 'Narration'}</label>
                <input type="text" className="input-field" placeholder={isUrdu ? 'ادائیگی کی تفصیل' : 'Payment details'} value={pmtForm.Narration} onChange={e => setPmtForm(f => ({ ...f, Narration: e.target.value }))} />
              </div>
            </div>
            <div style={{ padding: '0 20px 12px', fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-secondary,#f8fafc)', borderRadius: '0 0 4px 4px' }}>
              ℹ️ {isUrdu ? 'یہ وصولی خودکار اکاؤنٹنگ میں پوسٹ ہو جائے گی (Dr نقد/بنک، Cr کسٹمر)' : 'This receipt will auto-post to accounting (Dr Cash/Bank, Cr Customer A/R)'}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowPmtForm(false)} disabled={saving}>{isUrdu ? 'واپس' : 'Cancel'}</button>
              <button className="btn btn-primary" onClick={handleSavePayment} disabled={saving}>
                <Save size={13} /> {saving ? '…' : (isUrdu ? 'محفوظ کریں' : 'Save Receipt')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
