import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Edit2, X, Save, RefreshCw, Search, CheckCircle, XCircle, Printer, Package } from 'lucide-react';
import { useLang } from '../context/LanguageContext';
import { printPurchaseInvoice } from '../utils/printPDF';
import { toKg, DISPLAY_UNITS } from '../utils/unitConvert';

const api = window.electronAPI;

const EMPTY_LINE = () => ({ ItemID: '', WarehouseID: '', Quantity: '', UOM: 'KG', WeightKgPerUnit: 1, PackUnitID: '', BagsQty: '', DisplayUnit: 'KG', UnitCost: '', DiscountPct: '0', TaxPct: '0', LineTotal: 0, Narration: '' });
const EMPTY_HDR  = () => ({
  PIHID: null, InvoiceNo: '', InvoiceDate: new Date().toISOString().slice(0,10),
  SupplierID: '', WarehouseID: '', Remarks: '', DiscountAmt: '0',
  // Flour-mill fields
  GrossWeight: '', TareWeight: '', NetWeight: '',
  VehicleNo: '', DriverName: '', TransporterName: '', UnloadingLocation: '',
  PaymentType: 'Credit', CashAmount: '0', ChequeAmount: '0', CreditAmount: '0',
  ChequeNo: '', ChequeDate: '', BankName: '', SupplierRef: '',
  SettlementAccountCA: '',   // cash/bank account used when PaymentType != Credit
});

