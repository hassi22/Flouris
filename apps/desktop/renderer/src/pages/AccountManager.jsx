import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, X, Save, Search, RefreshCw } from 'lucide-react';
import { useLang } from '../context/LanguageContext';

const api = window.electronAPI;

const EMPTY_ACCOUNT = () => ({
  CA: null, SubAccID: '', AC_TITLE1: '', UAC_Title: '', Cell1: '', Remarks: '', Role: '',
});

function cleanStr(s) { return (s || '').replace(/^'+|'+$/g,'').replace(/\s+/g,' ').trim(); }

export default function AccountManager({ currentDb, dbInfo, showNotification }) {
  const { t, isUrdu } = useLang();
  const dir = isUrdu ? 'rtl' : 'ltr';

  const [accounts,      setAccounts]      = useState([]);
  const [subAccounts,   setSubAccounts]   = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [showForm,      setShowForm]      = useState(false);
  const [form,          setForm]          = useState(EMPTY_ACCOUNT());
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleting,      setDeleting]      = useState(false);
  const [search,        setSearch]        = useState('');
  const [filterSubAcc,  setFilterSubAcc]  = useState('');

  const load = useCallback(async () => {
    if (!currentDb || !api) return;
    setLoading(true);
    try {
      const [acRes, subRes] = await Promise.all([
        api.getChartOfAccounts(currentDb),
        api.getSubAccounts(currentDb),
      ]);
      if (acRes.success)  setAccounts(acRes.data);
      if (subRes.success) setSubAccounts(subRes.data);
    } finally { setLoading(false); }
  }, [currentDb]);

  useEffect(() => { load(); }, [load, dbInfo?.lastRefresh]);

  function openNew() {
    setForm(EMPTY_ACCOUNT());
    setShowForm(true);
  }

  function openEdit(ac) {
    setForm({
      CA:        ac.CA,
      SubAccID:  String(ac.SubAccID || ''),
      AC_TITLE1: ac.AC_TITLE1 || '',
      UAC_Title: ac.UAC_TITLE || ac.UAC_Title || '',
      Cell1:     ac.Cell1 || '',
      Remarks:   cleanStr(ac.Remarks),
      Role:      ac.Role || '',
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.AC_TITLE1.trim()) {
      showNotification(isUrdu ? 'اکاؤنٹ کا نام درج کریں' : 'Enter account name', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await api.saveAccount({
        dbPath: currentDb,
        account: {
          CA:        form.CA || undefined,
          SubAccID:  Number(form.SubAccID) || 0,
          AC_TITLE1: form.AC_TITLE1.trim(),
          UAC_Title: form.UAC_Title.trim(),
          Cell1:     form.Cell1.trim(),
          Remarks:   form.Remarks.trim(),
          Role:      form.Role || null,
        },
      });
      if (res.success) {
        showNotification(
          form.CA
            ? (isUrdu ? 'اکاؤنٹ اپ ڈیٹ ہو گیا' : 'Account updated')
            : (isUrdu ? 'اکاؤنٹ شامل ہو گیا' : 'Account added'),
          'success'
        );
        setShowForm(false);
        load();
      } else {
        showNotification(res.error || 'Failed to save', 'error');
      }
    } finally { setSaving(false); }
  }

  async function handleDelete(CA) {
    setDeleting(true);
    try {
      const res = await api.deleteAccount({ dbPath: currentDb, CA });
      if (res.success) {
        showNotification(isUrdu ? 'اکاؤنٹ حذف ہو گیا' : 'Account deleted', 'success');
        setDeleteConfirm(null);
        load();
      } else {
        showNotification(res.error || 'Cannot delete', 'error');
      }
    } finally { setDeleting(false); }
  }

  const subAccMap = new Map(subAccounts.map(s => [s.SubAccID, s]));

  const filtered = accounts.filter(ac => {
    const s = search.toLowerCase();
    const matchSearch = !s ||
      (ac.AC_TITLE1||'').toLowerCase().includes(s) ||
      (ac.UAC_TITLE||ac.UAC_Title||'').toLowerCase().includes(s) ||
      String(ac.CA).includes(s);
    const matchSub = !filterSubAcc || String(ac.SubAccID) === filterSubAcc;
    return matchSearch && matchSub;
  });

  const headGroups = [...new Set(subAccounts.map(s => s.headName).filter(Boolean))];

  return (
    <div className="page" dir={dir}>
      <div className="page-header">
        <div>
          <h1 className="page-title">{isUrdu ? 'اکاؤنٹس / پارٹیز' : 'Accounts / Parties'}</h1>
          <p className="page-subtitle">{isUrdu ? 'اکاؤنٹس شامل، ترمیم یا حذف کریں' : 'Add, edit or delete accounts and parties'}</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={openNew} disabled={!currentDb}>
            <Plus size={14} /> {isUrdu ? 'نیا اکاؤنٹ' : 'New Account'}
          </button>
          <button className="btn btn-secondary" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> {t.refresh}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="report-controls" style={{ marginBottom:14 }}>
        <select className="select-field" style={{ minWidth:180 }} value={filterSubAcc}
          onChange={e => setFilterSubAcc(e.target.value)}>
          <option value="">{isUrdu ? '— تمام گروپس —' : '— All Groups —'}</option>
          {subAccounts.map(s => (
            <option key={s.SubAccID} value={String(s.SubAccID)}>
              {s.headName ? `${s.headName} / ` : ''}{s.SubAccountNAme}
            </option>
          ))}
        </select>
        <div style={{ flex:1 }} />
        <div style={{ position:'relative' }}>
          <Search size={13} style={{ position:'absolute', [isUrdu?'right':'left']:10, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)' }} />
          <input
            type="text" className="input-field"
            placeholder={isUrdu ? 'نام یا نمبر سے تلاش…' : 'Search by name or A/C #…'}
            style={{ [isUrdu?'paddingRight':'paddingLeft']:30, width:280 }}
            value={search} onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {!currentDb ? (
        <div className="empty-state"><div className="empty-state-icon">📂</div><h3>{t.noDatabaseSelected}</h3></div>
      ) : loading ? (
        <div className="empty-state"><div className="loading-spinner" style={{ margin:'0 auto' }} /></div>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width:65 }}>{isUrdu ? 'نمبر' : 'A/C #'}</th>
                <th>{isUrdu ? 'انگریزی نام' : 'English Name'}</th>
                <th>{isUrdu ? 'اردو نام' : 'Urdu Name'}</th>
                <th style={{ width:180 }}>{isUrdu ? 'گروپ' : 'Group'}</th>
                <th style={{ width:90 }}>{isUrdu ? 'کردار' : 'Role'}</th>
                <th style={{ width:120 }}>{isUrdu ? 'موبائل' : 'Mobile'}</th>
                <th style={{ width:80 }}>{isUrdu ? 'عمل' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign:'center', color:'var(--text-muted)', padding:36 }}>
                  {isUrdu ? 'کوئی اکاؤنٹ نہیں ملا' : 'No accounts found'}
                </td></tr>
              ) : filtered.map(ac => {
                const sub = subAccMap.get(ac.SubAccID);
                    const roleLabel = ac.Role === 'cash' ? '💵 Cash/Bank'
                      : ac.Role === 'purchase' ? '🛒 Purchase'
                      : ac.Role === 'sales'    ? '🏷 Sales'
                      : ac.Role === 'customer' ? '👤 Customer'
                      : ac.Role === 'supplier' ? '🏭 Supplier'
                      : '';
                return (
                  <tr key={ac.CA}>
                    <td style={{ color:'var(--text-muted)', fontFamily:'monospace' }}>{ac.CA}</td>
                    <td className="account-name">{ac.AC_TITLE1}</td>
                    <td style={{ fontFamily:"'Noto Nastaliq Urdu',serif", fontSize:12, direction:'rtl' }}>
                      {ac.UAC_TITLE || ac.UAC_Title || '—'}
                    </td>
                    <td style={{ fontSize:12, color:'var(--text-secondary)' }}>
                      {sub ? `${sub.headName || ''} / ${sub.SubAccountNAme}` : '—'}
                    </td>
                    <td style={{ fontSize:11 }}>
                      {roleLabel && <span style={{ background:'var(--accent-muted,#e8f4fd)', borderRadius:4, padding:'2px 6px' }}>{roleLabel}</span>}
                    </td>
                    <td style={{ fontSize:12, color:'var(--text-muted)' }}>{ac.Cell1 || '—'}</td>
                    <td>
                      <div style={{ display:'flex', gap:5, justifyContent:'center' }}>
                        <button className="btn-icon" title={isUrdu?'ترمیم':'Edit'} onClick={() => openEdit(ac)}>
                          <Edit2 size={13} />
                        </button>
                        <button className="btn-icon btn-icon-danger" title={isUrdu?'حذف':'Delete'} onClick={() => setDeleteConfirm(ac.CA)}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ padding:'8px 14px', fontSize:11, color:'var(--text-muted)', borderTop:'1px solid var(--border)' }}>
            {isUrdu ? `${filtered.length} اکاؤنٹس` : `${filtered.length} accounts`}
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteConfirm !== null && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} dir={dir}>
            <div className="modal-header">
              <h3>{isUrdu ? 'اکاؤنٹ حذف کریں؟' : 'Delete Account?'}</h3>
              <button className="btn-icon" onClick={() => setDeleteConfirm(null)}><X size={15} /></button>
            </div>
            <div style={{ padding:'16px 20px', color:'var(--text-muted)', fontSize:13 }}>
              {isUrdu
                ? `A/C #${deleteConfirm} حذف ہو جائے گا۔ اگر اس کی کوئی لین دین ہیں تو حذف نہیں ہو گا۔`
                : `A/C #${deleteConfirm} will be deleted. Accounts with existing transactions cannot be deleted.`}
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

      {/* Account Form Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-box" style={{ maxWidth:540 }} onClick={e => e.stopPropagation()} dir={dir}>
            <div className="modal-header">
              <h3>{form.CA ? (isUrdu ? `اکاؤنٹ ترمیم — #${form.CA}` : `Edit Account — #${form.CA}`) : (isUrdu ? 'نیا اکاؤنٹ' : 'New Account')}</h3>
              <button className="btn-icon" onClick={() => setShowForm(false)}><X size={16} /></button>
            </div>

            <div style={{ padding:'16px 20px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div className="field-group" style={{ gridColumn:'span 2' }}>
                <label>{isUrdu ? 'اکاؤنٹ گروپ' : 'Account Group'}</label>
                <select className="select-field" value={form.SubAccID}
                  onChange={e => setForm(f => ({ ...f, SubAccID: e.target.value }))}>
                  <option value="">{isUrdu ? '— گروپ منتخب کریں —' : '— Select Group —'}</option>
                  {subAccounts.map(s => (
                    <option key={s.SubAccID} value={String(s.SubAccID)}>
                      {s.headName ? `${s.headName} › ` : ''}{s.SubAccountNAme}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field-group">
                <label>{isUrdu ? 'انگریزی نام' : 'English Name'} *</label>
                <input type="text" className="input-field" value={form.AC_TITLE1}
                  placeholder="Cash In Hand"
                  onChange={e => setForm(f => ({ ...f, AC_TITLE1: e.target.value }))} />
              </div>
              <div className="field-group">
                <label>{isUrdu ? 'اردو نام' : 'Urdu Name'}</label>
                <input type="text" className="input-field" value={form.UAC_Title}
                  placeholder="نقد رقم"
                  dir="rtl"
                  style={{ fontFamily:"'Noto Nastaliq Urdu',serif" }}
                  onChange={e => setForm(f => ({ ...f, UAC_Title: e.target.value }))} />
              </div>
              <div className="field-group">
                <label>{isUrdu ? 'موبائل نمبر' : 'Mobile No.'}</label>
                <input type="text" className="input-field" value={form.Cell1}
                  placeholder="+92 300 0000000"
                  onChange={e => setForm(f => ({ ...f, Cell1: e.target.value }))} />
              </div>
              <div className="field-group">
                <label>{isUrdu ? 'کردار (رول)' : 'Account Role'}</label>
                <select className="select-field" value={form.Role || ''}
                  onChange={e => setForm(f => ({ ...f, Role: e.target.value }))}>
                  <option value="">{isUrdu ? '— عام اکاؤنٹ —' : '— Normal (no role) —'}</option>
                  <option value="cash">{isUrdu ? '💵 نقد / بینک' : '💵 Cash or Bank'}</option>
                  <option value="purchase">{isUrdu ? '🛒 خرید' : '🛒 Purchase A/C'}</option>
                  <option value="sales">{isUrdu ? '🏷 فروخت' : '🏷 Sales A/C'}</option>
                  <option value="customer">{isUrdu ? '👤 گاہک (وصولی)' : '👤 Customer (Receivable)'}</option>
                  <option value="supplier">{isUrdu ? '🏭 سپلائر (ادائیگی)' : '🏭 Supplier (Payable)'}</option>
                </select>
              </div>
              {/* Auto-link notice */}
              {(form.Role === 'customer' || form.Role === 'supplier') && !form.CA && (
                <div style={{ gridColumn:'span 2', background:'rgba(22,163,74,0.08)', border:'1px solid rgba(22,163,74,0.3)', borderRadius:6, padding:'8px 12px', fontSize:12, color:'var(--emerald)' }}>
                  ✅ {isUrdu
                    ? `محفوظ کرنے پر ${form.Role === 'customer' ? 'گاہک' : 'سپلائر'} خودکار بنے گا`
                    : `A ${form.Role} record will be auto-created and linked to this account`}
                </div>
              )}
              <div className="field-group" style={{ gridColumn:'span 2' }}>
                <label>{isUrdu ? 'ریمارکس' : 'Remarks'}</label>
                <input type="text" className="input-field" value={form.Remarks}
                  onChange={e => setForm(f => ({ ...f, Remarks: e.target.value }))} />
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowForm(false)} disabled={saving}>{t.clear}</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                <Save size={13} />
                {saving ? '…' : (form.CA ? (isUrdu?'اپ ڈیٹ':'Update') : (isUrdu?'محفوظ کریں':'Save Account'))}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
