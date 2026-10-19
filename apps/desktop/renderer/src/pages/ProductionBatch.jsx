/**
 * ProductionBatch.jsx — Complete Flour Mill Production Batch
 *
 * Line types:
 *   OUTPUT — main finished goods (atta, maida, suji) that bear cost
 *   LOSS   — waste (bhusa, farshi, khaak) — goes to stock at zero cost
 *   GAIN   — unexpected extra output — bears cost like OUTPUT
 *
 * On POST the backend:
 *   1. Deducts wheat / raw material stock at avg cost
 *   2. Allocates input cost to OUTPUT+GAIN lines by weight (or %)
 *   3. Adds OUTPUT+GAIN to stock at allocated cost/kg
 *   4. Adds LOSS lines to stock at Rs.0
 *   5. Posts: Dr WIP / Cr Raw Material  →  Dr FG / Cr WIP
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, X, Save, RefreshCw, CheckCircle, Factory, Printer, Edit2, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import { useLang } from '../context/LanguageContext';
import { printProductionSlip } from '../utils/printPDF';

const api = window.electronAPI;

const EMPTY_HDR = () => ({
  BatchID: null, BatchNo: '', BatchDate: new Date().toISOString().slice(0, 10),
  RecipeID: '', InputItemID: '', InputQty: '', WarehouseID: '',
  CostingMethod: 'weight', Narration: '',
});
const newOutputLine = () => ({ ItemID: '', Quantity: '', PackUnitID: '', LineType: 'OUTPUT', IsLoss: 0 });
const newLossLine   = () => ({ ItemID: '', Quantity: '', PackUnitID: '', LineType: 'LOSS',   IsLoss: 1 });

function fmt(n, d = 2) {
  if (n == null || n === '') return '—';
  return Number(n).toLocaleString('en-PK', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtD(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return d; }
}

// ── Stock balance badge ────────────────────────────────────────────────────────
function StockBadge({ qty, uom, isUrdu }) {
  if (qty == null) return null;
  const low = qty <= 0;
  return (
    <span style={{
      fontSize: 11, padding: '2px 8px', borderRadius: 10, marginInlineStart: 6,
      background: low ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)',
      color: low ? 'var(--rose)' : 'var(--emerald)',
    }}>
      {isUrdu ? 'اسٹاک:' : 'Stock:'} {fmt(qty, 3)} {uom}
    </span>
  );
}

export default function ProductionBatch({ currentDb, dbInfo, showNotification }) {
  const { isUrdu } = useLang();
  const dir = isUrdu ? 'rtl' : 'ltr';

  const [batches,    setBatches]    = useState([]);
  const [recipes,    setRecipes]    = useState([]);
  const [items,      setItems]      = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [packUnits,  setPackUnits]  = useState([]); // all packaging units
  const [stockMap,   setStockMap]   = useState({}); // itemId → { qty, uom }
  const [loading,    setLoading]    = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [posting,    setPosting]    = useState(null);
  const [showForm,   setShowForm]   = useState(false);
  const [header,     setHeader]     = useState(EMPTY_HDR());
  const [outputLines, setOutputLines] = useState([newOutputLine()]);
  const [lossLines,   setLossLines]   = useState([newLossLine()]);

  // ── Load ────────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!currentDb) return;
    setLoading(true);
    try {
      const [bRes, rRes, iRes, wRes, sRes, pkRes] = await Promise.all([
        api.getProductionBatches({ dbPath: currentDb }),
        api.getRecipes({ dbPath: currentDb }),
        api.getMillItems(currentDb),
        api.getWarehouses(currentDb),
        api.getStockMovements({ dbPath: currentDb }),
        api.getPackagingUnits({ dbPath: currentDb }).catch(() => ({ success: false, data: [] })),
      ]);
      if (bRes.success)  setBatches(bRes.data || []);
      if (rRes.success)  setRecipes(rRes.data || []);
      if (iRes.success)  setItems(iRes.data || []);
      if (wRes.success)  setWarehouses(wRes.data || []);
      if (pkRes.success) setPackUnits(pkRes.data || []);
      if (sRes.success) {
        const map = {};
        (sRes.summary || []).forEach(s => {
          map[s.ItemID] = { qty: Number(s.balance || 0), uom: s.UOM };
        });
        setStockMap(map);
      }
    } finally { setLoading(false); }
  }, [currentDb]);

  useEffect(() => { load(); }, [load, dbInfo?.lastRefresh]);

  // ── When recipe changes, pre-fill lines ───────────────────────────────────
  function onRecipeChange(rid) {
    setHeader(h => ({ ...h, RecipeID: rid }));
    const recipe = recipes.find(r => r.RecipeID === Number(rid));
    if (!recipe) return;
    // Pre-fill input from first recipe input
    if (recipe.inputs?.length) {
      setHeader(h => ({ ...h, InputItemID: String(recipe.inputs[0].ItemID) }));
    }
    // Pre-fill outputs and losses from recipe outputs
    if (recipe.outputs?.length) {
      const outs  = recipe.outputs.filter(o => !o.IsLoss).map(o => ({ ItemID: String(o.ItemID), Quantity: '', LineType: 'OUTPUT', IsLoss: 0 }));
      const losses = recipe.outputs.filter(o => o.IsLoss).map(o => ({ ItemID: String(o.ItemID), Quantity: '', LineType: 'LOSS', IsLoss: 1 }));
      setOutputLines(outs.length ? outs : [newOutputLine()]);
      setLossLines(losses.length ? losses : [newLossLine()]);
    }
  }

  // ── Live recovery calculation ─────────────────────────────────────────────
  const stats = useMemo(() => {
    const inputQty = Number(header.InputQty || 0);
    const totalOutput = outputLines.reduce((s, l) => s + Number(l.Quantity || 0), 0);
    const totalLoss   = lossLines.reduce((s, l) => s + Number(l.Quantity || 0), 0);
    const unaccounted = inputQty - totalOutput - totalLoss;
    const recoveryPct = inputQty > 0 ? (totalOutput / inputQty) * 100 : 0;
    const lossPct     = inputQty > 0 ? (totalLoss   / inputQty) * 100 : 0;
    return { inputQty, totalOutput, totalLoss, unaccounted, recoveryPct, lossPct };
  }, [header.InputQty, outputLines, lossLines]);

  // ── Open new batch form ────────────────────────────────────────────────────
  function openNew() {
    setHeader(EMPTY_HDR());
    setOutputLines([newOutputLine()]);
    setLossLines([newLossLine()]);
    setShowForm(true);
  }

  // ── Open edit (Draft only) ────────────────────────────────────────────────
  function openEdit(batch) {
    if (batch.Status === 'Posted') { showNotification(isUrdu ? 'پوسٹڈ بیچ ترمیم نہیں ہو سکتا' : 'Cannot edit a posted batch', 'error'); return; }
    setHeader({
      BatchID: batch.BatchID, BatchNo: batch.BatchNo, BatchDate: batch.BatchDate,
      RecipeID: String(batch.RecipeID || ''), InputItemID: String(batch.InputItemID || ''),
      InputQty: String(batch.InputQty || ''), WarehouseID: String(batch.WarehouseID || ''),
      CostingMethod: batch.CostingMethod || 'weight', Narration: batch.Narration || '',
    });
    const allLines = batch.lines || [];
    const outs   = allLines.filter(l => !l.IsLoss && l.LineType !== 'LOSS').map(l => ({ ItemID: String(l.ItemID), Quantity: String(l.Quantity), PackUnitID: String(l.PackUnitID || ''), LineType: l.LineType || 'OUTPUT', IsLoss: 0 }));
    const losses = allLines.filter(l => l.IsLoss || l.LineType === 'LOSS').map(l => ({ ItemID: String(l.ItemID), Quantity: String(l.Quantity), PackUnitID: String(l.PackUnitID || ''), LineType: 'LOSS', IsLoss: 1 }));
    setOutputLines(outs.length ? outs : [newOutputLine()]);
    setLossLines(losses.length ? losses : [newLossLine()]);
    setShowForm(true);
  }

  // ── Save ─────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!header.InputItemID) { showNotification(isUrdu ? 'خام مال منتخب کریں' : 'Select input item', 'error'); return; }
    if (!header.InputQty || Number(header.InputQty) <= 0) { showNotification(isUrdu ? 'خام مال کی مقدار درج کریں' : 'Enter input qty', 'error'); return; }
    const validOut  = outputLines.filter(l => l.ItemID && Number(l.Quantity) > 0);
    if (!validOut.length) { showNotification(isUrdu ? 'کم از کم ایک پیداوار لائن درج کریں' : 'Add at least one output line', 'error'); return; }

    const allLines = [
      ...validOut.map(l => ({ ItemID: Number(l.ItemID), Quantity: Number(l.Quantity), LineType: 'OUTPUT', IsLoss: 0, Rate: 0, PackUnitID: l.PackUnitID ? Number(l.PackUnitID) : null })),
      ...lossLines.filter(l => l.ItemID && Number(l.Quantity) > 0)
        .map(l => ({ ItemID: Number(l.ItemID), Quantity: Number(l.Quantity), LineType: 'LOSS', IsLoss: 1, Rate: 0, PackUnitID: l.PackUnitID ? Number(l.PackUnitID) : null })),
    ];

    setSaving(true);
    try {
      const res = await api.saveProductionBatch({
        dbPath: currentDb,
        batch: {
          ...header,
          RecipeID:    header.RecipeID   ? Number(header.RecipeID)   : null,
          InputItemID: header.InputItemID ? Number(header.InputItemID) : null,
          InputQty:    Number(header.InputQty),
          WarehouseID: header.WarehouseID ? Number(header.WarehouseID) : null,
          lines: allLines,
        },
      });
      if (res.success) {
        showNotification(isUrdu ? 'بیچ محفوظ ہو گیا' : 'Batch saved', 'success');
        setShowForm(false); load();
      } else showNotification(res.error || 'Save failed', 'error');
    } finally { setSaving(false); }
  }

  // ── Post ──────────────────────────────────────────────────────────────────
  async function handlePost(batchId) {
    setPosting(batchId);
    try {
      const res = await api.postProductionBatch({ dbPath: currentDb, BatchID: batchId });
      if (res.success) {
        showNotification(
          isUrdu
            ? 'بیچ پوسٹ — خام مال کٹوتی، پیداوار اسٹاک میں، اکاؤنٹنگ پوسٹ'
            : 'Batch posted — raw material deducted, outputs stocked, accounting posted',
          'success'
        );
        load();
      } else showNotification(res.error || 'Post failed', 'error');
    } finally { setPosting(null); }
  }

  // ── Print ─────────────────────────────────────────────────────────────────
  async function handlePrint(batch) {
    const prefs = await api.getPrefs().catch(() => ({}));
    await printProductionSlip({ batch, items, warehouses, companyName: prefs.companyName || 'Flouris ERP', isUrdu, logoData: prefs.logoData });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  const itemName = id => items.find(i => i.ItemID === Number(id))?.ItemName || `#${id}`;
  const whName   = id => warehouses.find(w => w.WarehouseID === Number(id))?.WarehouseName || '—';

  const statusBadge = status => {
    const cfg = { Draft: ['var(--amber)', 'rgba(217,119,6,0.12)'], Posted: ['var(--emerald)', 'rgba(16,185,129,0.12)'] };
    const [color, bg] = cfg[status] || ['var(--text-muted)', 'var(--bg-card)'];
    const label = { Draft: isUrdu ? 'مسودہ' : 'Draft', Posted: isUrdu ? 'پوسٹڈ' : 'Posted' }[status] || status;
    return <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: bg, color }}>{label}</span>;
  };

  // Returns packaging units that belong to a given itemId
  const packUnitsForItem = (itemId) =>
    packUnits.filter(p => p.ItemID === Number(itemId));

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="page" dir={dir}>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Factory size={20} style={{ display: 'inline', marginInlineEnd: 8 }} />
            {isUrdu ? 'پیداواری بیچ' : 'Production Batches'}
          </h1>
          <p className="page-subtitle">
            {isUrdu
              ? 'گندم سے آٹا، میدہ، چوکر، بھوسا — مکمل لاگت مختص'
              : 'Wheat → Atta, Maida, Bran, Bhusa — full cost allocation & accounting'}
          </p>
        </div>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={openNew} disabled={!currentDb}>
            <Plus size={14} /> {isUrdu ? 'نیا بیچ' : 'New Batch'}
          </button>
          <button className="btn btn-secondary" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {/* Batch list */}
      {!currentDb ? (
        <div className="empty-state"><div className="empty-state-icon"><Factory size={40} /></div><h3>{isUrdu ? 'ڈیٹا بیس منتخب نہیں' : 'No Database Selected'}</h3></div>
      ) : loading ? (
        <div className="empty-state"><div className="loading-spinner" style={{ margin: '0 auto' }} /></div>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{isUrdu ? 'بیچ نمبر' : 'Batch No'}</th>
                <th>{isUrdu ? 'تاریخ' : 'Date'}</th>
                <th>{isUrdu ? 'خام مال' : 'Input'}</th>
                <th className="text-right">{isUrdu ? 'مقدار' : 'Input Qty'}</th>
                <th className="text-right">{isUrdu ? 'ریکوری %' : 'Recovery %'}</th>
                <th className="text-right">{isUrdu ? 'کل لاگت' : 'Input Cost'}</th>
                <th>{isUrdu ? 'گودام' : 'WH'}</th>
                <th>{isUrdu ? 'حالت' : 'Status'}</th>
                <th style={{ width: 100 }}>{isUrdu ? 'عمل' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody>
              {batches.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
                  {isUrdu ? 'کوئی بیچ نہیں' : 'No batches yet'}
                </td></tr>
              ) : batches.map(b => {
                const totalOut = (b.lines || []).filter(l => !l.IsLoss && l.LineType !== 'LOSS').reduce((s, l) => s + Number(l.Quantity || 0), 0);
                const recPct   = b.InputQty > 0 ? (totalOut / Number(b.InputQty)) * 100 : 0;
                return (
                  <tr key={b.BatchID}>
                    <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--accent)' }}>{b.BatchNo}</td>
                    <td style={{ fontSize: 12 }}>{fmtD(b.BatchDate)}</td>
                    <td className="account-name">{b.InputItemName || itemName(b.InputItemID)}</td>
                    <td className="text-right" style={{ fontSize: 12 }}>{fmt(b.InputQty, 3)} KG</td>
                    <td className="text-right">
                      {b.Status === 'Posted' ? (
                        <span style={{ color: recPct >= 95 ? 'var(--emerald)' : recPct >= 80 ? 'var(--amber)' : 'var(--rose)', fontWeight: 700 }}>
                          {fmt(recPct, 1)}%
                        </span>
                      ) : '—'}
                    </td>
                    <td className="text-right" style={{ fontSize: 12 }}>
                      {b.TotalInputCost > 0 ? `Rs.${fmt(b.TotalInputCost)}` : '—'}
                    </td>
                    <td style={{ fontSize: 12 }}>{whName(b.WarehouseID)}</td>
                    <td>{statusBadge(b.Status)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {b.Status === 'Draft' && (
                          <>
                            <button className="btn-icon" title={isUrdu ? 'ترمیم' : 'Edit'} onClick={() => openEdit(b)}>
                              <Edit2 size={12} />
                            </button>
                            <button className="btn-icon" style={{ color: 'var(--emerald)' }} title={isUrdu ? 'پوسٹ' : 'Post'}
                              onClick={() => handlePost(b.BatchID)} disabled={posting === b.BatchID}>
                              <CheckCircle size={13} />
                            </button>
                          </>
                        )}
                        <button className="btn-icon btn-accent" title={isUrdu ? 'پرنٹ' : 'Print'} onClick={() => handlePrint(b)}>
                          <Printer size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Batch Form Modal ── */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-box modal-wide" onClick={e => e.stopPropagation()} dir={dir}
            style={{ maxWidth: 900, maxHeight: '95vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h3>{header.BatchID ? (isUrdu ? 'بیچ ترمیم' : 'Edit Batch') : (isUrdu ? 'نیا پیداواری بیچ' : 'New Production Batch')}</h3>
              <button className="btn-icon" onClick={() => setShowForm(false)}><X size={16} /></button>
            </div>

            {/* Header fields */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <div className="field-group">
                <label>{isUrdu ? 'بیچ نمبر' : 'Batch No'}</label>
                <input type="text" className="input-field" value={header.BatchNo || ''} placeholder={isUrdu ? 'خودکار' : 'Auto'}
                  onChange={e => setHeader(h => ({ ...h, BatchNo: e.target.value }))} />
              </div>
              <div className="field-group">
                <label>{isUrdu ? 'تاریخ *' : 'Date *'}</label>
                <input type="date" className="input-field" value={header.BatchDate}
                  onChange={e => setHeader(h => ({ ...h, BatchDate: e.target.value }))} />
              </div>
              <div className="field-group">
                <label>{isUrdu ? 'ریسیپی' : 'Recipe (optional)'}</label>
                <select className="select-field" value={header.RecipeID || ''} onChange={e => onRecipeChange(e.target.value)}>
                  <option value="">{isUrdu ? '— اختیاری —' : '— Optional —'}</option>
                  {recipes.map(r => <option key={r.RecipeID} value={r.RecipeID}>{r.RecipeName}</option>)}
                </select>
              </div>

              {/* Input item + stock */}
              <div className="field-group">
                <label>
                  {isUrdu ? 'خام مال *' : 'Input Item *'}
                  {header.InputItemID && stockMap[Number(header.InputItemID)] && (
                    <StockBadge qty={stockMap[Number(header.InputItemID)].qty} uom={stockMap[Number(header.InputItemID)].uom} isUrdu={isUrdu} />
                  )}
                </label>
                <select className="select-field" value={header.InputItemID || ''} onChange={e => setHeader(h => ({ ...h, InputItemID: e.target.value }))}>
                  <option value="">{isUrdu ? '— منتخب کریں —' : '— Select —'}</option>
                  {items.map(i => <option key={i.ItemID} value={i.ItemID}>{i.ItemName} ({i.UOM})</option>)}
                </select>
              </div>
              <div className="field-group">
                <label>{isUrdu ? 'مقدار (KG) *' : 'Input Qty (KG) *'}</label>
                <input type="number" min="0" step="0.001" className="input-field"
                  value={header.InputQty || ''} placeholder="0.000"
                  onChange={e => setHeader(h => ({ ...h, InputQty: e.target.value }))} />
              </div>
              <div className="field-group">
                <label>{isUrdu ? 'گودام' : 'Warehouse'}</label>
                <select className="select-field" value={header.WarehouseID || ''} onChange={e => setHeader(h => ({ ...h, WarehouseID: e.target.value }))}>
                  <option value="">{isUrdu ? '— اختیاری —' : '— Optional —'}</option>
                  {warehouses.map(w => <option key={w.WarehouseID} value={w.WarehouseID}>{w.WarehouseName}</option>)}
                </select>
              </div>
              <div className="field-group">
                <label>{isUrdu ? 'لاگت تقسیم طریقہ' : 'Cost Method'}</label>
                <select className="select-field" value={header.CostingMethod || 'weight'} onChange={e => setHeader(h => ({ ...h, CostingMethod: e.target.value }))}>
                  <option value="weight">{isUrdu ? 'وزن کے تناسب سے' : 'By Weight Proportion'}</option>
                  <option value="pct">{isUrdu ? 'ریسیپی فیصد سے' : 'By Recipe % Allocation'}</option>
                </select>
              </div>
              <div className="field-group" style={{ gridColumn: 'span 2' }}>
                <label>{isUrdu ? 'نوٹ' : 'Narration'}</label>
                <input type="text" className="input-field" value={header.Narration || ''}
                  onChange={e => setHeader(h => ({ ...h, Narration: e.target.value }))} />
              </div>
            </div>

            {/* ── Live Recovery Bar ── */}
            {stats.inputQty > 0 && (
              <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <TrendingUp size={13} color="var(--emerald)" />
                  <span>{isUrdu ? 'ریکوری' : 'Recovery'}: <strong style={{ color: stats.recoveryPct >= 80 ? 'var(--emerald)' : 'var(--amber)' }}>{fmt(stats.recoveryPct, 1)}%</strong> ({fmt(stats.totalOutput, 3)} KG)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <TrendingDown size={13} color="var(--rose)" />
                  <span>{isUrdu ? 'ضائع' : 'Loss/Waste'}: <strong style={{ color: 'var(--rose)' }}>{fmt(stats.lossPct, 1)}%</strong> ({fmt(stats.totalLoss, 3)} KG)</span>
                </div>
                {Math.abs(stats.unaccounted) > 0.5 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--amber)' }}>
                    <AlertTriangle size={13} />
                    <span>{isUrdu ? 'بے حساب' : 'Unaccounted'}: {fmt(stats.unaccounted, 3)} KG</span>
                  </div>
                )}
              </div>
            )}

            {/* ── OUTPUT lines (finished goods — bear cost) ── */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--emerald)' }}>
                  📦 {isUrdu ? 'پیداوار (آٹا، میدہ، سوجی وغیرہ)' : 'Outputs — Finished Goods (Atta, Maida, Suji etc.)'}
                </span>
                <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }}
                  onClick={() => setOutputLines(l => [...l, newOutputLine()])}>
                  <Plus size={12} /> {isUrdu ? 'لائن' : 'Line'}
                </button>
              </div>
              <table className="data-table" style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                <thead>
                  <tr>
                    <th>{isUrdu ? 'آئٹم' : 'Item'}</th>
                    <th style={{ width: 160 }}>{isUrdu ? 'پیکنگ یونٹ' : 'Packaging Unit'}</th>
                    <th style={{ width: 130 }}>{isUrdu ? 'مقدار (KG)' : 'Qty (KG)'}</th>
                    <th style={{ width: 36 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {outputLines.map((line, i) => (
                    <tr key={i}>
                      <td style={{ padding: '5px 8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <select className="select-field" style={{ width: '100%', fontSize: 12 }} value={line.ItemID || ''} onChange={e => {
                            const next = [...outputLines];
                            next[i] = { ...next[i], ItemID: e.target.value, PackUnitID: '' };
                            setOutputLines(next);
                          }}>
                            <option value="">{isUrdu ? '— آئٹم —' : '— Item —'}</option>
                            {items.map(it => <option key={it.ItemID} value={it.ItemID}>{it.ItemName}</option>)}
                          </select>
                          {line.ItemID && stockMap[Number(line.ItemID)] && (
                            <span style={{ fontSize: 10, marginInlineStart: 6, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                              {fmt(stockMap[Number(line.ItemID)].qty, 1)} KG
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '5px 8px' }}>
                        {line.ItemID && packUnitsForItem(line.ItemID).length > 0 ? (
                          <select className="select-field" style={{ width: '100%', fontSize: 11 }}
                            value={line.PackUnitID || ''}
                            onChange={e => { const next = [...outputLines]; next[i] = { ...next[i], PackUnitID: e.target.value }; setOutputLines(next); }}>
                            <option value="">{isUrdu ? '— KG (پہلے سے) —' : '— KG (default) —'}</option>
                            {packUnitsForItem(line.ItemID).map(p => (
                              <option key={p.PackUnitID} value={p.PackUnitID}>{p.UnitLabel} ({p.WeightKg} kg)</option>
                            ))}
                          </select>
                        ) : (
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', padding: '0 4px' }}>KG</span>
                        )}
                      </td>
                      <td style={{ padding: '5px 8px' }}>
                        <input type="number" min="0" step="0.001" className="input-field" style={{ width: '100%', textAlign: 'right' }}
                          value={line.Quantity || ''} placeholder="0.000"
                          onChange={e => { const next = [...outputLines]; next[i] = { ...next[i], Quantity: e.target.value }; setOutputLines(next); }} />
                      </td>
                      <td style={{ padding: '5px 4px' }}>
                        {outputLines.length > 1 && (
                          <button className="btn-icon btn-icon-danger" onClick={() => setOutputLines(l => l.filter((_, idx) => idx !== i))}>
                            <X size={12} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2} style={{ padding: '8px 14px', fontWeight: 700 }}>{isUrdu ? 'کل پیداوار' : 'Total Output'}</td>
                    <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--emerald)' }}>
                      {fmt(stats.totalOutput, 3)} KG
                      {stats.inputQty > 0 && ` (${fmt(stats.recoveryPct, 1)}%)`}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* ── LOSS/WASTE lines (bhusa, farshi — zero cost) ── */}
            <div style={{ padding: '14px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--rose)' }}>
                  🌾 {isUrdu ? 'ضائع / بھوسا / فرشی (لاگت صفر)' : 'Waste / Bhusa / Farshi (zero cost to stock)'}
                </span>
                <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }}
                  onClick={() => setLossLines(l => [...l, newLossLine()])}>
                  <Plus size={12} /> {isUrdu ? 'لائن' : 'Line'}
                </button>
              </div>
              <table className="data-table" style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                <thead>
                  <tr>
                    <th>{isUrdu ? 'آئٹم' : 'Item'}</th>
                    <th style={{ width: 160 }}>{isUrdu ? 'پیکنگ یونٹ' : 'Packaging Unit'}</th>
                    <th style={{ width: 130 }}>{isUrdu ? 'مقدار (KG)' : 'Qty (KG)'}</th>
                    <th style={{ width: 36 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {lossLines.map((line, i) => (
                    <tr key={i}>
                      <td style={{ padding: '5px 8px' }}>
                        <select className="select-field" style={{ width: '100%', fontSize: 12 }} value={line.ItemID || ''} onChange={e => {
                          const next = [...lossLines];
                          next[i] = { ...next[i], ItemID: e.target.value, PackUnitID: '' };
                          setLossLines(next);
                        }}>
                          <option value="">{isUrdu ? '— آئٹم —' : '— Item —'}</option>
                          {items.map(it => <option key={it.ItemID} value={it.ItemID}>{it.ItemName}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '5px 8px' }}>
                        {line.ItemID && packUnitsForItem(line.ItemID).length > 0 ? (
                          <select className="select-field" style={{ width: '100%', fontSize: 11 }}
                            value={line.PackUnitID || ''}
                            onChange={e => { const next = [...lossLines]; next[i] = { ...next[i], PackUnitID: e.target.value }; setLossLines(next); }}>
                            <option value="">{isUrdu ? '— KG (پہلے سے) —' : '— KG (default) —'}</option>
                            {packUnitsForItem(line.ItemID).map(p => (
                              <option key={p.PackUnitID} value={p.PackUnitID}>{p.UnitLabel} ({p.WeightKg} kg)</option>
                            ))}
                          </select>
                        ) : (
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', padding: '0 4px' }}>KG</span>
                        )}
                      </td>
                      <td style={{ padding: '5px 8px' }}>
                        <input type="number" min="0" step="0.001" className="input-field" style={{ width: '100%', textAlign: 'right' }}
                          value={line.Quantity || ''} placeholder="0.000"
                          onChange={e => { const next = [...lossLines]; next[i] = { ...next[i], Quantity: e.target.value }; setLossLines(next); }} />
                      </td>
                      <td style={{ padding: '5px 4px' }}>
                        {lossLines.length > 1 && (
                          <button className="btn-icon btn-icon-danger" onClick={() => setLossLines(l => l.filter((_, idx) => idx !== i))}>
                            <X size={12} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2} style={{ padding: '8px 14px', fontWeight: 700 }}>{isUrdu ? 'کل ضائع' : 'Total Waste'}</td>
                    <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--rose)' }}>
                      {fmt(stats.totalLoss, 3)} KG
                      {stats.inputQty > 0 && ` (${fmt(stats.lossPct, 1)}%)`}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowForm(false)} disabled={saving}>{isUrdu ? 'واپس' : 'Cancel'}</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                <Save size={13} /> {saving ? '…' : (isUrdu ? 'محفوظ کریں' : 'Save Batch')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
