import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Printer, Package } from 'lucide-react';
import { useLang } from '../context/LanguageContext';

const api = window.electronAPI;
function fmt(n, dec=2) { if (!n && n !== 0) return '—'; return Number(n).toLocaleString('en-PK', { minimumFractionDigits: dec, maximumFractionDigits: dec }); }
function fmtQty(n, dec=3) { if (n == null) return '—'; return Number(n).toLocaleString('en-PK', { minimumFractionDigits: dec, maximumFractionDigits: dec }); }

export default function StockValuation({ currentDb, dbInfo, showNotification }) {
  const { isUrdu } = useLang();
  const dir = isUrdu ? 'rtl' : 'ltr';
  const [data, setData]           = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [packUnits,  setPackUnits]  = useState([]); // packaging unit definitions
  const [totalValue, setTotalValue] = useState(0);
  const [loading, setLoading]     = useState(false);
  const [asOfDate, setAsOfDate]   = useState('');
  const [warehouseId, setWarehouseId] = useState('');

  const load = useCallback(async () => {
    if (!currentDb) return;
    setLoading(true);
    try {
      const [res, wRes, pkRes] = await Promise.all([
        api.getStockValuation({ dbPath: currentDb, asOfDate: asOfDate || undefined, warehouseId: warehouseId || undefined }),
        api.getWarehouses(currentDb),
        api.getPackagingUnits({ dbPath: currentDb }).catch(() => ({ success: false, data: [] })),
      ]);
      if (res.success) { setData(res.data); setTotalValue(res.totalValue || 0); }
      else showNotification(res.error || 'Load failed', 'error');
      if (wRes.success)  setWarehouses(wRes.data);
      if (pkRes.success) setPackUnits(pkRes.data || []);
    } finally { setLoading(false); }
  }, [currentDb, asOfDate, warehouseId]);

  useEffect(() => { load(); }, [load, dbInfo?.lastRefresh]);

  // Helper: compute packaging breakdown for a given item balance
  function packBreakdown(itemId, balQty) {
    if (!balQty || balQty <= 0) return [];
    return packUnits
      .filter(p => p.ItemID === Number(itemId) && p.WeightKg > 0)
      .map(p => {
        const bags = Math.floor(balQty / p.WeightKg);
        const rem  = balQty - bags * p.WeightKg;
        return { label: p.UnitLabel, bags, rem, wt: p.WeightKg };
      });
  }

  const grouped = data.reduce((map, row) => {
    const cat = row.Category || (isUrdu ? 'غیر درجہ بند' : 'Uncategorised');
    if (!map[cat]) map[cat] = [];
    map[cat].push(row);
    return map;
  }, {});

  async function handlePrint() {
    const prefs = await api.getPrefs().catch(() => ({}));
    const genAt = new Date().toLocaleString('en-PK');
    const rows = data.map(r => {
      const packs = packBreakdown(r.ItemID, r.Quantity);
      const packStr = packs.length
        ? packs.map(p => `${p.bags} ${p.label}${p.rem > 0.01 ? ` + ${fmtQty(p.rem)} KG` : ''}`).join(', ')
        : '—';
      return `<tr><td>${r.ItemName}</td><td style="font-size:7pt;color:#64748b">${r.WarehouseName||'—'}</td><td style="text-align:right">${fmt(r.Quantity,3)} ${r.UOM}</td><td style="text-align:right">Rs.${fmt(r.AvgCost)}</td><td style="font-size:7pt">${packStr}</td><td style="text-align:right;font-weight:600">Rs.${fmt(r.TotalValue)}</td></tr>`;
    }).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{box-sizing:border-box;margin:0;padding:0}@page{margin:10mm 12mm;size:A4}body{font-family:'Segoe UI',Arial,sans-serif;font-size:8.5pt;color:#1a1a2e}table{width:100%;border-collapse:collapse}th{background:#4f46e5;color:#fff;padding:4px 7px;font-size:7.5pt;text-align:left}td{padding:3px 7px;border-bottom:1px solid #e2e8f0;font-size:8.5pt}.grand-total td{background:#4f46e5;color:#fff;font-weight:700;font-size:9pt;padding:5px 8px}h1{font-size:13pt;font-weight:700;color:#4f46e5}h2{font-size:9.5pt;font-weight:600}.hdr{display:flex;justify-content:space-between;border-bottom:2px solid #4f46e5;padding-bottom:6px;margin-bottom:10px}</style></head>
    <body><div class="hdr"><div><h1>${prefs.companyName||'Flouris ERP'}</h1><h2>${isUrdu?'اسٹاک تخمینہ':'Stock Valuation'}</h2>${asOfDate?`<p style="font-size:7.5pt;color:#64748b">${isUrdu?'بتاریخ':'As of'}: ${asOfDate}</p>`:''}</div><div style="font-size:7.5pt;color:#64748b;text-align:right">${genAt}</div></div>
    <table><thead><tr><th>${isUrdu?'آئٹم':'Item'}</th><th>${isUrdu?'گودام':'Warehouse'}</th><th style="text-align:right">${isUrdu?'مقدار':'Quantity'}</th><th style="text-align:right">${isUrdu?'اوسط لاگت':'Avg Cost'}</th><th>${isUrdu?'پیکنگ بریک ڈاؤن':'Packaging'}</th><th style="text-align:right">${isUrdu?'کل قدر':'Total Value'}</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr class="grand-total"><td colspan="5">${isUrdu?'مجموعی قدر':'Total Inventory Value'}</td><td style="text-align:right">Rs.${fmt(totalValue)}</td></tr></tfoot></table></body></html>`;
    await api.savePDF({ html, defaultFileName: 'Stock-Valuation.pdf' });
  }

  return (
    <div className="page" dir={dir}>
      <div className="page-header">
        <div><h1 className="page-title">{isUrdu?'اسٹاک تخمینہ':'Stock Valuation'}</h1><p className="page-subtitle">{isUrdu?'وزنی اوسط لاگت کے مطابق انوینٹری قدر':'Inventory value using weighted average cost method'}</p></div>
        <div className="header-actions">
          <button className="btn btn-accent" onClick={handlePrint} disabled={loading || !data.length}><Printer size={14} />{isUrdu?'PDF':'Print PDF'}</button>
          <button className="btn btn-secondary" onClick={load} disabled={loading}><RefreshCw size={14} className={loading?'spin':''} /></button>
        </div>
      </div>
      <div className="report-controls" style={{ marginBottom: 14 }}>
        <div className="date-group"><span className="date-label">{isUrdu?'بتاریخ':'As of'}</span><input type="date" className="input-field" value={asOfDate} onChange={e => setAsOfDate(e.target.value)} /></div>
        <select className="select-field" style={{ minWidth: 160 }} value={warehouseId} onChange={e => setWarehouseId(e.target.value)}>
          <option value="">{isUrdu?'— تمام گودام —':'— All Warehouses —'}</option>
          {warehouses.map(w => <option key={w.WarehouseID} value={w.WarehouseID}>{w.WarehouseName}</option>)}
        </select>
        <button className="btn btn-primary" onClick={load} disabled={loading}>{isUrdu?'لوڈ':'Load'}</button>
        <button className="btn btn-ghost" onClick={() => { setAsOfDate(''); setWarehouseId(''); }}>{isUrdu?'صاف':'Clear'}</button>
      </div>

      {!currentDb ? <div className="empty-state"><div className="empty-state-icon"><Package size={40}/></div><h3>{isUrdu?'ڈیٹا بیس منتخب نہیں':'No Database Selected'}</h3></div>
      : loading ? <div className="empty-state"><div className="loading-spinner" style={{ margin:'0 auto' }} /></div>
      : data.length === 0 ? <div className="empty-state"><div className="empty-state-icon">📦</div><h3>{isUrdu?'کوئی اسٹاک نہیں':'No stock data'}</h3><p>{isUrdu?'اسٹاک موومنٹ درج کریں':'Add stock movements to see valuation'}</p></div>
      : (
        <>
          <div className="report-summary">
            <div className="summary-pill"><div className="summary-pill-label">{isUrdu?'آئٹمز':'Items'}</div><div className="summary-pill-value">{data.length}</div></div>
            <div className="summary-pill"><div className="summary-pill-label">{isUrdu?'مجموعی قدر':'Total Value'}</div><div className="summary-pill-value pill-profit">Rs.{fmt(totalValue)}</div></div>
          </div>
          <div className="data-table-wrap" style={{ marginTop: 14 }}>
            <table className="data-table">
              <thead><tr>
                <th>{isUrdu?'آئٹم':'Item'}</th>
                <th>{isUrdu?'زمرہ':'Category'}</th>
                <th>{isUrdu?'گودام':'Warehouse'}</th>
                <th>{isUrdu?'یونٹ':'UOM'}</th>
                <th className="text-right">{isUrdu?'مقدار':'Quantity'}</th>
                <th>{isUrdu?'پیکنگ بریک ڈاؤن':'Packaging Breakdown'}</th>
                <th className="text-right">{isUrdu?'اوسط لاگت':'Avg Cost'}</th>
                <th className="text-right">{isUrdu?'کل قدر':'Total Value'}</th>
              </tr></thead>
              <tbody>
                {Object.entries(grouped).map(([cat, rows]) => (
                  <React.Fragment key={cat}>
                    <tr className="data-table"><td colSpan={8} style={{ background: '#e0e7ff', color: '#3730a3', fontWeight: 700, fontSize: 11, padding: '7px 14px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{cat}</td></tr>
                    {rows.map((r, i) => {
                      const packs = packBreakdown(r.ItemID, r.Quantity);
                      return (
                        <tr key={i}>
                          <td className="account-name">{r.ItemName}</td>
                          <td style={{ fontSize: 12 }}>{r.Category || '—'}</td>
                          <td style={{ fontSize: 12 }}>{r.WarehouseName || '—'}</td>
                          <td style={{ fontSize: 12 }}>{r.UOM}</td>
                          <td className="text-right" style={{ fontWeight: 600 }}>{fmtQty(r.Quantity)}</td>
                          <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                            {packs.length === 0
                              ? <span style={{ color: 'var(--text-muted)' }}>—</span>
                              : packs.map((p, pi) => (
                                <span key={pi} style={{ display: 'inline-block', marginInlineEnd: 8, whiteSpace: 'nowrap' }}>
                                  <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{p.bags}</span>
                                  {' '}{p.label}
                                  {p.rem > 0.01 && <span style={{ color: 'var(--text-muted)' }}> + {fmtQty(p.rem)} KG</span>}
                                </span>
                              ))
                            }
                          </td>
                          <td className="text-right" style={{ color: 'var(--text-secondary)' }}>Rs.{fmt(r.AvgCost)}</td>
                          <td className="text-right amount-credit">Rs.{fmt(r.TotalValue)}</td>
                        </tr>
                      );
                    })}
                    <tr><td colSpan={7} style={{ textAlign: isUrdu?'left':'right', fontWeight: 600, fontSize: 12, paddingInlineEnd: 14, background: '#f8fafc' }}>{isUrdu?'ذیلی کل':'Subtotal'}</td><td className="text-right" style={{ fontWeight: 700, background: '#f8fafc' }}>Rs.{fmt(rows.reduce((s,r)=>s+r.TotalValue,0))}</td></tr>
                  </React.Fragment>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={7}><strong>{isUrdu?'مجموعی انوینٹری قدر':'Total Inventory Value'}</strong></td><td className="text-right" style={{ fontWeight: 700, color: 'var(--emerald)', fontSize: 15 }}>Rs.{fmt(totalValue)}</td></tr></tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
