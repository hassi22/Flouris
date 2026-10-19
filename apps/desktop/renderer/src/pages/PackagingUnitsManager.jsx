/**
 * PackagingUnitsManager.jsx
 * Manage product weight/packaging variants for each mill item.
 * e.g. Atta → 10 KG bag, 20 KG bag, 25 KG bag
 *      Maida → 50 KG bag, 10 KG bag
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, X, Save, RefreshCw, Package, Star } from 'lucide-react';
import { useLang } from '../context/LanguageContext';

const api = window.electronAPI;

const EMPTY_UNIT = () => ({
  PackUnitID: null, ItemID: '', UnitLabel: '', WeightKg: '', BagType: '', CostPerUnit: '', SKU: '', IsDefault: false,
});

function fmt(n) {
  if (n == null || n === '') return '—';
  return Number(n).toLocaleString('en-PK', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

export default function PackagingUnitsManager({ currentDb, dbInfo, showNotification }) {
  const { isUrdu } = useLang();
  const dir = isUrdu ? 'rtl' : 'ltr';

  const [items,      setItems]      = useState([]);
  const [units,      setUnits]      = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [showForm,   setShowForm]   = useState(false);
  const [form,       setForm]       = useState(EMPTY_UNIT());
  const [filterItem, setFilterItem] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(async () => {
    if (!currentDb) return;
    setLoading(true);
    try {
      const [itemsRes, unitsRes] = await Promise.all([
        api.getMillItems(currentDb),
        api.getPackagingUnits({ dbPath: currentDb, itemId: filterItem || undefined }),
      ]);
      if (itemsRes.success) setItems(itemsRes.data || []);
      if (unitsRes.success) setUnits(unitsRes.data || []);
    } finally { setLoading(false); }
  }, [currentDb, filterItem]);

  useEffect(() => { load(); }, [load, dbInfo?.lastRefresh]);

  async function handleSave() {
    if (!form.ItemID)          { showNotification(isUrdu ? 'آئٹم منتخب کریں' : 'Select an item', 'error'); return; }
    if (!form.UnitLabel?.trim()) { showNotification(isUrdu ? 'یونٹ لیبل درج کریں (مثلاً "20 KG بیگ")' : 'Enter unit label (e.g. "20 KG Bag")', 'error'); return; }
    if (!form.WeightKg || Number(form.WeightKg) <= 0) {
      showNotification(isUrdu ? 'وزن (کلوگرام) درج کریں' : 'Enter weight in KG', 'error'); return;
    }
    setSaving(true);
    try {
      const res = await api.savePackagingUnit({
        dbPath: currentDb,
        unit: { ...form, ItemID: Number(form.ItemID), WeightKg: Number(form.WeightKg), CostPerUnit: Number(form.CostPerUnit || 0), IsDefault: form.IsDefault ? 1 : 0 },
      });
      if (res.success) {
        showNotification(isUrdu ? 'پیکیجنگ یونٹ محفوظ ہو گیا' : 'Packaging unit saved', 'success');
        setShowForm(false);
        load();
      } else showNotification(res.error || 'Save failed', 'error');
    } finally { setSaving(false); }
  }

  async function handleDelete(id) {
    const res = await api.deletePackagingUnit({ dbPath: currentDb, PackUnitID: id });
    if (res.success) { showNotification(isUrdu ? 'حذف ہو گیا' : 'Deleted', 'success'); setDeleteTarget(null); load(); }
    else showNotification(res.error || 'Delete failed', 'error');
  }

  // Group units by item for display
  const grouped = units.reduce((acc, u) => {
    const key = u.ItemID;
    if (!acc[key]) acc[key] = { ItemID: u.ItemID, ItemName: u.ItemName, BaseUOM: u.BaseUOM, units: [] };
    acc[key].units.push(u);
    return acc;
  }, {});
  const itemName = id => items.find(i => i.ItemID === Number(id))?.ItemName || `#${id}`;

  const BAG_TYPES = ['Jute Bag', 'PP Bag', 'Paper Bag', 'Plastic Bag', 'Woven Bag', 'Other'];

  return (
    <div className="page" dir={dir}>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Package size={20} style={{ display:'inline', marginInlineEnd:8 }} />
            {isUrdu ? 'پیکیجنگ یونٹس' : 'Packaging Units'}
          </h1>
          <p className="page-subtitle">
            {isUrdu
              ? 'ہر آئٹم کے مختلف وزن/سائز کے تھیلے (مثلاً آٹا 10 کلو، 20 کلو، 25 کلو)'
              : 'Define weight variants per item (e.g. Atta 10 KG bag, 20 KG bag, 25 KG bag)'}
          </p>
        </div>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={() => { setForm(EMPTY_UNIT()); setShowForm(true); }} disabled={!currentDb}>
            <Plus size={14} /> {isUrdu ? 'نیا یونٹ' : 'New Unit'}
          </button>
          <button className="btn btn-secondary" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {/* Filter */}
      <div className="report-controls" style={{ marginBottom: 14 }}>
        <select className="select-field" style={{ minWidth: 200 }} value={filterItem} onChange={e => setFilterItem(e.target.value)}>
          <option value="">{isUrdu ? '— تمام آئٹمز —' : '— All Items —'}</option>
          {items.map(i => <option key={i.ItemID} value={i.ItemID}>{i.ItemName}</option>)}
        </select>
        <button className="btn btn-primary" onClick={load} disabled={loading}>{isUrdu ? 'فلٹر' : 'Filter'}</button>
        {filterItem && <button className="btn btn-ghost" onClick={() => setFilterItem('')}>{isUrdu ? 'صاف' : 'Clear'}</button>}
        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginInlineStart: 8 }}>
          {units.length} {isUrdu ? 'یونٹس' : 'units'}
        </span>
      </div>

      {!currentDb ? (
        <div className="empty-state">
          <div className="empty-state-icon"><Package size={40} /></div>
          <h3>{isUrdu ? 'ڈیٹا بیس منتخب نہیں' : 'No Database Selected'}</h3>
        </div>
      ) : loading ? (
        <div className="empty-state"><div className="loading-spinner" style={{ margin: '0 auto' }} /></div>
      ) : units.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><Package size={40} /></div>
          <h3>{isUrdu ? 'کوئی پیکیجنگ یونٹ نہیں' : 'No packaging units defined'}</h3>
          <p>{isUrdu
            ? 'اوپر "نیا یونٹ" بٹن سے آٹا 10KG، 20KG وغیرہ شامل کریں'
            : 'Click "New Unit" above to add variants like Atta 10KG, 20KG etc.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {Object.values(grouped).map(group => (
            <div key={group.ItemID} className="data-table-wrap">
              <div style={{
                padding: '10px 16px', borderBottom: '1px solid var(--border)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: 'var(--bg-secondary,#f8fafc)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Package size={16} style={{ color: 'var(--accent)' }} />
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{group.ItemName}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-card)', padding: '2px 8px', borderRadius: 8 }}>
                    {group.BaseUOM}
                  </span>
                </div>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {group.units.length} {isUrdu ? 'ویریئنٹس' : 'variants'}
                </span>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{isUrdu ? 'لیبل' : 'Label'}</th>
                    <th className="text-right" style={{ width: 110 }}>{isUrdu ? 'وزن (KG)' : 'Weight (KG)'}</th>
                    <th style={{ width: 120 }}>{isUrdu ? 'تھیلے کی قسم' : 'Bag Type'}</th>
                    <th style={{ width: 110 }}>{isUrdu ? 'لاگت/یونٹ' : 'Cost/Unit'}</th>
                    <th style={{ width: 120 }}>{isUrdu ? 'SKU' : 'SKU'}</th>
                    <th style={{ width: 80, textAlign: 'center' }}>{isUrdu ? 'پہلے سے طے' : 'Default'}</th>
                    <th style={{ width: 80 }}>{isUrdu ? 'عمل' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody>
                  {group.units.map(u => (
                    <tr key={u.PackUnitID}>
                      <td className="account-name" style={{ fontWeight: 600 }}>{u.UnitLabel}</td>
                      <td className="text-right" style={{ fontFamily: 'monospace', color: 'var(--blue)' }}>{fmt(u.WeightKg)}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{u.BagType || '—'}</td>
                      <td style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--emerald)' }}>Rs. {fmt(u.CostPerUnit || 0)}</td>
                      <td style={{ fontSize: 12, fontFamily: 'monospace' }}>{u.SKU || '—'}</td>
                      <td style={{ textAlign: 'center' }}>
                        {u.IsDefault ? (
                          <Star size={14} fill="var(--amber)" stroke="var(--amber)" title={isUrdu ? 'پہلے سے طے' : 'Default'} />
                        ) : '—'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn-icon" title={isUrdu ? 'ترمیم' : 'Edit'}
                            onClick={() => { setForm({ ...u, IsDefault: !!u.IsDefault }); setShowForm(true); }}>
                            <Edit2 size={12} />
                          </button>
                          <button className="btn-icon btn-icon-danger" title={isUrdu ? 'حذف' : 'Delete'}
                            onClick={() => setDeleteTarget(u)}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {/* ── Form Modal ── */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} dir={dir} style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3>{form.PackUnitID ? (isUrdu ? 'پیکیجنگ یونٹ ترمیم' : 'Edit Packaging Unit') : (isUrdu ? 'نیا پیکیجنگ یونٹ' : 'New Packaging Unit')}</h3>
              <button className="btn-icon" onClick={() => setShowForm(false)}><X size={16} /></button>
            </div>
            <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {/* Item */}
              <div className="field-group" style={{ gridColumn: 'span 2' }}>
                <label>{isUrdu ? 'آئٹم *' : 'Item *'}</label>
                <select className="select-field" value={form.ItemID || ''} onChange={e => setForm(f => ({ ...f, ItemID: e.target.value }))}>
                  <option value="">{isUrdu ? '— منتخب کریں —' : '— Select Item —'}</option>
                  {items.map(i => <option key={i.ItemID} value={i.ItemID}>{i.ItemName} ({i.UOM})</option>)}
                </select>
              </div>
              {/* Label */}
              <div className="field-group" style={{ gridColumn: 'span 2' }}>
                <label>{isUrdu ? 'یونٹ لیبل *' : 'Unit Label *'}</label>
                <input
                  type="text" className="input-field"
                  placeholder={isUrdu ? 'مثلاً: 20 KG بیگ' : 'e.g. 20 KG Bag'}
                  value={form.UnitLabel || ''}
                  onChange={e => setForm(f => ({ ...f, UnitLabel: e.target.value }))}
                />
                <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                  {isUrdu ? 'انوائس پر نظر آنے والا نام' : 'This label appears on invoices'}
                </span>
              </div>
              {/* Weight */}
              <div className="field-group">
                <label>{isUrdu ? 'وزن (KG) *' : 'Weight (KG) *'}</label>
                <input
                  type="number" min="0.001" step="0.001" className="input-field"
                  placeholder="20.000"
                  value={form.WeightKg || ''}
                  onChange={e => setForm(f => ({ ...f, WeightKg: e.target.value }))}
                />
              </div>
              {/* Bag Type */}
              <div className="field-group">
                <label>{isUrdu ? 'تھیلے کی قسم' : 'Bag Type'}</label>
                <input
                  type="text"
                  className="input-field"
                  list="pack-bag-types"
                  placeholder={isUrdu ? 'مثلاً PP بیگ / جٹی بیگ' : 'e.g. PP Bag / Jute Bag'}
                  value={form.BagType || ''}
                  onChange={e => setForm(f => ({ ...f, BagType: e.target.value }))}
                />
                <datalist id="pack-bag-types">
                  {BAG_TYPES.map(t => <option key={t} value={t} />)}
                </datalist>
              </div>
              {/* Cost */}
              <div className="field-group">
                <label>{isUrdu ? 'لاگت فی یونٹ (روپے)' : 'Cost per Unit (Rs)'}</label>
                <input
                  type="number" min="0" step="0.01" className="input-field"
                  placeholder="0.00"
                  value={form.CostPerUnit || ''}
                  onChange={e => setForm(f => ({ ...f, CostPerUnit: e.target.value }))}
                />
              </div>
              {/* SKU */}
              <div className="field-group">
                <label>{isUrdu ? 'SKU / بارکوڈ' : 'SKU / Barcode'}</label>
                <input
                  type="text" className="input-field" placeholder="ATT-20KG-001"
                  value={form.SKU || ''}
                  onChange={e => setForm(f => ({ ...f, SKU: e.target.value }))}
                />
              </div>
              {/* Default */}
              <div className="field-group" style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 22 }}>
                <input
                  type="checkbox" id="isDefaultCk" style={{ width: 16, height: 16 }}
                  checked={!!form.IsDefault}
                  onChange={e => setForm(f => ({ ...f, IsDefault: e.target.checked }))}
                />
                <label htmlFor="isDefaultCk" style={{ marginBottom: 0, cursor: 'pointer' }}>
                  {isUrdu ? 'پہلے سے طے شدہ یونٹ' : 'Set as default unit'}
                </label>
              </div>
            </div>

            {/* Preview */}
            {form.WeightKg && Number(form.WeightKg) > 0 && form.UnitLabel && (
              <div style={{ margin: '0 20px 16px', padding: '10px 14px', background: 'var(--bg-secondary,#f0f7ff)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                <strong>{isUrdu ? 'پیش نظارہ:' : 'Preview:'}</strong>{' '}
                {form.UnitLabel} — {Number(form.WeightKg).toFixed(3)} KG{' '}
                {form.BagType ? `(${form.BagType})` : ''}
                {form.IsDefault ? ` ⭐ ${isUrdu ? 'پہلے سے طے' : 'Default'}` : ''}
              </div>
            )}

            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowForm(false)} disabled={saving}>
                {isUrdu ? 'واپس' : 'Cancel'}
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                <Save size={13} /> {saving ? '…' : (isUrdu ? 'محفوظ کریں' : 'Save Unit')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm ── */}
      {deleteTarget && (
        <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} dir={dir} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3>{isUrdu ? 'حذف کریں؟' : 'Delete?'}</h3>
              <button className="btn-icon" onClick={() => setDeleteTarget(null)}><X size={15} /></button>
            </div>
            <div style={{ padding: '16px 20px', color: 'var(--text-muted)', fontSize: 13 }}>
              {isUrdu
                ? `"${deleteTarget.UnitLabel}" یونٹ کو غیر فعال کر دیا جائے گا۔`
                : `"${deleteTarget.UnitLabel}" will be deactivated.`}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setDeleteTarget(null)}>{isUrdu ? 'واپس' : 'Cancel'}</button>
              <button className="btn btn-danger" onClick={() => handleDelete(deleteTarget.PackUnitID)}>
                <Trash2 size={13} /> {isUrdu ? 'حذف کریں' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
