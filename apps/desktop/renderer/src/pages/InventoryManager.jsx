import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, X, Save, RefreshCw, Package, Warehouse, ArrowDownToLine, ArrowUpFromLine, BarChart3 } from 'lucide-react';
import { useLang } from '../context/LanguageContext';

const api = window.electronAPI;

const EMPTY_ITEM = () => ({ ItemID: null, ItemCode: '', ItemName: '', ItemNameUr: '', Category: '', UOM: 'KG', ReorderLevel: 0, IsBardana: false, BardanaType: '', BardanaCost: 0, Active: true });
const EMPTY_WH   = () => ({ WarehouseID: null, WarehouseName: '', WarehouseNameUr: '' });
const EMPTY_MOV  = () => ({ MovementID: null, MovementDate: new Date().toISOString().slice(0,10), ItemID: '', WarehouseID: '', MovementType: 'IN', Quantity: '', Rate: '', ReferenceNo: '', Narration: '' });

function fmt(n) {
  if (n == null || n === '') return '—';
  return Number(n).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtQty(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('en-PK', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

export default function InventoryManager({ currentDb, dbInfo, showNotification }) {
  const { isUrdu } = useLang();
  const dir = isUrdu ? 'rtl' : 'ltr';

  const [tab,          setTab]          = useState('items');     // 'items' | 'movements' | 'summary' | 'warehouses'
  const [items,        setItems]        = useState([]);
  const [warehouses,   setWarehouses]   = useState([]);
  const [movements,    setMovements]    = useState([]);
  const [summary,      setSummary]      = useState([]);
  const [packUnits,    setPackUnits]    = useState([]); // packaging unit definitions
  const [loading,      setLoading]      = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [deleting,     setDeleting]     = useState(false);

  // Form state
  const [showItemForm, setShowItemForm] = useState(false);
  const [itemForm,     setItemForm]     = useState(EMPTY_ITEM());
  const [showWhForm,   setShowWhForm]   = useState(false);
  const [whForm,       setWhForm]       = useState(EMPTY_WH());
  const [showMovForm,  setShowMovForm]  = useState(false);
  const [movForm,      setMovForm]      = useState(EMPTY_MOV());
  const [deleteTarget, setDeleteTarget] = useState(null); // { type, id }

  // Filters for movements
  const [filterItem,  setFilterItem]  = useState('');
  const [filterStart, setFilterStart] = useState('');
  const [filterEnd,   setFilterEnd]   = useState('');

  const loadAll = useCallback(async () => {
    if (!currentDb || !api) return;
    setLoading(true);
    try {
      const [itemsRes, whRes, movRes, pkRes] = await Promise.all([
        api.getMillItems(currentDb),
        api.getWarehouses(currentDb),
        api.getStockMovements({ dbPath: currentDb, itemId: filterItem || undefined, startDate: filterStart || undefined, endDate: filterEnd || undefined }),
        api.getPackagingUnits({ dbPath: currentDb }).catch(() => ({ success: false, data: [] })),
      ]);
      if (itemsRes.success) setItems(itemsRes.data || []);
      if (whRes.success)    setWarehouses(whRes.data || []);
      if (movRes.success)   { setMovements(movRes.data || []); setSummary(movRes.summary || []); }
      if (pkRes.success)    setPackUnits(pkRes.data || []);
    } finally { setLoading(false); }
  }, [currentDb, filterItem, filterStart, filterEnd]);

  useEffect(() => { loadAll(); }, [loadAll, dbInfo?.lastRefresh]);

  // ── Items CRUD ────────────────────────────────────────────────────────────
  async function saveItem() {
    if (!itemForm.ItemName.trim()) { showNotification(isUrdu ? 'آئٹم کا نام درج کریں' : 'Enter item name', 'error'); return; }
    setSaving(true);
    try {
      const res = await api.saveMillItem({ dbPath: currentDb, item: { ...itemForm, ItemName: itemForm.ItemName.trim() } });
      if (res.success) { showNotification(isUrdu ? 'آئٹم محفوظ' : 'Item saved', 'success'); setShowItemForm(false); loadAll(); }
      else showNotification(res.error, 'error');
    } finally { setSaving(false); }
  }

  async function deleteItem(id) {
    setDeleting(true);
    try {
      const res = await api.deleteMillItem({ dbPath: currentDb, ItemID: id });
      if (res.success) { showNotification(isUrdu ? 'آئٹم حذف' : 'Item deleted', 'success'); setDeleteTarget(null); loadAll(); }
      else showNotification(res.error, 'error');
    } finally { setDeleting(false); }
  }

  // ── Warehouses CRUD ───────────────────────────────────────────────────────
  async function saveWarehouse() {
    if (!whForm.WarehouseName.trim()) { showNotification(isUrdu ? 'گودام کا نام درج کریں' : 'Enter warehouse name', 'error'); return; }
    setSaving(true);
    try {
      const res = await api.saveWarehouse({ dbPath: currentDb, warehouse: { ...whForm, WarehouseName: whForm.WarehouseName.trim() } });
      if (res.success) { showNotification(isUrdu ? 'گودام محفوظ' : 'Warehouse saved', 'success'); setShowWhForm(false); loadAll(); }
      else showNotification(res.error, 'error');
    } finally { setSaving(false); }
  }

  // ── Stock Movements CRUD ──────────────────────────────────────────────────
  async function saveMovement() {
    if (!movForm.ItemID || !movForm.Quantity || !movForm.MovementDate) {
      showNotification(isUrdu ? 'آئٹم، تاریخ اور مقدار لازمی ہیں' : 'Item, date and quantity are required', 'error'); return;
    }
    setSaving(true);
    try {
      const res = await api.saveStockMovement({ dbPath: currentDb, movement: { ...movForm, Quantity: Number(movForm.Quantity), Rate: Number(movForm.Rate)||0 } });
      if (res.success) { showNotification(isUrdu ? 'اندراج محفوظ' : 'Movement saved', 'success'); setShowMovForm(false); loadAll(); }
      else showNotification(res.error, 'error');
    } finally { setSaving(false); }
  }

  async function deleteMovement(id) {
    setDeleting(true);
    try {
      const res = await api.deleteStockMovement({ dbPath: currentDb, MovementID: id });
      if (res.success) { showNotification(isUrdu ? 'اندراج حذف' : 'Movement deleted', 'success'); setDeleteTarget(null); loadAll(); }
      else showNotification(res.error, 'error');
    } finally { setDeleting(false); }
  }

  const itemName = (id) => items.find(i => i.ItemID === Number(id))?.ItemName || `#${id}`;
  const whName   = (id) => warehouses.find(w => w.WarehouseID === Number(id))?.WarehouseName || '—';

  const TAB_STYLE = (active) => ({
    padding: '8px 18px', border: 'none', borderRadius: '8px 8px 0 0',
    background: active ? '#fff' : 'transparent',
    borderBottom: active ? '2px solid var(--blue)' : '2px solid transparent',
    color: active ? 'var(--blue)' : 'var(--text-muted)',
    fontWeight: active ? 700 : 400, cursor: 'pointer', fontSize: 13,
    display: 'flex', alignItems: 'center', gap: 6,
  });

  if (!currentDb) return (
    <div className="page" dir={dir}>
      <div className="empty-state"><div className="empty-state-icon">📂</div><h3>{isUrdu ? 'کوئی ڈیٹا بیس منتخب نہیں' : 'No Database Selected'}</h3></div>
    </div>
  );

  return (
    <div className="page" dir={dir}>
      <div className="page-header">
        <div>
          <h1 className="page-title">{isUrdu ? '📦 انوینٹری منیجمنٹ' : '📦 Inventory Management'}</h1>
          <p className="page-subtitle">{isUrdu ? 'آئٹمز، گودام، اسٹاک اندراجات اور موجودہ بیلنس' : 'Mill items, warehouses, stock movements and current balances'}</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={loadAll} disabled={loading}><RefreshCw size={14} className={loading ? 'spin' : ''} /> {isUrdu ? 'تازہ کریں' : 'Refresh'}</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 18 }}>
        <button style={TAB_STYLE(tab === 'summary')}   onClick={() => setTab('summary')}>  <BarChart3 size={14} />   {isUrdu ? 'اسٹاک خلاصہ' : 'Stock Summary'}</button>
        <button style={TAB_STYLE(tab === 'movements')} onClick={() => setTab('movements')}><ArrowDownToLine size={14} /> {isUrdu ? 'اندراجات' : 'Movements'}</button>
        <button style={TAB_STYLE(tab === 'items')}     onClick={() => setTab('items')}>    <Package size={14} />     {isUrdu ? 'آئٹمز' : 'Items'}</button>
        <button style={TAB_STYLE(tab === 'warehouses')} onClick={() => setTab('warehouses')}><Warehouse size={14} />  {isUrdu ? 'گودام' : 'Warehouses'}</button>
      </div>

      {loading ? <div className="empty-state"><div className="loading-spinner" style={{ margin: '0 auto' }} /></div> : (
        <>
          {/* ── Stock Summary ─────────────────────────────────────────────── */}
          {tab === 'summary' && (
            <>
              {summary.length === 0 ? (
                <div className="empty-state"><div className="empty-state-icon">📊</div><h3>{isUrdu ? 'کوئی آئٹم نہیں' : 'No items found'}</h3><p>{isUrdu ? 'پہلے آئٹمز ٹیب میں آئٹم شامل کریں' : 'Add items in the Items tab first'}</p></div>
              ) : (
                <div className="data-table-wrap">
                  <table className="data-table">
                    <thead><tr>
                      <th>{isUrdu ? 'آئٹم' : 'Item'}</th>
                      <th>{isUrdu ? 'یونٹ' : 'UOM'}</th>
                      <th className="text-right">{isUrdu ? 'کل وصول' : 'Total In'}</th>
                      <th className="text-right">{isUrdu ? 'کل اخراج' : 'Total Out'}</th>
                      <th className="text-right">{isUrdu ? 'موجودہ بیلنس' : 'Balance Qty'}</th>
                      <th>{isUrdu ? 'پیکنگ بریک ڈاؤن' : 'Packaging Breakdown'}</th>
                      <th className="text-right">{isUrdu ? 'بیلنس قیمت' : 'Balance Value'}</th>
                    </tr></thead>
                    <tbody>
                      {summary.map(s => {
                        const bal   = Number(s.balance || 0);
                        const isLow = bal <= 0;
                        // Compute packaging breakdown for this item
                        const itemPacks = packUnits.filter(p => p.ItemID === s.ItemID && p.WeightKg > 0);
                        const packBreakdown = itemPacks.map(p => {
                          const bags = bal > 0 ? Math.floor(bal / p.WeightKg) : 0;
                          const rem  = bal > 0 ? bal - bags * p.WeightKg : 0;
                          return { label: p.UnitLabel, bags, rem, wt: p.WeightKg };
                        });
                        return (
                          <tr key={s.ItemID}>
                            <td className="account-name">{s.ItemName}</td>
                            <td style={{ color: 'var(--text-muted)' }}>{s.UOM}</td>
                            <td className="text-right" style={{ color: 'var(--emerald)' }}>{fmtQty(s.totalIn)}</td>
                            <td className="text-right" style={{ color: 'var(--rose)' }}>{fmtQty(s.totalOut)}</td>
                            <td className="text-right" style={{ fontWeight: 700, color: isLow ? 'var(--rose)' : 'var(--blue)' }}>
                              {fmtQty(bal)} {isLow && '⚠'}
                            </td>
                            <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                              {packBreakdown.length === 0
                                ? <span style={{ color: 'var(--text-muted)' }}>—</span>
                                : packBreakdown.map((p, pi) => (
                                  <span key={pi} style={{ display: 'inline-block', marginInlineEnd: 8, whiteSpace: 'nowrap' }}>
                                    <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{p.bags}</span>
                                    {' '}{p.label}
                                    {p.rem > 0.01 && <span style={{ color: 'var(--text-muted)' }}> + {fmtQty(p.rem)} KG</span>}
                                  </span>
                                ))
                              }
                            </td>
                            <td className="text-right" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Rs. {fmt(s.balanceValue)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={6} style={{ fontWeight: 700 }}>{isUrdu ? 'کل قیمت' : 'Total Inventory Value'}</td>
                        <td className="text-right" style={{ color: 'var(--emerald)', fontSize: 15 }}>
                          Rs. {fmt(summary.reduce((s, r) => s + (Number(r.balanceValue) || 0), 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ── Stock Movements ───────────────────────────────────────────── */}
          {tab === 'movements' && (
            <>
              <div className="report-controls" style={{ marginBottom: 14 }}>
                <select className="select-field" style={{ minWidth: 160 }} value={filterItem} onChange={e => setFilterItem(e.target.value)}>
                  <option value="">{isUrdu ? '— تمام آئٹمز —' : '— All Items —'}</option>
                  {items.map(i => <option key={i.ItemID} value={i.ItemID}>{i.ItemName}</option>)}
                </select>
                <div className="date-group"><span className="date-label">{isUrdu ? 'سے' : 'From'}</span>
                  <input type="date" className="input-field" value={filterStart} onChange={e => setFilterStart(e.target.value)} /></div>
                <div className="date-group"><span className="date-label">{isUrdu ? 'تک' : 'To'}</span>
                  <input type="date" className="input-field" value={filterEnd} onChange={e => setFilterEnd(e.target.value)} /></div>
                <button className="btn btn-primary" onClick={loadAll}>{isUrdu ? 'لگائیں' : 'Apply'}</button>
                <button className="btn btn-ghost" onClick={() => { setFilterItem(''); setFilterStart(''); setFilterEnd(''); }}>{isUrdu ? 'صاف' : 'Clear'}</button>
                <div style={{ flex: 1 }} />
                <button className="btn btn-primary" onClick={() => { setMovForm(EMPTY_MOV()); setShowMovForm(true); }}>
                  <Plus size={14} /> {isUrdu ? 'نیا اندراج' : 'New Movement'}
                </button>
              </div>
              {movements.length === 0 ? (
                <div className="empty-state"><div className="empty-state-icon">📋</div><h3>{isUrdu ? 'کوئی اندراج نہیں' : 'No movements found'}</h3></div>
              ) : (
                <div className="data-table-wrap">
                  <table className="data-table">
                    <thead><tr>
                      <th style={{ width: 110 }}>{isUrdu ? 'تاریخ' : 'Date'}</th>
                      <th>{isUrdu ? 'آئٹم' : 'Item'}</th>
                      <th>{isUrdu ? 'گودام' : 'Warehouse'}</th>
                      <th style={{ width: 80 }}>{isUrdu ? 'قسم' : 'Type'}</th>
                      <th className="text-right" style={{ width: 110 }}>{isUrdu ? 'مقدار' : 'Quantity'}</th>
                      <th className="text-right" style={{ width: 110 }}>{isUrdu ? 'شرح' : 'Rate'}</th>
                      <th className="text-right" style={{ width: 120 }}>{isUrdu ? 'مالیت' : 'Value'}</th>
                      <th>{isUrdu ? 'ریمارکس' : 'Narration'}</th>
                      <th style={{ width: 70 }}></th>
                    </tr></thead>
                    <tbody>
                      {movements.map(m => (
                        <tr key={m.MovementID}>
                          <td style={{ fontSize: 12 }}>{m.MovementDate ? String(m.MovementDate).slice(0,10) : '—'}</td>
                          <td className="account-name">{m.ItemName || `#${m.ItemID}`}</td>
                          <td style={{ fontSize: 12 }}>{m.WarehouseName || '—'}</td>
                          <td>
                            <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700,
                              background: m.MovementType === 'IN' ? 'rgba(22,163,74,0.12)' : 'rgba(220,38,38,0.12)',
                              color: m.MovementType === 'IN' ? 'var(--emerald)' : 'var(--rose)' }}>
                              {m.MovementType === 'IN' ? (isUrdu ? '▼ وصول' : '▼ IN') : (isUrdu ? '▲ اخراج' : '▲ OUT')}
                            </span>
                          </td>
                          <td className="text-right">{fmtQty(m.Quantity)} <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{m.UOM}</span></td>
                          <td className="text-right" style={{ fontSize: 12 }}>{fmt(m.Rate)}</td>
                          <td className="text-right" style={{ fontWeight: 600 }}>Rs. {fmt(m.Quantity * (m.Rate||0))}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.Narration || m.ReferenceNo || '—'}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                              <button className="btn-icon" onClick={() => { setMovForm({ ...m, MovementDate: String(m.MovementDate||'').slice(0,10), Quantity: String(m.Quantity), Rate: String(m.Rate||'') }); setShowMovForm(true); }}>
                                <Edit2 size={12} />
                              </button>
                              <button className="btn-icon btn-icon-danger" onClick={() => setDeleteTarget({ type: 'movement', id: m.MovementID })}>
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ── Items ─────────────────────────────────────────────────────── */}
          {tab === 'items' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                <button className="btn btn-primary" onClick={() => { setItemForm(EMPTY_ITEM()); setShowItemForm(true); }}>
                  <Plus size={14} /> {isUrdu ? 'نیا آئٹم' : 'New Item'}
                </button>
              </div>
              {items.length === 0 ? (
                <div className="empty-state"><div className="empty-state-icon">📦</div><h3>{isUrdu ? 'کوئی آئٹم نہیں' : 'No items yet'}</h3>
                  <p style={{ marginTop: 8, fontSize: 13, color: 'var(--text-muted)' }}>{isUrdu ? 'اوپر "نیا آئٹم" بٹن سے گندم، میدہ، آٹا وغیرہ شامل کریں' : 'Add wheat, maida, atta, chokar etc. using New Item above'}</p>
                </div>
              ) : (
                <div className="data-table-wrap">
                  <table className="data-table">
                    <thead><tr>
                      <th style={{ width: 60 }}>ID</th>
                      <th>{isUrdu ? 'کوڈ' : 'Code'}</th>
                      <th>{isUrdu ? 'نام' : 'Name'}</th>
                      <th>{isUrdu ? 'اردو نام' : 'Urdu Name'}</th>
                      <th>{isUrdu ? 'زمرہ' : 'Category'}</th>
                      <th style={{ width: 70 }}>{isUrdu ? 'یونٹ' : 'UOM'}</th>
                      <th style={{ width: 90 }}>{isUrdu ? 'باردانہ' : 'Bardana'}</th>
                      <th className="text-right" style={{ width: 100 }}>{isUrdu ? 'ری آرڈر' : 'Reorder Lv.'}</th>
                      <th style={{ width: 80 }}>{isUrdu ? 'عمل' : 'Actions'}</th>
                    </tr></thead>
                    <tbody>
                      {items.map(item => (
                        <tr key={item.ItemID}>
                          <td style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>{item.ItemID}</td>
                          <td style={{ fontSize: 12 }}>{item.ItemCode || '—'}</td>
                          <td className="account-name">{item.ItemName}</td>
                          <td style={{ fontFamily: "'Noto Nastaliq Urdu',serif", fontSize: 12, direction: 'rtl' }}>{item.ItemNameUr || '—'}</td>
                          <td style={{ fontSize: 12 }}>{item.Category || '—'}</td>
                          <td><span style={{ background: 'var(--accent-dim,#e0e7ff)', padding: '2px 8px', borderRadius: 8, fontSize: 11 }}>{item.UOM}</span></td>
                          <td style={{ fontSize: 11, color: item.IsBardana ? 'var(--amber)' : 'var(--text-muted)' }}>
                            {item.IsBardana ? (item.BardanaType || (isUrdu ? 'باردانہ' : 'Bardana')) : '—'}
                          </td>
                          <td className="text-right" style={{ fontSize: 12 }}>{fmtQty(item.ReorderLevel)}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                              <button className="btn-icon" onClick={() => { setItemForm({ ...item }); setShowItemForm(true); }}><Edit2 size={12} /></button>
                              <button className="btn-icon btn-icon-danger" onClick={() => setDeleteTarget({ type: 'item', id: item.ItemID })}><Trash2 size={12} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ── Warehouses ────────────────────────────────────────────────── */}
          {tab === 'warehouses' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                <button className="btn btn-primary" onClick={() => { setWhForm(EMPTY_WH()); setShowWhForm(true); }}>
                  <Plus size={14} /> {isUrdu ? 'نیا گودام' : 'New Warehouse'}
                </button>
              </div>
              {warehouses.length === 0 ? (
                <div className="empty-state"><div className="empty-state-icon">🏭</div><h3>{isUrdu ? 'کوئی گودام نہیں' : 'No warehouses yet'}</h3></div>
              ) : (
                <div className="data-table-wrap">
                  <table className="data-table">
                    <thead><tr>
                      <th style={{ width: 60 }}>ID</th>
                      <th>{isUrdu ? 'نام' : 'Name'}</th>
                      <th>{isUrdu ? 'اردو نام' : 'Urdu Name'}</th>
                      <th style={{ width: 80 }}></th>
                    </tr></thead>
                    <tbody>
                      {warehouses.map(w => (
                        <tr key={w.WarehouseID}>
                          <td style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>{w.WarehouseID}</td>
                          <td className="account-name">{w.WarehouseName}</td>
                          <td style={{ fontFamily: "'Noto Nastaliq Urdu',serif", fontSize: 12, direction: 'rtl' }}>{w.WarehouseNameUr || '—'}</td>
                          <td>
                            <button className="btn-icon" onClick={() => { setWhForm({ ...w }); setShowWhForm(true); }}><Edit2 size={12} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── Delete Confirm ─────────────────────────────────────────────────── */}
      {deleteTarget && (
        <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} dir={dir}>
            <div className="modal-header">
              <h3>{isUrdu ? 'حذف کریں؟' : 'Delete?'}</h3>
              <button className="btn-icon" onClick={() => setDeleteTarget(null)}><X size={15} /></button>
            </div>
            <div style={{ padding: '16px 20px', color: 'var(--text-muted)', fontSize: 13 }}>
              {isUrdu ? 'یہ ریکارڈ مستقل حذف ہو جائے گا۔' : 'This record will be permanently deleted.'}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setDeleteTarget(null)} disabled={deleting}>{isUrdu ? 'واپس' : 'Cancel'}</button>
              <button className="btn btn-danger" disabled={deleting}
                onClick={() => deleteTarget.type === 'item' ? deleteItem(deleteTarget.id) : deleteMovement(deleteTarget.id)}>
                <Trash2 size={13} /> {deleting ? '…' : (isUrdu ? 'حذف کریں' : 'Delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Item Form ──────────────────────────────────────────────────────── */}
      {showItemForm && (
        <div className="modal-overlay" onClick={() => setShowItemForm(false)}>
          <div className="modal-box" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()} dir={dir}>
            <div className="modal-header">
              <h3>{itemForm.ItemID ? (isUrdu ? 'آئٹم ترمیم' : 'Edit Item') : (isUrdu ? 'نیا آئٹم' : 'New Item')}</h3>
              <button className="btn-icon" onClick={() => setShowItemForm(false)}><X size={16} /></button>
            </div>
            <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                ['ItemCode',    isUrdu ? 'کوڈ'      : 'Item Code',    'WHEAT-01',   false],
                ['ItemName',    isUrdu ? 'نام*'      : 'Name *',       'Wheat',      false],
                ['ItemNameUr',  isUrdu ? 'اردو نام'  : 'Urdu Name',    'گندم',       true ],
                ['Category',    isUrdu ? 'زمرہ'      : 'Category',     'Raw Material',false],
              ].map(([field, label, ph, rtl]) => (
                <div className="field-group" key={field}>
                  <label>{label}</label>
                  <input type="text" className="input-field" dir={rtl ? 'rtl' : 'ltr'}
                    style={{ fontFamily: rtl ? "'Noto Nastaliq Urdu',serif" : undefined }}
                    placeholder={ph}
                    value={itemForm[field] || ''}
                    onChange={e => setItemForm(f => ({ ...f, [field]: e.target.value }))} />
                </div>
              ))}
              <div className="field-group">
                <label>{isUrdu ? 'یونٹ (UOM)' : 'Unit of Measure'}</label>
                <select className="select-field" value={itemForm.UOM || 'KG'}
                  onChange={e => setItemForm(f => ({ ...f, UOM: e.target.value }))}>
                  {['KG','MAAN','TON','BAG','PIECE','LITRE'].map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
              <div className="field-group">
                <label>{isUrdu ? 'ری آرڈر لیول' : 'Reorder Level'}</label>
                <input type="number" min="0" step="0.001" className="input-field"
                  value={itemForm.ReorderLevel || 0}
                  onChange={e => setItemForm(f => ({ ...f, ReorderLevel: e.target.value }))} />
              </div>
              <div className="field-group" style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 18 }}>
                <input type="checkbox" id="item-is-bardana" checked={!!itemForm.IsBardana}
                  onChange={e => setItemForm(f => ({ ...f, IsBardana: e.target.checked }))} />
                <label htmlFor="item-is-bardana" style={{ marginBottom: 0, cursor: 'pointer' }}>
                  {isUrdu ? 'باردانہ / پیکیجنگ میٹریل' : 'Bardana / Packing Material'}
                </label>
              </div>
              <div className="field-group">
                <label>{isUrdu ? 'باردانہ قسم' : 'Bardana Type'}</label>
                <input type="text" className="input-field" placeholder={isUrdu ? 'مثلاً جٹی بیگ، PP بیگ' : 'e.g. Jute Bag, PP Bag'}
                  value={itemForm.BardanaType || ''}
                  onChange={e => setItemForm(f => ({ ...f, BardanaType: e.target.value }))} />
              </div>
              <div className="field-group">
                <label>{isUrdu ? 'باردانہ لاگت (فی یونٹ)' : 'Bardana Cost (per unit)'}</label>
                <input type="number" min="0" step="0.01" className="input-field"
                  value={itemForm.BardanaCost || 0}
                  onChange={e => setItemForm(f => ({ ...f, BardanaCost: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowItemForm(false)} disabled={saving}>{isUrdu ? 'واپس' : 'Cancel'}</button>
              <button className="btn btn-primary" onClick={saveItem} disabled={saving}>
                <Save size={13} /> {saving ? '…' : (isUrdu ? 'محفوظ کریں' : 'Save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Warehouse Form ─────────────────────────────────────────────────── */}
      {showWhForm && (
        <div className="modal-overlay" onClick={() => setShowWhForm(false)}>
          <div className="modal-box" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()} dir={dir}>
            <div className="modal-header">
              <h3>{whForm.WarehouseID ? (isUrdu ? 'گودام ترمیم' : 'Edit Warehouse') : (isUrdu ? 'نیا گودام' : 'New Warehouse')}</h3>
              <button className="btn-icon" onClick={() => setShowWhForm(false)}><X size={16} /></button>
            </div>
            <div style={{ padding: '16px 20px', display: 'grid', gap: 12 }}>
              <div className="field-group">
                <label>{isUrdu ? 'نام *' : 'Name *'}</label>
                <input type="text" className="input-field" value={whForm.WarehouseName}
                  placeholder="Main Store" onChange={e => setWhForm(f => ({ ...f, WarehouseName: e.target.value }))} />
              </div>
              <div className="field-group">
                <label>{isUrdu ? 'اردو نام' : 'Urdu Name'}</label>
                <input type="text" className="input-field" dir="rtl"
                  style={{ fontFamily: "'Noto Nastaliq Urdu',serif" }}
                  value={whForm.WarehouseNameUr || ''} placeholder="مرکزی گودام"
                  onChange={e => setWhForm(f => ({ ...f, WarehouseNameUr: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowWhForm(false)} disabled={saving}>{isUrdu ? 'واپس' : 'Cancel'}</button>
              <button className="btn btn-primary" onClick={saveWarehouse} disabled={saving}>
                <Save size={13} /> {saving ? '…' : (isUrdu ? 'محفوظ' : 'Save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Movement Form ──────────────────────────────────────────────────── */}
      {showMovForm && (
        <div className="modal-overlay" onClick={() => setShowMovForm(false)}>
          <div className="modal-box" style={{ maxWidth: 540 }} onClick={e => e.stopPropagation()} dir={dir}>
            <div className="modal-header">
              <h3>{movForm.MovementID ? (isUrdu ? 'اندراج ترمیم' : 'Edit Movement') : (isUrdu ? 'نیا اسٹاک اندراج' : 'New Stock Movement')}</h3>
              <button className="btn-icon" onClick={() => setShowMovForm(false)}><X size={16} /></button>
            </div>
            <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field-group">
                <label>{isUrdu ? 'تاریخ *' : 'Date *'}</label>
                <input type="date" className="input-field" value={movForm.MovementDate}
                  onChange={e => setMovForm(f => ({ ...f, MovementDate: e.target.value }))} />
              </div>
              <div className="field-group">
                <label>{isUrdu ? 'قسم *' : 'Type *'}</label>
                <select className="select-field" value={movForm.MovementType}
                  onChange={e => setMovForm(f => ({ ...f, MovementType: e.target.value }))}>
                  <option value="IN">{isUrdu ? '▼ وصول (IN)' : '▼ IN (Receipt)'}</option>
                  <option value="OUT">{isUrdu ? '▲ اخراج (OUT)' : '▲ OUT (Issue)'}</option>
                  <option value="OPENING">{isUrdu ? 'اوپننگ اسٹاک' : 'Opening Stock'}</option>
                  <option value="ADJUSTMENT">{isUrdu ? 'ایڈجسٹمنٹ' : 'Adjustment'}</option>
                </select>
              </div>
              <div className="field-group">
                <label>{isUrdu ? 'آئٹم *' : 'Item *'}</label>
                <select className="select-field" value={movForm.ItemID}
                  onChange={e => setMovForm(f => ({ ...f, ItemID: e.target.value }))}>
                  <option value="">{isUrdu ? '— منتخب کریں —' : '— Select —'}</option>
                  {items.map(i => <option key={i.ItemID} value={i.ItemID}>{i.ItemName} ({i.UOM})</option>)}
                </select>
              </div>
              <div className="field-group">
                <label>{isUrdu ? 'گودام' : 'Warehouse'}</label>
                <select className="select-field" value={movForm.WarehouseID}
                  onChange={e => setMovForm(f => ({ ...f, WarehouseID: e.target.value }))}>
                  <option value="">{isUrdu ? '— (اختیاری) —' : '— (optional) —'}</option>
                  {warehouses.map(w => <option key={w.WarehouseID} value={w.WarehouseID}>{w.WarehouseName}</option>)}
                </select>
              </div>
              <div className="field-group">
                <label>{isUrdu ? 'مقدار *' : 'Quantity *'}</label>
                <input type="number" min="0" step="0.001" className="input-field"
                  style={{ fontWeight: 700, fontSize: 15 }}
                  placeholder="0.000" value={movForm.Quantity}
                  onChange={e => setMovForm(f => ({ ...f, Quantity: e.target.value }))} />
              </div>
              <div className="field-group">
                <label>{isUrdu ? 'شرح (فی یونٹ)' : 'Rate (per unit)'}</label>
                <input type="number" min="0" step="0.01" className="input-field"
                  placeholder="0.00" value={movForm.Rate}
                  onChange={e => setMovForm(f => ({ ...f, Rate: e.target.value }))} />
              </div>
              <div className="field-group">
                <label>{isUrdu ? 'ریفرنس نمبر' : 'Reference No.'}</label>
                <input type="text" className="input-field" placeholder="GRN-001"
                  value={movForm.ReferenceNo || ''}
                  onChange={e => setMovForm(f => ({ ...f, ReferenceNo: e.target.value }))} />
              </div>
              <div className="field-group">
                <label>{isUrdu ? 'نوٹ' : 'Narration'}</label>
                <input type="text" className="input-field" placeholder={isUrdu ? 'تفصیل…' : 'Description…'}
                  value={movForm.Narration || ''}
                  onChange={e => setMovForm(f => ({ ...f, Narration: e.target.value }))} />
              </div>
              {movForm.Quantity && movForm.Rate && (
                <div style={{ gridColumn: 'span 2', padding: '8px 12px', background: 'var(--bg-deep,#f0f4f8)', borderRadius: 8, fontSize: 13, fontWeight: 600, color: 'var(--blue)' }}>
                  {isUrdu ? 'کل مالیت:' : 'Total Value:'} Rs. {fmt(Number(movForm.Quantity) * Number(movForm.Rate))}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowMovForm(false)} disabled={saving}>{isUrdu ? 'واپس' : 'Cancel'}</button>
              <button className="btn btn-primary" onClick={saveMovement} disabled={saving}>
                <Save size={13} /> {saving ? '…' : (isUrdu ? 'محفوظ کریں' : 'Save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
