import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, X, Save, RefreshCw } from 'lucide-react';
import { useLang } from '../context/LanguageContext';

const api = window.electronAPI;
const EMPTY = () => ({ CCID: null, CCCode: '', CCName: '', CCNameUr: '', Active: true });

export default function CostCenterManager({ currentDb, dbInfo, showNotification }) {
  const { isUrdu } = useLang();
  const dir = isUrdu ? 'rtl' : 'ltr';
  const [ccs, setCcs]         = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]       = useState(EMPTY());
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const load = useCallback(async () => {
    if (!currentDb) return;
    setLoading(true);
    try { const r = await api.getCostCenters({ dbPath: currentDb }); if (r.success) setCcs(r.data); }
    finally { setLoading(false); }
  }, [currentDb]);

  useEffect(() => { load(); }, [load, dbInfo?.lastRefresh]);

  async function handleSave() {
    if (!form.CCName?.trim()) { showNotification(isUrdu?'نام درج کریں':'Name required', 'error'); return; }
    setSaving(true);
    try {
      const res = await api.saveCostCenter({ dbPath: currentDb, cc: form });
      if (res.success) { showNotification(isUrdu?'لاگت مرکز محفوظ':'Cost center saved', 'success'); setShowForm(false); load(); }
      else showNotification(res.error || 'Save failed', 'error');
    } finally { setSaving(false); }
  }

  return (
    <div className="page" dir={dir}>
      <div className="page-header">
        <div><h1 className="page-title">{isUrdu?'لاگت مراکز':'Cost Centers'}</h1><p className="page-subtitle">{isUrdu?'اخراجات کو مختلف محکموں میں تقسیم کریں':'Assign expenses to departments like Milling, Packing, Admin'}</p></div>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={() => { setForm(EMPTY()); setShowForm(true); }} disabled={!currentDb}><Plus size={14} />{isUrdu?'نیا لاگت مرکز':'New Cost Center'}</button>
          <button className="btn btn-secondary" onClick={load} disabled={loading}><RefreshCw size={14} className={loading?'spin':''} /></button>
        </div>
      </div>

      {!currentDb ? <div className="empty-state"><h3>{isUrdu?'ڈیٹا بیس منتخب نہیں':'No Database Selected'}</h3></div>
      : loading ? <div className="empty-state"><div className="loading-spinner" style={{ margin:'0 auto' }} /></div>
      : <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr><th>{isUrdu?'کوڈ':'Code'}</th><th>{isUrdu?'نام':'Name'}</th><th>{isUrdu?'اردو نام':'Urdu Name'}</th><th>{isUrdu?'حالت':'Status'}</th><th style={{ width:80 }}></th></tr></thead>
            <tbody>
              {ccs.length === 0 ? <tr><td colSpan={5} style={{ textAlign:'center', color:'var(--text-muted)', padding:32 }}>{isUrdu?'کوئی لاگت مرکز نہیں':'No cost centers'}</td></tr>
              : ccs.map(c => (
                <tr key={c.CCID}>
                  <td style={{ fontFamily:'monospace', fontSize:12 }}>{c.CCCode||'—'}</td>
                  <td className="account-name">{c.CCName}</td>
                  <td style={{ fontSize:12 }}>{c.CCNameUr||'—'}</td>
                  <td><span style={{ fontSize:11, padding:'2px 8px', borderRadius:12, background:c.Active?'rgba(16,185,129,0.12)':'rgba(244,63,94,0.1)', color:c.Active?'var(--emerald)':'var(--rose)' }}>{c.Active?(isUrdu?'فعال':'Active'):(isUrdu?'غیر فعال':'Inactive')}</span></td>
                  <td><div style={{ display:'flex', gap:5 }}>
                    <button className="btn-icon" onClick={() => { setForm(c); setShowForm(true); }}><Edit2 size={13} /></button>
                    <button className="btn-icon btn-icon-danger" onClick={() => setDeleteConfirm(c.CCID)}><Trash2 size={13} /></button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>}

      {deleteConfirm && <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}><div className="modal-box" onClick={e => e.stopPropagation()} dir={dir}><div className="modal-header"><h3>{isUrdu?'حذف کریں؟':'Delete?'}</h3><button className="btn-icon" onClick={() => setDeleteConfirm(null)}><X size={15} /></button></div><div className="modal-footer"><button className="btn btn-ghost" onClick={() => setDeleteConfirm(null)}>{isUrdu?'منسوخ':'Cancel'}</button><button className="btn btn-danger" onClick={async () => { const r = await api.saveCostCenter({ dbPath: currentDb, cc: { ...ccs.find(c => c.CCID === deleteConfirm), Active: 0 } }); if (r.success) { setDeleteConfirm(null); load(); } }}><Trash2 size={13} />{isUrdu?'غیر فعال کریں':'Deactivate'}</button></div></div></div>}

      {showForm && <div className="modal-overlay" onClick={() => setShowForm(false)}><div className="modal-box" onClick={e => e.stopPropagation()} dir={dir} style={{ maxWidth:480 }}><div className="modal-header"><h3>{form.CCID?(isUrdu?'ترمیم':'Edit'):(isUrdu?'نیا لاگت مرکز':'New Cost Center')}</h3><button className="btn-icon" onClick={() => setShowForm(false)}><X size={16} /></button></div><div className="modal-body"><div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <div className="field-group"><label>{isUrdu?'کوڈ':'Code'}</label><input type="text" className="input-field" value={form.CCCode||''} onChange={e => setForm(f => ({ ...f, CCCode: e.target.value }))} /></div>
        <div className="field-group"><label>{isUrdu?'نام *':'Name *'}</label><input type="text" className="input-field" value={form.CCName||''} onChange={e => setForm(f => ({ ...f, CCName: e.target.value }))} /></div>
        <div className="field-group"><label>{isUrdu?'اردو نام':'Urdu Name'}</label><input type="text" className="input-field" value={form.CCNameUr||''} onChange={e => setForm(f => ({ ...f, CCNameUr: e.target.value }))} /></div>
        <div className="field-group"><label>{isUrdu?'حالت':'Status'}</label><select className="select-field" value={form.Active?'1':'0'} onChange={e => setForm(f => ({ ...f, Active: e.target.value==='1' }))}><option value="1">{isUrdu?'فعال':'Active'}</option><option value="0">{isUrdu?'غیر فعال':'Inactive'}</option></select></div>
      </div></div><div className="modal-footer"><button className="btn btn-ghost" onClick={() => setShowForm(false)} disabled={saving}>{isUrdu?'منسوخ':'Cancel'}</button><button className="btn btn-primary" onClick={handleSave} disabled={saving}><Save size={13} />{saving?'…':(isUrdu?'محفوظ کریں':'Save')}</button></div></div></div>}
    </div>
  );
}
