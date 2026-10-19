import React, { useState, useEffect, useCallback } from 'react';
import { Save, RefreshCw, Link, Info } from 'lucide-react';
import { useLang } from '../context/LanguageContext';

const api = window.electronAPI;

// CUSTOMER_RECEIVABLE and SUPPLIER_PAYABLE are intentionally excluded here.
// Each customer/supplier carries its own LinkedAccountCA, which is set in the
// Customer / Supplier profile page and is used directly by all posting flows.
// No global fallback mapping is needed for parties.
const PURPOSE_LABELS = {
  RAW_MATERIAL_INVENTORY:   { en: 'Raw Material Inventory', ur: 'خام مال انوینٹری' },
  FINISHED_GOODS_INVENTORY: { en: 'Finished Goods Inventory', ur: 'تیار مال انوینٹری' },
  BYPRODUCT_INVENTORY:      { en: 'By-Product Inventory (Bran etc.)', ur: 'ضمنی مال انوینٹری' },
  RAW_MATERIAL_PURCHASE:    { en: 'Raw Material Purchase Account', ur: 'خام مال خرید اکاؤنٹ' },
  SALES:                    { en: 'Sales Revenue Account', ur: 'فروخت آمدنی اکاؤنٹ' },
  SALES_RETURN:             { en: 'Sales Return Account', ur: 'واپسی فروخت اکاؤنٹ' },
  COGS:                     { en: 'Cost of Goods Sold (COGS)', ur: 'فروخت شدہ مال کی لاگت' },
  CASH:                     { en: 'Default Cash Account', ur: 'نقد اکاؤنٹ' },
  BANK:                     { en: 'Default Bank Account', ur: 'بینک اکاؤنٹ' },
  PRODUCTION_WIP:           { en: 'Production Work-In-Progress', ur: 'زیر عمل پیداوار' },
  PRODUCTION_VARIANCE:      { en: 'Production Variance', ur: 'پیداوار تفاوت' },
  STOCK_GAIN:               { en: 'Stock Gain / Excess Account', ur: 'اسٹاک فائدہ اکاؤنٹ' },
  STOCK_LOSS:               { en: 'Stock Loss / Shortage Account', ur: 'اسٹاک نقصان اکاؤنٹ' },
  TAX_PAYABLE:              { en: 'Tax Payable Account', ur: 'ٹیکس واجبات اکاؤنٹ' },
};

