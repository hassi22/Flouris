import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, X, Save, RefreshCw, AlertTriangle } from 'lucide-react';
import { useLang } from '../context/LanguageContext';

const api = window.electronAPI;
const EMPTY_GRP = () => ({ SubAccID: null, AccountID: '', SubAccountNAme: '', SubAccountNAmeU: '' });

function cleanStr(s) { return (s || '').replace(/^'+|'+$/g, '').replace(/\s+/g, ' ').trim(); }

export default function GroupManager({ currentDb, dbInfo, showNotification }) {
  const { t, isUrdu } = useLang();
  const dir = isUrdu ? 'rtl' : 'ltr';

  const [groups,              setGroups]              = useState([]);
  const [heads,               setHeads]               = useState([]);  // tblAccHead rows
  const [loading,             setLoading]             = useState(false);
  const [saving,              setSaving]              = useState(false);
  const [showForm,            setShowForm]            = useState(false);
  const [form,                setForm]                = useState(EMPTY_GRP());
  const [isEdit,              setIsEdit]              = useState(false);
  const [deleteConfirm,       setDeleteConfirm]       = useState(null);
  const [deleting,            setDeleting]            = useState(false);
  const [unclassified,        setUnclassified]        = useState([]);   // groups with no valid head

  const HEAD_LABELS    = { 1: 'Capital / Equity', 2: 'Liabilities', 3: 'Assets', 4: 'Sales & Revenue', 5: 'Expenses' };
  const HEAD_LABELS_UR = { 1: 'سرمایہ', 2: 'واجبات', 3: 'اثاثے', 4: 'آمدنی', 5: 'اخراجات' };
  const headName = (id) => isUrdu ? (HEAD_LABELS_UR[id] || `Head ${id}`) : (HEAD_LABELS[id] || `Head ${id}`);

  const load = useCallback(async () => {
    if (!currentDb || !api) return;
    setLoading(true);
    try {
      const [groupsRes, unclassRes] = await Promise.all([
        api.getAccountHeads(currentDb),
        api.findUnclassifiedGroups(currentDb),
      ]);
      if (groupsRes.success) {
        setGroups(groupsRes.data || []);
        setHeads(groupsRes.heads || []);
      } else showNotification(groupsRes.error || 'Failed', 'error');
      if (unclassRes.success) setUnclassified(unclassRes.data || []);
    } finally { setLoading(false); }
  }, [currentDb]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load, dbInfo?.lastRefresh]);

  function openNew()     { setForm(EMPTY_GRP()); setIsEdit(false); setShowForm(true); }
  function openEdit(g)   {
    setForm({ SubAccID: g.SubAccID, AccountID: String(g.AccountID), SubAccountNAme: cleanStr(g.SubAccountNAme), SubAccountNAmeU: cleanStr(g.SubAccountNAmeU || '') });
    setIsEdit(true); setShowForm(true);
  }

  async function handleSave() {
    if (!form.SubAccountNAme.trim()) {
      showNotification(isUrdu ? 'گروپ کا نام درج کریں' : 'Enter group name', 'error');
      return;
    }
    if (form.AccountID === '' || form.AccountID === null || Number.isNaN(Number(form.AccountID))) {
      showNotification(isUrdu ? 'سیکشن منتخب کریں' : 'Select a section for this group', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await api.saveAccountGroup({
        dbPath: currentDb,
        group: { SubAccID: form.SubAccID, AccountID: Number(form.AccountID) || 0, SubAccountNAme: form.SubAccountNAme.trim(), SubAccountNAmeU: form.SubAccountNAmeU.trim(), isEdit },
      });
      if (res.success) {
        showNotification(isEdit ? (isUrdu ? 'اپ ڈیٹ ہو گیا' : 'Updated') : (isUrdu ? 'گروپ شامل ہو گیا' : 'Group added'), 'success');
        setShowForm(false); load();
      } else showNotification(res.error || 'Failed', 'error');
    } finally { setSaving(false); }
  }

  async function handleDelete(SubAccID) {
    setDeleting(true);
    try {
      const res = await api.deleteAccountGroup({ dbPath: currentDb, SubAccID });
      if (res.success) {
        showNotification(isUrdu ? 'گروپ حذف ہو گیا' : 'Group deleted', 'success');
        setDeleteConfirm(null); load();
      } else showNotification(res.error || 'Cannot delete', 'error');
    } finally { setDeleting(false); }
  }

  // Group groups by head section
  const byHead = {};
  for (const g of groups) {
    const hid = g.AccountID || 0;
    if (!byHead[hid]) byHead[hid] = [];
    byHead[hid].push(g);
  }

  return (
    <div className="page" dir={dir}>
      <div className="page-header">
        <div>
          <h1 className="page-title">{isUrdu ? 'اکاؤنٹ گروپس' : 'Account Groups'}</h1>
          <p className="page-subtitle">{isUrdu ? 'اکاؤنٹ ذیلی گروپس شامل، ترمیم یا حذف کریں' : 'Manage sub-account groups used to classify all accounts'}</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={openNew} disabled={!currentDb}><Plus size={14} /> {isUrdu ? 'نیا گروپ' : 'New Group'}</button>
          <button className="btn btn-secondary" onClick={load} disabled={loading}><RefreshCw size={14} className={loading ? 'spin' : ''} /> {t.refresh}</button>
        </div>
      </div>

      {!currentDb ? (
        <div className="empty-state"><div className="empty-state-icon">📂</div><h3>{t.noDatabaseSelected}</h3></div>
      ) : loading ? (
        <div className="empty-state"><div className="loading-spinner" style={{ margin: '0 auto' }} /></div>
      ) : (
        <>
          {/* ── Warning: groups with no valid section assigned ── */}
          {unclassified.length > 0 && (
            <div className="error-banner" style={{ display:'flex', alignItems:'flex-start', gap:10, marginBottom:14 }}>
              <AlertTriangle size={16} style={{ flexShrink:0, marginTop:2 }} />
              <div>
                <strong>
                  {isUrdu
                    ? `${unclassified.length} گروپس کا کوئی سیکشن نہیں — یہ بیلنس شیٹ / نفع و نقصان میں نظر نہیں آئیں گے`
                    : `${unclassified.length} group(s) have no section assigned — they are invisible on Balance Sheet / P&L`}
                </strong>
                <ul style={{ margin:'6px 0 0', paddingInlineStart:18, fontSize:12 }}>
                  {unclassified.map(g => (
                    <li key={g.SubAccID} style={{ marginBottom:2 }}>
                      <strong>#{g.SubAccID}</strong> {cleanStr(g.SubAccountNAme)}
                      {' — '}
                      <button
                        className="btn btn-ghost"
                        style={{ padding:'1px 8px', fontSize:11 }}
                        onClick={() => {
                          setForm({ SubAccID: g.SubAccID, AccountID: '', SubAccountNAme: cleanStr(g.SubAccountNAme), SubAccountNAmeU: '' });
                          setIsEdit(true); setShowForm(true);
                        }}
                      >
                        {isUrdu ? 'ٹھیک کریں' : 'Fix'}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          {[1, 2, 3, 4, 5].map(hid => {
            const sectionGroups = byHead[hid];
            if (!sectionGroups?.length) return null;
            return (
              <div key={hid} style={{ marginBottom: 16 }}>
                <div className="tb-section-head" style={{ marginBottom: 6 }}>
                  <span className="tb-section-label">{headName(hid)}</span>
                </div>
                <div className="data-table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th style={{ width: 70 }}>ID</th>
                        <th>{isUrdu ? 'انگریزی نام' : 'English Name'}</th>
                        <th>{isUrdu ? 'اردو نام' : 'Urdu Name'}</th>
                        <th style={{ width: 80 }}>{isUrdu ? 'عمل' : 'Actions'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sectionGroups.map(g => (
                        <tr key={g.SubAccID}>
                          <td style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>{g.SubAccID}</td>
                          <td className="account-name">{cleanStr(g.SubAccountNAme)}</td>
                          <td style={{ fontFamily: "'Noto Nastaliq Urdu',serif", fontSize: 12, direction: 'rtl' }}>{cleanStr(g.SubAccountNAmeU || '')}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 5, justifyContent: 'center' }}>
                              <button className="btn-icon" onClick={() => openEdit(g)} title={isUrdu ? 'ترمیم' : 'Edit'}><Edit2 size={13} /></button>
                              <button className="btn-icon btn-icon-danger" onClick={() => setDeleteConfirm(g.SubAccID)} title={isUrdu ? 'حذف' : 'Delete'}><Trash2 size={13} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
          {Object.keys(byHead).length === 0 && (
            <div className="empty-state"><div className="empty-state-icon">📋</div><h3>{t.noData}</h3></div>
          )}
        </>
      )}

      {/* Delete confirm */}
      {deleteConfirm !== null && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} dir={dir}>
            <div className="modal-header">
              <h3>{isUrdu ? 'گروپ حذف کریں؟' : 'Delete group?'}</h3>
              <button className="btn-icon" onClick={() => setDeleteConfirm(null)}><X size={15} /></button>
            </div>
            <div style={{ padding: '16px 20px', color: 'var(--text-muted)', fontSize: 13 }}>
              {isUrdu ? 'گروپ حذف ہو جائے گا۔ اگر اس کے تحت اکاؤنٹس ہیں تو حذف نہیں ہو گا۔' : 'Group will be deleted. Cannot delete if accounts are assigned to it.'}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setDeleteConfirm(null)} disabled={deleting}>{t.clear}</button>
              <button className="btn btn-danger" onClick={() => handleDelete(deleteConfirm)} disabled={deleting}>
                <Trash2 size={13} /> {deleting ? '…' : (isUrdu ? 'حذف کریں' : 'Delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Group form modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-box" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()} dir={dir}>
            <div className="modal-header">
              <h3>{isEdit ? (isUrdu ? 'گروپ ترمیم' : 'Edit Group') : (isUrdu ? 'نیا گروپ' : 'New Group')}</h3>
              <button className="btn-icon" onClick={() => setShowForm(false)}><X size={16} /></button>
            </div>
            <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div className="field-group" style={{ gridColumn: 'span 2' }}>
                <label>{isUrdu ? 'سیکشن (بڑا گروپ)' : 'Section (Head)'} *</label>
                <select className="select-field" value={form.AccountID}
                  onChange={e => setForm(f => ({ ...f, AccountID: e.target.value }))}>
                  <option value="">{isUrdu ? '— سیکشن منتخب کریں —' : '— Select Section —'}</option>
                  {heads.length > 0
                    ? heads.map(h => <option key={h.id} value={h.id}>{h.id}. {h.name}</option>)
                    : [1,2,3,4,5].map(i => <option key={i} value={i}>{i}. {HEAD_LABELS[i]}</option>)
                  }
                </select>
              </div>
              <div className="field-group">
                <label>{isUrdu ? 'انگریزی نام' : 'English Name'} *</label>
                <input type="text" className="input-field" value={form.SubAccountNAme}
                  placeholder="Purchase Parties"
                  onChange={e => setForm(f => ({ ...f, SubAccountNAme: e.target.value }))} />
              </div>
              <div className="field-group">
                <label>{isUrdu ? 'اردو نام' : 'Urdu Name'}</label>
                <input type="text" className="input-field" value={form.SubAccountNAmeU}
                  placeholder="خرید پارٹیز" dir="rtl"
                  style={{ fontFamily: "'Noto Nastaliq Urdu',serif" }}
                  onChange={e => setForm(f => ({ ...f, SubAccountNAmeU: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowForm(false)} disabled={saving}>{t.clear}</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                <Save size={13} /> {saving ? '…' : (isEdit ? (isUrdu ? 'اپ ڈیٹ' : 'Update') : (isUrdu ? 'محفوظ کریں' : 'Save Group'))}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
