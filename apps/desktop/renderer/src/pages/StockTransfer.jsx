import React, { useState, useEffect, useCallback } from 'react';
import { Plus, X, Save, ArrowRightLeft } from 'lucide-react';
import { useLang } from '../context/LanguageContext';

const api = window.electronAPI;
const EMPTY_LINE = () => ({ ItemID: '', Quantity: '', PackUnitID: '' });

function fmtQty(n) { if (n == null) return '—'; return Number(n).toLocaleString('en-PK', { minimumFractionDigits: 3, maximumFractionDigits: 3 }); }

export default function StockTransfer({ currentDb, dbInfo, showNotification }) {
  const { isUrdu } = useLang();
  const dir = isUrdu ? 'rtl' : 'ltr';
  const [items,      setItems]      = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [packUnits,  setPackUnits]  = useState([]);
  const [stockSummary, setStockSummary] = useState([]); // for showing current balances
  const [saving,     setSaving]     = useState(false);
  const [form, setForm] = useState({
    TransferDate: new Date().toISOString().slice(0,10),
    FromWarehouseID: '', ToWarehouseID: '', Narration: '',
    lines: [EMPTY_LINE()],
  });

  const load = useCallback(async () => {
    if (!currentDb) return;
    const [iRes, wRes, pkRes, sRes] = await Promise.all([
      api.getMillItems(currentDb),
      api.getWarehouses(currentDb),
      api.getPackagingUnits({ dbPath: currentDb }).catch(() => ({ success: false, data: [] })),
      api.getStockMovements({ dbPath: currentDb }),
    ]);
    if (iRes.success)  setItems(iRes.data);
    if (wRes.success)  setWarehouses(wRes.data);
    if (pkRes.success) setPackUnits(pkRes.data || []);
    if (sRes.success)  setStockSummary(sRes.summary || []);
  }, [currentDb]);

  useEffect(() => { load(); }, [load, dbInfo?.lastRefresh]);

  function setLine(i, field, val) {
    setForm(f => {
      const lines = [...f.lines];
      // When item changes, reset PackUnitID
      lines[i] = field === 'ItemID'
        ? { ...lines[i], ItemID: val, PackUnitID: '' }
        : { ...lines[i], [field]: val };
      return { ...f, lines };
    });
  }

  // Current stock balance for an item in FromWarehouse
  function currentStock(itemId) {
    if (!form.FromWarehouseID || !itemId) return null;
    const row = stockSummary.find(s =>
      s.ItemID === Number(itemId) &&
      (s.WarehouseID == null || s.WarehouseID === Number(form.FromWarehouseID))
    );
    return row ? Number(row.balance) : null;
  }

  // Packaging units for an item
  const packsFor = (itemId) => packUnits.filter(p => p.ItemID === Number(itemId) && p.Active !== 0);

  async function handleSave() {
    if (!form.FromWarehouseID || !form.ToWarehouseID) {
      showNotification(isUrdu ? 'دونوں گودام منتخب کریں' : 'Select both warehouses', 'error'); return;
    }
    if (form.FromWarehouseID === form.ToWarehouseID) {
      showNotification(isUrdu ? 'گودام مختلف ہونے چاہیں' : 'Warehouses must be different', 'error'); return;
    }
    const validLines = form.lines.filter(l => l.ItemID && Number(l.Quantity) > 0);
    if (!validLines.length) {
      showNotification(isUrdu ? 'کم از کم ایک آئٹم درج کریں' : 'Add at least one item', 'error'); return;
    }
    setSaving(true);
    try {
      const res = await api.saveStockTransfer({
        dbPath: currentDb,
        transfer: {
          ...form,
          FromWarehouseID: Number(form.FromWarehouseID),
          ToWarehouseID:   Number(form.ToWarehouseID),
          lines: validLines.map(l => ({
            ItemID:     Number(l.ItemID),
            Quantity:   Number(l.Quantity),
            PackUnitID: l.PackUnitID ? Number(l.PackUnitID) : null,
          })),
        },
      });
      if (res.success) {
        showNotification(isUrdu ? 'اسٹاک ٹرانسفر ہو گیا' : 'Stock transferred successfully', 'success');
        setForm({
          TransferDate: new Date().toISOString().slice(0,10),
          FromWarehouseID: '', ToWarehouseID: '', Narration: '',
          lines: [EMPTY_LINE()],
        });
        load();
      } else showNotification(res.error || 'Transfer failed', 'error');
    } finally { setSaving(false); }
  }

  return (
    <div className="page" dir={dir}>
      <div className="page-header">
        <div>
          <h1 className="page-title">{isUrdu ? 'اسٹاک ٹرانسفر' : 'Stock Transfer'}</h1>
          <p className="page-subtitle">{isUrdu ? 'ایک گودام سے دوسرے گودام میں اسٹاک منتقل کریں' : 'Move stock between warehouses without P&L impact'}</p>
        </div>
      </div>

      {!currentDb ? (
        <div className="empty-state">
          <div className="empty-state-icon"><ArrowRightLeft size={40} /></div>
          <h3>{isUrdu ? 'ڈیٹا بیس منتخب نہیں' : 'No Database Selected'}</h3>
        </div>
      ) : (
        <div className="settings-section" style={{ maxWidth: 760 }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div className="field-group">
              <label>{isUrdu ? 'تاریخ *' : 'Date *'}</label>
              <input type="date" className="input-field" value={form.TransferDate}
                onChange={e => setForm(f => ({ ...f, TransferDate: e.target.value }))} />
            </div>
            <div className="field-group">
              <label>{isUrdu ? 'از گودام *' : 'From Warehouse *'}</label>
              <select className="select-field" value={form.FromWarehouseID || ''}
                onChange={e => setForm(f => ({ ...f, FromWarehouseID: e.target.value }))}>
                <option value="">{isUrdu ? '— منتخب —' : '— Select —'}</option>
                {warehouses.map(w => <option key={w.WarehouseID} value={w.WarehouseID}>{w.WarehouseName}</option>)}
              </select>
            </div>
            <div className="field-group">
              <label>{isUrdu ? 'بہ گودام *' : 'To Warehouse *'}</label>
              <select className="select-field" value={form.ToWarehouseID || ''}
                onChange={e => setForm(f => ({ ...f, ToWarehouseID: e.target.value }))}>
                <option value="">{isUrdu ? '— منتخب —' : '— Select —'}</option>
                {warehouses.map(w => <option key={w.WarehouseID} value={w.WarehouseID}>{w.WarehouseName}</option>)}
              </select>
            </div>
            <div className="field-group" style={{ gridColumn: 'span 3' }}>
              <label>{isUrdu ? 'نوٹ' : 'Narration'}</label>
              <input type="text" className="input-field" value={form.Narration || ''}
                onChange={e => setForm(f => ({ ...f, Narration: e.target.value }))} />
            </div>
          </div>

          {/* Lines header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{isUrdu ? 'آئٹم' : 'Items to Transfer'}</span>
            <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }}
              onClick={() => setForm(f => ({ ...f, lines: [...f.lines, EMPTY_LINE()] }))}>
              <Plus size={12} />
            </button>
          </div>

          {/* Lines table */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{isUrdu ? 'آئٹم' : 'Item'}</th>
                  <th style={{ width: 170 }}>{isUrdu ? 'پیکنگ یونٹ' : 'Packaging Unit'}</th>
                  <th style={{ width: 150 }}>{isUrdu ? 'مقدار (KG)' : 'Quantity (KG)'}</th>
                  <th style={{ width: 90 }}>{isUrdu ? 'موجودہ' : 'On Hand'}</th>
                  <th style={{ width: 36 }}></th>
                </tr>
              </thead>
              <tbody>
                {form.lines.map((line, i) => {
                  const packs   = line.ItemID ? packsFor(line.ItemID) : [];
                  const onHand  = currentStock(line.ItemID);
                  const tooLow  = onHand !== null && Number(line.Quantity) > onHand;
                  return (
                    <tr key={i}>
                      {/* Item */}
                      <td style={{ padding: '5px 8px' }}>
                        <select className="select-field" style={{ width: '100%', fontSize: 12 }}
                          value={line.ItemID || ''}
                          onChange={e => setLine(i, 'ItemID', e.target.value)}>
                          <option value="">{isUrdu ? '— آئٹم —' : '— Item —'}</option>
                          {items.map(it => <option key={it.ItemID} value={it.ItemID}>{it.ItemName} ({it.UOM})</option>)}
                        </select>
                      </td>
                      {/* Packaging unit */}
                      <td style={{ padding: '5px 8px' }}>
                        {packs.length > 0 ? (
                          <select className="select-field" style={{ width: '100%', fontSize: 11 }}
                            value={line.PackUnitID || ''}
                            onChange={e => setLine(i, 'PackUnitID', e.target.value)}>
                            <option value="">{isUrdu ? '— KG —' : '— KG —'}</option>
                            {packs.map(p => (
                              <option key={p.PackUnitID} value={p.PackUnitID}>{p.UnitLabel} ({p.WeightKg} kg)</option>
                            ))}
                          </select>
                        ) : (
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', padding: '0 4px' }}>KG</span>
                        )}
                      </td>
                      {/* Qty */}
                      <td style={{ padding: '5px 8px' }}>
                        <input type="number" min="0" step="0.001" className="input-field"
                          style={{ width: '100%', textAlign: 'right', borderColor: tooLow ? 'var(--rose)' : undefined }}
                          value={line.Quantity || ''} placeholder="0"
                          onChange={e => setLine(i, 'Quantity', e.target.value)} />
                      </td>
                      {/* On-hand stock badge */}
                      <td style={{ padding: '5px 8px', textAlign: 'right', fontSize: 11 }}>
                        {onHand !== null ? (
                          <span style={{ color: tooLow ? 'var(--rose)' : 'var(--emerald)', fontWeight: 600 }}>
                            {fmtQty(onHand)}
                          </span>
                        ) : '—'}
                      </td>
                      {/* Remove */}
                      <td style={{ padding: '5px 4px' }}>
                        {form.lines.length > 1 && (
                          <button className="btn-icon btn-icon-danger"
                            onClick={() => setForm(f => ({ ...f, lines: f.lines.filter((_, idx) => idx !== i) }))}>
                            <X size={12} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            <Save size={13} />
            {saving ? '…' : (isUrdu ? 'ٹرانسفر کریں' : 'Execute Transfer')}
          </button>
        </div>
      )}
    </div>
  );
}