export default function AccountMappings({ currentDb, dbInfo, showNotification }) {
  const { isUrdu } = useLang();
  const dir = isUrdu ? 'rtl' : 'ltr';
  const [mappings, setMappings] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [pendingChanges, setPendingChanges] = useState({});

  const load = useCallback(async () => {
    if (!currentDb) return;
    setLoading(true);
    try {
      const [mRes, aRes] = await Promise.all([api.getAccountMappings({ dbPath: currentDb }), api.getChartOfAccounts(currentDb)]);
      if (mRes.success) setMappings(mRes.data);
      if (aRes.success) setAccounts(aRes.data);
    } finally { setLoading(false); }
  }, [currentDb]);

  useEffect(() => { load(); }, [load, dbInfo?.lastRefresh]);
  useEffect(() => { setPendingChanges({}); }, [currentDb]);

  const mappingMap = Object.fromEntries(mappings.map(m => [m.Purpose, m.AccountCA]));
  const acLabel = id => { if (!id) return ''; const a = accounts.find(x => Number(x.CA) === Number(id)); return a ? `${a.CA} — ${a.AC_TITLE1}` : `A/C #${id}`; };

  function onChange(purpose, ca) { setPendingChanges(p => ({ ...p, [purpose]: ca })); }

  async function handleSaveAll() {
    const entries = Object.entries(pendingChanges);
    if (!entries.length) { showNotification(isUrdu?'کوئی تبدیلی نہیں':'No changes to save', 'info'); return; }
    let ok = 0, err = 0;
    for (const [purpose, ca] of entries) {
      const res = await api.saveAccountMapping({ dbPath: currentDb, purpose, accountCA: ca ? Number(ca) : null });
      if (res.success) ok++; else err++;
    }
    if (err) showNotification(`${ok} saved, ${err} failed`, 'error');
    else { showNotification(isUrdu?`${ok} میپنگ محفوظ ہو گئیں`:`${ok} mapping(s) saved`, 'success'); setPendingChanges({}); load(); }
  }

  const groups = [
    { title: isUrdu?'انوینٹری اکاؤنٹس':'Inventory Accounts', purposes: ['RAW_MATERIAL_INVENTORY','FINISHED_GOODS_INVENTORY','BYPRODUCT_INVENTORY'] },
    { title: isUrdu?'خرید و فروخت':'Purchase & Sales', purposes: ['RAW_MATERIAL_PURCHASE','SALES','SALES_RETURN','COGS'] },
    { title: isUrdu?'نقد و بینک':'Cash & Bank', purposes: ['CASH','BANK'] },
    { title: isUrdu?'پیداوار':'Production', purposes: ['PRODUCTION_WIP','PRODUCTION_VARIANCE'] },
    { title: isUrdu?'اسٹاک ایڈجسٹمنٹ':'Stock Adjustment', purposes: ['STOCK_GAIN','STOCK_LOSS'] },
    { title: isUrdu?'ٹیکس':'Tax', purposes: ['TAX_PAYABLE'] },
  ];

  return (
    <div className="page" dir={dir}>
      <div className="page-header">
        <div><h1 className="page-title">{isUrdu?'اکاؤنٹ میپنگ':'Account Mappings'}</h1><p className="page-subtitle">{isUrdu?'ERP مقاصد کو اکاؤنٹس سے منسلک کریں':'Link ERP purposes to specific accounts for automatic posting'}</p></div>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={load} disabled={loading}><RefreshCw size={14} className={loading?'spin':''} /></button>
          {Object.keys(pendingChanges).length > 0 && <button className="btn btn-primary" onClick={handleSaveAll}><Save size={14} />{isUrdu?'تمام تبدیلیاں محفوظ کریں':`Save ${Object.keys(pendingChanges).length} Change(s)`}</button>}
        </div>
      </div>

      {!currentDb ? (
        <div className="empty-state"><div className="empty-state-icon"><Link size={40} /></div><h3>{isUrdu?'ڈیٹا بیس منتخب نہیں':'No Database Selected'}</h3></div>
      ) : loading ? (
        <div className="empty-state"><div className="loading-spinner" style={{ margin:'0 auto' }} /></div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          {accounts.length === 0 && <div className="error-banner">{isUrdu?'کوئی اکاؤنٹ نہیں ملا — پہلے Chart of Accounts میں اکاؤنٹ بنائیں':'No accounts found — create accounts first in Chart of Accounts'}</div>}

          {/* Party accounts note */}
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px',
            background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)',
            borderRadius: 8, fontSize: 13, color: 'var(--text-secondary)',
          }}>
            <Info size={16} style={{ color: 'var(--emerald)', flexShrink: 0, marginTop: 1 }} />
            <span>
              {isUrdu
                ? 'کسٹمر اور سپلائر اکاؤنٹس یہاں سیٹ نہیں ہوتے — ہر کسٹمر/سپلائر کے پروفائل میں "منسلک اکاؤنٹ" سیٹ کریں۔ خرید/فروخت پوسٹ ہوتے وقت اسی اکاؤنٹ کا استعمال ہوتا ہے۔'
                : 'Customer & Supplier accounts are not set here — each customer/supplier carries its own "Linked Account" set in its profile. That account is used directly when purchase/sales invoices are posted.'}
            </span>
          </div>
          {groups.map(group => (
            <div key={group.title} className="settings-section">
              <h3 style={{ display:'flex', alignItems:'center', gap:8 }}><Link size={16} style={{ color:'var(--accent)' }} />{group.title}</h3>
              {group.purposes.map(purpose => {
                const label = PURPOSE_LABELS[purpose];
                const currentCA = pendingChanges.hasOwnProperty(purpose) ? pendingChanges[purpose] : (mappingMap[purpose] || '');
                const isDirty = pendingChanges.hasOwnProperty(purpose);
                return (
                  <div key={purpose} className="setting-row">
                    <div className="setting-info">
                      <span className="setting-label" style={{ display:'flex', alignItems:'center', gap:6 }}>
                        {isUrdu ? label.ur : label.en}
                        {isDirty && <span style={{ fontSize:10, background:'var(--amber)', color:'white', padding:'1px 6px', borderRadius:8 }}>●</span>}
                      </span>
                      <span className="setting-desc" style={{ fontFamily:'monospace', fontSize:11 }}>{purpose}</span>
                    </div>
                    <div style={{ minWidth:280 }}>
                      <select className="select-field" style={{ width:'100%' }} value={currentCA||''} onChange={e => onChange(purpose, e.target.value)}>
                        <option value="">{isUrdu?'— میپ نہیں ہوا —':'— Not Mapped —'}</option>
                        {accounts.map(a => <option key={a.CA} value={a.CA}>{a.CA} — {a.AC_TITLE1}</option>)}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          {Object.keys(pendingChanges).length > 0 && (
            <div style={{ display:'flex', justifyContent:'flex-end' }}>
              <button className="btn btn-primary" onClick={handleSaveAll}><Save size={13} />{isUrdu?`${Object.keys(pendingChanges).length} تبدیلیاں محفوظ کریں`:`Save ${Object.keys(pendingChanges).length} Change(s)`}</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
