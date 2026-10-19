import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Printer, TrendingUp } from 'lucide-react';
import { useLang } from '../context/LanguageContext';

const api = window.electronAPI;
function fmt(n, dec=2) { if (!n && n !== 0) return '—'; return Number(n).toLocaleString('en-PK', { minimumFractionDigits: dec, maximumFractionDigits: dec }); }

export default function ProductProfitability({ currentDb, dbInfo, showNotification }) {
  const { isUrdu } = useLang();
  const dir = isUrdu ? 'rtl' : 'ltr';
  const [data, setData]         = useState([]);
  const [loading, setLoading]   = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate]   = useState('');

  const load = useCallback(async () => {
    if (!currentDb) return;
    setLoading(true);
    try {
      const res = await api.getProductProfitability({ dbPath: currentDb, startDate: startDate || undefined, endDate: endDate || undefined });
      if (res.success) setData(res.data);
      else showNotification(res.error || 'Load failed', 'error');
    } finally { setLoading(false); }
  }, [currentDb, startDate, endDate]);

  useEffect(() => { load(); }, [load, dbInfo?.lastRefresh]);

  const totalSales  = data.reduce((s, r) => s + r.TotalSales,  0);
  const totalCOGS   = data.reduce((s, r) => s + r.TotalCOGS,   0);
  const totalProfit = data.reduce((s, r) => s + r.GrossProfit, 0);

  async function handlePrint() {
    const prefs = await api.getPrefs().catch(() => ({}));
    const rows = data.map(r => `<tr><td>${r.ItemName}</td><td style="text-align:right">${fmt(r.TotalQty,3)} ${r.UOM}</td><td style="text-align:right">Rs.${fmt(r.TotalSales)}</td><td style="text-align:right">Rs.${fmt(r.TotalCOGS)}</td><td style="text-align:right;color:${r.GrossProfit>=0?'#15803d':'#dc2626'};font-weight:600">Rs.${fmt(r.GrossProfit)}</td><td style="text-align:right">${fmt(r.GrossMargin,1)}%</td></tr>`).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{box-sizing:border-box;margin:0;padding:0}@page{margin:10mm 12mm;size:A4}body{font-family:'Segoe UI',Arial,sans-serif;font-size:8.5pt;color:#1a1a2e}table{width:100%;border-collapse:collapse}th{background:#4f46e5;color:#fff;padding:4px 7px;font-size:7.5pt;text-align:left}td{padding:3px 7px;border-bottom:1px solid #e2e8f0}.grand-total td{background:#4f46e5;color:#fff;font-weight:700}h1{font-size:13pt;font-weight:700;color:#4f46e5}h2{font-size:9.5pt;font-weight:600}.hdr{display:flex;justify-content:space-between;border-bottom:2px solid #4f46e5;padding-bottom:6px;margin-bottom:10px}</style></head>
    <body><div class="hdr"><div><h1>${prefs.companyName||'Flouris ERP'}</h1><h2>${isUrdu?'پروڈکٹ منافع':'Product Profitability'}</h2></div><div style="font-size:7.5pt;color:#64748b;text-align:right">${new Date().toLocaleString('en-PK')}</div></div>
    <table><thead><tr><th>${isUrdu?'پروڈکٹ':'Product'}</th><th style="text-align:right">${isUrdu?'فروخت مقدار':'Qty Sold'}</th><th style="text-align:right">${isUrdu?'فروخت رقم':'Sales'}</th><th style="text-align:right">COGS</th><th style="text-align:right">${isUrdu?'خام نفع':'Gross Profit'}</th><th style="text-align:right">${isUrdu?'مارجن':'Margin%'}</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr class="grand-total"><td>${isUrdu?'مجموعی':'Total'}</td><td></td><td style="text-align:right">Rs.${fmt(totalSales)}</td><td style="text-align:right">Rs.${fmt(totalCOGS)}</td><td style="text-align:right">Rs.${fmt(totalProfit)}</td><td style="text-align:right">${totalSales>0?fmt(totalProfit/totalSales*100,1):0}%</td></tr></tfoot></table></body></html>`;
    await api.savePDF({ html, defaultFileName: 'Product-Profitability.pdf' });
  }

  return (
    <div className="page" dir={dir}>
      <div className="page-header">
        <div><h1 className="page-title">{isUrdu?'پروڈکٹ منافع':'Product Profitability'}</h1><p className="page-subtitle">{isUrdu?'ہر پروڈکٹ کی فروخت، COGS اور خام منافع':'Sales, COGS and gross profit per product'}</p></div>
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
      {!currentDb ? <div className="empty-state"><div className="empty-state-icon"><TrendingUp size={40}/></div><h3>{isUrdu?'ڈیٹا بیس منتخب نہیں':'No Database Selected'}</h3></div>
      : loading ? <div className="empty-state"><div className="loading-spinner" style={{ margin:'0 auto' }} /></div>
      : data.length === 0 ? <div className="empty-state"><div className="empty-state-icon">📊</div><h3>{isUrdu?'کوئی ڈیٹا نہیں':'No data'}</h3><p>{isUrdu?'پوسٹڈ فروخت انوائس درکار ہیں':'Post some sales invoices to see profitability'}</p></div>
      : (
        <>
          <div className="report-summary">
            <div className="summary-pill"><div className="summary-pill-label">{isUrdu?'کل فروخت':'Total Sales'}</div><div className="summary-pill-value pill-credit">Rs.{fmt(totalSales)}</div></div>
            <div className="summary-pill"><div className="summary-pill-label">COGS</div><div className="summary-pill-value pill-debit">Rs.{fmt(totalCOGS)}</div></div>
            <div className="summary-pill"><div className="summary-pill-label">{isUrdu?'خام منافع':'Gross Profit'}</div><div className="summary-pill-value" style={{ color: totalProfit >= 0 ? 'var(--emerald)' : 'var(--rose)' }}>Rs.{fmt(totalProfit)}</div></div>
            <div className="summary-pill"><div className="summary-pill-label">{isUrdu?'مارجن':'Gross Margin'}</div><div className="summary-pill-value" style={{ color: totalProfit >= 0 ? 'var(--emerald)' : 'var(--rose)' }}>{totalSales > 0 ? fmt(totalProfit / totalSales * 100, 1) : 0}%</div></div>
          </div>
          <div className="data-table-wrap" style={{ marginTop: 14 }}>
            <table className="data-table">
              <thead><tr>
                <th>{isUrdu?'پروڈکٹ':'Product'}</th>
                <th>{isUrdu?'یونٹ':'UOM'}</th>
                <th className="text-right">{isUrdu?'فروخت مقدار':'Qty Sold'}</th>
                <th className="text-right">{isUrdu?'اوسط فروخت قیمت':'Avg Sale'}</th>
                <th className="text-right">{isUrdu?'اوسط لاگت':'Avg Cost'}</th>
                <th className="text-right">{isUrdu?'کل فروخت':'Total Sales'}</th>
                <th className="text-right">COGS</th>
                <th className="text-right">{isUrdu?'خام نفع':'Gross Profit'}</th>
                <th className="text-right">{isUrdu?'مارجن %':'Margin%'}</th>
              </tr></thead>
              <tbody>
                {data.map((r, i) => (
                  <tr key={i}>
                    <td className="account-name">{r.ItemName}</td>
                    <td style={{ fontSize: 12 }}>{r.UOM}</td>
                    <td className="text-right">{fmt(r.TotalQty, 3)}</td>
                    <td className="text-right" style={{ fontSize: 12 }}>Rs.{fmt(r.AvgSalePerUnit)}</td>
                    <td className="text-right" style={{ fontSize: 12 }}>Rs.{fmt(r.AvgCostPerUnit)}</td>
                    <td className="text-right amount-credit">Rs.{fmt(r.TotalSales)}</td>
                    <td className="text-right amount-debit">Rs.{fmt(r.TotalCOGS)}</td>
                    <td className="text-right" style={{ fontWeight: 700, color: r.GrossProfit >= 0 ? 'var(--emerald)' : 'var(--rose)' }}>Rs.{fmt(r.GrossProfit)}</td>
                    <td className="text-right" style={{ color: r.GrossMargin >= 0 ? 'var(--emerald)' : 'var(--rose)' }}>{fmt(r.GrossMargin, 1)}%</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr>
                <td colSpan={5}><strong>{isUrdu?'مجموعی':'Total'}</strong></td>
                <td className="text-right"><strong>Rs.{fmt(totalSales)}</strong></td>
                <td className="text-right"><strong>Rs.{fmt(totalCOGS)}</strong></td>
                <td className="text-right" style={{ fontWeight: 700, color: totalProfit >= 0 ? 'var(--emerald)' : 'var(--rose)', fontSize: 14 }}>Rs.{fmt(totalProfit)}</td>
                <td className="text-right" style={{ fontWeight: 700 }}>{totalSales > 0 ? fmt(totalProfit / totalSales * 100, 1) : 0}%</td>
              </tr></tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
