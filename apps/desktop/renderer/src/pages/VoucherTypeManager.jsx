import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, X, Save, RefreshCw, Tag } from 'lucide-react';
import { useLang } from '../context/LanguageContext';

const api = window.electronAPI;

const EMPTY_VT = () => ({ VTYPE: '', VTITLE: '', UVTITLE: '' });

function cleanStr(s) { return (s || '').replace(/^'+|'+$/g, '').replace(/\s+/g, ' ').trim(); }

export default function VoucherTypeManager({ currentDb, dbInfo, showNotification }) {
  const { t, isUrdu } = useLang();
  const dir = isUrdu ? 'rtl' : 'ltr';

  const [vtypes,        setVtypes]        = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [showForm,      setShowForm]      = useState(false);
  const [form,          setForm]          = useState(EMPTY_VT());
  const [isEdit,        setIsEdit]        = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleting,      setDeleting]      = useState(false);

  const load = useCallback(async () => {
    if (!currentDb || !api) return;
    setLoading(true);
    try {
      const res = await api.getVoucherTypes(currentDb);
      if (res.success) setVtypes(res.data || []);
      else showNotification(res.error || 'Failed to load', 'error');
    } finally { setLoading(false); }
  }, [currentDb]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load, dbInfo?.lastRefresh]);

  function openNew()    { setForm(EMPTY_VT()); setIsEdit(false); setShowForm(true); }
  function openEdit(vt) {
    setForm({ VTYPE: String(vt.VTYPE), VTITLE: cleanStr(vt.VTITLE), UVTITLE: cleanStr(vt.UVTITLE || '') });
    setIsEdit(true);
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.VTYPE || !form.VTITLE) {
      showNotification(isUrdu ? 'کوڈ اور نام درج کریں' : 'Enter code and name', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await api.saveVoucherType({
        dbPath: currentDb,
        vt: {
          VTYPE:  Number(form.VTYPE),
          VTITLE: form.VTITLE.trim(),
          UVTITLE: form.UVTITLE.trim(),
          isEdit,
        },
      });
      if (res.success) {
        showNotification(isEdit ? (isUrdu ? 'اپ ڈیٹ ہو گیا' : 'Updated') : (isUrdu ? 'محفوظ ہو گیا' : 'Saved'), 'success');
        setShowForm(false); load();
      } else showNotification(res.error || 'Failed', 'error');
    } finally { setSaving(false); }
  }

  async function handleDelete(VTYPE) {
    setDeleting(true);
    try {
      const res = await api.deleteVoucherType({ dbPath: currentDb, VTYPE });
      if (res.success) {
        showNotification(isUrdu ? 'حذف ہو گیا' : 'Deleted', 'success');
        setDeleteConfirm(null); load();
      } else showNotification(res.error || 'Cannot delete', 'error');
    } finally { setDeleting(false); }
  }

  return (
    <div className="page" dir={dir}>
      <div className="page-header">
        <div>
          <h1 className="page-title">{isUrdu ? 'وصول نامہ اقسام' : 'Voucher Types'}</h1>
          <p className="page-subtitle">
            {isUrdu
              ? 'وصول نامہ اقسام صرف درجہ بندی کے لیے — ڈیبٹ/کریڈٹ پوسٹنگ اکاؤنٹ لائنوں سے طے ہوتی ہے'
              : 'Voucher types are for classification only — Dr/Cr posting is determined by account lines, not the type'}
          </p>
        </div>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={openNew} disabled={!currentDb}>
            <Plus size={14} /> {isUrdu ? 'نئی قسم' : 'New Type'}
          </button>
          <button className="btn btn-secondary" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> {t.refresh}
          </button>
        </div>
      </div>

      {!currentDb ? (
        <div className="empty-state">
          <div className="empty-state-icon">📂</div>
          <h3>{t.noDatabaseSelected}</h3>
        </div>
      ) : loading ? (
        <div className="empty-state"><div className="loading-spinner" style={{ margin: '0 auto' }} /></div>
      ) : (
        <>
          {/* ── Info banner ── */}
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px',
            background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
            borderRadius: 8, marginBottom: 14, fontSize: 13, color: 'var(--text-secondary)',
          }}>
            <Tag size={16} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 1 }} />
            <span>
              {isUrdu
                ? 'وصول نامہ قسم صرف لیبل ہے — فلٹرنگ اور رپورٹنگ کے لیے۔ پوسٹنگ ہمیشہ ڈیبٹ/کریڈٹ اکاؤنٹ اور رقم سے طے ہوتی ہے۔ کسٹمر و سپلائر اکاؤنٹس ان کے پروفائل میں مقرر کریں۔'
                : 'Voucher type is a label only — used for filtering and reporting. Posting is always determined by the Dr/Cr accounts and amounts entered on each line. Customer & supplier accounts are set in their own profiles.'}
            </span>
          </div>

          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 80 }}>{isUrdu ? 'کوڈ' : 'Code'}</th>
                  <th>{isUrdu ? 'انگریزی نام' : 'English Name'}</th>
                  <th>{isUrdu ? 'اردو نام' : 'Urdu Name'}</th>
                  <th style={{ width: 80 }}>{isUrdu ? 'عمل' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody>
                {vtypes.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
                      {isUrdu ? 'کوئی اقسام نہیں' : 'No voucher types defined'}
                    </td>
                  </tr>
                ) : vtypes.map(vt => (
                  <tr key={vt.VTYPE}>
                    <td><span className="vtype-code-pill">{vt.VTYPE}</span></td>
                    <td className="account-name">{cleanStr(vt.VTITLE)}</td>
                    <td style={{ fontFamily: "'Noto Nastaliq Urdu',serif", fontSize: 12, direction: 'rtl' }}>
                      {cleanStr(vt.UVTITLE || '')}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 5, justifyContent: 'center' }}>
                        <button className="btn-icon" onClick={() => openEdit(vt)} title={isUrdu ? 'ترمیم' : 'Edit'}>
                          <Edit2 size={13} />
                        </button>
                        <button className="btn-icon btn-icon-danger" onClick={() => setDeleteConfirm(vt.VTYPE)} title={isUrdu ? 'حذف' : 'Delete'}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Usage guide ── */}
          <div className="settings-section" style={{ marginTop: 18 }}>
            <h3>{isUrdu ? 'استعمال کا طریقہ' : 'How Voucher Types Work'}</h3>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 2 }}>
              <p>
                {isUrdu
                  ? '• وصول نامہ قسم کوڈ صرف درجہ بندی — مثلاً 201 = جرنل، 301 = خرید، 401 = فروخت'
                  : '• Voucher type code is classification only — e.g. 201 = Journal, 301 = Purchase, 401 = Sales'}
              </p>
              <p>
                {isUrdu
                  ? '• پوسٹنگ (ڈیبٹ/کریڈٹ) ہر وصول نامہ لائن کے اکاؤنٹ اور رقم سے طے ہوتی ہے'
                  : '• Posting (Dr/Cr) is determined by the account and amount on each voucher line'}
              </p>
              <p>
                {isUrdu
                  ? '• کسٹمر اکاؤنٹ: کسٹمر پروفائل میں "منسلک اکاؤنٹ" سیٹ کریں'
                  : '• Customer account: set "Linked Account" in the customer profile'}
              </p>
              <p>
                {isUrdu
                  ? '• سپلائر اکاؤنٹ: سپلائر پروفائل میں "منسلک اکاؤنٹ" سیٹ کریں'
                  : '• Supplier account: set "Linked Account" in the supplier profile'}
              </p>
              <p>
                {isUrdu
                  ? '• خرید/فروخت انوائس پوسٹ ہونے پر اکاؤنٹنگ خود بخود ہوتی ہے'
                  : '• Purchase/Sales invoice posting creates accounting entries automatically'}
              </p>
            </div>
          </div>
        </>
      )}

      {/* ── Delete Confirm ── */}
      {deleteConfirm !== null && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} dir={dir}>
            <div className="modal-header">
              <h3>{isUrdu ? 'حذف کریں؟' : 'Delete voucher type?'}</h3>
              <button className="btn-icon" onClick={() => setDeleteConfirm(null)}><X size={15} /></button>
            </div>
            <div style={{ padding: '16px 20px', color: 'var(--text-muted)', fontSize: 13 }}>
              {isUrdu ? `کوڈ ${deleteConfirm} حذف ہو جائے گا۔` : `Voucher type ${deleteConfirm} will be deleted.`}
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

      {/* ── VT Form Modal ── */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-box" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()} dir={dir}>
            <div className="modal-header">
              <h3>
                {isEdit
                  ? (isUrdu ? 'وصول نامہ قسم ترمیم' : 'Edit Voucher Type')
                  : (isUrdu ? 'نئی وصول نامہ قسم' : 'New Voucher Type')}
              </h3>
              <button className="btn-icon" onClick={() => setShowForm(false)}><X size={16} /></button>
            </div>
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="field-group">
                <label>{isUrdu ? 'کوڈ (نمبر) *' : 'Code (number) *'}</label>
                <input
                  type="number" className="input-field"
                  value={form.VTYPE} disabled={isEdit}
                  placeholder={isUrdu ? 'مثال: 205' : 'e.g. 205'}
                  onChange={e => setForm(f => ({ ...f, VTYPE: e.target.value }))}
                />
              </div>
              <div className="field-group">
                <label>{isUrdu ? 'انگریزی نام *' : 'English Name *'}</label>
                <input
                  type="text" className="input-field"
                  value={form.VTITLE} placeholder="Cash Receipt"
                  onChange={e => setForm(f => ({ ...f, VTITLE: e.target.value }))}
                />
              </div>
              <div className="field-group">
                <label>{isUrdu ? 'اردو نام' : 'Urdu Name'}</label>
                <input
                  type="text" className="input-field"
                  value={form.UVTITLE} placeholder="نقد وصولی"
                  dir="rtl" style={{ fontFamily: "'Noto Nastaliq Urdu',serif" }}
                  onChange={e => setForm(f => ({ ...f, UVTITLE: e.target.value }))}
                />
              </div>
              <div style={{
                padding: '8px 12px', background: 'var(--accent-dim)',
                border: '1px solid rgba(99,102,241,0.2)', borderRadius: 8, fontSize: 12,
                color: 'var(--text-secondary)',
              }}>
                <Tag size={12} style={{ display: 'inline', marginInlineEnd: 4 }} />
                {isUrdu
                  ? 'یہ قسم صرف لیبل ہے — پوسٹنگ وصول نامہ اندراج کے اکاؤنٹس سے طے ہوتی ہے'
                  : 'This type is a label only — posting is determined by the accounts entered on the voucher'}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowForm(false)} disabled={saving}>{t.clear}</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                <Save size={13} />
                {saving ? '…' : (isEdit ? (isUrdu ? 'اپ ڈیٹ' : 'Update') : (isUrdu ? 'محفوظ کریں' : 'Save'))}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
