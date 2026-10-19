import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Printer, Users } from 'lucide-react';
import { useLang } from '../context/LanguageContext';

const api = window.electronAPI;
function fmt(n) { if (!n && n !== 0) return '—'; return Number(n).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtD(d) { if (!d) return '—'; try { return new Date(d).toLocaleDateString('en-PK', { day:'2-digit', month:'short', year:'numeric' }); } catch { return d; } }

export default function CustomerOutstanding({ currentDb, dbInfo, showNotification }) {
  const { isUrdu } = useLang();
  const dir = isUrdu ? 'rtl' : 'ltr';
  const [data, setData]         = useState([]);
  const [loading, setLoading]   = useState(false);
  const [asOfDate, setAsOfDate] = useState('');
  const [expanded, setExpanded] = useState({});

  const load = useCallback(async () => {
    if (!currentDb) return;
    setLoading(true);
    try {
      const res = await api.getCustomerOutstanding({ dbPath: currentDb, asOfDate: asOfDate || undefined });
      if (res.success) setData(res.data);
      else showNotification(res.error || 'Load failed', 'error');
    } finally { setLoading(false); }
  }, [currentDb, asOfDate]);

  useEffect(() => { load(); }, [load, dbInfo?.lastRefresh]);

  async function handlePrint() {
    const prefs = await api.getPrefs().catch(() => ({}));
    const genAt = new Date().toLocaleString('en-PK');
    const totalBal = data.reduce((s, c) => s + c.balance, 0);
    const rows = data.map(c => `
      <tr class="group-row"><td colspan="5">${c.CustomerName}${c.Contact ? ` — ${c.Contact}` : ''}</td></tr>
      ${(c.invoices || []).map(inv => `<tr><td style="padding-left:20px">${inv.InvoiceNo}</td><td>${fmtD(inv.InvoiceDate)}</td><td class="tr">${fmt(inv.NetTotal)}</td><td class="tr">—</td><td class="tr">${fmt(inv.NetTotal)}</td></tr>`).join('')}
      <tr class="sub-row"><td colspan="2">${isUrdu ? 'کسٹمر کل' : 'Customer Total'}</td><td class="tr">${fmt(c.totalInvoiced)}</td><td class="tr">${fmt(c.totalPaid)}</td><td class="tr" style="color:${c.balance >= 0 ? '#dc2626' : '#15803d'}">${fmt(c.balance)}</td></tr>
    `).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{box-sizing:border-box;margin:0;padding:0}@page{margin:10mm 12mm;size:A4}body{font-family:'Segoe UI',Arial,sans-serif;font-size:8.5pt;color:#1a1a2e}table{width:100%;border-collapse:collapse}th{background:#4f46e5;color:#fff;padding:4px 7px;font-size:7.5pt;text-align:left}td{padding:3px 7px;border-bottom:1px solid #e2e8f0;font-size:8.5pt}.tr{text-align:right}.group-row td{background:#e0e7ff;font-weight:700;font-size:7.5pt;color:#3730a3;padding:4px 7px}.sub-row td{background:#f0f4ff;font-weight:600;font-size:7.5pt;padding:3px 7px}.grand-total td{background:#4f46e5;color:#fff;font-weight:700;font-size:9pt;padding:5px 8px}h1{font-size:13pt;font-weight:700;color:#4f46e5}h2{font-size:9.5pt;font-weight:600}p{font-size:7.5pt;color:#64748b}.hdr{display:flex;justify-content:space-between;border-bottom:2px solid #4f46e5;padding-bottom:6px;margin-bottom:10px}</style></head>
    <body><div class="hdr"><div><h1>${prefs.companyName || 'Flouris ERP'}</h1><h2>${isUrdu ? 'کسٹمر واجبات' : 'Customer Outstanding'}</h2>${asOfDate ? `<p>${isUrdu ? 'بتاریخ' : 'As of'}: ${fmtD(asOfDate)}</p>` : ''}</div><div style="font-size:7.5pt;color:#64748b;text-align:right">${genAt}</div></div>
    <table><thead><tr><th>${isUrdu?'انوائس':'Invoice'}</th><th>${isUrdu?'تاریخ':'Date'}</th><th class="tr">${isUrdu?'انوائس رقم':'Invoiced'}</th><th class="tr">${isUrdu?'ادا شدہ':'Paid'}</th><th class="tr">${isUrdu?'بیلنس':'Balance'}</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr class="grand-total"><td colspan="2">${isUrdu?'مجموعی کل':'Grand Total'}</td><td class="tr">${fmt(data.reduce((s,c)=>s+c.totalInvoiced,0))}</td><td class="tr">${fmt(data.reduce((s,c)=>s+c.totalPaid,0))}</td><td class="tr">${fmt(totalBal)}</td></tr></tfoot></table></body></html>`;
    await api.savePDF({ html, defaultFileName: 'Customer-Outstanding.pdf' });
  }

  const totalBal = data.reduce((s, c) => s + c.balance, 0);

  return (
    <div className="page" dir={dir}>
      <div className="page-header">
        <div><h1 className="page-title">{isUrdu?'کسٹمر واجبات':'Customer Outstanding'}</h1><p className="page-subtitle">{isUrdu?'کسٹمرز کی بقایا رقم':'Unpaid balances by customer'}</p></div>
        <div className="header-actions">
          <button className="btn btn-accent" onClick={handlePrint} disabled={loading || !data.length}><Printer size={14} />{isUrdu?'PDF':'Print PDF'}</button>
          <button className="btn btn-secondary" onClick={load} disabled={loading}><RefreshCw size={14} className={loading?'spin':''} /></button>
        </div>
      </div>
      <div className="report-controls" style={{ marginBottom: 14 }}>
        <div className="date-group"><span className="date-label">{isUrdu?'بتاریخ':'As of'}</span><input type="date" className="input-field" value={asOfDate} onChange={e => setAsOfDate(e.target.value)} /></div>
        <button className="btn btn-primary" onClick={load} disabled={loading}>{isUrdu?'لوڈ کریں':'Load'}</button>
        <button className="btn btn-ghost" onClick={() => setAsOfDate('')}>{isUrdu?'صاف':'Clear'}</button>
      </div>
      {!currentDb ? <div className="empty-state"><div className="empty-state-icon"><Users size={40}/></div><h3>{isUrdu?'ڈیٹا بیس منتخب نہیں':'No Database Selected'}</h3></div>
      : loading ? <div className="empty-state"><div className="loading-spinner" style={{ margin:'0 auto' }} /></div>
      : data.length === 0 ? <div className="empty-state"><div className="empty-state-icon">📋</div><h3>{isUrdu?'کوئی واجبات نہیں':'No outstanding balances'}</h3><p>{isUrdu?'کوئی پوسٹڈ فروخت انوائس نہیں ملی':'No posted sales invoices found'}</p></div>
      : (
        <>
          <div className="report-summary">
            <div className="summary-pill"><div className="summary-pill-label">{isUrdu?'کسٹمرز':'Customers'}</div><div className="summary-pill-value">{data.length}</div></div>
            <div className="summary-pill"><div className="summary-pill-label">{isUrdu?'کل انوائس':'Total Invoiced'}</div><div className="summary-pill-value pill-debit">Rs.{fmt(data.reduce((s,c)=>s+c.totalInvoiced,0))}</div></div>
            <div className="summary-pill"><div className="summary-pill-label">{isUrdu?'کل واجب':'Total Outstanding'}</div><div className="summary-pill-value" style={{ color: totalBal > 0 ? 'var(--rose)' : 'var(--emerald)' }}>Rs.{fmt(totalBal)}</div></div>
          </div>
          <div className="data-table-wrap" style={{ marginTop: 14 }}>
            <table className="data-table">
              <thead><tr>
                <th>{isUrdu?'کسٹمر':'Customer'}</th>
                <th>{isUrdu?'رابطہ':'Contact'}</th>
                <th className="text-right">{isUrdu?'انوائس رقم':'Invoiced'}</th>
                <th className="text-right">{isUrdu?'ادا شدہ':'Paid'}</th>
                <th className="text-right">{isUrdu?'بیلنس':'Balance'}</th>
                <th style={{ width: 80 }}></th>
              </tr></thead>
              <tbody>
                {data.map(c => (
                  <React.Fragment key={c.CustomerID}>
                    <tr style={{ cursor: 'pointer' }} onClick={() => setExpanded(e => ({ ...e, [c.CustomerID]: !e[c.CustomerID] }))}>
                      <td className="account-name">{c.CustomerName} <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{expanded[c.CustomerID] ? '▲' : '▼'}</span></td>
                      <td style={{ fontSize: 12 }}>{c.Contact || '—'}</td>
                      <td className="text-right">{fmt(c.totalInvoiced)}</td>
                      <td className="text-right">{fmt(c.totalPaid)}</td>
                      <td className="text-right" style={{ fontWeight: 700, color: c.balance > 0 ? 'var(--rose)' : 'var(--emerald)' }}>Rs.{fmt(c.balance)}</td>
                      <td></td>
                    </tr>
                    {expanded[c.CustomerID] && (c.invoices || []).map(inv => (
                      <tr key={inv.SIHID} style={{ background: 'var(--bg-deep)' }}>
                        <td style={{ paddingInlineStart: 28, fontSize: 12, color: 'var(--accent)', fontFamily: 'monospace' }}>{inv.InvoiceNo}</td>
                        <td style={{ fontSize: 12 }}>{fmtD(inv.InvoiceDate)}</td>
                        <td className="text-right" style={{ fontSize: 12 }}>{fmt(inv.NetTotal)}</td>
                        <td className="text-right" style={{ fontSize: 12 }}>—</td>
                        <td className="text-right" style={{ fontSize: 12, color: 'var(--rose)' }}>{fmt(inv.NetTotal)}</td>
                        <td></td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={2}><strong>{isUrdu?'مجموعی':'Grand Total'}</strong></td><td className="text-right"><strong>{fmt(data.reduce((s,c)=>s+c.totalInvoiced,0))}</strong></td><td className="text-right"><strong>{fmt(data.reduce((s,c)=>s+c.totalPaid,0))}</strong></td><td className="text-right" style={{ color: totalBal > 0 ? 'var(--rose)' : 'var(--emerald)', fontWeight: 700 }}>Rs.{fmt(totalBal)}</td><td></td></tr></tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
