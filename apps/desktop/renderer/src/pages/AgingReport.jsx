import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Printer } from 'lucide-react';
import { useLang } from '../context/LanguageContext';

const api = window.electronAPI;

function fmt(n) { return Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

export default function AgingReport({ currentDb, dbInfo, showNotification }) {
  const { isUrdu } = useLang();
  const dir = isUrdu ? 'rtl' : 'ltr';

  const [partyType, setPartyType]   = useState('Customer');
  const [asOfDate,  setAsOfDate]    = useState(new Date().toISOString().slice(0, 10));
  const [data,      setData]        = useState([]);
  const [summary,   setSummary]     = useState({});
  const [loading,   setLoading]     = useState(false);

  const load = useCallback(async () => {
    if (!currentDb) return;
    setLoading(true);
    try {
      const r = await api.getAgingReport({ dbPath: currentDb, partyType, asOfDate });
      if (r.success) { setData(r.data || []); setSummary(r.summary || {}); }
      else showNotification(r.error || 'Load failed', 'error');
    } finally { setLoading(false); }
  }, [currentDb, partyType, asOfDate]);

  useEffect(() => { load(); }, [load, dbInfo?.lastRefresh]);

  const bucketLabels = [
    { key: 'current',    label: isUrdu ? 'موجودہ'    : 'Current',    labelEn: 'Current' },
    { key: 'days1_30',   label: isUrdu ? '1-30 دن'    : '1–30 Days',  labelEn: '1–30' },
    { key: 'days31_60',  label: isUrdu ? '31-60 دن'   : '31–60 Days', labelEn: '31–60' },
    { key: 'days61_90',  label: isUrdu ? '61-90 دن'   : '61–90 Days', labelEn: '61–90' },
    { key: 'days91_120', label: isUrdu ? '91-120 دن'  : '91–120 Days',labelEn: '91–120' },
    { key: 'days120plus',label: isUrdu ? '120+ دن'    : '120+ Days',  labelEn: '120+' },
    { key: 'total',      label: isUrdu ? 'کل'         : 'Total',      labelEn: 'Total', bold: true },
  ];

  async function handlePrint() {
    if (!api.savePDF) return;
    const title = `${partyType} Aging Report — As of ${asOfDate}`;
    const rows = data.map(d => `
      <tr>
        <td>${d.PartyName}</td>
        ${bucketLabels.map(b => `<td style="text-align:right">${fmt(d[b.key] || 0)}</td>`).join('')}
      </tr>`).join('');
    const html = `<html><head><style>body{font-family:Arial;font-size:12px}table{width:100%;border-collapse:collapse}th,td{padding:6px 10px;border:1px solid #ddd}th{background:#f0f4f8;font-weight:700}td:not(:first-child){text-align:right}tfoot td{font-weight:700;background:#f0f4f8}</style></head><body>
      <h2>${title}</h2>
      <table>
        <thead><tr><th>${isUrdu ? 'فریق' : 'Party'}</th>${bucketLabels.map(b => `<th>${b.labelEn}</th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td><strong>${isUrdu ? 'کل' : 'Total'}</strong></td>${bucketLabels.map(b => `<td>${fmt(summary[b.key] || 0)}</td>`).join('')}</tr></tfoot>
      </table>
    </body></html>`;
    await api.savePDF({ html, defaultFileName: `${partyType}_Aging_${asOfDate}.pdf` });
  }

  return (
    <div className="page" dir={dir}>
      <div className="page-header">
        <div>
          <h1 className="page-title">{isUrdu ? 'بقایا رپورٹ' : 'Aging Report'}</h1>
          <p className="page-subtitle">{isUrdu ? 'واجبات کی تاریخ کے مطابق درجہ بندی' : 'Outstanding balances bucketed by overdue period'}</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={handlePrint} disabled={!data.length}><Printer size={14} />{isUrdu ? 'پرنٹ' : 'Print PDF'}</button>
          <button className="btn btn-secondary" onClick={load} disabled={loading}><RefreshCw size={14} className={loading ? 'spin' : ''} />{isUrdu ? 'تازہ کریں' : 'Refresh'}</button>
        </div>
      </div>

      <div className="report-controls" style={{ marginBottom: 14 }}>
        <select className="select-field" style={{ minWidth: 160 }} value={partyType} onChange={e => setPartyType(e.target.value)}>
          <option value="Customer">{isUrdu ? 'گاہک (وصولی)' : 'Customers (AR)'}</option>
          <option value="Supplier">{isUrdu ? 'سپلائر (ادائیگی)' : 'Suppliers (AP)'}</option>
        </select>
        <div className="field-group" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{isUrdu ? 'بتاریخ:' : 'As of Date:'}</label>
          <input type="date" className="input-field" style={{ width: 160 }} value={asOfDate} onChange={e => setAsOfDate(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={load} disabled={loading || !currentDb}>{loading ? '…' : (isUrdu ? 'رپورٹ دیکھیں' : 'Run Report')}</button>
      </div>

      {!currentDb ? (
        <div className="empty-state"><h3>{isUrdu ? 'ڈیٹا بیس منتخب نہیں' : 'No Database Selected'}</h3></div>
      ) : loading ? (
        <div className="empty-state"><div className="loading-spinner" style={{ margin: '0 auto' }} /></div>
      ) : (
        <>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead><tr>
                <th>{isUrdu ? 'نام' : 'Party Name'}</th>
                {bucketLabels.map(b => <th key={b.key} className="text-right" style={b.bold ? { fontWeight: 800 } : {}}>{b.label}</th>)}
              </tr></thead>
              <tbody>
                {data.length === 0 ? (
                  <tr><td colSpan={bucketLabels.length + 1} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
                    {isUrdu ? 'کوئی بقایا نہیں' : 'No outstanding balances'}
                  </td></tr>
                ) : data.map(d => (
                  <tr key={d.PartyID}>
                    <td className="account-name">{d.PartyName}</td>
                    {bucketLabels.map(b => (
                      <td key={b.key} className="text-right" style={{
                        color: b.key !== 'current' && b.key !== 'total' && Number(d[b.key] || 0) > 0 ? 'var(--rose)' : undefined,
                        fontWeight: b.bold ? 700 : undefined,
                      }}>
                        {Number(d[b.key] || 0) > 0 ? fmt(d[b.key]) : '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {data.length > 0 && (
                <tfoot>
                  <tr style={{ fontWeight: 700, background: 'var(--bg-secondary)' }}>
                    <td>{isUrdu ? 'مجموعی' : 'Grand Total'}</td>
                    {bucketLabels.map(b => (
                      <td key={b.key} className="text-right" style={{ color: b.key === 'total' ? 'var(--accent)' : undefined }}>
                        {fmt(summary[b.key] || 0)}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Summary buckets */}
          {Object.keys(summary).length > 0 && (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', padding: '12px 0' }}>
              {bucketLabels.filter(b => b.key !== 'total').map(b => (
                <div key={b.key} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', minWidth: 120 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{b.label}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: Number(summary[b.key]||0) > 0 && b.key !== 'current' ? 'var(--rose)' : 'var(--emerald)' }}>
                    Rs.{fmt(summary[b.key] || 0)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
