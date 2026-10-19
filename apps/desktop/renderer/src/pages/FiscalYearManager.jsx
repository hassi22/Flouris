import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, X, Save, RefreshCw, Calendar } from 'lucide-react';
import { useLang } from '../context/LanguageContext';

const api = window.electronAPI;
const EMPTY = () => ({ FYearID: null, FYearName: '', StartDate: '', EndDate: '', Status: 'Open' });

function fmtD(d) { if (!d) return '—'; try { return new Date(d).toLocaleDateString('en-PK', { day:'2-digit', month:'short', year:'numeric'}); } catch { return d; } }

export default function FiscalYearManager({ currentDb, dbInfo, showNotification }) {
  const { isUrdu } = useLang();
  const dir = isUrdu ? 'rtl' : 'ltr';
  const [fys, setFys]         = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]       = useState(EMPTY());

  const load = useCallback(async () => {
    if (!currentDb) return;
    setLoading(true);
    try { const r = await api.getFiscalYears({ dbPath: currentDb }); if (r.success) setFys(r.data); }
    finally { setLoading(false); }
  }, [currentDb]);

  useEffect(() => { load(); }, [load, dbInfo?.lastRefresh]);

  async function handleSave() {
    if (!form.FYearName || !form.StartDate || !form.EndDate) { showNotification(isUrdu?'تمام لازمی فیلڈ بھریں':'Fill all required fields', 'error'); return; }
    setSaving(true);
    try {
      const res = await api.saveFiscalYear({ dbPath: currentDb, fy: form });
      if (res.success) { showNotification(isUrdu?'مالی سال محفوظ':'Fiscal year saved', 'success'); setShowForm(false); load(); }
      else showNotification(res.error || 'Save failed', 'error');
    } finally { setSaving(false); }
  }

  const statusBadge = s => {
    const cfg = { Open: ['var(--emerald)','rgba(16,185,129,0.12)'], Closed: ['var(--rose)','rgba(244,63,94,0.1)'] };
    const [color, bg] = cfg[s] || ['var(--text-muted)','var(--bg-card)'];
    return <span style={{ fontSize:11, padding:'2px 8px', borderRadius:12, background:bg, color }}>{s === 'Open' ? (isUrdu?'کھلا':'Open') : (isUrdu?'بند':'Closed')}</span>;
  };

  return (
    <div className="page" dir={dir}>
      <div className="page-header">
        <div><h1 className="page-title">{isUrdu?'مالی سال':'Fiscal Years'}</h1><p className="page-subtitle">{isUrdu?'مالی سال ترتیب دیں':'Configure fiscal years for your enterprise'}</p></div>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={() => { setForm(EMPTY()); setShowForm(true); }} disabled={!currentDb}><Plus size={14} />{isUrdu?'نیا مالی سال':'New Fiscal Year'}</button>
          <button className="btn btn-secondary" onClick={load} disabled={loading}><RefreshCw size={14} className={loading?'spin':''} /></button>
        </div>
      </div>

      {!currentDb ? <div className="empty-state"><div className="empty-state-icon"><Calendar size={40} /></div><h3>{isUrdu?'ڈیٹا بیس منتخب نہیں':'No Database Selected'}</h3></div>
      : loading ? <div className="empty-state"><div className="loading-spinner" style={{ margin:'0 auto' }} /></div>
      : <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr><th>{isUrdu?'مالی سال':'Fiscal Year'}</th><th>{isUrdu?'شروع':'Start Date'}</th><th>{isUrdu?'ختم':'End Date'}</th><th>{isUrdu?'حالت':'Status'}</th><th style={{ width:80 }}></th></tr></thead>
            <tbody>
              {fys.length === 0 ? <tr><td colSpan={5} style={{ textAlign:'center', color:'var(--text-muted)', padding:32 }}>{isUrdu?'کوئی مالی سال نہیں':'No fiscal years configured'}</td></tr>
              : fys.map(fy => (
                <tr key={fy.FYearID}>
                  <td className="account-name">{fy.FYearName}</td>
                  <td>{fmtD(fy.StartDate)}</td>
                  <td>{fmtD(fy.EndDate)}</td>
                  <td>{statusBadge(fy.Status)}</td>
                  <td><button className="btn-icon" onClick={() => { setForm(fy); setShowForm(true); }}><Edit2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>}

      {showForm && <div className="modal-overlay" onClick={() => setShowForm(false)}><div className="modal-box" onClick={e => e.stopPropagation()} dir={dir} style={{ maxWidth:480 }}><div className="modal-header"><h3>{form.FYearID?(isUrdu?'مالی سال ترمیم':'Edit Fiscal Year'):(isUrdu?'نیا مالی سال':'New Fiscal Year')}</h3><button className="btn-icon" onClick={() => setShowForm(false)}><X size={16} /></button></div><div className="modal-body"><div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        <div className="field-group"><label>{isUrdu?'نام *':'Name *'}</label><input type="text" className="input-field" value={form.FYearName||''} placeholder="e.g. FY 2025-26" onChange={e => setForm(f => ({ ...f, FYearName: e.target.value }))} /></div>
        <div className="field-group"><label>{isUrdu?'شروع تاریخ *':'Start Date *'}</label><input type="date" className="input-field" value={form.StartDate||''} onChange={e => setForm(f => ({ ...f, StartDate: e.target.value }))} /></div>
        <div className="field-group"><label>{isUrdu?'ختم تاریخ *':'End Date *'}</label><input type="date" className="input-field" value={form.EndDate||''} onChange={e => setForm(f => ({ ...f, EndDate: e.target.value }))} /></div>
        <div className="field-group"><label>{isUrdu?'حالت':'Status'}</label><select className="select-field" value={form.Status||'Open'} onChange={e => setForm(f => ({ ...f, Status: e.target.value }))}><option value="Open">{isUrdu?'کھلا':'Open'}</option><option value="Closed">{isUrdu?'بند':'Closed'}</option></select></div>
      </div></div><div className="modal-footer"><button className="btn btn-ghost" onClick={() => setShowForm(false)} disabled={saving}>{isUrdu?'منسوخ':'Cancel'}</button><button className="btn btn-primary" onClick={handleSave} disabled={saving}><Save size={13} />{saving?'…':(isUrdu?'محفوظ کریں':'Save')}</button></div></div></div>}
    </div>
  );
}
