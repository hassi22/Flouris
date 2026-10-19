import React, { useState, useEffect, useCallback } from 'react';
import { Save, ClipboardCheck } from 'lucide-react';
import { useLang } from '../context/LanguageContext';

const api = window.electronAPI;

function fmt(n, dec = 3) {
  if (!n && n !== 0) return '—';
  return Number(n).toLocaleString('en-PK', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

export default function StockAdjustment({ currentDb, dbInfo, showNotification }) {
  const { isUrdu } = useLang();
  const dir = isUrdu ? 'rtl' : 'ltr';

  const [items,        setItems]        = useState([]);
  const [warehouses,   setWarehouses]   = useState([]);
  const [stockSummary, setStockSummary] = useState([]);
  const [packUnits,    setPackUnits]    = useState([]);
  const [saving,       setSaving]       = useState(false);
  const [form, setForm] = useState({
    AdjustmentDate: new Date().toISOString().slice(0, 10),
    ItemID: '', WarehouseID: '', PhysicalQty: '', Narration: '',
  });
  const [systemQty, setSystemQty] = useState(null);

  const load = useCallback(async () => {
    if (!currentDb) return;
    const [iRes, wRes, sRes, pkRes] = await Promise.all([
      api.getMillItems(currentDb),
      api.getWarehouses(currentDb),
      api.getStockMovements({ dbPath: currentDb }),
      api.getPackagingUnits({ dbPath: currentDb }).catch(() => ({ success: false, data: [] })),
    ]);
    if (iRes.success)  setItems(iRes.data);
    if (wRes.success)  setWarehouses(wRes.data);
    if (sRes.success)  setStockSummary(sRes.summary || []);
    if (pkRes.success) setPackUnits(pkRes.data || []);
  }, [currentDb]);

  useEffect(() => { load(); }, [load, dbInfo?.lastRefresh]);

  // Update system qty when item selection changes
  useEffect(() => {
    if (!form.ItemID) { setSystemQty(null); return; }
    const row = stockSummary.find(s => s.ItemID === Number(form.ItemID));
    setSystemQty(row ? row.balance : 0);
  }, [form.ItemID, stockSummary]);

  const diff = (form.PhysicalQty !== '' && systemQty !== null)
    ? Number(form.PhysicalQty) - systemQty
    : null;

  // Compute packaging breakdown for a given item+qty
  function packBreakdown(itemId, qty) {
    if (!qty || qty <= 0) return [];
    return packUnits
      .filter(p => p.ItemID === Number(itemId) && p.WeightKg > 0)
      .map(p => {
        const bags = Math.floor(qty / p.WeightKg);
        const rem  = qty - bags * p.WeightKg;
        return { label: p.UnitLabel, bags, rem, wt: p.WeightKg };
      });
  }

  const selectedItem = items.find(i => i.ItemID === Number(form.ItemID));

  async function handleSave() {
    if (!form.ItemID) {
      showNotification(isUrdu ? 'آئٹم منتخب کریں' : 'Select an item', 'error'); return;
    }
    if (form.PhysicalQty === '') {
      showNotification(isUrdu ? 'جسمانی مقدار درج کریں' : 'Enter physical count', 'error'); return;
    }
    if (diff === 0) {
      showNotification(isUrdu ? 'کوئی فرق نہیں' : 'No difference — no adjustment needed', 'info'); return;
    }
    setSaving(true);
    try {
      const res = await api.saveStockAdjustment({
        dbPath: currentDb,
        adjustment: {
          AdjustmentDate: form.AdjustmentDate,
          ItemID:      Number(form.ItemID),
          WarehouseID: form.WarehouseID ? Number(form.WarehouseID) : null,
          PhysicalQty: Number(form.PhysicalQty),
          Narration:   form.Narration || `Stock Adjustment ${form.AdjustmentDate}`,
        },
      });
      if (res.success) {
        showNotification(
          isUrdu ? 'ایڈجسٹمنٹ محفوظ اور اکاؤنٹنگ پوسٹ ہو گئی' : 'Adjustment saved & accounting posted',
          'success'
        );
        setForm(f => ({ ...f, ItemID: '', WarehouseID: '', PhysicalQty: '', Narration: '' }));
        setSystemQty(null);
        load();
      } else showNotification(res.error || 'Save failed', 'error');
    } finally { setSaving(false); }
  }

  return (
    <div className="page" dir={dir}>
      <div className="page-header">
        <div>
          <h1 className="page-title">{isUrdu ? 'اسٹاک ایڈجسٹمنٹ' : 'Stock Adjustment'}</h1>
          <p className="page-subtitle">{isUrdu ? 'جسمانی گنتی سے نظام کے اسٹاک کو درست کریں' : 'Reconcile system stock with physical count'}</p>
        </div>
      </div>

      {!currentDb ? (
        <div className="empty-state">
          <div className="empty-state-icon"><ClipboardCheck size={40} /></div>
          <h3>{isUrdu ? 'ڈیٹا بیس منتخب نہیں' : 'No Database Selected'}</h3>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* ── Adjustment Form ── */}
          <div className="settings-section">
            <h3>{isUrdu ? 'ایڈجسٹمنٹ فارم' : 'Adjustment Form'}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Date */}
              <div className="field-group">
                <label>{isUrdu ? 'تاریخ *' : 'Date *'}</label>
                <input type="date" className="input-field" value={form.AdjustmentDate}
                  onChange={e => setForm(f => ({ ...f, AdjustmentDate: e.target.value }))} />
              </div>

              {/* Item */}
              <div className="field-group">
                <label>{isUrdu ? 'آئٹم *' : 'Item *'}</label>
                <select className="select-field" value={form.ItemID || ''}
                  onChange={e => setForm(f => ({ ...f, ItemID: e.target.value }))}>
                  <option value="">{isUrdu ? '— آئٹم منتخب کریں —' : '— Select Item —'}</option>
                  {items.map(i => <option key={i.ItemID} value={i.ItemID}>{i.ItemName} ({i.UOM})</option>)}
                </select>
              </div>

              {/* Warehouse */}
              <div className="field-group">
                <label>{isUrdu ? 'گودام' : 'Warehouse (optional)'}</label>
                <select className="select-field" value={form.WarehouseID || ''}
                  onChange={e => setForm(f => ({ ...f, WarehouseID: e.target.value }))}>
                  <option value="">{isUrdu ? '— تمام —' : '— All Warehouses —'}</option>
                  {warehouses.map(w => <option key={w.WarehouseID} value={w.WarehouseID}>{w.WarehouseName}</option>)}
                </select>
              </div>

              {/* System stock + packaging breakdown */}
              {systemQty !== null && (
                <div style={{ padding: '10px 12px', background: 'var(--accent-dim)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}>
                  <div style={{ marginBottom: 4 }}>
                    {isUrdu ? 'نظام اسٹاک' : 'System Stock'}:{' '}
                    <strong>{fmt(systemQty)} {selectedItem?.UOM || 'KG'}</strong>
                  </div>
                  {(() => {
                    const packs = packBreakdown(form.ItemID, systemQty);
                    return packs.length > 0 ? (
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
                        {packs.map((p, pi) => (
                          <span key={pi} style={{ whiteSpace: 'nowrap' }}>
                            <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{p.bags}</span>
                            {' '}{p.label}
                            {p.rem > 0.01 && <span style={{ color: 'var(--text-muted)' }}> + {fmt(p.rem)} KG</span>}
                          </span>
                        ))}
                      </div>
                    ) : null;
                  })()}
                </div>
              )}

              {/* Physical count */}
              <div className="field-group">
                <label>{isUrdu ? 'جسمانی گنتی *' : 'Physical Count *'}</label>
                <input type="number" min="0" step="0.001" className="input-field"
                  value={form.PhysicalQty || ''} placeholder="0"
                  onChange={e => setForm(f => ({ ...f, PhysicalQty: e.target.value }))} />
              </div>

              {/* Physical count packaging breakdown */}
              {form.PhysicalQty !== '' && Number(form.PhysicalQty) > 0 && form.ItemID && (() => {
                const packs = packBreakdown(form.ItemID, Number(form.PhysicalQty));
                return packs.length > 0 ? (
                  <div style={{ padding: '8px 12px', background: 'rgba(99,102,241,0.07)', borderRadius: 'var(--radius-sm)', fontSize: 11, color: 'var(--text-secondary)', display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
                    {packs.map((p, pi) => (
                      <span key={pi} style={{ whiteSpace: 'nowrap' }}>
                        <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{p.bags}</span>
                        {' '}{p.label}
                        {p.rem > 0.01 && <span style={{ color: 'var(--text-muted)' }}> + {fmt(p.rem)} KG</span>}
                      </span>
                    ))}
                  </div>
                ) : null;
              })()}

              {/* Difference badge */}
              {diff !== null && diff !== 0 && (
                <div style={{
                  padding: '10px 12px', borderRadius: 'var(--radius-sm)', fontSize: 13,
                  background: diff > 0 ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)',
                  color: diff > 0 ? 'var(--emerald)' : 'var(--rose)',
                }}>
                  {diff > 0 ? '⬆️' : '⬇️'}{' '}
                  {isUrdu ? 'فرق' : 'Difference'}:{' '}
                  <strong>{diff > 0 ? '+' : ''}{fmt(diff)}</strong>
                  {' — '}
                  {diff > 0
                    ? (isUrdu ? 'اسٹاک فائدہ' : 'Stock Gain')
                    : (isUrdu ? 'اسٹاک نقصان' : 'Stock Loss')}
                </div>
              )}
              {diff === 0 && form.PhysicalQty !== '' && (
                <div style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'rgba(16,185,129,0.1)', color: 'var(--emerald)' }}>
                  ✓ {isUrdu ? 'کوئی فرق نہیں' : 'No difference'}
                </div>
              )}

              {/* Narration */}
              <div className="field-group">
                <label>{isUrdu ? 'نوٹ' : 'Narration'}</label>
                <input type="text" className="input-field" value={form.Narration || ''}
                  onChange={e => setForm(f => ({ ...f, Narration: e.target.value }))} />
              </div>

              <button className="btn btn-primary" onClick={handleSave} disabled={saving || diff === 0}>
                <Save size={13} />
                {saving ? '…' : (isUrdu ? 'ایڈجسٹمنٹ محفوظ کریں' : 'Save Adjustment')}
              </button>
            </div>
          </div>

          {/* ── Current Stock Summary ── */}
          <div className="settings-section">
            <h3>{isUrdu ? 'موجودہ اسٹاک' : 'Current Stock Summary'}</h3>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{isUrdu ? 'آئٹم' : 'Item'}</th>
                    <th>{isUrdu ? 'یونٹ' : 'UOM'}</th>
                    <th className="text-right">{isUrdu ? 'بیلنس' : 'Balance'}</th>
                    <th>{isUrdu ? 'پیکنگ' : 'Packaging'}</th>
                  </tr>
                </thead>
                <tbody>
                  {stockSummary.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>
                        {isUrdu ? 'کوئی اسٹاک نہیں' : 'No stock data'}
                      </td>
                    </tr>
                  ) : stockSummary.map(s => {
                    const isSelected = Number(s.ItemID) === Number(form.ItemID);
                    const packs = packBreakdown(s.ItemID, s.balance);
                    return (
                      <tr key={s.ItemID}
                        style={{ background: isSelected ? 'var(--accent-dim)' : undefined, cursor: 'pointer' }}
                        onClick={() => setForm(f => ({ ...f, ItemID: String(s.ItemID) }))}>
                        <td className="account-name">{s.ItemName}</td>
                        <td style={{ fontSize: 12 }}>{s.UOM}</td>
                        <td className="text-right" style={{
                          color: s.balance < 0 ? 'var(--rose)' : 'var(--text-primary)', fontWeight: 600,
                        }}>
                          {fmt(s.balance)}
                        </td>
                        <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                          {packs.length === 0
                            ? <span style={{ color: 'var(--text-muted)' }}>—</span>
                            : packs.map((p, pi) => (
                              <span key={pi} style={{ display: 'block', whiteSpace: 'nowrap' }}>
                                <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{p.bags}</span>
                                {' '}{p.label}
                                {p.rem > 0.01 && <span style={{ color: 'var(--text-muted)' }}> +{fmt(p.rem)} KG</span>}
                              </span>
                            ))
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