function fmt(n) { if (!n && n !== 0) return '—'; return Number(n).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtD(d) { if (!d) return '—'; try { return new Date(d).toLocaleDateString('en-PK', { day:'2-digit', month:'short', year:'numeric' }); } catch { return d; } }

function calcLineTotal(line) {
  const qty  = Number(line.Quantity  || 0);
  const cost = Number(line.UnitCost  || 0);
  const disc = Number(line.DiscountPct || 0);
  return qty * cost * (1 - disc / 100);
}

function getPackUnitMeta(line, packUnits) {
  if (!line.PackUnitID) return null;
  return packUnits.find(p => Number(p.PackUnitID) === Number(line.PackUnitID)) || null;
}

function getLineFactor(line, packUnits) {
  const pack = getPackUnitMeta(line, packUnits);
  if (pack && Number(pack.WeightKg || 0) > 0) return Number(pack.WeightKg || 1);

  const uom = (line.UOM || 'KG').toUpperCase();
  if (uom === 'MAUND' || uom === 'MAAN') return 40;
  if (uom === 'TON') return 1000;
  return 1;
}

function getDisplayQty(line, packUnits) {
  const factor = getLineFactor(line, packUnits);
  return factor > 1 ? Number(line.Quantity || 0) / factor : Number(line.Quantity || 0);
}

export default function PurchaseInvoice({ currentDb, dbInfo, showNotification }) {
  const { isUrdu } = useLang();
  const dir = isUrdu ? 'rtl' : 'ltr';

  const [invoices, setInvoices]     = useState([]);
  const [suppliers, setSuppliers]   = useState([]);
  const [items, setItems]           = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [accounts, setAccounts]     = useState([]); // for settlement account picker
  const [packUnits, setPackUnits]   = useState([]);  // all packaging units
  const [loading, setLoading]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [posting, setPosting]       = useState(false);
  const [showForm, setShowForm]     = useState(false);
  const [header, setHeader]         = useState(EMPTY_HDR());
  const [lines, setLines]           = useState([EMPTY_LINE()]);
  const [search, setSearch]         = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const load = useCallback(async () => {
    if (!currentDb) return;
    setLoading(true);
    try {
      const [iRes, sRes, itemRes, wRes, pkRes, acRes] = await Promise.all([
        api.getPurchaseInvoices({ dbPath: currentDb }),
        api.getSuppliers({ dbPath: currentDb }),
        api.getMillItems(currentDb),
        api.getWarehouses(currentDb),
        api.getPackagingUnits({ dbPath: currentDb }),
        api.getChartOfAccounts(currentDb),
      ]);
      if (iRes.success)    setInvoices(iRes.data);
      if (sRes.success)    setSuppliers(sRes.data);
      if (itemRes.success) setItems(itemRes.data);
      if (wRes.success)    setWarehouses(wRes.data);
      if (pkRes.success)   setPackUnits(pkRes.data || []);
      if (acRes.success)   setAccounts(acRes.data || []);
    } finally { setLoading(false); }
  }, [currentDb]);

  useEffect(() => { load(); }, [load, dbInfo?.lastRefresh]);

  // Recalc line totals whenever qty/cost/disc changes
  function setLine(i, field, value) {
    setLines(prev => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      next[i].LineTotal = calcLineTotal(next[i]);
      return next;
    });
  }

  const subTotal  = lines.reduce((s, l) => s + (Number(l.LineTotal) || 0), 0);
  const discAmt   = Number(header.DiscountAmt || 0);
  const netTotal  = subTotal - discAmt;

  // Auto-calculate net weight
  const grossWt = Number(header.GrossWeight || 0);
  const tareWt  = Number(header.TareWeight  || 0);
  const netWt   = grossWt > 0 ? Math.max(0, grossWt - tareWt) : 0;

  function updateLineUnit(i, nextUOM) {
    setLines(prev => {
      const next = [...prev];
      const itemPacks = packUnits.filter(p => Number(p.ItemID) === Number(next[i].ItemID));
      const selectedPack = itemPacks.find(p => p.UnitLabel === nextUOM) || null;
      next[i] = {
        ...next[i],
        UOM: nextUOM,
        DisplayUnit: nextUOM,
        PackUnitID: selectedPack ? selectedPack.PackUnitID : '',
        WeightKgPerUnit: selectedPack ? Number(selectedPack.WeightKg || 1) : 1,
      };
      next[i].LineTotal = calcLineTotal(next[i]);
      return next;
    });
  }

  async function openNew() {
    let nextNo = '';
    if (api.getNextInvoiceNo) {
      const r = await api.getNextInvoiceNo({ dbPath: currentDb, type: 'PURCHASE' });
      if (r.success) nextNo = r.nextNo;
    }
    setHeader({ ...EMPTY_HDR(), InvoiceNo: nextNo });
    setLines([EMPTY_LINE()]);
    setShowForm(true);
  }

  async function openEdit(inv) {
    const r = await api.getPurchaseInvoice({ dbPath: currentDb, PIHID: inv.PIHID });
    if (!r.success) { showNotification(r.error || 'Load failed', 'error'); return; }
    setHeader({ ...r.header, DiscountAmt: r.header.DiscountAmt ?? '0' });
    setLines(r.lines.length ? r.lines.map(l => {
      const pack = getPackUnitMeta(l, packUnits);
      const factor = getLineFactor({ ...l, PackUnitID: l.PackUnitID || '' }, packUnits);
      const displayQty = getDisplayQty({ ...l, PackUnitID: l.PackUnitID || '' }, packUnits);
      const displayCost = pack ? (Number(l.UnitCost || 0) * factor) : Number(l.UnitCost || 0);
      return {
        ...EMPTY_LINE(),
        ...l,
        PackUnitID: l.PackUnitID || '',
        WeightKgPerUnit: pack ? Number(pack.WeightKg || 1) : 1,
        UOM: pack ? pack.UnitLabel : (l.UOM || 'KG'),
        DisplayUnit: pack ? pack.UnitLabel : (l.UOM || 'KG'),
        Quantity: String(displayQty),
        UnitCost: String(displayCost),
        DiscountPct: l.DiscountPct ?? '0',
        TaxPct: l.TaxPct ?? '0',
        LineTotal: l.LineTotal || 0,
      };
    }) : [EMPTY_LINE()]);
    setShowForm(true);
  }

  async function handleSave() {
    if (!header.SupplierID) { showNotification(isUrdu ? 'سپلائر منتخب کریں' : 'Select a supplier', 'error'); return; }
    if (!header.InvoiceNo?.trim()) { showNotification(isUrdu ? 'انوائس نمبر درج کریں' : 'Invoice number required', 'error'); return; }
    const validLines = lines.filter(l => l.ItemID && Number(l.Quantity) > 0);
    if (!validLines.length) { showNotification(isUrdu ? 'کم از کم ایک آئٹم درج کریں' : 'Add at least one item line', 'error'); return; }
    setSaving(true);
    try {
      const res = await api.savePurchaseInvoice({ dbPath: currentDb, header: { ...header, SupplierID: Number(header.SupplierID), WarehouseID: Number(header.WarehouseID) || null, DiscountAmt: Number(header.DiscountAmt || 0) }, lines: validLines.map(l => {
          const factor = getLineFactor(l, packUnits);
          const kgQty = Number(l.Quantity || 0) * factor;
          const pricePerKg = factor > 1 ? Number(l.UnitCost || 0) / factor : Number(l.UnitCost || 0);
          return {
            ...l,
            ItemID: Number(l.ItemID),
            WarehouseID: Number(l.WarehouseID) || Number(header.WarehouseID) || null,
            PackUnitID: l.PackUnitID ? Number(l.PackUnitID) : null,
            Quantity: kgQty,
            UOM: 'KG',
            UnitCost: pricePerKg,
            DiscountPct: Number(l.DiscountPct || 0),
            TaxPct: Number(l.TaxPct || 0),
            LineTotal: Number(l.LineTotal || 0),
          };
        }) });
      if (res.success) {
        showNotification(isUrdu ? 'انوائس محفوظ ہو گئی' : 'Invoice saved', 'success');
        if (header.PIHID) {
          setShowForm(false);
        } else {
          const next = await api.getNextInvoiceNo({ dbPath: currentDb, type: 'PURCHASE' });
          setHeader({ ...EMPTY_HDR(), InvoiceNo: next.success ? next.nextNo : '' });
          setLines([EMPTY_LINE()]);
          setShowForm(true);
        }
        load();
      }
      else showNotification(res.error || 'Save failed', 'error');
    } finally { setSaving(false); }
  }

  async function handlePost(pihid) {
    // Get the header for this invoice to check PaymentType and SettlementAccountCA
    const inv = invoices.find(i => i.PIHID === pihid);
    setPosting(true);
    try {
      const res = await api.postPurchaseInvoice({
        dbPath: currentDb,
        PIHID: pihid,
        settlementAccountCA: inv?.SettlementAccountCA ? Number(inv.SettlementAccountCA) : undefined,
        paymentType: inv?.PaymentType || 'Credit',
      });
      if (res.success) { showNotification(isUrdu ? 'انوائس پوسٹ ہو گئی — اسٹاک اور اکاؤنٹنگ اپ ڈیٹ ہو گئے' : 'Invoice posted — stock & accounting updated', 'success'); load(); }
      else showNotification(res.error || 'Post failed', 'error');
    } finally { setPosting(false); }
  }

  async function handleCancel(pihid) {
    const res = await api.cancelPurchaseInvoice({ dbPath: currentDb, PIHID: pihid });
    if (res.success) { showNotification(isUrdu ? 'انوائس منسوخ ہو گئی' : 'Invoice cancelled', 'success'); load(); }
    else showNotification(res.error || 'Cancel failed', 'error');
  }

  async function handlePrint(inv) {
    const r = await api.getPurchaseInvoice({ dbPath: currentDb, PIHID: inv.PIHID });
    if (!r.success) { showNotification(r.error || 'Load failed', 'error'); return; }
    const prefs = await api.getPrefs().catch(() => ({}));
    const dbName = currentDb?.split('/').pop()?.replace(/\.sqlite$/i, '') || 'Database';
    await printPurchaseInvoice({
      header: r.header,
      lines: r.lines,
      suppliers,
      items,
      warehouses,
      companyName: prefs.companyName || dbName,
      dbName,
      dbPath: currentDb,
      isUrdu,
      logoData: prefs.logoData,
    });
  }

  const filtered = invoices.filter(inv => {
    if (filterStatus && inv.Status !== filterStatus) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return inv.InvoiceNo?.toLowerCase().includes(s) || inv.SupplierName?.toLowerCase().includes(s);
  });

  const statusBadge = status => {
    const cfg = { Draft: ['var(--amber)', 'rgba(217,119,6,0.12)'], Posted: ['var(--emerald)', 'rgba(16,185,129,0.12)'], Cancelled: ['var(--rose)', 'rgba(244,63,94,0.10)'] };
    const [color, bg] = cfg[status] || ['var(--text-muted)', 'var(--bg-card)'];
    const label = { Draft: isUrdu ? 'مسودہ' : 'Draft', Posted: isUrdu ? 'پوسٹڈ' : 'Posted', Cancelled: isUrdu ? 'منسوخ' : 'Cancelled' }[status] || status;
    return <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: bg, color }}>{label}</span>;
  };

  const supplierName = id => suppliers.find(s => s.SupplierID === Number(id))?.SupplierName || `S#${id}`;
  const itemName     = id => items.find(i => i.ItemID === Number(id))?.ItemName || `Item#${id}`;
  const whName       = id => warehouses.find(w => w.WarehouseID === Number(id))?.WarehouseName || '—';

  return (
    <div className="page" dir={dir}>
      <div className="page-header">
        <div><h1 className="page-title">{isUrdu ? 'خرید انوائس' : 'Purchase Invoices'}</h1><p className="page-subtitle">{isUrdu ? 'خرید ریکارڈ، اسٹاک اور اکاؤنٹنگ خودکار پوسٹنگ' : 'Purchase records with automatic stock & accounting posting'}</p></div>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={openNew} disabled={!currentDb}><Plus size={14} />{isUrdu ? 'نئی انوائس' : 'New Invoice'}</button>
          <button className="btn btn-secondary" onClick={load} disabled={loading}><RefreshCw size={14} className={loading ? 'spin' : ''} />{isUrdu ? 'تازہ کریں' : 'Refresh'}</button>
        </div>
      </div>

      <div className="report-controls" style={{ marginBottom: 14 }}>
        <select className="select-field" style={{ minWidth: 140 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">{isUrdu ? '— تمام —' : '— All Status —'}</option>
          <option value="Draft">{isUrdu ? 'مسودہ' : 'Draft'}</option>
          <option value="Posted">{isUrdu ? 'پوسٹڈ' : 'Posted'}</option>
          <option value="Cancelled">{isUrdu ? 'منسوخ' : 'Cancelled'}</option>
        </select>
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', [isUrdu?'right':'left']: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input type="text" className="input-field" style={{ [isUrdu?'paddingRight':'paddingLeft']: 30, width: 240 }} placeholder={isUrdu ? 'انوائس نمبر / سپلائر…' : 'Invoice no / supplier…'} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginInlineStart: 8 }}>{filtered.length} {isUrdu ? 'انوائس' : 'invoices'}</span>
      </div>

      {!currentDb ? (
        <div className="empty-state"><div className="empty-state-icon"><Package size={40} /></div><h3>{isUrdu ? 'ڈیٹا بیس منتخب نہیں' : 'No Database Selected'}</h3></div>
      ) : loading ? (
        <div className="empty-state"><div className="loading-spinner" style={{ margin: '0 auto' }} /></div>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr>
              <th>{isUrdu ? 'انوائس نمبر' : 'Invoice No'}</th>
              <th>{isUrdu ? 'تاریخ' : 'Date'}</th>
              <th>{isUrdu ? 'سپلائر' : 'Supplier'}</th>
              <th>{isUrdu ? 'گودام' : 'Warehouse'}</th>
              <th className="text-right">{isUrdu ? 'ذیلی کل' : 'Sub Total'}</th>
              <th className="text-right">{isUrdu ? 'خالص کل' : 'Net Total'}</th>
              <th>{isUrdu ? 'حالت' : 'Status'}</th>
              <th style={{ width: 120 }}>{isUrdu ? 'عمل' : 'Actions'}</th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>{isUrdu ? 'کوئی انوائس نہیں ملی' : 'No invoices found'}</td></tr>
              ) : filtered.map(inv => (
                <tr key={inv.PIHID}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--accent)' }}>{inv.InvoiceNo}</td>
                  <td>{fmtD(inv.InvoiceDate)}</td>
                  <td className="account-name">{inv.SupplierName || supplierName(inv.SupplierID)}</td>
                  <td style={{ fontSize: 12 }}>{whName(inv.WarehouseID)}</td>
                  <td className="text-right">{fmt(inv.SubTotal)}</td>
                  <td className="text-right amount-debit">{fmt(inv.NetTotal)}</td>
                  <td>{statusBadge(inv.Status)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {inv.Status === 'Draft' && <><button className="btn-icon" title={isUrdu ? 'ترمیم' : 'Edit'} onClick={() => openEdit(inv)}><Edit2 size={13} /></button><button className="btn-icon" title={isUrdu ? 'پوسٹ کریں' : 'Post'} style={{ color: 'var(--emerald)' }} onClick={() => handlePost(inv.PIHID)} disabled={posting}><CheckCircle size={13} /></button></>}
                      {inv.Status === 'Posted' && <><button className="btn-icon btn-accent" title={isUrdu ? 'پرنٹ' : 'Print'} onClick={() => handlePrint(inv)}><Printer size={13} /></button><button className="btn-icon btn-icon-danger" title={isUrdu ? 'منسوخ' : 'Cancel'} onClick={() => handleCancel(inv.PIHID)}><XCircle size={13} /></button></>}
                      {inv.Status === 'Cancelled' && <button className="btn-icon" title={isUrdu ? 'پرنٹ' : 'Print'} onClick={() => handlePrint(inv)}><Printer size={13} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Invoice Form */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-box modal-wide" onClick={e => e.stopPropagation()} dir={dir} style={{ maxWidth: 1200, maxHeight: '96vh' }}>
            <div className="modal-header">
              <h3>{header.PIHID ? (isUrdu ? `خرید انوائس ترمیم — ${header.InvoiceNo}` : `Edit Purchase Invoice — ${header.InvoiceNo}`) : (isUrdu ? 'نئی خرید انوائس' : 'New Purchase Invoice')}</h3>
              <button className="btn-icon" onClick={() => setShowForm(false)}><X size={16} /></button>
            </div>

            {/* Header fields - Flour Mill Enhanced */}
            <div style={{ overflowY: 'auto', maxHeight: 420, padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              {/* Basic Info Row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 12 }}>
                <div className="field-group">
                  <label>{isUrdu ? 'انوائس نمبر *' : 'Invoice No *'}</label>
                  <input type="text" className="input-field" value={header.InvoiceNo} onChange={e => setHeader(h => ({ ...h, InvoiceNo: e.target.value }))} />
                </div>
                <div className="field-group">
                  <label>{isUrdu ? 'تاریخ *' : 'Date *'}</label>
                  <input type="date" className="input-field" value={header.InvoiceDate} onChange={e => setHeader(h => ({ ...h, InvoiceDate: e.target.value }))} />
                </div>
                <div className="field-group">
                  <label>{isUrdu ? 'سپلائر *' : 'Supplier *'}</label>
                  <select className="select-field" value={header.SupplierID} onChange={e => setHeader(h => ({ ...h, SupplierID: e.target.value }))}>
                    <option value="">{isUrdu ? '— منتخب کریں —' : '— Select —'}</option>
                    {suppliers.map(s => <option key={s.SupplierID} value={s.SupplierID}>{s.SupplierName}{s.IsOneTime ? ' ★' : ''}</option>)}
                  </select>
                </div>
                <div className="field-group">
                  <label>{isUrdu ? 'گودام' : 'Default Warehouse'}</label>
                  <select className="select-field" value={header.WarehouseID || ''} onChange={e => setHeader(h => ({ ...h, WarehouseID: e.target.value }))}>
                    <option value="">{isUrdu ? '— اختیاری —' : '— Optional —'}</option>
                    {warehouses.map(w => <option key={w.WarehouseID} value={w.WarehouseID}>{w.WarehouseName}</option>)}
                  </select>
                </div>
                <div className="field-group">
                  <label>{isUrdu ? 'رعایت (روپے)' : 'Discount (Rs.)'}</label>
                  <input type="number" min="0" step="0.01" className="input-field" value={header.DiscountAmt || ''} placeholder="0" onChange={e => setHeader(h => ({ ...h, DiscountAmt: e.target.value }))} />
                </div>
                <div className="field-group">
                  <label>{isUrdu ? 'ریمارکس' : 'Remarks'}</label>
                  <input type="text" className="input-field" value={header.Remarks || ''} onChange={e => setHeader(h => ({ ...h, Remarks: e.target.value }))} />
                </div>
              </div>

              {/* Weight Section */}
              <div style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--emerald)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {isUrdu ? '⚖️ وزن (کلوگرام)' : '⚖️ Weight (KG)'}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
                  <div className="field-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: 11 }}>{isUrdu ? 'مجموعی وزن' : 'Gross Weight'}</label>
                    <input type="number" min="0" step="0.001" className="input-field" value={header.GrossWeight || ''} placeholder="0.000"
                      onChange={e => setHeader(h => ({ ...h, GrossWeight: e.target.value }))} />
                  </div>
                  <div className="field-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: 11 }}>{isUrdu ? 'ٹیر وزن' : 'Tare Weight'}</label>
                    <input type="number" min="0" step="0.001" className="input-field" value={header.TareWeight || ''} placeholder="0.000"
                      onChange={e => setHeader(h => ({ ...h, TareWeight: e.target.value }))} />
                  </div>
                  <div className="field-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: 11 }}>{isUrdu ? 'خالص وزن (خودکار)' : 'Net Weight (Auto)'}</label>
                    <input type="text" className="input-field" value={netWt > 0 ? netWt.toFixed(3) : ''} readOnly
                      style={{ background: 'rgba(16,185,129,0.08)', color: 'var(--emerald)', fontWeight: 700 }} />
                  </div>
                  <div className="field-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: 11 }}>{isUrdu ? 'تخلیہ مقام' : 'Unloading Location'}</label>
                    <input type="text" className="input-field" value={header.UnloadingLocation || ''} placeholder={isUrdu ? 'اختیاری' : 'Optional'}
                      onChange={e => setHeader(h => ({ ...h, UnloadingLocation: e.target.value }))} />
                  </div>
                </div>
              </div>

              {/* Vehicle / Transport */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 12 }}>
                <div className="field-group">
                  <label>{isUrdu ? 'گاڑی نمبر' : 'Vehicle No'}</label>
                  <input type="text" className="input-field" value={header.VehicleNo || ''} placeholder="ABC-123"
                    onChange={e => setHeader(h => ({ ...h, VehicleNo: e.target.value }))} />
                </div>
                <div className="field-group">
                  <label>{isUrdu ? 'ڈرائیور' : 'Driver'}</label>
                  <input type="text" className="input-field" value={header.DriverName || ''} placeholder={isUrdu ? 'اختیاری' : 'Optional'}
                    onChange={e => setHeader(h => ({ ...h, DriverName: e.target.value }))} />
                </div>
                <div className="field-group">
                  <label>{isUrdu ? 'ٹرانسپورٹر' : 'Transporter'}</label>
                  <input type="text" className="input-field" value={header.TransporterName || ''} placeholder={isUrdu ? 'اختیاری' : 'Optional'}
                    onChange={e => setHeader(h => ({ ...h, TransporterName: e.target.value }))} />
                </div>
              </div>

              {/* Payment Type */}
              <div style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {isUrdu ? '💳 ادائیگی کا طریقہ' : '💳 Payment Type'}
                </div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  {['Cash','Credit','Cheque','Mixed'].map(pt => (
                    <label key={pt} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 13 }}>
                      <input type="radio" name="paymentType" value={pt} checked={header.PaymentType === pt}
                        onChange={() => setHeader(h => ({ ...h, PaymentType: pt }))} />
                      <strong>{isUrdu ? { Cash: 'نقد', Credit: 'ادھار', Cheque: 'چیک', Mixed: 'مخلوط' }[pt] : pt}</strong>
                    </label>
                  ))}
                  {(header.PaymentType === 'Mixed' || header.PaymentType === 'Cash') && (
                    <div className="field-group" style={{ margin: 0, minWidth: 120 }}>
                      <label style={{ fontSize: 11 }}>{isUrdu ? 'نقد رقم' : 'Cash Amt'}</label>
                      <input type="number" min="0" step="0.01" className="input-field" value={header.CashAmount || ''} placeholder="0.00"
                        onChange={e => setHeader(h => ({ ...h, CashAmount: e.target.value }))} />
                    </div>
                  )}
                  {(header.PaymentType === 'Mixed' || header.PaymentType === 'Cheque') && (
                    <>
                      <div className="field-group" style={{ margin: 0, minWidth: 120 }}>
                        <label style={{ fontSize: 11 }}>{isUrdu ? 'چیک رقم' : 'Cheque Amt'}</label>
                        <input type="number" min="0" step="0.01" className="input-field" value={header.ChequeAmount || ''} placeholder="0.00"
                          onChange={e => setHeader(h => ({ ...h, ChequeAmount: e.target.value }))} />
                      </div>
                      <div className="field-group" style={{ margin: 0, minWidth: 120 }}>
                        <label style={{ fontSize: 11 }}>{isUrdu ? 'چیک نمبر' : 'Cheque No'}</label>
                        <input type="text" className="input-field" value={header.ChequeNo || ''} placeholder="0001"
                          onChange={e => setHeader(h => ({ ...h, ChequeNo: e.target.value }))} />
                      </div>
                      <div className="field-group" style={{ margin: 0, minWidth: 130 }}>
                        <label style={{ fontSize: 11 }}>{isUrdu ? 'چیک تاریخ' : 'Cheque Date'}</label>
                        <input type="date" className="input-field" value={header.ChequeDate || ''} onChange={e => setHeader(h => ({ ...h, ChequeDate: e.target.value }))} />
                      </div>
                      <div className="field-group" style={{ margin: 0, minWidth: 120 }}>
                        <label style={{ fontSize: 11 }}>{isUrdu ? 'بینک' : 'Bank'}</label>
                        <input type="text" className="input-field" value={header.BankName || ''} placeholder="HBL / MCB…"
                          onChange={e => setHeader(h => ({ ...h, BankName: e.target.value }))} />
                      </div>
                    </>
                  )}
                  {header.PaymentType === 'Mixed' && (
                    <div className="field-group" style={{ margin: 0, minWidth: 120 }}>
                      <label style={{ fontSize: 11 }}>{isUrdu ? 'ادھار رقم' : 'Credit Amt'}</label>
                      <input type="number" min="0" step="0.01" className="input-field" value={header.CreditAmount || ''} placeholder="0.00"
                        onChange={e => setHeader(h => ({ ...h, CreditAmount: e.target.value }))} />
                    </div>
                  )}
                </div>
                {/* Settlement account — shown for any non-Credit payment */}
                {header.PaymentType !== 'Credit' && (
                  <div style={{ marginTop: 10 }}>
                    <div className="field-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: 11, fontWeight: 700 }}>
                        {isUrdu ? '🏦 نقد/بینک اکاؤنٹ (پوسٹنگ پر استعمال ہوگا)' : '🏦 Cash / Bank Account for Settlement'}
                      </label>
                      <select className="select-field" value={header.SettlementAccountCA || ''}
                        onChange={e => setHeader(h => ({ ...h, SettlementAccountCA: e.target.value }))}>
                        <option value="">{isUrdu ? '— اکاؤنٹ منتخب کریں —' : '— Select account —'}</option>
                        {accounts.map(a => <option key={a.CA} value={a.CA}>{a.CA} — {a.AC_TITLE1}</option>)}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Lines */}
            {/* Lines — with Maund/unit conversion and packaging support */}
            <div className="lines-section">
              <div className="lines-section-header">
                <span className="lines-section-title">{isUrdu ? 'آئٹم لائنیں' : 'Item Lines'}</span>
                <span style={{ fontSize:11, color:'var(--text-muted)', marginInlineStart:8 }}>
                  {isUrdu ? '(مقدار KG میں محفوظ — مَن=40KG، ٹن=1000KG)' : '(qty stored in KG — Maund=40KG, Ton=1000KG)'}
                </span>
                <button className="btn btn-ghost" style={{ fontSize:12, padding:'4px 10px', marginInlineStart:'auto' }}
                  onClick={() => setLines(l => [...l, EMPTY_LINE()])}><Plus size={12} />{isUrdu ? 'لائن شامل کریں' : 'Add Line'}</button>
              </div>
              <div style={{ overflowX:'auto', overflowY:'auto', maxHeight:320, border:'1px solid var(--border)', borderRadius:8 }}>
                <table className="data-table" style={{ minWidth:1000, tableLayout:'fixed', borderRadius:0 }}>
                  <thead><tr>
                    <th style={{ width:190 }}>{isUrdu?'آئٹم':'Item'}</th>
                    <th style={{ width:130 }}>{isUrdu?'یونٹ / مَن':'Unit / Maund'}</th>
                    <th style={{ width:90 }}>{isUrdu?'مقدار':'Qty'}</th>
                    <th style={{ width:100 }}><span style={{ color:'var(--emerald)', fontSize:11 }}>{isUrdu?'KG (خودکار)':'KG (Auto)'}</span></th>
                    <th style={{ width:130 }}>{isUrdu?'گودام':'Warehouse'}</th>
                    <th style={{ width:100 }}>{isUrdu?'لاگت':'Unit Cost'}</th>
                    <th style={{ width:75 }}>{isUrdu?'رعایت%':'Disc%'}</th>
                    <th style={{ width:110 }}>{isUrdu?'کل رقم':'Line Total'}</th>
                    <th style={{ width:30 }}></th>
                  </tr></thead>
                  <tbody>
                    {lines.map((line, i) => {
                      const selUnit = line.UOM || 'KG';
                      const factor = getLineFactor(line, packUnits);
                      const kgQty = Number(line.Quantity || 0) * factor;
                      const itemPacks = packUnits.filter(p => Number(p.ItemID) === Number(line.ItemID));
                      return (
                        <tr key={i}>
                          {/* Item */}
                          <td style={{ padding:'5px 7px' }}>
                            <select className="select-field" style={{ width:'100%', fontSize:12 }}
                              value={line.ItemID||''} onChange={e => setLines(prev => {
                                const next = [...prev];
                                next[i] = { ...next[i], ItemID: e.target.value, UOM: 'KG', DisplayUnit: 'KG', PackUnitID: '', WeightKgPerUnit: 1 };
                                next[i].LineTotal = calcLineTotal(next[i]);
                                return next;
                              })}>
                              <option value="">{isUrdu?'— آئٹم —':'— Item —'}</option>
                              {items.map(it => <option key={it.ItemID} value={it.ItemID}>{it.ItemName}</option>)}
                            </select>
                          </td>
                          {/* Unit selector */}
                          <td style={{ padding:'5px 7px' }}>
                            <select className="select-field" style={{ width:'100%', fontSize:12 }}
                              value={line.UOM||'KG'} onChange={e => updateLineUnit(i, e.target.value)}>
                              <option value="KG">KG</option>
                              <option value="MAUND">مَن / Maund (40 KG)</option>
                              <option value="TON">Ton (1000 KG)</option>
                              {itemPacks.map(p => (
                                <option key={p.PackUnitID} value={p.UnitLabel}>{p.UnitLabel} ({p.WeightKg} KG)</option>
                              ))}
                            </select>
                          </td>
                          {/* Qty in selected unit */}
                          <td style={{ padding:'5px 7px' }}>
                            <input type="number" min="0" step="0.001" className="input-field"
                              style={{ width:'100%', textAlign:'right', fontWeight:700 }}
                              value={line.Quantity||''} placeholder="0.000"
                              onChange={e => setLine(i,'Quantity',e.target.value)} />
                          </td>
                          {/* Auto KG */}
                          <td style={{ padding:'5px 7px', background:'rgba(22,163,74,0.05)' }}>
                            <span style={{ display:'block', textAlign:'right', fontSize:12, fontWeight:700, color:'var(--emerald)', padding:'5px 3px' }}>
                              {kgQty > 0 ? kgQty.toFixed(3) : '—'} KG
                            </span>
                          </td>
                          {/* Warehouse */}
                          <td style={{ padding:'5px 7px' }}>
                            <select className="select-field" style={{ width:'100%', fontSize:11 }}
                              value={line.WarehouseID||header.WarehouseID||''} onChange={e => setLine(i,'WarehouseID',e.target.value)}>
                              <option value="">{isUrdu?'— گودام —':'— WH —'}</option>
                              {warehouses.map(w => <option key={w.WarehouseID} value={w.WarehouseID}>{w.WarehouseName}</option>)}
                            </select>
                          </td>
                          {/* Unit Cost */}
                          <td style={{ padding:'5px 7px' }}>
                            <input type="number" min="0" step="0.01" className="input-field"
                              style={{ width:'100%', textAlign:'right' }}
                              value={line.UnitCost||''} placeholder="0.00"
                              onChange={e => setLine(i,'UnitCost',e.target.value)} />
                            {selUnit !== 'KG' && Number(line.UnitCost) > 0 && factor > 0 && (
                              <div style={{ fontSize:10, color:'var(--text-muted)', textAlign:'right', marginTop:2 }}>
                                = Rs.{(Number(line.UnitCost)/factor).toFixed(2)}/KG
                              </div>
                            )}
                          </td>
                          {/* Discount */}
                          <td style={{ padding:'5px 7px' }}>
                            <input type="number" min="0" max="100" step="0.1" className="input-field"
                              style={{ width:'100%', textAlign:'right' }}
                              value={line.DiscountPct||'0'} onChange={e => setLine(i,'DiscountPct',e.target.value)} />
                          </td>
                          {/* Line Total */}
                          <td style={{ padding:'5px 7px', textAlign:'right', fontWeight:600, color:'var(--emerald)' }}>
                            Rs.{fmt(line.LineTotal)}
                          </td>
                          <td style={{ padding:'5px 3px' }}>
                            {lines.length > 1 && <button className="btn-icon btn-icon-danger" onClick={() => setLines(l => l.filter((_,idx) => idx !== i))}><X size={12}/></button>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={6} style={{ padding:'10px 14px', fontWeight:700 }}>{isUrdu?'ذیلی کل / رعایت / خالص کل':'Sub Total / Discount / Net Total'}</td>
                      <td style={{ textAlign:'right', padding:'10px 14px' }}>
                        <div style={{ fontSize:11, color:'var(--text-muted)' }}>Sub: Rs.{fmt(subTotal)}</div>
                        <div style={{ fontSize:11, color:'var(--rose)' }}>Disc: Rs.{fmt(discAmt)}</div>
                        <div style={{ fontSize:15, fontWeight:700, color:'var(--emerald)' }}>Rs.{fmt(netTotal)}</div>
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowForm(false)} disabled={saving}>{isUrdu ? 'منسوخ' : 'Cancel'}</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}><Save size={13} />{saving ? '…' : (isUrdu ? 'محفوظ کریں' : 'Save Draft')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
