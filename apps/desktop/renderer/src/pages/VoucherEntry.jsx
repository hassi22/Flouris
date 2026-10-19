/**
 * VoucherEntry.jsx
 *
 * Each voucher line is FULLY EXPLICIT:
 *   Debit Account  +  Debit Amount
 *   Credit Account +  Credit Amount
 *
 * A line can be:
 *   - Debit only  (Dr Account + Dr Amount, no Cr)
 *   - Credit only (Cr Account + Cr Amount, no Dr)
 *   - Both Dr+Cr  (one complete double-entry leg in a single row)
 *
 * "Voucher Name" is a free classification label only.
 * It NEVER determines whether an amount is debit or credit.
 * The posting engine reads DrAmount/CrAmount/DrAccountCA/CrAccountCA.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Trash2, Save, RefreshCw, Edit2, X, Search, CheckCircle, AlertCircle } from 'lucide-react';
import { useLang } from '../context/LanguageContext';

const api = window.electronAPI;

// ── Data shapes ───────────────────────────────────────────────────────────────
const EMPTY_LINE = () => ({
  VType:       '',      // voucher name code — classification only
  DrAccountCA: '',      // account to debit  (can be empty)
  DrAmount:    '',      // debit amount       (can be empty)
  CrAccountCA: '',      // account to credit  (can be empty)
  CrAmount:    '',      // credit amount      (can be empty)
  Narration:   '',
  // optional inventory tracking
  ItemID: '', Quantity: '', Rate: '', WarehouseID: '',
});

const EMPTY_FORM = () => ({
  TR_No:   null,
  TR_Date: new Date().toISOString().slice(0, 10),
  V_No:    '',
  Remarks: '',
  lines:   [EMPTY_LINE()],
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtAmt(n) {
  const v = parseFloat(n);
  if (!Number.isFinite(v) || v === 0) return '—';
  return v.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return d; }
}
function clean(s) { return (s || '').replace(/^'+|'+$/g, '').replace(/\s+/g, ' ').trim(); }

// ── Account dropdown ──────────────────────────────────────────────────────────
function AcctSelect({ value, onChange, accounts, isUrdu, placeholder }) {
  const label = a => `${a.CA} — ${(isUrdu && a.UAC_TITLE) ? a.UAC_TITLE : a.AC_TITLE1}`;
  return (
    <select
      className="select-field"
      style={{ width: '100%', fontSize: 12 }}
      value={value}
      onChange={e => onChange(e.target.value)}
    >
      <option value="">{placeholder || (isUrdu ? '— اکاؤنٹ —' : '— Account —')}</option>
      {accounts.map(a => <option key={a.CA} value={a.CA}>{label(a)}</option>)}
    </select>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function VoucherEntry({ currentDb, dbInfo, showNotification }) {
  const { t, isUrdu } = useLang();
  const dir = isUrdu ? 'rtl' : 'ltr';

  const [voucherNames, setVoucherNames] = useState([]);   // formerly "voucher types"
  const [accounts,     setAccounts]     = useState([]);
  const [millItems,    setMillItems]    = useState([]);
  const [vouchers,     setVouchers]     = useState([]);

  const [loading,       setLoading]       = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [showForm,      setShowForm]      = useState(false);
  const [form,          setForm]          = useState(EMPTY_FORM());
  const [filterFrom,    setFilterFrom]    = useState('');
  const [filterTo,      setFilterTo]      = useState('');
  const [filterName,    setFilterName]    = useState(''); // by voucher name code
  const [search,        setSearch]        = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleting,      setDeleting]      = useState(false);

  // ── Reference data ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentDb || !api) return;
    api.getVoucherTypes(currentDb).then(r => { if (r?.success) setVoucherNames(r.data || []); });
    api.getChartOfAccounts(currentDb).then(r => { if (r?.success) setAccounts(r.data || []); });
    api.getMillItems(currentDb).then(r => { if (r?.success) setMillItems(r.data || []); });
  }, [currentDb]);

  // ── Voucher list ─────────────────────────────────────────────────────────────
  const loadVouchers = useCallback(async () => {
    if (!currentDb || !api) return;
    setLoading(true);
    try {
      const r = await api.getVouchers({
        dbPath:    currentDb,
        startDate: filterFrom || undefined,
        endDate:   filterTo   || undefined,
        vtype:     filterName ? Number(filterName) : undefined,
      });
      if (r?.success) setVouchers(r.data || []);
      else showNotification(r?.error || 'Failed to load', 'error');
    } catch (e) {
      showNotification(e?.message || 'Failed to load', 'error');
    } finally {
      setLoading(false);
    }
  }, [currentDb, filterFrom, filterTo, filterName, showNotification]);

  useEffect(() => { loadVouchers(); }, [loadVouchers, dbInfo?.lastRefresh]);

  // ── Line helpers ─────────────────────────────────────────────────────────────
  const setLine = (i, field, value) => setForm(p => {
    const lines = [...p.lines];
    lines[i] = { ...lines[i], [field]: value };
    return { ...p, lines };
  });

  const addLine    = () => setForm(p => ({ ...p, lines: [...p.lines, EMPTY_LINE()] }));
  const removeLine = i  => setForm(p => ({ ...p, lines: p.lines.filter((_, j) => j !== i) }));

  // ── Totals ───────────────────────────────────────────────────────────────────
  const totalDr = form.lines.reduce((s, l) => s + (Number(l.DrAmount) || 0), 0);
  const totalCr = form.lines.reduce((s, l) => s + (Number(l.CrAmount) || 0), 0);
  const diff     = Math.abs(totalDr - totalCr);
  // Balanced = totals match within 1 paisa AND at least one line has any amount.
  // Individual lines can be Dr-only or Cr-only — balance is measured across ALL lines.
  const hasAnyAmount = totalDr > 0 || totalCr > 0;
  const balanced = diff < 0.01 && hasAnyAmount;

  // ── Open new / edit ──────────────────────────────────────────────────────────
  const openNew = () => { setForm(EMPTY_FORM()); setShowForm(true); };

  function openEdit(row) {
    const lines = vouchers
      .filter(v => v.TR_No === row.TR_No)
      .map(v => {
        const hasExplicit = (
          v.DrAmount != null ||
          v.CrAmount != null ||
          v.DrAccountCA != null ||
          v.CrAccountCA != null
        );

        if (hasExplicit) {
          const hasDr = Number(v.DrAmount || 0) > 0;
          const hasCr = Number(v.CrAmount || 0) > 0;
          return {
            VType:       String(v.VType ?? ''),
            DrAccountCA: String(v.DrAccountCA ?? v.Account_Party ?? ''),
            DrAmount:    hasDr ? String(v.DrAmount) : '',
            CrAccountCA: String(v.CrAccountCA ?? v.AC_Party2 ?? ''),
            CrAmount:    hasCr ? String(v.CrAmount) : '',
            Narration:   clean(v.Narration),
            ItemID: '', Quantity: '', Rate: '', WarehouseID: '',
          };
        }

        // Legacy fallback: keep the original side data only if it was explicitly stored there.
        return {
          VType:       String(v.VType ?? ''),
          DrAccountCA: String(v.Account_Party ?? ''),
          DrAmount:    String(v.Account_Party ? (v.Amount ?? '') : ''),
          CrAccountCA: String(v.AC_Party2 ?? ''),
          CrAmount:    String(v.AC_Party2 ? (v.Amount ?? '') : ''),
          Narration:   clean(v.Narration),
          ItemID: '', Quantity: '', Rate: '', WarehouseID: '',
        };
      });

    setForm({
      TR_No:   row.TR_No,
      TR_Date: (row.TR_Date || '').slice(0, 10),
      V_No:    String(row.V_No ?? ''),
      Remarks: clean(row.Remarks),
      lines:   lines.length ? lines : [EMPTY_LINE()],
    });
    setShowForm(true);
  }

  // ── Save ─────────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.TR_Date) {
      showNotification(isUrdu ? 'تاریخ درج کریں' : 'Enter a date', 'error');
      return;
    }

    // A line is valid if it has at least one side (Dr-only or Cr-only is fine —
    // the OVERALL voucher totals must balance, not each individual line).
    const validLines = form.lines.filter(l =>
      (Number(l.DrAmount) > 0 && l.DrAccountCA) ||
      (Number(l.CrAmount) > 0 && l.CrAccountCA)
    );

    if (!validLines.length) {
      showNotification(
        isUrdu
          ? 'کم از کم ایک مکمل لائن درج کریں (اکاؤنٹ + رقم)'
          : 'Enter at least one complete line (account + amount)',
        'error'
      );
      return;
    }

    const sDr = validLines.reduce((s, l) => s + (Number(l.DrAmount) || 0), 0);
    const sCr = validLines.reduce((s, l) => s + (Number(l.CrAmount) || 0), 0);

    // Unbalanced vouchers are allowed. The balance summary is shown for reference only.

    setSaving(true);
    try {
      const res = await api.saveVoucher({
        dbPath: currentDb,
        voucher: {
          TR_No:   form.TR_No,
          TR_Date: form.TR_Date,
          V_Typ:   0,         // header VType not authoritative
          V_No:    form.V_No || '',
          Remarks: form.Remarks || '',
          Amont:   sDr,
          AccountParty: 0,
          ACParty2:     0,
          lines: validLines.map(l => ({
            VType:       Number(l.VType) || 201,   // classification only
            DrAccountCA: Number(l.DrAccountCA) || 0,
            DrAmount:    Number(l.DrAmount) || 0,
            CrAccountCA: Number(l.CrAccountCA) || 0,
            CrAmount:    Number(l.CrAmount) || 0,
            // legacy compat
            Account_Party: Number(l.DrAccountCA) || 0,
            AC_Party2:     Number(l.CrAccountCA) || 0,
            Amount:        Number(l.DrAmount) || Number(l.CrAmount) || 0,
            Narration:     l.Narration || '',
            ItemID:      l.ItemID      ? Number(l.ItemID)      : null,
            Quantity:    l.Quantity    ? Number(l.Quantity)    : null,
            Rate:        l.Rate        ? Number(l.Rate)        : null,
            WarehouseID: l.WarehouseID ? Number(l.WarehouseID) : null,
          })),
        },
      });

      if (res?.success) {
        showNotification(
          form.TR_No
            ? (isUrdu ? 'وصول نامہ اپ ڈیٹ ہو گیا' : 'Voucher updated')
            : (isUrdu ? 'وصول نامہ محفوظ ہو گیا' : 'Voucher saved'),
          'success'
        );
        setShowForm(false);
        loadVouchers();
      } else {
        showNotification(res?.error || 'Save failed', 'error');
      }
    } catch (e) {
      showNotification(e?.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────────
  async function handleDelete(TR_No) {
    setDeleting(true);
    try {
      const res = await api.deleteVoucher({ dbPath: currentDb, TR_No });
      if (res?.success) {
        showNotification(isUrdu ? 'وصول نامہ حذف ہو گیا' : 'Voucher deleted', 'success');
        setDeleteConfirm(null);
        loadVouchers();
      } else {
        showNotification(res?.error || 'Delete failed', 'error');
      }
    } catch (e) {
      showNotification(e?.message || 'Delete failed', 'error');
    } finally {
      setDeleting(false);
    }
  }

  // ── List helpers ──────────────────────────────────────────────────────────────
  const seen = new Set();
  const uniqueVouchers = vouchers.filter(v => { if (seen.has(v.TR_No)) return false; seen.add(v.TR_No); return true; });
  const filteredList   = uniqueVouchers.filter(v => {
    if (!search) return true;
    const s = search.toLowerCase();
    return clean(v.Remarks).toLowerCase().includes(s) || String(v.TR_No).includes(s) || String(v.V_No || '').includes(s);
  });

  const voucherNameLabel = code => {
    const vn = voucherNames.find(v => Number(v.VTYPE) === Number(code));
    if (!vn) return code ? `#${code}` : '—';
    return (isUrdu && vn.UVTITLE) ? vn.UVTITLE : vn.VTITLE;
  };

  const acLabel = id => {
    if (!id) return '—';
    const a = accounts.find(x => Number(x.CA) === Number(id));
    if (!a) return `A/C #${id}`;
    return (isUrdu && a.UAC_TITLE) ? a.UAC_TITLE : a.AC_TITLE1;
  };

  const rowDrTotal = v => {
    const all = vouchers.filter(x => x.TR_No === v.TR_No);
    const dr  = all.reduce((s, x) => s + (Number(x.DrAmount) || 0), 0);
    return dr || Number(v.Amont) || 0;
  };

  // ── Render ─────────────────────────────────────────────────────────────────────
  return (
    <div className="page" dir={dir}>

      {/* ── Page header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">{isUrdu ? 'وصول نامہ اندراج' : 'Voucher Entry'}</h1>
          <p className="page-subtitle">
            {isUrdu
              ? 'ہر لائن میں ڈیبٹ/کریڈٹ یا دونوں — وصول نامہ نام صرف درجہ بندی'
              : 'Per-line Dr / Cr (or both) — Voucher Name is classification only'}
          </p>
        </div>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={openNew} disabled={!currentDb}>
            <Plus size={14} />{isUrdu ? 'نیا وصول نامہ' : 'New Voucher'}
          </button>
          <button className="btn btn-secondary" onClick={loadVouchers} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} />{t.refresh}
          </button>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="report-controls" style={{ marginBottom: 14 }}>
        <div className="date-group">
          <span className="date-label">{t.from}</span>
          <input type="date" className="input-field" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} />
        </div>
        <div className="date-group">
          <span className="date-label">{t.to}</span>
          <input type="date" className="input-field" value={filterTo} onChange={e => setFilterTo(e.target.value)} />
        </div>

        {/* "Voucher Name" filter — renamed from "Type" */}
        <select className="select-field" style={{ minWidth: 200 }} value={filterName} onChange={e => setFilterName(e.target.value)}>
          <option value="">{isUrdu ? '— تمام وصول نامے —' : '— All Voucher Names —'}</option>
          {voucherNames.map(vn => (
            <option key={vn.VTYPE} value={vn.VTYPE}>
              {(isUrdu && vn.UVTITLE) ? vn.UVTITLE : vn.VTITLE}
            </option>
          ))}
        </select>

        <button className="btn btn-primary" onClick={loadVouchers} disabled={loading}>{t.apply}</button>
        <button className="btn btn-ghost" onClick={() => { setFilterFrom(''); setFilterTo(''); setFilterName(''); }}>{t.clear}</button>

        <div style={{ flex: 1 }} />
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', [isUrdu ? 'right' : 'left']: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input type="text"
            placeholder={isUrdu ? 'TR # / نمبر / ریمارکس…' : 'TR # / voucher no. / remarks…'}
            className="input-field"
            style={{ [isUrdu ? 'paddingRight' : 'paddingLeft']: 30, width: 260 }}
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* ── List ── */}
      {!currentDb ? (
        <div className="empty-state"><div className="empty-state-icon">📂</div><h3>{t.noDatabaseSelected}</h3><p>{t.selectDbFirst}</p></div>
      ) : loading ? (
        <div className="empty-state"><div className="loading-spinner" style={{ margin: '0 auto' }} /></div>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 65 }}>TR #</th>
                <th style={{ width: 110 }}>{t.date}</th>
                <th style={{ width: 175 }}>{isUrdu ? 'وصول نامہ نام' : 'Voucher Name'}</th>
                <th style={{ width: 75 }}>V#</th>
                <th>{isUrdu ? 'ریمارکس' : 'Remarks'}</th>
                <th className="text-right" style={{ width: 130 }}>
                  <span className="dr-amount">{isUrdu ? 'ڈیبٹ (Rs.)' : 'Dr (Rs.)'}</span>
                </th>
                <th style={{ width: 80 }}>{isUrdu ? 'عمل' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody>
              {filteredList.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
                  {isUrdu ? 'کوئی وصول نامہ نہیں ملا' : 'No vouchers found'}
                </td></tr>
              ) : filteredList.map(v => (
                <tr key={v.TR_No}>
                  <td style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>{v.TR_No}</td>
                  <td>{fmtDate(v.TR_Date)}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{voucherNameLabel(v.V_Typ ?? v.VType)}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{v.V_No || '—'}</td>
                  <td style={{ fontSize: 12 }}>{clean(v.Remarks) || '—'}</td>
                  <td className="text-right dr-amount">{fmtAmt(rowDrTotal(v))}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 5, justifyContent: 'center' }}>
                      <button className="btn-icon" title={isUrdu ? 'ترمیم' : 'Edit'} onClick={() => openEdit(v)}><Edit2 size={13} /></button>
                      <button className="btn-icon btn-icon-danger" title={isUrdu ? 'حذف' : 'Delete'} onClick={() => setDeleteConfirm(v.TR_No)}><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: '6px 14px', fontSize: 11, color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>
            {filteredList.length} {isUrdu ? 'وصول نامے' : 'vouchers'}
          </div>
        </div>
      )}

      {/* ── Delete confirm ── */}
      {deleteConfirm !== null && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} dir={dir}>
            <div className="modal-header">
              <h3>{isUrdu ? 'وصول نامہ حذف کریں؟' : 'Delete Voucher?'}</h3>
              <button className="btn-icon" onClick={() => setDeleteConfirm(null)}><X size={15} /></button>
            </div>
            <div style={{ padding: '18px 20px', color: 'var(--text-muted)', fontSize: 13 }}>
              {isUrdu
                ? `TR #${deleteConfirm} اور اس کی تمام لائنیں مستقل طور پر حذف ہو جائیں گی۔`
                : `TR #${deleteConfirm} and all its lines will be permanently deleted.`}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setDeleteConfirm(null)} disabled={deleting}>{t.clear}</button>
              <button className="btn btn-danger" onClick={() => handleDelete(deleteConfirm)} disabled={deleting}>
                <Trash2 size={13} />{deleting ? '…' : (isUrdu ? 'حذف کریں' : 'Delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Voucher Form Modal ── */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div
            className="modal-box modal-wide"
            onClick={e => e.stopPropagation()}
            dir={dir}
            style={{ maxWidth: 1280, maxHeight: '96vh', display: 'flex', flexDirection: 'column' }}
          >
            {/* Title bar */}
            <div className="modal-header">
              <h3>
                {form.TR_No
                  ? (isUrdu ? `وصول نامہ ترمیم — TR #${form.TR_No}` : `Edit Voucher — TR #${form.TR_No}`)
                  : (isUrdu ? 'نیا وصول نامہ' : 'New Voucher')}
              </h3>
              <button className="btn-icon" onClick={() => setShowForm(false)}><X size={16} /></button>
            </div>

            {/* Header row */}
            <div style={{ display: 'grid', gridTemplateColumns: '160px 150px 1fr', gap: 12, padding: '12px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div className="field-group">
                <label>{t.date} *</label>
                <input type="date" className="input-field" value={form.TR_Date}
                  onChange={e => setForm(f => ({ ...f, TR_Date: e.target.value }))} />
              </div>
              <div className="field-group">
                <label>{isUrdu ? 'وصول نامہ نمبر' : 'Voucher No.'}</label>
                <input type="text" className="input-field" value={form.V_No}
                  placeholder={isUrdu ? 'اختیاری' : 'Optional'}
                  onChange={e => setForm(f => ({ ...f, V_No: e.target.value }))} />
              </div>
              <div className="field-group">
                <label>{isUrdu ? 'ریمارکس' : 'Remarks'}</label>
                <input type="text" className="input-field" value={form.Remarks}
                  placeholder={isUrdu ? 'مختصر وضاحت…' : 'Brief description…'}
                  onChange={e => setForm(f => ({ ...f, Remarks: e.target.value }))} />
              </div>
            </div>

            {/* ── Entry lines ── */}
            <div className="lines-section" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <div className="lines-section-header" style={{ flexShrink: 0 }}>
                <span className="lines-section-title">
                  {isUrdu ? 'اندراج لائنیں' : 'Entry Lines'}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', marginInlineStart: 8 }}>
                  {isUrdu
                    ? '(ہر لائن کی ڈیبٹ/کریڈٹ سمت اس کی اپنی لائن کے مطابق ہے — ڈیبٹ صرف، کریڈٹ صرف، یا دونوں ممکن ہیں)'
                    : '(Each line is posted exactly as entered — Dr-only, Cr-only, or both are supported)'}
                </span>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 12, padding: '4px 10px', marginInlineStart: 'auto' }}
                  onClick={addLine}
                >
                  <Plus size={12} />{isUrdu ? 'لائن شامل کریں' : 'Add Line'}
                </button>
              </div>

              <div style={{ flex: 1, overflowX: 'auto', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                <table className="data-table" style={{ minWidth: 1020, tableLayout: 'fixed', borderRadius: 0 }}>
                  <thead>
                    <tr>
                      {/* Voucher Name column — renamed from "Voucher Type" */}
                      <th style={{ width: 160 }}>
                        <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                          {isUrdu ? 'وصول نامہ نام (درجہ بندی)' : 'Voucher Name (label)'}
                        </span>
                      </th>

                      {/* Debit side */}
                      <th style={{ width: 225, borderLeft: '3px solid var(--rose)' }}>
                        <span className="dr-amount">🔴 {isUrdu ? 'ڈیبٹ اکاؤنٹ' : 'Debit Account'}</span>
                      </th>
                      <th style={{ width: 125, borderLeft: '1px solid rgba(220,38,38,0.2)' }}>
                        <span className="dr-amount">{isUrdu ? 'ڈیبٹ رقم' : 'Dr Amount'}</span>
                      </th>

                      {/* Credit side */}
                      <th style={{ width: 225, borderLeft: '3px solid var(--emerald)' }}>
                        <span className="cr-amount">🟢 {isUrdu ? 'کریڈٹ اکاؤنٹ' : 'Credit Account'}</span>
                      </th>
                      <th style={{ width: 125, borderLeft: '1px solid rgba(22,163,74,0.2)' }}>
                        <span className="cr-amount">{isUrdu ? 'کریڈٹ رقم' : 'Cr Amount'}</span>
                      </th>

                      <th style={{ width: 150 }}>{isUrdu ? 'تفصیل' : 'Narration'}</th>
                      <th style={{ width: 32 }}></th>
                    </tr>
                  </thead>

                  <tbody>
                    {form.lines.map((line, i) => {
                      const isPurchOrSale = [301, 302, 304, 401, 402, 404].includes(Number(line.VType));
                      const hasInventoryRow = isPurchOrSale && millItems.length > 0;
                      return (
                        <React.Fragment key={i}>
                          <tr style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)' }}>

                            {/* ── Voucher Name ── */}
                            <td style={{ padding: '4px 6px' }}>
                              <select
                                className="select-field"
                                style={{ width: '100%', fontSize: 11 }}
                                value={line.VType || ''}
                                onChange={e => setLine(i, 'VType', e.target.value)}
                              >
                                <option value="">{isUrdu ? '— نام (اختیاری) —' : '— Name (optional) —'}</option>
                                {voucherNames.map(vn => (
                                  <option key={vn.VTYPE} value={vn.VTYPE}>
                                    {(isUrdu && vn.UVTITLE) ? vn.UVTITLE : vn.VTITLE}
                                  </option>
                                ))}
                              </select>
                            </td>

                            {/* ── Debit Account ── */}
                            <td style={{ padding: '4px 6px', borderLeft: '3px solid var(--rose)' }}>
                              <AcctSelect
                                value={line.DrAccountCA || ''}
                                onChange={v => setLine(i, 'DrAccountCA', v)}
                                accounts={accounts}
                                isUrdu={isUrdu}
                                placeholder={isUrdu ? '— ڈیبٹ اکاؤنٹ (اختیاری) —' : '— Debit A/C (optional) —'}
                              />
                            </td>

                            {/* ── Debit Amount ── */}
                            <td style={{ padding: '4px 6px', borderLeft: '1px solid rgba(220,38,38,0.2)' }}>
                              <input
                                type="number" min="0" step="0.01"
                                className="input-field dr-amount"
                                style={{ width: '100%', textAlign: 'right', fontWeight: 700, fontSize: 14 }}
                                value={line.DrAmount || ''}
                                placeholder="0.00"
                                onChange={e => setLine(i, 'DrAmount', e.target.value)}
                              />
                            </td>

                            {/* ── Credit Account ── */}
                            <td style={{ padding: '4px 6px', borderLeft: '3px solid var(--emerald)' }}>
                              <AcctSelect
                                value={line.CrAccountCA || ''}
                                onChange={v => setLine(i, 'CrAccountCA', v)}
                                accounts={accounts}
                                isUrdu={isUrdu}
                                placeholder={isUrdu ? '— کریڈٹ اکاؤنٹ (اختیاری) —' : '— Credit A/C (optional) —'}
                              />
                            </td>

                            {/* ── Credit Amount ── */}
                            <td style={{ padding: '4px 6px', borderLeft: '1px solid rgba(22,163,74,0.2)' }}>
                              <input
                                type="number" min="0" step="0.01"
                                className="input-field cr-amount"
                                style={{ width: '100%', textAlign: 'right', fontWeight: 700, fontSize: 14 }}
                                value={line.CrAmount || ''}
                                placeholder="0.00"
                                onChange={e => setLine(i, 'CrAmount', e.target.value)}
                              />
                            </td>

                            {/* ── Narration ── */}
                            <td style={{ padding: '4px 6px' }}>
                              <input type="text" className="input-field"
                                style={{ width: '100%', fontSize: 11 }}
                                value={line.Narration || ''}
                                placeholder={isUrdu ? 'تفصیل…' : 'Description…'}
                                onChange={e => setLine(i, 'Narration', e.target.value)}
                              />
                            </td>

                            {/* ── Remove ── */}
                            <td style={{ padding: '4px 3px', textAlign: 'center' }}>
                              {form.lines.length > 1 && (
                                <button className="btn-icon btn-icon-danger" onClick={() => removeLine(i)}>
                                  <X size={12} />
                                </button>
                              )}
                            </td>
                          </tr>

                          {/* Optional inventory sub-row for stock-related voucher names */}
                          {hasInventoryRow && (
                            <tr style={{ background: 'rgba(0,0,0,0.025)' }}>
                              <td colSpan={2} style={{ padding: '3px 8px 3px 20px', fontSize: 11 }}>
                                <select className="select-field" style={{ width: '100%', fontSize: 11 }}
                                  value={line.ItemID || ''} onChange={e => setLine(i, 'ItemID', e.target.value)}>
                                  <option value="">{isUrdu ? '— آئٹم (اختیاری) —' : '— Item (optional) —'}</option>
                                  {millItems.map(it => <option key={it.ItemID} value={it.ItemID}>{it.ItemName} ({it.UOM})</option>)}
                                </select>
                              </td>
                              <td style={{ padding: '3px 8px', fontSize: 11 }}>
                                <input type="number" min="0" step="0.001" className="input-field"
                                  style={{ width: '100%', fontSize: 11 }} placeholder={isUrdu ? 'مقدار' : 'Qty'}
                                  value={line.Quantity || ''} onChange={e => setLine(i, 'Quantity', e.target.value)} />
                              </td>
                              <td style={{ padding: '3px 8px', fontSize: 11 }}>
                                <input type="number" min="0" step="0.01" className="input-field"
                                  style={{ width: '100%', fontSize: 11 }} placeholder={isUrdu ? 'شرح' : 'Rate'}
                                  value={line.Rate || ''} onChange={e => setLine(i, 'Rate', e.target.value)} />
                              </td>
                              <td colSpan={3} style={{ padding: '3px 8px', fontSize: 10, color: 'var(--text-muted)' }}>
                                📦 {isUrdu ? 'اسٹاک حرکت (اختیاری)' : 'Inventory movement (optional)'}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>

                  {/* ── Running totals footer ── */}
                  <tfoot>
                    <tr style={{ background: balanced ? 'rgba(22,163,74,0.07)' : 'rgba(220,38,38,0.07)' }}>
                      <td style={{ padding: '9px 8px', fontWeight: 700, fontSize: 12 }}>
                        {isUrdu ? 'مجموعہ' : 'TOTALS'}
                      </td>

                      <td style={{ padding: '9px 8px', borderLeft: '3px solid var(--rose)' }}></td>

                      {/* Total Dr */}
                      <td className="text-right dr-amount" style={{ fontWeight: 800, fontSize: 16, padding: '9px 8px' }}>
                        Rs.{totalDr.toLocaleString('en-PK', { minimumFractionDigits: 2 })}
                      </td>

                      <td style={{ padding: '9px 8px', borderLeft: '3px solid var(--emerald)' }}></td>

                      {/* Total Cr */}
                      <td className="text-right cr-amount" style={{ fontWeight: 800, fontSize: 16, padding: '9px 8px' }}>
                        Rs.{totalCr.toLocaleString('en-PK', { minimumFractionDigits: 2 })}
                      </td>

                     
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* ── Footer ── */}
            <div className="modal-footer" style={{ flexShrink: 0 }}>
              <button className="btn btn-ghost" onClick={() => setShowForm(false)} disabled={saving}>{t.clear}</button>
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={saving || !hasAnyAmount}
                title={!hasAnyAmount ? (isUrdu ? 'کم از کم ایک مکمل لائن درج کریں' : 'Enter at least one complete line') : ''}
              >
                <Save size={13} />
                {saving
                  ? '…'
                  : form.TR_No
                    ? (isUrdu ? 'اپ ڈیٹ کریں' : 'Update Voucher')
                    : (isUrdu ? 'محفوظ کریں' : 'Save Voucher')}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
