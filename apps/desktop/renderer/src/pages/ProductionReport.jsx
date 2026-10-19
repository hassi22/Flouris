import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Printer, Factory } from 'lucide-react';
import { useLang } from '../context/LanguageContext';

const api = window.electronAPI;
function fmt(n, dec=2) { if (!n && n !== 0) return '—'; return Number(n).toLocaleString('en-PK', { minimumFractionDigits: dec, maximumFractionDigits: dec }); }
function fmtD(d) { if (!d) return '—'; try { return new Date(d).toLocaleDateString('en-PK', { day:'2-digit', month:'short', year:'numeric' }); } catch { return d; } }
function pct(v) { if (!v && v !== 0) return '—'; return `${Number(v).toFixed(1)}%`; }

export default function ProductionReport({ currentDb, dbInfo, showNotification }) {
  const { isUrdu } = useLang();
  const dir = isUrdu ? 'rtl' : 'ltr';
  const [data, setData]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate]     = useState('');
  const [expanded, setExpanded]   = useState({});

  const load = useCallback(async () => {
    if (!currentDb) return;
    setLoading(true);
    try {
      const res = await api.getProductionReport({ dbPath: currentDb, startDate: startDate || undefined, endDate: endDate || undefined });
      if (res.success) setData(res.data);
      else showNotification(res.error || 'Load failed', 'error');
    } finally { setLoading(false); }
  }, [currentDb, startDate, endDate]);

  useEffect(() => { load(); }, [load, dbInfo?.lastRefresh]);

  const totalInput  = data.reduce((s, b) => s + Number(b.InputQty   || 0), 0);
  const totalOutput = data.reduce((s, b) => s + Number(b.TotalOutput || 0), 0);
  const totalLoss   = data.reduce((s, b) => s + Number(b.Loss        || 0), 0);
  const totalCost   = data.reduce((s, b) => s + Number(b.TotalInputCost || 0), 0);
  const avgRecovery = totalInput > 0 ? (totalOutput / totalInput * 100) : 0;

  async function handlePrint() {
    const prefs = await api.getPrefs().catch(() => ({}));
    const rows = data.map(b => `
      <tr>
        <td style="font-family:monospace;font-size:7.5pt">${b.BatchNo}</td>
        <td>${fmtD(b.BatchDate)}</td>
        <td>${b.InputItemName||'—'}</td>
        <td style="text-align:right">${fmt(b.InputQty,1)} KG</td>
        <td style="text-align:right">${fmt(b.TotalOutput,1)} KG</td>
        <td style="text-align:right;color:#dc2626">${fmt(b.Loss,1)} KG</td>
        <td style="text-align:right">${pct(b.RecoveryPct)}</td>
        <td style="text-align:right">Rs.${fmt(b.TotalInputCost)}</td>
        <td style="text-align:right">Rs.${fmt(b.CostPerKg)}/KG</td>
      </tr>
    `).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{box-sizing:border-box;margin:0;padding:0}@page{margin:10mm 12mm;size:A4 landscape}body{font-family:'Segoe UI',Arial,sans-serif;font-size:8pt;color:#1a1a2e}table{width:100%;border-collapse:collapse}th{background:#4f46e5;color:#fff;padding:4px 7px;font-size:7.5pt;text-align:left}td{padding:3px 7px;border-bottom:1px solid #e2e8f0}.grand-total td{background:#4f46e5;color:#fff;font-weight:700;padding:5px 8px}h1{font-size:13pt;font-weight:700;color:#4f46e5}h2{font-size:9.5pt;font-weight:600}.hdr{display:flex;justify-content:space-between;border-bottom:2px solid #4f46e5;padding-bottom:6px;margin-bottom:10px}</style></head>
    <body><div class="hdr"><div><h1>${prefs.companyName||'Flouris ERP'}</h1><h2>${isUrdu?'پیداوار رپورٹ / گندم ریکوری':'Production Report / Wheat Recovery'}</h2></div><div style="font-size:7.5pt;color:#64748b;text-align:right">${new Date().toLocaleString('en-PK')}</div></div>
    <table><thead><tr><th>${isUrdu?'بیچ نمبر':'Batch'}</th><th>${isUrdu?'تاریخ':'Date'}</th><th>${isUrdu?'خام مال':'Input'}</th><th style="text-align:right">${isUrdu?'مقدار':'Input KG'}</th><th style="text-align:right">${isUrdu?'پیداوار':'Output KG'}</th><th style="text-align:right">${isUrdu?'ضائع':'Loss KG'}</th><th style="text-align:right">${isUrdu?'ریکوری %':'Recovery%'}</th><th style="text-align:right">${isUrdu?'کل لاگت':'Total Cost'}</th><th style="text-align:right">${isUrdu?'لاگت/KG':'Cost/KG'}</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr class="grand-total"><td colspan="3">${isUrdu?'مجموعی':'Total'}</td><td style="text-align:right">${fmt(totalInput,1)} KG</td><td style="text-align:right">${fmt(totalOutput,1)} KG</td><td style="text-align:right">${fmt(totalLoss,1)} KG</td><td style="text-align:right">${pct(avgRecovery)}</td><td style="text-align:right">Rs.${fmt(totalCost)}</td><td></td></tr></tfoot></table></body></html>`;
    await api.savePDF({ html, defaultFileName: 'Production-Report.pdf' });
  }

  return (
    <div className="page" dir={dir}>
      <div className="page-header">
        <div><h1 className="page-title">{isUrdu?'پیداوار رپورٹ':'Production Report'}</h1><p className="page-subtitle">{isUrdu?'گندم ریکوری، پیداوار اور لاگت تجزیہ':'Wheat recovery, production output and cost analysis'}</p></div>
        <div className="header-actions">
          <button className="btn btn-accent" onClick={handlePrint} disabled={loading || !data.length}><Printer size={14} />{isUrdu?'PDF':'Print PDF'}</button>
          <button className="btn btn-secondary" onClick={load} disabled={loading}><RefreshCw size={14} className={loading?'spin':''} /></button>
        </div>
      </div>
      <div className="report-controls" style={{ marginBottom: 14 }}>
        <div className="date-group"><span className="date-label">{isUrdu?'سے':'From'}</span><input type="date" className="input-field" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
        <div className="date-group"><span className="date-label">{isUrdu?'تک':'To'}</span><input type="date" className="input-field" value={endDate} onChange={e => setEndDate(e.target.value)} /></div>
        <button className="btn btn-primary" onClick={load} disabled={loading}>{isUrdu?'لوڈ':'Load'}</button>
        <button className="btn btn-ghost" onClick={() => { setStartDate(''); setEndDate(''); }}>{isUrdu?'صاف':'Clear'}</button>
      </div>

      {!currentDb ? <div className="empty-state"><div className="empty-state-icon"><Factory size={40}/></div><h3>{isUrdu?'ڈیٹا بیس منتخب نہیں':'No Database Selected'}</h3></div>
      : loading ? <div className="empty-state"><div className="loading-spinner" style={{ margin:'0 auto' }} /></div>
      : data.length === 0 ? <div className="empty-state"><div className="empty-state-icon">🏭</div><h3>{isUrdu?'کوئی پیداوار نہیں':'No production batches'}</h3></div>
      : (
        <>
          <div className="report-summary">
            <div className="summary-pill"><div className="summary-pill-label">{isUrdu?'بیچز':'Batches'}</div><div className="summary-pill-value">{data.length}</div></div>
            <div className="summary-pill"><div className="summary-pill-label">{isUrdu?'کل گندم':'Total Wheat'}</div><div className="summary-pill-value">{fmt(totalInput,1)} KG</div></div>
            <div className="summary-pill"><div className="summary-pill-label">{isUrdu?'کل پیداوار':'Total Output'}</div><div className="summary-pill-value pill-credit">{fmt(totalOutput,1)} KG</div></div>
            <div className="summary-pill"><div className="summary-pill-label">{isUrdu?'کل ضائع':'Total Loss'}</div><div className="summary-pill-value pill-debit">{fmt(totalLoss,1)} KG</div></div>
            <div className="summary-pill"><div className="summary-pill-label">{isUrdu?'اوسط ریکوری':'Avg Recovery'}</div><div className="summary-pill-value pill-profit">{pct(avgRecovery)}</div></div>
            <div className="summary-pill"><div className="summary-pill-label">{isUrdu?'کل لاگت':'Total Cost'}</div><div className="summary-pill-value">Rs.{fmt(totalCost)}</div></div>
          </div>

          <div className="data-table-wrap" style={{ marginTop: 14 }}>
            <table className="data-table">
              <thead><tr>
                <th>{isUrdu?'بیچ نمبر':'Batch No'}</th>
                <th>{isUrdu?'تاریخ':'Date'}</th>
                <th>{isUrdu?'خام مال':'Input Item'}</th>
                <th className="text-right">{isUrdu?'مقدار':'Input KG'}</th>
                <th className="text-right">{isUrdu?'پیداوار':'Output KG'}</th>
                <th className="text-right">{isUrdu?'ضائع':'Loss KG'}</th>
                <th className="text-right">{isUrdu?'ریکوری %':'Recovery%'}</th>
                <th className="text-right">{isUrdu?'ضائع %':'Loss%'}</th>
                <th className="text-right">{isUrdu?'کل لاگت':'Total Cost'}</th>
                <th className="text-right">{isUrdu?'لاگت/KG':'Cost/KG'}</th>
                <th style={{ width: 36 }}></th>
              </tr></thead>
              <tbody>
                {data.map(b => (
                  <React.Fragment key={b.BatchID}>
                    <tr style={{ cursor: 'pointer' }} onClick={() => setExpanded(e => ({ ...e, [b.BatchID]: !e[b.BatchID] }))}>
                      <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--accent)' }}>{b.BatchNo}</td>
                      <td>{fmtD(b.BatchDate)}</td>
                      <td className="account-name">{b.InputItemName || '—'}</td>
                      <td className="text-right">{fmt(b.InputQty, 1)}</td>
                      <td className="text-right amount-credit">{fmt(b.TotalOutput, 1)}</td>
                      <td className="text-right amount-debit">{fmt(b.Loss, 1)}</td>
                      <td className="text-right" style={{ color: b.RecoveryPct >= 95 ? 'var(--emerald)' : b.RecoveryPct >= 90 ? 'var(--amber)' : 'var(--rose)', fontWeight: 600 }}>{pct(b.RecoveryPct)}</td>
                      <td className="text-right" style={{ color: 'var(--rose)' }}>{pct(b.LossPct)}</td>
                      <td className="text-right">Rs.{fmt(b.TotalInputCost)}</td>
                      <td className="text-right" style={{ fontSize: 12 }}>Rs.{fmt(b.CostPerKg)}</td>
                      <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{expanded[b.BatchID] ? '▲' : '▼'}</td>
                    </tr>
                    {expanded[b.BatchID] && (b.lines || []).map((l, li) => (
                      <tr key={li} style={{ background: 'var(--bg-deep)' }}>
                        <td colSpan={3} style={{ paddingInlineStart: 28, fontSize: 12, color: l.IsLoss ? 'var(--rose)' : 'var(--emerald)' }}>
                          {l.IsLoss ? '🗑️' : '📦'} {l.ItemName}
                        </td>
                        <td></td>
                        <td className="text-right" style={{ fontSize: 12, color: l.IsLoss ? 'var(--rose)' : 'var(--emerald)' }}>{fmt(l.Quantity, 1)} KG</td>
                        <td colSpan={2} style={{ fontSize: 12 }}>{l.IsLoss ? (isUrdu ? 'ضائع' : 'Loss') : ''}</td>
                        <td></td>
                        <td className="text-right" style={{ fontSize: 12 }}>{l.AllocatedCost > 0 ? `Rs.${fmt(l.AllocatedCost)}` : '—'}</td>
                        <td className="text-right" style={{ fontSize: 12 }}>{l.CostPerUnit > 0 ? `Rs.${fmt(l.CostPerUnit)}/KG` : '—'}</td>
                        <td></td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
              <tfoot><tr>
                <td colSpan={3}><strong>{isUrdu?'مجموعی':'Total'}</strong></td>
                <td className="text-right"><strong>{fmt(totalInput,1)} KG</strong></td>
                <td className="text-right" style={{ color: 'var(--emerald)', fontWeight: 700 }}>{fmt(totalOutput,1)} KG</td>
                <td className="text-right" style={{ color: 'var(--rose)', fontWeight: 700 }}>{fmt(totalLoss,1)} KG</td>
                <td className="text-right" style={{ fontWeight: 700 }}>{pct(avgRecovery)}</td>
                <td className="text-right" style={{ fontWeight: 700 }}>{totalInput > 0 ? pct(totalLoss/totalInput*100) : '—'}</td>
                <td className="text-right"><strong>Rs.{fmt(totalCost)}</strong></td>
                <td className="text-right" style={{ fontSize: 12 }}>{totalOutput > 0 ? `Rs.${fmt(totalCost/totalOutput)}/KG` : '—'}</td>
                <td></td>
              </tr></tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
