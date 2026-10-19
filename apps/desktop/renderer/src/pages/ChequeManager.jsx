import React, { useState, useEffect, useCallback } from 'react';
import { Plus, RefreshCw, CheckCircle, XCircle, Edit2, X, Save, Search } from 'lucide-react';
import { useLang } from '../context/LanguageContext';

const api = window.electronAPI;

function fmt(n) { return Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtD(d) { if (!d) return '—'; try { return new Date(d).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return d; } }

const STATUS_CFG = {
  PENDING:   { label: 'Pending',   labelUr: 'زیر التواء', color: 'var(--amber)',  bg: 'rgba(217,119,6,0.12)' },
  CLEARED:   { label: 'Cleared',   labelUr: 'کلئیر',      color: 'var(--emerald)',bg: 'rgba(16,185,129,0.12)' },
  BOUNCED:   { label: 'Bounced',   labelUr: 'باؤنس',      color: 'var(--rose)',   bg: 'rgba(244,63,94,0.10)' },
  CANCELLED: { label: 'Cancelled', labelUr: 'منسوخ',      color: 'var(--text-muted)', bg: 'var(--bg-card)' },
};

export default function ChequeManager({ currentDb, dbInfo, showNotification }) {
  const { isUrdu } = useLang();
  const dir = isUrdu ? 'rtl' : 'ltr';

  const [cheques,  setCheques]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editCheque, setEditCheque] = useState(null);
  const [filterStatus,    setFilterStatus]    = useState('');
  const [filterDirection, setFilterDirection] = useState('');
  const [search, setSearch] = useState('');

  const EMPTY = () => ({
    ChequeNo: '', ChequeDate: new Date().toISOString().slice(0, 10),
    BankName: '', BankAccountNo: '', PartyType: 'Supplier', PartyID: '', PartyName: '',
    Amount: '', Direction: 'ISSUED', Status: 'PENDING', Notes: '',
  });

  const load = useCallback(async () => {
    if (!currentDb) return;
    setLoading(true);
    try {
      const r = await api.getCheques({ dbPath: currentDb, status: filterStatus || undefined, direction: filterDirection || undefined });
      if (r.success) setCheques(r.data || []);
    } finally { setLoading(false); }
  }, [currentDb, filterStatus, filterDirection]);

  useEffect(() => { load(); }, [load, dbInfo?.lastRefresh]);

  async function handleSave() {
    if (!editCheque.ChequeNo?.trim()) { showNotification(isUrdu ? 'چیک نمبر درج کریں' : 'Cheque number required', 'error'); return; }
    if (!editCheque.Amount || Number(editCheque.Amount) <= 0) { showNotification(isUrdu ? 'رقم درج کریں' : 'Amount required', 'error'); return; }
    setSaving(true);
    try {
      const r = await api.saveCheque({ dbPath: currentDb, cheque: { ...editCheque, Amount: Number(editCheque.Amount) } });
      if (r.success) { showNotification(isUrdu ? 'چیک محفوظ ہو گیا' : 'Cheque saved', 'success'); setShowForm(false); load(); }
      else showNotification(r.error || 'Save failed', 'error');
    } finally { setSaving(false); }
  }

  async function handleStatusChange(cheque, newStatus) {
    const r = await api.updateChequeStatus({ dbPath: currentDb, ChequeID: cheque.ChequeID, status: newStatus, clearedDate: newStatus === 'CLEARED' ? new Date().toISOString().slice(0, 10) : null });
    if (r.success) { showNotification(isUrdu ? `حالت تبدیل: ${newStatus}` : `Status updated: ${newStatus}`, 'success'); load(); }
    else showNotification(r.error || 'Update failed', 'error');
  }

  const filtered = cheques.filter(c => {
    if (!search) return true;
    const s = search.toLowerCase();
    return c.ChequeNo?.toLowerCase().includes(s) || c.PartyName?.toLowerCase().includes(s) || c.BankName?.toLowerCase().includes(s);
  });

  const badge = (status) => {
    const cfg = STATUS_CFG[status] || { label: status, labelUr: status, color: 'var(--text-muted)', bg: 'var(--bg-card)' };
    return <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: cfg.bg, color: cfg.color }}>{isUrdu ? cfg.labelUr : cfg.label}</span>;
  };

  return (
    <div className="page" dir={dir}>
      <div className="page-header">
        <div>
          <h1 className="page-title">{isUrdu ? 'چیک مینیجر' : 'Cheque Manager'}</h1>
          <p className="page-subtitle">{isUrdu ? 'صادر اور وصول شدہ چیکوں کا انتظام' : 'Track issued and received cheques with status workflow'}</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={() => { setEditCheque(EMPTY()); setShowForm(true); }} disabled={!currentDb}>
            <Plus size={14} />{isUrdu ? 'نیا چیک' : 'New Cheque'}
          </button>
          <button className="btn btn-secondary" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} />{isUrdu ? 'تازہ کریں' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="report-controls" style={{ marginBottom: 14 }}>
        <select className="select-field" style={{ minWidth: 140 }} value={filterDirection} onChange={e => setFilterDirection(e.target.value)}>
          <option value="">{isUrdu ? '— سمت —' : '— Direction —'}</option>
          <option value="ISSUED">{isUrdu ? 'صادر' : 'Issued'}</option>
          <option value="RECEIVED">{isUrdu ? 'موصول' : 'Received'}</option>
        </select>
        <select className="select-field" style={{ minWidth: 140 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">{isUrdu ? '— تمام حالت —' : '— All Status —'}</option>
          {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{isUrdu ? v.labelUr : v.label}</option>)}
        </select>
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input type="text" className="input-field" style={{ paddingLeft: 30, width: 220 }}
            placeholder={isUrdu ? 'چیک نمبر / فریق…' : 'Cheque no / party…'}
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>
          {filtered.length} {isUrdu ? 'چیک' : 'cheques'}
        </span>
      </div>

      {!currentDb ? (
        <div className="empty-state"><h3>{isUrdu ? 'ڈیٹا بیس منتخب نہیں' : 'No Database Selected'}</h3></div>
      ) : loading ? (
        <div className="empty-state"><div className="loading-spinner" style={{ margin: '0 auto' }} /></div>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr>
              <th>{isUrdu ? 'چیک نمبر' : 'Cheque No'}</th>
              <th>{isUrdu ? 'تاریخ' : 'Date'}</th>
              <th>{isUrdu ? 'بینک' : 'Bank'}</th>
              <th>{isUrdu ? 'فریق' : 'Party'}</th>
              <th>{isUrdu ? 'سمت' : 'Dir.'}</th>
              <th className="text-right">{isUrdu ? 'رقم' : 'Amount'}</th>
              <th>{isUrdu ? 'حالت' : 'Status'}</th>
              <th style={{ width: 150 }}>{isUrdu ? 'عمل' : 'Actions'}</th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>{isUrdu ? 'کوئی چیک نہیں' : 'No cheques found'}</td></tr>
              ) : filtered.map(c => (
                <tr key={c.ChequeID}>
                  <td style={{ fontFamily: 'monospace', color: 'var(--accent)' }}>{c.ChequeNo}</td>
                  <td>{fmtD(c.ChequeDate)}</td>
                  <td style={{ fontSize: 12 }}>{c.BankName || '—'}</td>
                  <td className="account-name">{c.PartyName || '—'}</td>
                  <td>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12,
                      background: c.Direction === 'ISSUED' ? 'rgba(244,63,94,0.10)' : 'rgba(16,185,129,0.12)',
                      color: c.Direction === 'ISSUED' ? 'var(--rose)' : 'var(--emerald)' }}>
                      {c.Direction === 'ISSUED' ? (isUrdu ? 'صادر' : 'Issued') : (isUrdu ? 'موصول' : 'Received')}
                    </span>
                  </td>
                  <td className="text-right amount-debit">{fmt(c.Amount)}</td>
                  <td>{badge(c.Status)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {c.Status === 'PENDING' && <>
                        <button className="btn-icon" title={isUrdu ? 'کلئیر' : 'Mark Cleared'} style={{ color: 'var(--emerald)' }}
                          onClick={() => handleStatusChange(c, 'CLEARED')}><CheckCircle size={13} /></button>
                        <button className="btn-icon btn-icon-danger" title={isUrdu ? 'باؤنس' : 'Mark Bounced'}
                          onClick={() => handleStatusChange(c, 'BOUNCED')}><XCircle size={13} /></button>
                        <button className="btn-icon" title={isUrdu ? 'ترمیم' : 'Edit'}
                          onClick={() => { setEditCheque({ ...c }); setShowForm(true); }}><Edit2 size={13} /></button>
                      </>}
                      {c.Status === 'CLEARED' && <span style={{ fontSize: 11, color: 'var(--emerald)' }}>✓ {fmtD(c.ClearedDate)}</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary bar */}
      {filtered.length > 0 && (
        <div style={{ padding: '12px 20px', background: 'var(--bg-card)', borderTop: '1px solid var(--border)', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {Object.entries(STATUS_CFG).map(([k, v]) => {
            const total = filtered.filter(c => c.Status === k).reduce((s, c) => s + Number(c.Amount || 0), 0);
            if (total < 0.01) return null;
            return <span key={k} style={{ fontSize: 12, color: v.color }}>{isUrdu ? v.labelUr : v.label}: <strong>Rs.{fmt(total)}</strong></span>;
          })}
        </div>
      )}

      {/* Cheque Form Modal */}
      {showForm && editCheque && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} dir={dir} style={{ maxWidth: 600 }}>
            <div className="modal-header">
              <h3>{editCheque.ChequeID ? (isUrdu ? 'چیک ترمیم' : 'Edit Cheque') : (isUrdu ? 'نیا چیک' : 'New Cheque')}</h3>
              <button className="btn-icon" onClick={() => setShowForm(false)}><X size={16} /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12, padding: '16px 20px' }}>
              <div className="field-group">
                <label>{isUrdu ? 'چیک نمبر *' : 'Cheque No *'}</label>
                <input type="text" className="input-field" value={editCheque.ChequeNo || ''} onChange={e => setEditCheque(c => ({ ...c, ChequeNo: e.target.value }))} />
              </div>
              <div className="field-group">
                <label>{isUrdu ? 'تاریخ *' : 'Date *'}</label>
                <input type="date" className="input-field" value={editCheque.ChequeDate || ''} onChange={e => setEditCheque(c => ({ ...c, ChequeDate: e.target.value }))} />
              </div>
              <div className="field-group">
                <label>{isUrdu ? 'بینک' : 'Bank'}</label>
                <input type="text" className="input-field" value={editCheque.BankName || ''} onChange={e => setEditCheque(c => ({ ...c, BankName: e.target.value }))} placeholder="HBL / MCB / UBL…" />
              </div>
              <div className="field-group">
                <label>{isUrdu ? 'رقم *' : 'Amount *'}</label>
                <input type="number" min="0" step="0.01" className="input-field" value={editCheque.Amount || ''} onChange={e => setEditCheque(c => ({ ...c, Amount: e.target.value }))} />
              </div>
              <div className="field-group">
                <label>{isUrdu ? 'سمت' : 'Direction'}</label>
                <select className="select-field" value={editCheque.Direction || 'ISSUED'} onChange={e => setEditCheque(c => ({ ...c, Direction: e.target.value }))}>
                  <option value="ISSUED">{isUrdu ? 'صادر (ادائیگی)' : 'Issued (Payment)'}</option>
                  <option value="RECEIVED">{isUrdu ? 'موصول (وصولی)' : 'Received (Receipt)'}</option>
                </select>
              </div>
              <div className="field-group">
                <label>{isUrdu ? 'فریق کا نام' : 'Party Name'}</label>
                <input type="text" className="input-field" value={editCheque.PartyName || ''} onChange={e => setEditCheque(c => ({ ...c, PartyName: e.target.value }))} />
              </div>
              <div className="field-group" style={{ gridColumn: '1/-1' }}>
                <label>{isUrdu ? 'نوٹس' : 'Notes'}</label>
                <input type="text" className="input-field" value={editCheque.Notes || ''} onChange={e => setEditCheque(c => ({ ...c, Notes: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowForm(false)} disabled={saving}>{isUrdu ? 'منسوخ' : 'Cancel'}</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}><Save size={13} />{saving ? '…' : (isUrdu ? 'محفوظ کریں' : 'Save')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
