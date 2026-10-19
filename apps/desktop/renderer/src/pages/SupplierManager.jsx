import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Edit2, X, Save, RefreshCw, Search, Truck } from 'lucide-react';
import { useLang } from '../context/LanguageContext';

const api = window.electronAPI;
const EMPTY = () => ({ SupplierID: null, SupplierCode: '', SupplierName: '', SupplierNameUr: '', Contact: '', Address: '', OpeningBalance: '', LinkedAccountCA: '', Active: true });

function fmt(n) {
  if (!n && n !== 0) return '—';
  return Number(n).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function SupplierManager({ currentDb, dbInfo, showNotification }) {
  const { isUrdu } = useLang();
  const dir = isUrdu ? 'rtl' : 'ltr';
  const [suppliers, setSuppliers] = useState([]);
  const [accounts, setAccounts]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState(EMPTY());
  const [search, setSearch]       = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const load = useCallback(async () => {
    if (!currentDb) return;
    setLoading(true);
    try {
      const [sRes, aRes] = await Promise.all([
        api.getSuppliers({ dbPath: currentDb }),
        api.getChartOfAccounts(currentDb),
      ]);
      if (sRes.success) setSuppliers(sRes.data);
      if (aRes.success) setAccounts(aRes.data);
    } finally { setLoading(false); }
  }, [currentDb]);

  useEffect(() => { load(); }, [load, dbInfo?.lastRefresh]);

  const filtered = suppliers.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return s.SupplierName?.toLowerCase().includes(q) || s.SupplierCode?.toLowerCase().includes(q) || s.Contact?.toLowerCase().includes(q);
  });

  function openNew() { setForm(EMPTY()); setShowForm(true); }
  function openEdit(s) { setForm({ ...s, OpeningBalance: s.OpeningBalance ?? '', LinkedAccountCA: s.LinkedAccountCA ?? '' }); setShowForm(true); }

  async function handleSave() {
    if (!form.SupplierName?.trim()) { showNotification(isUrdu ? 'نام درج کریں' : 'Supplier name is required', 'error'); return; }
    setSaving(true);
    try {
      const res = await api.saveSupplier({ dbPath: currentDb, supplier: { ...form, OpeningBalance: Number(form.OpeningBalance || 0), LinkedAccountCA: form.LinkedAccountCA || null } });
      if (res.success) { showNotification(isUrdu ? 'سپلائر محفوظ ہو گیا' : 'Supplier saved', 'success'); setShowForm(false); load(); }
      else showNotification(res.error || 'Save failed', 'error');
    } finally { setSaving(false); }
  }

  async function handleDelete(id) {
    const res = await api.deleteSupplier({ dbPath: currentDb, SupplierID: id });
    if (res.success) { showNotification(isUrdu ? 'سپلائر حذف ہو گیا' : 'Supplier deleted', 'success'); setDeleteConfirm(null); load(); }
    else showNotification(res.error || 'Delete failed', 'error');
  }

  const acLabel = id => { const a = accounts.find(x => Number(x.CA) === Number(id)); return a ? `${a.CA} — ${a.AC_TITLE1}` : id ? `A/C #${id}` : '—'; };

  return (
    <div className="page" dir={dir}>
      <div className="page-header">
        <div><h1 className="page-title">{isUrdu ? 'سپلائرز' : 'Suppliers'}</h1><p className="page-subtitle">{isUrdu ? 'سپلائر فہرست اور ادائیگی انتظام' : 'Supplier master list and payables management'}</p></div>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={openNew} disabled={!currentDb}><Plus size={14} />{isUrdu ? 'نیا سپلائر' : 'New Supplier'}</button>
          <button className="btn btn-secondary" onClick={load} disabled={loading}><RefreshCw size={14} className={loading ? 'spin' : ''} />{isUrdu ? 'تازہ کریں' : 'Refresh'}</button>
        </div>
      </div>
      <div className="report-controls" style={{ marginBottom: 14 }}>
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', [isUrdu?'right':'left']: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input type="text" className="input-field" style={{ [isUrdu?'paddingRight':'paddingLeft']: 30, width: 260 }} placeholder={isUrdu ? 'نام / کوڈ…' : 'Name / code…'} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginInlineStart: 8 }}>{filtered.length} {isUrdu ? 'سپلائرز' : 'suppliers'}</span>
      </div>

      <div className="info-banner" style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 8, background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.18)', color: 'var(--text-secondary)', fontSize: 12 }}>
        {isUrdu
          ? 'نوٹ: سپلائر اسٹاٹمنٹ اس سپلائر کے LinkedAccountCA سے کھولی جاتی ہے۔ اگر LinkedAccountCA درست نہ ہو تو azyان چارٹ اور بیلنس غلط ہو سکتا ہے۔'
          : 'Note: supplier statements are opened from each supplier’s LinkedAccountCA. If the linked payable account is not set correctly, the statement and aging may not be accurate.'}
      </div>

      {!currentDb ? (
        <div className="empty-state"><div className="empty-state-icon"><Truck size={40} /></div><h3>{isUrdu ? 'ڈیٹا بیس منتخب نہیں' : 'No Database Selected'}</h3></div>
      ) : loading ? (
        <div className="empty-state"><div className="loading-spinner" style={{ margin: '0 auto' }} /></div>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr>
              <th>{isUrdu ? 'کوڈ' : 'Code'}</th>
              <th>{isUrdu ? 'نام' : 'Name'}</th>
              <th>{isUrdu ? 'رابطہ' : 'Contact'}</th>
              <th>{isUrdu ? 'پتہ' : 'Address'}</th>
              <th className="text-right">{isUrdu ? 'ابتدائی بیلنس' : 'Opening Bal.'}</th>
              <th>{isUrdu ? 'اکاؤنٹ' : 'Linked Account'}</th>
              <th>{isUrdu ? 'حالت' : 'Status'}</th>
              <th style={{ width: 80 }}>{isUrdu ? 'عمل' : 'Actions'}</th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>{isUrdu ? 'کوئی سپلائر نہیں ملا' : 'No suppliers found'}</td></tr>
              ) : filtered.map(s => (
                <tr key={s.SupplierID}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{s.SupplierCode || '—'}</td>
                  <td className="account-name">{s.SupplierName}</td>
                  <td style={{ fontSize: 12 }}>{s.Contact || '—'}</td>
                  <td style={{ fontSize: 12, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.Address || '—'}</td>
                  <td className="text-right">{fmt(s.OpeningBalance)}</td>
                  <td style={{ fontSize: 12 }}>{acLabel(s.LinkedAccountCA)}</td>
                  <td><span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: s.Active ? 'rgba(16,185,129,0.12)' : 'rgba(244,63,94,0.1)', color: s.Active ? 'var(--emerald)' : 'var(--rose)' }}>{s.Active ? (isUrdu ? 'فعال' : 'Active') : (isUrdu ? 'غیر فعال' : 'Inactive')}</span></td>
                  <td><div style={{ display: 'flex', gap: 5 }}>
                    <button className="btn-icon" onClick={() => openEdit(s)}><Edit2 size={13} /></button>
                    <button className="btn-icon btn-icon-danger" onClick={() => setDeleteConfirm(s.SupplierID)}><Trash2 size={13} /></button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deleteConfirm !== null && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} dir={dir}>
            <div className="modal-header"><h3>{isUrdu ? 'سپلائر حذف کریں؟' : 'Delete Supplier?'}</h3><button className="btn-icon" onClick={() => setDeleteConfirm(null)}><X size={15} /></button></div>
            <div style={{ padding: '16px 20px', color: 'var(--text-muted)', fontSize: 13 }}>{isUrdu ? 'کیا آپ واقعی اس سپلائر کو حذف کرنا چاہتے ہیں؟' : 'Are you sure you want to delete this supplier?'}</div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setDeleteConfirm(null)}>{isUrdu ? 'منسوخ' : 'Cancel'}</button>
              <button className="btn btn-danger" onClick={() => handleDelete(deleteConfirm)}><Trash2 size={13} />{isUrdu ? 'حذف کریں' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-box modal-wide" onClick={e => e.stopPropagation()} dir={dir} style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <h3>{form.SupplierID ? (isUrdu ? 'سپلائر ترمیم' : 'Edit Supplier') : (isUrdu ? 'نیا سپلائر' : 'New Supplier')}</h3>
              <button className="btn-icon" onClick={() => setShowForm(false)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {[
                  { label: isUrdu ? 'کوڈ' : 'Supplier Code', key: 'SupplierCode', placeholder: 'S-001' },
                  { label: isUrdu ? 'نام (انگریزی)' : 'Name (English)', key: 'SupplierName', required: true },
                  { label: isUrdu ? 'نام (اردو)' : 'Name (Urdu)', key: 'SupplierNameUr' },
                  { label: isUrdu ? 'رابطہ' : 'Contact', key: 'Contact' },
                ].map(({ label, key, required, placeholder }) => (
                  <div className="field-group" key={key}>
                    <label>{label}{required && <span style={{ color: 'var(--rose)' }}> *</span>}</label>
                    <input type="text" className="input-field" value={form[key] || ''} placeholder={placeholder || ''} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
                  </div>
                ))}
                <div className="field-group" style={{ gridColumn: 'span 2' }}>
                  <label>{isUrdu ? 'پتہ' : 'Address'}</label>
                  <input type="text" className="input-field" value={form.Address || ''} onChange={e => setForm(f => ({ ...f, Address: e.target.value }))} />
                </div>
                <div className="field-group">
                  <label>{isUrdu ? 'ابتدائی بیلنس (روپے)' : 'Opening Balance (Rs.)'}</label>
                  <input type="number" step="0.01" className="input-field" value={form.OpeningBalance || ''} placeholder="0" onChange={e => setForm(f => ({ ...f, OpeningBalance: e.target.value }))} />
                </div>
                <div className="field-group">
                  <label>{isUrdu ? 'منسلک اکاؤنٹ (واجبات)' : 'Linked Payable Account'}</label>
                  <select className="select-field" value={form.LinkedAccountCA || ''} onChange={e => setForm(f => ({ ...f, LinkedAccountCA: e.target.value }))}>
                    <option value="">{isUrdu ? '— اختیاری —' : '— Optional —'}</option>
                    {accounts.map(a => <option key={a.CA} value={a.CA}>{a.CA} — {a.AC_TITLE1}</option>)}
                  </select>
                </div>
                <div className="field-group">
                  <label>{isUrdu ? 'حالت' : 'Status'}</label>
                  <select className="select-field" value={form.Active ? '1' : '0'} onChange={e => setForm(f => ({ ...f, Active: e.target.value === '1' }))}>
                    <option value="1">{isUrdu ? 'فعال' : 'Active'}</option>
                    <option value="0">{isUrdu ? 'غیر فعال' : 'Inactive'}</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowForm(false)} disabled={saving}>{isUrdu ? 'منسوخ' : 'Cancel'}</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}><Save size={13} />{saving ? '…' : (isUrdu ? 'محفوظ کریں' : 'Save Supplier')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
