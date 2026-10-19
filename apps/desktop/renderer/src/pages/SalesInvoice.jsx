/**
 * SalesInvoice — Full packaging-unit aware sales invoice.
 *
 * Quantities are ALWAYS stored internally in KG.
 * When a packaging unit is selected (e.g. "20 KG Bag"):
 *   - User enters bag count
 *   - KG = bags × weightKg  (stored in Quantity)
 *   - Price is entered per bag
 *   - Price per KG = pricePerBag / weightKg
 *   - LineTotal = bags × pricePerBag × (1 - disc%)
 *
 * When no packaging unit (bulk KG):
 *   - User enters KG directly
 *   - Price is per KG
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, X, Save, RefreshCw, Search, CheckCircle, XCircle, Printer, ShoppingCart } from 'lucide-react';
import { useLang } from '../context/LanguageContext';
import { printSalesInvoice } from '../utils/printPDF';
import { DISPLAY_UNITS, toKg } from '../utils/unitConvert';

const api = window.electronAPI;

const EMPTY_LINE = () => ({
  ItemID: '', WarehouseID: '',
  PackUnitID: '',   // selected packaging unit
  WeightKgPerUnit: 1,  // KG per bag (from PackUnit)
  BagsQty: '',         // bag count (display)
  Quantity: '',         // KG (stored)
  UOM: 'KG',
  DisplayUnit: 'KG',   // what unit the user sees
  UnitPrice: '',        // price per display unit (bag or KG)
  DiscountPct: '0',
  TaxPct: '0',
  LineTotal: 0,
  Narration: '',
});
const EMPTY_HDR = () => ({
  SIHID: null,
  InvoiceNo: '',
  InvoiceDate: new Date().toISOString().slice(0, 10),
  CustomerID: '', WarehouseID: '',
  Remarks: '', DiscountAmt: '0',
  PaymentType: 'Credit',           // Cash | Credit | Cheque | Mixed
  CashAmount: '0',
  SettlementAccountCA: '',          // cash/bank account used when PaymentType != Credit
});

function fmt(n) {
  if (!n && n !== 0) return '—';
  return Number(n).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtD(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return d; }
}

function calcLine(line) {
  const bags  = Number(line.BagsQty  || 0);
  const kgs   = Number(line.Quantity || 0);
  const price = Number(line.UnitPrice || 0);
  const disc  = Number(line.DiscountPct || 0) / 100;
  // If packaging selected: total = bags × price × (1-disc)
  // If bulk KG: total = kgs × price × (1-disc)
  const qty = line.PackUnitID ? bags : kgs;
  return qty * price * (1 - disc);
}

function getPackUnit(packUnits, packUnitId) {
  return packUnits.find(p => Number(p.PackUnitID) === Number(packUnitId)) || null;
}

export default function SalesInvoice({ currentDb, dbInfo, showNotification }) {
  const { isUrdu } = useLang();
  const dir = isUrdu ? 'rtl' : 'ltr';

  const [invoices,   setInvoices]   = useState([]);
  const [customers,  setCustomers]  = useState([]);
  const [items,      setItems]      = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [accounts,   setAccounts]   = useState([]); // for settlement account picker
  const [packUnits,  setPackUnits]  = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [posting,    setPosting]    = useState(false);
  const [showForm,   setShowForm]   = useState(false);
  const [header,     setHeader]     = useState(EMPTY_HDR());
  const [lines,      setLines]      = useState([EMPTY_LINE()]);
  const [search,     setSearch]     = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const load = useCallback(async () => {
    if (!currentDb) return;
    setLoading(true);
    try {
      const [iRes, cRes, itemRes, wRes, pkRes, acRes] = await Promise.all([
        api.getSalesInvoices({ dbPath: currentDb }),
        api.getCustomers({ dbPath: currentDb }),
        api.getMillItems(currentDb),
        api.getWarehouses(currentDb),
        api.getPackagingUnits({ dbPath: currentDb }),
        api.getChartOfAccounts(currentDb),
      ]);
      if (iRes.success)    setInvoices(iRes.data);
      if (cRes.success)    setCustomers(cRes.data);
      if (itemRes.success) setItems(itemRes.data);
      if (wRes.success)    setWarehouses(wRes.data);
      if (pkRes.success)   setPackUnits(pkRes.data || []);
      if (acRes.success)   setAccounts(acRes.data || []);
    } finally { setLoading(false); }
  }, [currentDb]);

  useEffect(() => { load(); }, [load, dbInfo?.lastRefresh]);

  // ── Line helpers ────────────────────────────────────────────────────────────
  function setLineField(i, updates) {
    setLines(prev => {
      const next = [...prev];
      next[i] = { ...next[i], ...updates };
      next[i].LineTotal = calcLine(next[i]);
      return next;
    });
  }

  function onSelectPackUnit(i, packUnitId) {
    if (!packUnitId) {
      setLineField(i, { PackUnitID: '', WeightKgPerUnit: 1, UOM: 'KG', DisplayUnit: 'KG', BagsQty: '' });
      return;
    }
    const pu = getPackUnit(packUnits, packUnitId);
    if (!pu) return;
    setLines(prev => {
      const next = [...prev];
      const bags  = Number(next[i].BagsQty || 0);
      const weightKg = Number(pu.WeightKg) || 1;
      const newKg = bags * weightKg;
      next[i] = {
        ...next[i],
        PackUnitID: packUnitId,
        WeightKgPerUnit: weightKg,
        UOM: pu.UnitLabel,
        DisplayUnit: pu.UnitLabel,
        Quantity: newKg > 0 ? String(newKg) : '',
      };
      next[i].LineTotal = calcLine(next[i]);
      return next;
    });
  }

  function onBagsChange(i, bagsVal) {
    setLines(prev => {
      const next = [...prev];
      const bags = Number(bagsVal || 0);
      const kgPerBag = Number(next[i].WeightKgPerUnit || 1);
      next[i] = {
        ...next[i],
        BagsQty: bagsVal,
        Quantity: bags > 0 ? String(bags * kgPerBag) : '',
      };
      next[i].LineTotal = calcLine(next[i]);
      return next;
    });
  }

  // ── Totals ──────────────────────────────────────────────────────────────────
  const subTotal = lines.reduce((s, l) => s + (Number(l.LineTotal) || 0), 0);
  const discAmt  = Number(header.DiscountAmt || 0);
  const netTotal = subTotal - discAmt;

  // ── Open new / edit ─────────────────────────────────────────────────────────
  async function openNew() {
    let nextNo = '';
    try { const r = await api.getNextInvoiceNo({ dbPath: currentDb, type: 'SALES' }); if (r.success) nextNo = r.nextNo; } catch(_) {}
    setHeader({ ...EMPTY_HDR(), InvoiceNo: nextNo });
    setLines([EMPTY_LINE()]);
    setShowForm(true);
  }

  async function openEdit(inv) {
    const r = await api.getSalesInvoice({ dbPath: currentDb, SIHID: inv.SIHID });
    if (!r.success) { showNotification(r.error || 'Load failed', 'error'); return; }
    const loadedLines = r.lines.length
      ? r.lines.map(l => {
          const pu = l.PackUnitID ? getPackUnit(packUnits, l.PackUnitID) : null;
          const kgPer = pu ? (Number(pu.WeightKg) || 1) : 1;
          const bags  = pu && kgPer > 0 ? Number(l.Quantity) / kgPer : 0;
          return {
            ...EMPTY_LINE(),
            ...l,
            PackUnitID:      l.PackUnitID || '',
            WeightKgPerUnit: kgPer,
            BagsQty:         pu ? String(bags) : '',
            UOM:             pu ? pu.UnitLabel : (l.UOM || 'KG'),
            DisplayUnit:     pu ? pu.UnitLabel : (l.UOM || 'KG'),
            UnitPrice:       String(l.UnitPrice || 0),
            DiscountPct:     String(l.DiscountPct ?? '0'),
            LineTotal:       l.LineTotal || 0,
          };
        })
      : [EMPTY_LINE()];
    setHeader({ ...r.header, DiscountAmt: r.header.DiscountAmt ?? '0' });
    setLines(loadedLines);
    setShowForm(true);
  }

  // ── Save ────────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!header.CustomerID) { showNotification(isUrdu ? 'کسٹمر منتخب کریں' : 'Select a customer', 'error'); return; }
    if (!header.InvoiceNo?.trim()) { showNotification(isUrdu ? 'انوائس نمبر درج کریں' : 'Invoice number required', 'error'); return; }
    const validLines = lines.filter(l => l.ItemID && Number(l.Quantity) > 0);
    if (!validLines.length) { showNotification(isUrdu ? 'کم از کم ایک آئٹم درج کریں' : 'Add at least one item line', 'error'); return; }
    setSaving(true);
    try {
      const res = await api.saveSalesInvoice({
        dbPath: currentDb,
        header: { ...header, CustomerID: Number(header.CustomerID), WarehouseID: Number(header.WarehouseID) || null, DiscountAmt: Number(header.DiscountAmt || 0) },
        lines: validLines.map(l => ({
          ItemID:     Number(l.ItemID),
          WarehouseID: Number(l.WarehouseID) || Number(header.WarehouseID) || null,
          PackUnitID:  l.PackUnitID ? Number(l.PackUnitID) : null,
          Quantity:   Number(l.Quantity),  // always KG
          UOM:        l.PackUnitID ? l.UOM : 'KG',
          UnitPrice:  Number(l.UnitPrice || 0),
          DiscountPct: Number(l.DiscountPct || 0),
          TaxPct:     Number(l.TaxPct || 0),
          LineTotal:  Number(l.LineTotal || 0),
          Narration:  l.Narration || '',
          // extra display info for printing
          BagsQty:    l.PackUnitID ? Number(l.BagsQty || 0) : null,
          WeightKgPerUnit: l.PackUnitID ? Number(l.WeightKgPerUnit || 1) : null,
        })),
      });
      if (res.success) {
        showNotification(isUrdu ? 'انوائس محفوظ ہو گئی' : 'Invoice saved', 'success');
        if (header.SIHID) {
          setShowForm(false);
        } else {
          const next = await api.getNextInvoiceNo({ dbPath: currentDb, type: 'SALES' });
          setHeader({ ...EMPTY_HDR(), InvoiceNo: next.success ? next.nextNo : '' });
          setLines([EMPTY_LINE()]);
          setShowForm(true);
        }
        load();
      }
      else showNotification(res.error || 'Save failed', 'error');
    } finally { setSaving(false); }
  }

  async function handlePost(sihid) {
    const inv = invoices.find(i => i.SIHID === sihid);
    setPosting(true);
    try {
      const res = await api.postSalesInvoice({
        dbPath: currentDb,
        SIHID: sihid,
        settlementAccountCA: inv?.SettlementAccountCA ? Number(inv.SettlementAccountCA) : undefined,
        paymentType: inv?.PaymentType || 'Credit',
      });
      if (res.success) { showNotification(isUrdu ? 'انوائس پوسٹ — اسٹاک، COGS، اکاؤنٹنگ اپ ڈیٹ' : 'Posted — stock, COGS & accounting updated', 'success'); load(); }
      else showNotification(res.error || 'Post failed', 'error');
    } finally { setPosting(false); }
  }

  async function handleCancel(sihid) {
    const res = await api.cancelSalesInvoice({ dbPath: currentDb, SIHID: sihid });
    if (res.success) { showNotification(isUrdu ? 'انوائس منسوخ' : 'Invoice cancelled', 'success'); load(); }
    else showNotification(res.error || 'Cancel failed', 'error');
  }

  async function handlePrint(inv) {
    const r = await api.getSalesInvoice({ dbPath: currentDb, SIHID: inv.SIHID });
    if (!r.success) { showNotification(r.error || 'Load failed', 'error'); return; }
    const prefs = await api.getPrefs().catch(() => ({}));
    const dbName = currentDb?.split('/').pop()?.replace(/\.sqlite$/i, '') || 'Database';
    await printSalesInvoice({
      header: r.header,
      lines: r.lines,
      customers,
      items,
      warehouses,
      packUnits,
      companyName: prefs.companyName || dbName,
      dbName,
      dbPath: currentDb,
      isUrdu,
      logoData: prefs.logoData,
    });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const filtered = invoices.filter(inv => {
    if (filterStatus && inv.Status !== filterStatus) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return inv.InvoiceNo?.toLowerCase().includes(s) || inv.CustomerName?.toLowerCase().includes(s);
  });

  const statusBadge = status => {
    const cfg = { Draft:['var(--amber)','rgba(217,119,6,0.12)'], Posted:['var(--emerald)','rgba(16,185,129,0.12)'], Cancelled:['var(--rose)','rgba(244,63,94,0.10)'] };
    const [color, bg] = cfg[status] || ['var(--text-muted)','var(--bg-card)'];
    const label = { Draft:isUrdu?'مسودہ':'Draft', Posted:isUrdu?'پوسٹڈ':'Posted', Cancelled:isUrdu?'منسوخ':'Cancelled' }[status] || status;
    return <span style={{ fontSize:11, padding:'2px 8px', borderRadius:12, background:bg, color }}>{label}</span>;
  };

  const whName = id => warehouses.find(w => w.WarehouseID === Number(id))?.WarehouseName || '—';
  const itemUnitsFor = itemId => packUnits.filter(p => Number(p.ItemID) === Number(itemId));

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="page" dir={dir}>
      <div className="page-header">
        <div>
          <h1 className="page-title">{isUrdu ? 'فروخت انوائس' : 'Sales Invoices'}</h1>
          <p className="page-subtitle">{isUrdu ? 'پیکیجنگ یونٹ — اسٹاک KG میں محفوظ' : 'Packaging units supported — stock stored in KG internally'}</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={openNew} disabled={!currentDb}><Plus size={14} />{isUrdu ? 'نئی انوائس' : 'New Invoice'}</button>
          <button className="btn btn-secondary" onClick={load} disabled={loading}><RefreshCw size={14} className={loading?'spin':''} />{isUrdu?'تازہ کریں':'Refresh'}</button>
        </div>
      </div>

      {/* Filters */}
      <div className="report-controls" style={{ marginBottom:14 }}>
        <select className="select-field" style={{ minWidth:140 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">{isUrdu?'— تمام —':'— All Status —'}</option>
          <option value="Draft">{isUrdu?'مسودہ':'Draft'}</option>
          <option value="Posted">{isUrdu?'پوسٹڈ':'Posted'}</option>
          <option value="Cancelled">{isUrdu?'منسوخ':'Cancelled'}</option>
        </select>
        <div style={{ position:'relative' }}>
          <Search size={13} style={{ position:'absolute', [isUrdu?'right':'left']:10, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)' }} />
          <input type="text" className="input-field" style={{ [isUrdu?'paddingRight':'paddingLeft']:30, width:240 }}
            placeholder={isUrdu?'انوائس / کسٹمر…':'Invoice no / customer…'} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <span style={{ fontSize:12, color:'var(--text-muted)', marginInlineStart:8 }}>{filtered.length} {isUrdu?'انوائس':'invoices'}</span>
      </div>

      {!currentDb ? (
        <div className="empty-state"><div className="empty-state-icon"><ShoppingCart size={40}/></div><h3>{isUrdu?'ڈیٹا بیس منتخب نہیں':'No Database Selected'}</h3></div>
      ) : loading ? (
        <div className="empty-state"><div className="loading-spinner" style={{ margin:'0 auto' }}/></div>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr>
              <th>{isUrdu?'انوائس نمبر':'Invoice No'}</th>
              <th>{isUrdu?'تاریخ':'Date'}</th>
              <th>{isUrdu?'کسٹمر':'Customer'}</th>
              <th>{isUrdu?'گودام':'Warehouse'}</th>
              <th className="text-right">{isUrdu?'کل':'Net Total'}</th>
              <th>{isUrdu?'حالت':'Status'}</th>
              <th style={{ width:110 }}>{isUrdu?'عمل':'Actions'}</th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign:'center', color:'var(--text-muted)', padding:40 }}>{isUrdu?'کوئی انوائس نہیں':'No invoices found'}</td></tr>
              ) : filtered.map(inv => (
                <tr key={inv.SIHID}>
                  <td style={{ fontFamily:'monospace', fontSize:12, color:'var(--accent)' }}>{inv.InvoiceNo}</td>
                  <td>{fmtD(inv.InvoiceDate)}</td>
                  <td className="account-name">{inv.CustomerName}</td>
                  <td style={{ fontSize:12 }}>{whName(inv.WarehouseID)}</td>
                  <td className="text-right cr-amount">{fmt(inv.NetTotal)}</td>
                  <td>{statusBadge(inv.Status)}</td>
                  <td>
                    <div style={{ display:'flex', gap:4 }}>
                      {inv.Status === 'Draft' && <>
                        <button className="btn-icon" onClick={() => openEdit(inv)}><Edit2 size={13}/></button>
                        <button className="btn-icon" style={{ color:'var(--emerald)' }} onClick={() => handlePost(inv.SIHID)} disabled={posting}><CheckCircle size={13}/></button>
                      </>}
                      {inv.Status === 'Posted' && <>
                        <button className="btn-icon btn-accent" onClick={() => handlePrint(inv)}><Printer size={13}/></button>
                        <button className="btn-icon btn-icon-danger" onClick={() => handleCancel(inv.SIHID)}><XCircle size={13}/></button>
                      </>}
                      {inv.Status === 'Cancelled' && <button className="btn-icon" onClick={() => handlePrint(inv)}><Printer size={13}/></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Invoice Form ──────────────────────────────────────────────────────── */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-box modal-wide" onClick={e => e.stopPropagation()} dir={dir}
            style={{ maxWidth:1200, maxHeight:'96vh', display:'flex', flexDirection:'column' }}>
            <div className="modal-header">
              <h3>{header.SIHID ? (isUrdu?`فروخت انوائس — ${header.InvoiceNo}`:`Sales Invoice — ${header.InvoiceNo}`) : (isUrdu?'نئی فروخت انوائس':'New Sales Invoice')}</h3>
              <button className="btn-icon" onClick={() => setShowForm(false)}><X size={16}/></button>
            </div>

            {/* Header */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, padding:'14px 20px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
              <div className="field-group"><label>{isUrdu?'انوائس نمبر *':'Invoice No *'}</label><input type="text" className="input-field" value={header.InvoiceNo} onChange={e => setHeader(h => ({ ...h, InvoiceNo: e.target.value }))}/></div>
              <div className="field-group"><label>{isUrdu?'تاریخ *':'Date *'}</label><input type="date" className="input-field" value={header.InvoiceDate} onChange={e => setHeader(h => ({ ...h, InvoiceDate: e.target.value }))}/></div>
              <div className="field-group">
                <label>{isUrdu?'کسٹمر *':'Customer *'}</label>
                <select className="select-field" value={header.CustomerID} onChange={e => setHeader(h => ({ ...h, CustomerID: e.target.value }))}>
                  <option value="">{isUrdu?'— منتخب کریں —':'— Select —'}</option>
                  {customers.map(c => <option key={c.CustomerID} value={c.CustomerID}>{c.CustomerName}</option>)}
                </select>
              </div>
              <div className="field-group">
                <label>{isUrdu?'گودام':'Warehouse'}</label>
                <select className="select-field" value={header.WarehouseID||''} onChange={e => setHeader(h => ({ ...h, WarehouseID: e.target.value }))}>
                  <option value="">{isUrdu?'— اختیاری —':'— Optional —'}</option>
                  {warehouses.map(w => <option key={w.WarehouseID} value={w.WarehouseID}>{w.WarehouseName}</option>)}
                </select>
              </div>
              <div className="field-group"><label>{isUrdu?'رعایت (Rs.)':'Discount (Rs.)'}</label><input type="number" min="0" step="0.01" className="input-field" value={header.DiscountAmt||''} placeholder="0" onChange={e => setHeader(h => ({ ...h, DiscountAmt: e.target.value }))}/></div>
              <div className="field-group"><label>{isUrdu?'ریمارکس':'Remarks'}</label><input type="text" className="input-field" value={header.Remarks||''} onChange={e => setHeader(h => ({ ...h, Remarks: e.target.value }))}/></div>
            </div>

            {/* Payment Type + Settlement Account */}
            <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', background: 'rgba(59,130,246,0.04)' }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', marginBottom: 6, textTransform: 'uppercase' }}>
                    {isUrdu ? '💳 ادائیگی کا طریقہ' : '💳 Payment Type'}
                  </div>
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                    {['Cash','Credit','Cheque','Mixed'].map(pt => (
                      <label key={pt} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 13 }}>
                        <input type="radio" name="salesPaymentType" value={pt}
                          checked={header.PaymentType === pt}
                          onChange={() => setHeader(h => ({ ...h, PaymentType: pt }))} />
                        <strong>{isUrdu ? { Cash: 'نقد', Credit: 'ادھار', Cheque: 'چیک', Mixed: 'مخلوط' }[pt] : pt}</strong>
                      </label>
                    ))}
                  </div>
                </div>
                {(header.PaymentType === 'Cash' || header.PaymentType === 'Mixed') && (
                  <div className="field-group" style={{ margin: 0, minWidth: 160 }}>
                    <label style={{ fontSize: 11 }}>{isUrdu ? 'نقد موصولہ رقم' : 'Cash Received'}</label>
                    <input type="number" min="0" step="0.01" className="input-field"
                      value={header.CashAmount || ''} placeholder="0.00"
                      onChange={e => setHeader(h => ({ ...h, CashAmount: e.target.value }))} />
                  </div>
                )}
                {header.PaymentType !== 'Credit' && (
                  <div className="field-group" style={{ margin: 0, minWidth: 280 }}>
                    <label style={{ fontSize: 11, fontWeight: 700 }}>
                      {isUrdu ? '🏦 نقد/بینک اکاؤنٹ' : '🏦 Cash / Bank Account'}
                    </label>
                    <select className="select-field" value={header.SettlementAccountCA || ''}
                      onChange={e => setHeader(h => ({ ...h, SettlementAccountCA: e.target.value }))}>
                      <option value="">{isUrdu ? '— اکاؤنٹ منتخب کریں —' : '— Select account —'}</option>
                      {accounts.map(a => <option key={a.CA} value={a.CA}>{a.CA} — {a.AC_TITLE1}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Lines */}
            <div className="lines-section" style={{ flex:1, minHeight:0, display:'flex', flexDirection:'column' }}>
              <div className="lines-section-header" style={{ flexShrink:0 }}>
                <span className="lines-section-title">{isUrdu?'آئٹم لائنیں':'Item Lines'}</span>
                <span style={{ fontSize:11, color:'var(--text-muted)', marginInlineStart:8 }}>
                  {isUrdu ? '(مقدار ہمیشہ KG میں محفوظ — پیکیجنگ سے خودکار)' : '(quantity stored as KG — auto from packaging)'}
                </span>
                <button className="btn btn-ghost" style={{ fontSize:12, padding:'4px 10px', marginInlineStart:'auto' }}
                  onClick={() => setLines(l => [...l, EMPTY_LINE()])}><Plus size={12}/>{isUrdu?'لائن':'Add Line'}</button>
              </div>

              <div style={{ overflowX:'auto', overflowY:'auto', flex:1, border:'1px solid var(--border)', borderRadius:8 }}>
                <table className="data-table" style={{ minWidth:1020, tableLayout:'fixed', borderRadius:0 }}>
                  <thead><tr>
                    <th style={{ width:170 }}>{isUrdu?'آئٹم':'Item'}</th>
                    <th style={{ width:170 }}>{isUrdu?'پیکیجنگ یونٹ':'Packaging Unit'}</th>
                    <th style={{ width:90 }}>{isUrdu?'تھیلے / بوری':'Bags / Units'}</th>
                    <th style={{ width:110 }}>
                      <span style={{ color:'var(--emerald)', fontSize:11 }}>{isUrdu?'KG (خودکار)':'KG (Auto)'}</span>
                    </th>
                    <th style={{ width:130 }}>{isUrdu?'گودام':'Warehouse'}</th>
                    <th style={{ width:110 }}>{isUrdu?'قیمت/یونٹ':'Price/Unit'}</th>
                    <th style={{ width:70 }}>{isUrdu?'رعایت%':'Disc%'}</th>
                    <th style={{ width:110 }}>{isUrdu?'کل':'Total'}</th>
                    <th style={{ width:30 }}></th>
                  </tr></thead>
                  <tbody>
                    {lines.map((line, i) => {
                      const itemPackUnits = itemUnitsFor(line.ItemID);
                      const hasPack = !!line.PackUnitID;
                      return (
                        <tr key={i}>
                          {/* Item */}
                          <td style={{ padding:'5px 7px' }}>
                            <select className="select-field" style={{ width:'100%', fontSize:12 }}
                              value={line.ItemID||''} onChange={e => setLineField(i, { ItemID: e.target.value, PackUnitID:'', WeightKgPerUnit:1, UOM:'KG', DisplayUnit:'KG', BagsQty:'' })}>
                              <option value="">{isUrdu?'— آئٹم —':'— Item —'}</option>
                              {items.map(it => <option key={it.ItemID} value={it.ItemID}>{it.ItemName}</option>)}
                            </select>
                          </td>

                          {/* Packaging Unit */}
                          <td style={{ padding:'5px 7px' }}>
                            {itemPackUnits.length > 0 ? (
                              <select className="select-field" style={{ width:'100%', fontSize:12 }}
                                value={line.PackUnitID||''} onChange={e => onSelectPackUnit(i, e.target.value)}>
                                <option value="">{isUrdu?'— بلک KG —':'— Bulk KG —'}</option>
                                {itemPackUnits.map(p => (
                                  <option key={p.PackUnitID} value={p.PackUnitID}>
                                    {p.UnitLabel} ({p.WeightKg} KG)
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span style={{ fontSize:11, color:'var(--text-muted)', display:'block', padding:'4px 2px' }}>
                                {isUrdu ? 'کوئی پیکیجنگ نہیں' : 'No packaging — bulk KG'}
                              </span>
                            )}
                          </td>

                          {/* Bags qty (shown when packaging selected) */}
                          <td style={{ padding:'5px 7px' }}>
                            {hasPack ? (
                              <input type="number" min="0" step="1"
                                className="input-field"
                                style={{ width:'100%', textAlign:'right', fontWeight:700 }}
                                value={line.BagsQty||''} placeholder="0"
                                onChange={e => onBagsChange(i, e.target.value)} />
                            ) : (
                              <span style={{ fontSize:11, color:'var(--text-muted)', textAlign:'center', display:'block' }}>—</span>
                            )}
                          </td>

                          {/* KG (auto or direct entry) */}
                          <td style={{ padding:'5px 7px', background: hasPack ? 'rgba(22,163,74,0.05)' : 'transparent' }}>
                            {hasPack ? (
                              <span style={{ display:'block', textAlign:'right', fontSize:13, fontWeight:700, color:'var(--emerald)', padding:'6px 4px' }}>
                                {Number(line.Quantity||0).toFixed(3)}
                              </span>
                            ) : (
                              <input type="number" min="0" step="0.001"
                                className="input-field"
                                style={{ width:'100%', textAlign:'right', fontWeight:700 }}
                                value={line.Quantity||''} placeholder="0.000"
                                onChange={e => setLineField(i, { Quantity: e.target.value })} />
                            )}
                          </td>

                          {/* Warehouse */}
                          <td style={{ padding:'5px 7px' }}>
                            <select className="select-field" style={{ width:'100%', fontSize:11 }}
                              value={line.WarehouseID||header.WarehouseID||''} onChange={e => setLineField(i, { WarehouseID: e.target.value })}>
                              <option value="">{isUrdu?'— گودام —':'— WH —'}</option>
                              {warehouses.map(w => <option key={w.WarehouseID} value={w.WarehouseID}>{w.WarehouseName}</option>)}
                            </select>
                          </td>

                          {/* Price per bag or per KG */}
                          <td style={{ padding:'5px 7px' }}>
                            <input type="number" min="0" step="0.01"
                              className="input-field"
                              style={{ width:'100%', textAlign:'right' }}
                              value={line.UnitPrice||''} placeholder="0.00"
                              onChange={e => setLineField(i, { UnitPrice: e.target.value })} />
                            {hasPack && Number(line.UnitPrice) > 0 && Number(line.WeightKgPerUnit) > 0 && (
                              <div style={{ fontSize:10, color:'var(--text-muted)', textAlign:'right', marginTop:2 }}>
                                = Rs.{(Number(line.UnitPrice)/Number(line.WeightKgPerUnit)).toFixed(2)}/KG
                              </div>
                            )}
                          </td>

                          {/* Discount */}
                          <td style={{ padding:'5px 7px' }}>
                            <input type="number" min="0" max="100" step="0.1"
                              className="input-field"
                              style={{ width:'100%', textAlign:'right' }}
                              value={line.DiscountPct||'0'}
                              onChange={e => setLineField(i, { DiscountPct: e.target.value })} />
                          </td>

                          {/* Line Total */}
                          <td style={{ padding:'5px 7px', textAlign:'right', fontWeight:700, color:'var(--emerald)' }}>
                            Rs.{fmt(line.LineTotal)}
                          </td>

                          <td style={{ padding:'5px 3px' }}>
                            {lines.length > 1 && (
                              <button className="btn-icon btn-icon-danger"
                                onClick={() => setLines(l => l.filter((_,idx) => idx !== i))}>
                                <X size={12}/>
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={7} style={{ padding:'10px 14px', fontWeight:700 }}>
                        {isUrdu ? 'مجموعہ' : 'Totals'}
                      </td>
                      <td style={{ textAlign:'right', padding:'10px 14px' }}>
                        <div style={{ fontSize:11, color:'var(--text-muted)' }}>Sub: Rs.{fmt(subTotal)}</div>
                        <div style={{ fontSize:11, color:'var(--rose)' }}>Disc: (Rs.{fmt(discAmt)})</div>
                        <div style={{ fontSize:16, fontWeight:800, color:'var(--emerald)' }}>Rs.{fmt(netTotal)}</div>
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="modal-footer" style={{ flexShrink:0 }}>
              <button className="btn btn-ghost" onClick={() => setShowForm(false)} disabled={saving}>{isUrdu?'منسوخ':'Cancel'}</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}><Save size={13}/>{saving?'…':(isUrdu?'محفوظ کریں':'Save Draft')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
