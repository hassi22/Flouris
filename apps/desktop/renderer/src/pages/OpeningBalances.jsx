import React, { useState, useEffect, useCallback } from 'react';
import { Plus, RefreshCw, X, Save, CheckCircle } from 'lucide-react';
import { useLang } from '../context/LanguageContext';

const api = window.electronAPI;

function fmt(n) { return Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

const EMPTY = (asOfDate) => ({
  OpeningType: 'Account', AccountCA: '', PartyType: '', PartyID: '',
  ItemID: '', WarehouseID: '', DebitAmount: '', CreditAmount: '',
  Quantity: '', UnitCost: '', Narration: 'Opening Balance',
  AsOfDate: asOfDate || new Date().toISOString().slice(0, 10),
  FYearID: '',
});

export default function OpeningBalances({ currentDb, dbInfo, showNotification }) {
  const { isUrdu } = useLang();
  const dir = isUrdu ? 'rtl' : 'ltr';

  const [records,    setRecords]    = useState([]);
  const [accounts,   setAccounts]   = useState([]);
  const [items,      setItems]      = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [customers,  setCustomers]  = useState([]);
  const [suppliers,  setSuppliers]  = useState([]);
  const [fiscalYears, setFiscalYears] = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [showForm,   setShowForm]   = useState(false);
  const [form,       setForm]       = useState(EMPTY());

  const load = useCallback(async () => {
    if (!currentDb) return;
    setLoading(true);
    try {
      const [obRes, acRes, itemRes, whRes, custRes, suppRes, fyRes] = await Promise.all([
        api.getOpeningBalances({ dbPath: currentDb }),
        api.getChartOfAccounts(currentDb),
        api.getMillItems(currentDb),
        api.getWarehouses(currentDb),
        api.getCustomers({ dbPath: currentDb }),
        api.getSuppliers({ dbPath: currentDb }),
        api.getFiscalYears({ dbPath: currentDb }),
      ]);
      if (obRes.success)   setRecords(obRes.data || []);
      if (acRes.success)   setAccounts(acRes.data || []);
      if (itemRes.success) setItems(itemRes.data || []);
      if (whRes.success)   setWarehouses(whRes.data || []);
      if (custRes.success) setCustomers(custRes.data || []);
      if (suppRes.success) setSuppliers(suppRes.data || []);
      if (fyRes.success)   setFiscalYears(fyRes.data || []);
    } finally { setLoading(false); }
  }, [currentDb]);

  useEffect(() => { load(); }, [load, dbInfo?.lastRefresh]);

  async function handlePost() {
    if (!form.AsOfDate) { showNotification(isUrdu ? 'تاریخ درج کریں' : 'Date required', 'error'); return; }
    if (form.OpeningType === 'Account' && !form.AccountCA) { showNotification(isUrdu ? 'اکاؤنٹ منتخب کریں' : 'Select account', 'error'); return; }
    if (form.OpeningType === 'Inventory' && !form.ItemID) { showNotification(isUrdu ? 'آئٹم منتخب کریں' : 'Select item', 'error'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        AccountCA:   form.AccountCA   ? Number(form.AccountCA)   : null,
        PartyID:     form.PartyID     ? Number(form.PartyID)      : null,
        ItemID:      form.ItemID      ? Number(form.ItemID)       : null,
        WarehouseID: form.WarehouseID ? Number(form.WarehouseID)  : null,
        FYearID:     form.FYearID     ? Number(form.FYearID)      : null,
        DebitAmount:  Number(form.DebitAmount  || 0),
        CreditAmount: Number(form.CreditAmount || 0),
        Quantity:     Number(form.Quantity  || 0),
        UnitCost:     Number(form.UnitCost  || 0),
      };
      const r = await api.postOpeningBalance({ dbPath: currentDb, ob: payload });
      if (r.success) { showNotification(isUrdu ? 'ابتدائی بیلنس پوسٹ ہو گیا' : 'Opening balance posted', 'success'); setShowForm(false); load(); }
      else showNotification(r.error || 'Failed', 'error');
    } finally { setSaving(false); }
  }

  const typeOptions = [
    { value: 'Account',   labelEn: 'Account Balance',   labelUr: 'اکاؤنٹ بیلنس' },
    { value: 'Customer',  labelEn: 'Customer Balance',  labelUr: 'گاہک بیلنس' },
    { value: 'Supplier',  labelEn: 'Supplier Balance',  labelUr: 'سپلائر بیلنس' },
    { value: 'Inventory', labelEn: 'Inventory Stock',   labelUr: 'انوینٹری اسٹاک' },
  ];

  return (
    <div className="page" dir={dir}>
      <div className="page-header">
        <div>
          <h1 className="page-title">{isUrdu ? 'ابتدائی بیلنس' : 'Opening Balances'}</h1>
          <p className="page-subtitle">{isUrdu ? 'سال کی شروعات میں اکاؤنٹ، گاہک، سپلائر اور اسٹاک بیلنس درج کریں' : 'Enter account, customer, supplier, and inventory opening balances'}</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={() => { setForm(EMPTY()); setShowForm(true); }} disabled={!currentDb}>
            <Plus size={14} />{isUrdu ? 'نیا بیلنس' : 'New Entry'}
          </button>
          <button className="btn btn-secondary" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} />{isUrdu ? 'تازہ کریں' : 'Refresh'}
          </button>
        </div>
      </div>

      {!currentDb ? (
        <div className="empty-state"><h3>{isUrdu ? 'ڈیٹا بیس منتخب نہیں' : 'No Database Selected'}</h3></div>
      ) : loading ? (
        <div className="empty-state"><div className="loading-spinner" style={{ margin: '0 auto' }} /></div>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr>
              <th>{isUrdu ? 'قسم' : 'Type'}</th>
              <th>{isUrdu ? 'اکاؤنٹ / آئٹم' : 'Account / Item'}</th>
              <th>{isUrdu ? 'تاریخ' : 'Date'}</th>
              <th className="text-right">{isUrdu ? 'ڈیبٹ' : 'Debit'}</th>
              <th className="text-right">{isUrdu ? 'کریڈٹ' : 'Credit'}</th>
              <th className="text-right">{isUrdu ? 'مقدار' : 'Qty'}</th>
              <th className="text-right">{isUrdu ? 'قیمت/یونٹ' : 'Unit Cost'}</th>
              <th>{isUrdu ? 'نوٹ' : 'Narration'}</th>
            </tr></thead>
            <tbody>
              {records.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
                  {isUrdu ? 'کوئی ابتدائی بیلنس نہیں' : 'No opening balances posted yet'}
                </td></tr>
              ) : records.map(r => (
                <tr key={r.OBID}>
                  <td><span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 10, background: 'var(--bg-secondary)', color: 'var(--accent)' }}>{r.OpeningType}</span></td>
                  <td className="account-name">{r.AccountName || r.ItemName || `ID:${r.AccountCA || r.ItemID}`}</td>
                  <td>{r.PostedAt ? new Date(r.PostedAt).toLocaleDateString('en-PK') : '—'}</td>
                  <td className="text-right amount-debit">{Number(r.DebitAmount || 0) > 0 ? fmt(r.DebitAmount) : '—'}</td>
                  <td className="text-right amount-credit">{Number(r.CreditAmount || 0) > 0 ? fmt(r.CreditAmount) : '—'}</td>
                  <td className="text-right">{Number(r.Quantity || 0) > 0 ? Number(r.Quantity).toLocaleString() : '—'}</td>
                  <td className="text-right">{Number(r.UnitCost || 0) > 0 ? fmt(r.UnitCost) : '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.Narration}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} dir={dir} style={{ maxWidth: 580 }}>
            <div className="modal-header">
              <h3>{isUrdu ? 'ابتدائی بیلنس درج کریں' : 'Post Opening Balance'}</h3>
              <button className="btn-icon" onClick={() => setShowForm(false)}><X size={16} /></button>
            </div>
            <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12 }}>
              <div className="field-group">
                <label>{isUrdu ? 'قسم *' : 'Type *'}</label>
                <select className="select-field" value={form.OpeningType} onChange={e => setForm(f => ({ ...f, OpeningType: e.target.value, AccountCA: '', ItemID: '', PartyID: '' }))}>
                  {typeOptions.map(o => <option key={o.value} value={o.value}>{isUrdu ? o.labelUr : o.labelEn}</option>)}
                </select>
              </div>
              <div className="field-group">
                <label>{isUrdu ? 'تاریخ *' : 'As of Date *'}</label>
                <input type="date" className="input-field" value={form.AsOfDate} onChange={e => setForm(f => ({ ...f, AsOfDate: e.target.value }))} />
              </div>

              {form.OpeningType === 'Account' && (
                <div className="field-group" style={{ gridColumn: '1/-1' }}>
                  <label>{isUrdu ? 'اکاؤنٹ *' : 'Account *'}</label>
                  <select className="select-field" value={form.AccountCA || ''} onChange={e => setForm(f => ({ ...f, AccountCA: e.target.value }))}>
                    <option value="">{isUrdu ? '— اکاؤنٹ منتخب کریں —' : '— Select Account —'}</option>
                    {accounts.map(a => <option key={a.CA} value={a.CA}>{a.CA} — {a.AC_TITLE1}</option>)}
                  </select>
                </div>
              )}
              {form.OpeningType === 'Customer' && (
                <div className="field-group" style={{ gridColumn: '1/-1' }}>
                  <label>{isUrdu ? 'گاہک *' : 'Customer *'}</label>
                  <select className="select-field" value={form.PartyID || ''} onChange={e => setForm(f => ({ ...f, PartyID: e.target.value, PartyType: 'Customer' }))}>
                    <option value="">— {isUrdu ? 'منتخب کریں' : 'Select'} —</option>
                    {customers.map(c => <option key={c.CustomerID} value={c.CustomerID}>{c.CustomerName}</option>)}
                  </select>
                </div>
              )}
              {form.OpeningType === 'Supplier' && (
                <div className="field-group" style={{ gridColumn: '1/-1' }}>
                  <label>{isUrdu ? 'سپلائر *' : 'Supplier *'}</label>
                  <select className="select-field" value={form.PartyID || ''} onChange={e => setForm(f => ({ ...f, PartyID: e.target.value, PartyType: 'Supplier' }))}>
                    <option value="">— {isUrdu ? 'منتخب کریں' : 'Select'} —</option>
                    {suppliers.map(s => <option key={s.SupplierID} value={s.SupplierID}>{s.SupplierName}</option>)}
                  </select>
                </div>
              )}
              {form.OpeningType === 'Inventory' && (<>
                <div className="field-group" style={{ gridColumn: '1/-1' }}>
                  <label>{isUrdu ? 'آئٹم *' : 'Item *'}</label>
                  <select className="select-field" value={form.ItemID || ''} onChange={e => setForm(f => ({ ...f, ItemID: e.target.value }))}>
                    <option value="">— {isUrdu ? 'آئٹم' : 'Select Item'} —</option>
                    {items.map(i => <option key={i.ItemID} value={i.ItemID}>{i.ItemName} ({i.UOM})</option>)}
                  </select>
                </div>
                <div className="field-group">
                  <label>{isUrdu ? 'گودام' : 'Warehouse'}</label>
                  <select className="select-field" value={form.WarehouseID || ''} onChange={e => setForm(f => ({ ...f, WarehouseID: e.target.value }))}>
                    <option value="">{isUrdu ? '— اختیاری —' : '— Optional —'}</option>
                    {warehouses.map(w => <option key={w.WarehouseID} value={w.WarehouseID}>{w.WarehouseName}</option>)}
                  </select>
                </div>
                <div className="field-group">
                  <label>{isUrdu ? 'مقدار (KG)' : 'Opening Qty (KG)'}</label>
                  <input type="number" min="0" step="0.001" className="input-field" value={form.Quantity || ''} placeholder="0.000"
                    onChange={e => setForm(f => ({ ...f, Quantity: e.target.value }))} />
                </div>
                <div className="field-group">
                  <label>{isUrdu ? 'قیمت/یونٹ (Rs.)' : 'Unit Cost (Rs.)'}</label>
                  <input type="number" min="0" step="0.01" className="input-field" value={form.UnitCost || ''} placeholder="0.00"
                    onChange={e => setForm(f => ({ ...f, UnitCost: e.target.value }))} />
                </div>
                {form.Quantity && form.UnitCost && (
                  <div style={{ gridColumn: '1/-1', background: 'rgba(16,185,129,0.08)', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: 'var(--emerald)', fontWeight: 700 }}>
                    {isUrdu ? 'کل قیمت:' : 'Total Value:'} Rs.{fmt(Number(form.Quantity || 0) * Number(form.UnitCost || 0))}
                  </div>
                )}
              </>)}

              {form.OpeningType !== 'Inventory' && (<>
                <div className="field-group">
                  <label>{isUrdu ? 'ڈیبٹ (Rs.)' : 'Debit (Rs.)'}</label>
                  <input type="number" min="0" step="0.01" className="input-field" value={form.DebitAmount || ''} placeholder="0.00"
                    onChange={e => setForm(f => ({ ...f, DebitAmount: e.target.value, CreditAmount: '' }))} />
                </div>
                <div className="field-group">
                  <label>{isUrdu ? 'کریڈٹ (Rs.)' : 'Credit (Rs.)'}</label>
                  <input type="number" min="0" step="0.01" className="input-field" value={form.CreditAmount || ''} placeholder="0.00"
                    onChange={e => setForm(f => ({ ...f, CreditAmount: e.target.value, DebitAmount: '' }))} />
                </div>
              </>)}

              <div className="field-group" style={{ gridColumn: '1/-1' }}>
                <label>{isUrdu ? 'نوٹ' : 'Narration'}</label>
                <input type="text" className="input-field" value={form.Narration || ''} onChange={e => setForm(f => ({ ...f, Narration: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowForm(false)} disabled={saving}>{isUrdu ? 'منسوخ' : 'Cancel'}</button>
              <button className="btn btn-primary" onClick={handlePost} disabled={saving}><CheckCircle size={13} />{saving ? '…' : (isUrdu ? 'پوسٹ کریں' : 'Post')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
