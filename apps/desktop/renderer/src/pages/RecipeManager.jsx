import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Edit2, X, Save, RefreshCw, FlaskConical } from 'lucide-react';
import { useLang } from '../context/LanguageContext';

const api = window.electronAPI;
const EMPTY_IN  = () => ({ ItemID: '', ExpectedQtyPct: '100', UOM: 'KG' });
const EMPTY_OUT = () => ({ ItemID: '', ExpectedPct: '', CostAllocPct: '', CostMethod: 'weight', IsLoss: false, UOM: 'KG' });
const EMPTY_RECIPE = () => ({ RecipeID: null, RecipeName: '', RecipeNameUr: '', Description: '', inputs: [EMPTY_IN()], outputs: [EMPTY_OUT()] });

export default function RecipeManager({ currentDb, dbInfo, showNotification }) {
  const { isUrdu } = useLang();
  const dir = isUrdu ? 'rtl' : 'ltr';
  const [recipes, setRecipes] = useState([]);
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]       = useState(EMPTY_RECIPE());
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const load = useCallback(async () => {
    if (!currentDb) return;
    setLoading(true);
    try {
      const [rRes, iRes] = await Promise.all([api.getRecipes({ dbPath: currentDb }), api.getMillItems(currentDb)]);
      if (rRes.success) setRecipes(rRes.data);
      if (iRes.success) setItems(iRes.data);
    } finally { setLoading(false); }
  }, [currentDb]);

  useEffect(() => { load(); }, [load, dbInfo?.lastRefresh]);

  function setInput(i, field, val) { setForm(f => { const inputs = [...f.inputs]; inputs[i] = { ...inputs[i], [field]: val }; return { ...f, inputs }; }); }
  function setOutput(i, field, val) { setForm(f => { const outputs = [...f.outputs]; outputs[i] = { ...outputs[i], [field]: val }; return { ...f, outputs }; }); }

  async function handleSave() {
    if (!form.RecipeName?.trim()) { showNotification(isUrdu ? 'ریسیپی کا نام درج کریں' : 'Recipe name required', 'error'); return; }
    const validIn  = form.inputs.filter(i => i.ItemID);
    const validOut = form.outputs.filter(o => o.ItemID);
    if (!validIn.length)  { showNotification(isUrdu ? 'کم از کم ایک خام مال درج کریں' : 'Add at least one input item', 'error'); return; }
    if (!validOut.length) { showNotification(isUrdu ? 'کم از کم ایک آؤٹ پٹ درج کریں' : 'Add at least one output item', 'error'); return; }
    setSaving(true);
    try {
      const res = await api.saveRecipe({ dbPath: currentDb, recipe: { ...form, inputs: validIn.map(i => ({ ...i, ItemID: Number(i.ItemID), ExpectedQtyPct: Number(i.ExpectedQtyPct||100) })), outputs: validOut.map(o => ({ ...o, ItemID: Number(o.ItemID), ExpectedPct: Number(o.ExpectedPct||0), CostAllocPct: Number(o.CostAllocPct||0), IsLoss: o.IsLoss ? 1 : 0 })) } });
      if (res.success) { showNotification(isUrdu ? 'ریسیپی محفوظ ہو گئی' : 'Recipe saved', 'success'); setShowForm(false); load(); }
      else showNotification(res.error || 'Save failed', 'error');
    } finally { setSaving(false); }
  }

  async function handleDelete(id) {
    const res = await api.deleteRecipe({ dbPath: currentDb, RecipeID: id });
    if (res.success) { showNotification(isUrdu ? 'ریسیپی حذف ہو گئی' : 'Recipe deleted', 'success'); setDeleteConfirm(null); load(); }
    else showNotification(res.error || 'Delete failed', 'error');
  }

  const itemName = id => items.find(i => i.ItemID === Number(id))?.ItemName || `#${id}`;

  return (
    <div className="page" dir={dir}>
      <div className="page-header">
        <div><h1 className="page-title">{isUrdu ? 'پیداواری ریسیپیز' : 'Production Recipes / BOM'}</h1><p className="page-subtitle">{isUrdu ? 'خام مال اور تیار مال کی ترکیب' : 'Configure raw material inputs and finished goods outputs'}</p></div>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={() => { setForm(EMPTY_RECIPE()); setShowForm(true); }} disabled={!currentDb}><Plus size={14} />{isUrdu ? 'نئی ریسیپی' : 'New Recipe'}</button>
          <button className="btn btn-secondary" onClick={load} disabled={loading}><RefreshCw size={14} className={loading ? 'spin' : ''} /></button>
        </div>
      </div>

      {!currentDb ? (
        <div className="empty-state"><div className="empty-state-icon"><FlaskConical size={40} /></div><h3>{isUrdu?'ڈیٹا بیس منتخب نہیں':'No Database Selected'}</h3></div>
      ) : loading ? (
        <div className="empty-state"><div className="loading-spinner" style={{ margin: '0 auto' }} /></div>
      ) : recipes.length === 0 ? (
        <div className="empty-state"><div className="empty-state-icon">🧪</div><h3>{isUrdu?'کوئی ریسیپی نہیں':'No recipes yet'}</h3><p>{isUrdu?'پہلی ریسیپی شامل کریں':'Add your first production recipe'}</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {recipes.map(r => (
            <div key={r.RecipeID} className="summary-card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{r.RecipeName}</div>
                  {r.RecipeNameUr && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.RecipeNameUr}</div>}
                  {r.Description  && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{r.Description}</div>}
                  <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12 }}>
                    <span style={{ color: 'var(--rose)' }}>📥 {isUrdu?'خام مال':'Inputs'}: {(r.inputs||[]).map(i => itemName(i.ItemID)).join(', ') || '—'}</span>
                    <span style={{ color: 'var(--emerald)' }}>📤 {isUrdu?'آؤٹ پٹ':'Outputs'}: {(r.outputs||[]).filter(o => !o.IsLoss).map(o => `${itemName(o.ItemID)} (${o.ExpectedPct}%)`).join(', ') || '—'}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 5 }}>
                  <button className="btn-icon" onClick={() => { setForm({ ...r, inputs: r.inputs?.length ? r.inputs : [EMPTY_IN()], outputs: r.outputs?.length ? r.outputs : [EMPTY_OUT()] }); setShowForm(true); }}><Edit2 size={13} /></button>
                  <button className="btn-icon btn-icon-danger" onClick={() => setDeleteConfirm(r.RecipeID)}><Trash2 size={13} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} dir={dir}>
            <div className="modal-header"><h3>{isUrdu?'ریسیپی حذف کریں؟':'Delete Recipe?'}</h3><button className="btn-icon" onClick={() => setDeleteConfirm(null)}><X size={15} /></button></div>
            <div style={{ padding: '16px 20px', color: 'var(--text-muted)', fontSize: 13 }}>{isUrdu?'کیا آپ واقعی حذف کرنا چاہتے ہیں؟':'Are you sure you want to delete this recipe?'}</div>
            <div className="modal-footer"><button className="btn btn-ghost" onClick={() => setDeleteConfirm(null)}>{isUrdu?'منسوخ':'Cancel'}</button><button className="btn btn-danger" onClick={() => handleDelete(deleteConfirm)}><Trash2 size={13} />{isUrdu?'حذف':'Delete'}</button></div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-box modal-wide" onClick={e => e.stopPropagation()} dir={dir} style={{ maxWidth: 860, maxHeight: '92vh' }}>
            <div className="modal-header"><h3>{form.RecipeID ? (isUrdu?'ریسیپی ترمیم':'Edit Recipe') : (isUrdu?'نئی ریسیپی':'New Recipe')}</h3><button className="btn-icon" onClick={() => setShowForm(false)}><X size={16} /></button></div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div className="field-group"><label>{isUrdu?'ریسیپی نام (انگریزی) *':'Recipe Name (English) *'}</label><input type="text" className="input-field" value={form.RecipeName||''} onChange={e => setForm(f => ({ ...f, RecipeName: e.target.value }))} /></div>
                <div className="field-group"><label>{isUrdu?'نام (اردو)':'Name (Urdu)'}</label><input type="text" className="input-field" value={form.RecipeNameUr||''} onChange={e => setForm(f => ({ ...f, RecipeNameUr: e.target.value }))} /></div>
                <div className="field-group" style={{ gridColumn: 'span 2' }}><label>{isUrdu?'تفصیل':'Description'}</label><input type="text" className="input-field" value={form.Description||''} onChange={e => setForm(f => ({ ...f, Description: e.target.value }))} /></div>
              </div>

              {/* Inputs */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--rose)' }}>📥 {isUrdu?'خام مال (Input)':'Raw Material Inputs'}</span>
                  <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setForm(f => ({ ...f, inputs: [...f.inputs, EMPTY_IN()] }))}><Plus size={12} /></button>
                </div>
                {form.inputs.map((inp, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 80px 32px', gap: 8, marginBottom: 6 }}>
                    <select className="select-field" value={inp.ItemID||''} onChange={e => setInput(i,'ItemID',e.target.value)}><option value="">{isUrdu?'— آئٹم —':'— Item —'}</option>{items.map(it => <option key={it.ItemID} value={it.ItemID}>{it.ItemName}</option>)}</select>
                    <input type="number" min="0" step="0.01" className="input-field" value={inp.ExpectedQtyPct||''} placeholder={isUrdu?'% مقدار':'% Qty'} onChange={e => setInput(i,'ExpectedQtyPct',e.target.value)} />
                    <select className="select-field" value={inp.UOM||'KG'} onChange={e => setInput(i,'UOM',e.target.value)}>{['KG','MAAN','TON'].map(u => <option key={u} value={u}>{u}</option>)}</select>
                    {form.inputs.length > 1 && <button className="btn-icon btn-icon-danger" onClick={() => setForm(f => ({ ...f, inputs: f.inputs.filter((_,idx) => idx !== i) }))}><X size={12} /></button>}
                  </div>
                ))}
              </div>

              {/* Outputs */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--emerald)' }}>📤 {isUrdu?'تیار مال (Output)':'Finished Goods Outputs'}</span>
                  <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setForm(f => ({ ...f, outputs: [...f.outputs, EMPTY_OUT()] }))}><Plus size={12} /></button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '3fr 80px 80px 100px 80px 32px', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', padding: '0 4px' }}>{isUrdu?'آئٹم':'Item'}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{isUrdu?'متوقع %':'Exp%'}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{isUrdu?'لاگت %':'Cost%'}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{isUrdu?'طریقہ':'Method'}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{isUrdu?'ضائع؟':'Loss?'}</span>
                  <span></span>
                </div>
                {form.outputs.map((out, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '3fr 80px 80px 100px 80px 32px', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                    <select className="select-field" value={out.ItemID||''} onChange={e => setOutput(i,'ItemID',e.target.value)}><option value="">{isUrdu?'— آئٹم —':'— Item —'}</option>{items.map(it => <option key={it.ItemID} value={it.ItemID}>{it.ItemName}</option>)}</select>
                    <input type="number" min="0" max="100" step="0.1" className="input-field" value={out.ExpectedPct||''} placeholder="%" onChange={e => setOutput(i,'ExpectedPct',e.target.value)} />
                    <input type="number" min="0" max="100" step="0.1" className="input-field" value={out.CostAllocPct||''} placeholder="%" onChange={e => setOutput(i,'CostAllocPct',e.target.value)} />
                    <select className="select-field" value={out.CostMethod||'weight'} onChange={e => setOutput(i,'CostMethod',e.target.value)}><option value="weight">{isUrdu?'وزن':'Weight'}</option><option value="value">{isUrdu?'قدر':'Value'}</option><option value="pct">{isUrdu?'فیصد':'Percent'}</option></select>
                    <input type="checkbox" checked={out.IsLoss||false} onChange={e => setOutput(i,'IsLoss',e.target.checked)} style={{ width: 18, height: 18, marginTop: 2 }} />
                    {form.outputs.length > 1 && <button className="btn-icon btn-icon-danger" onClick={() => setForm(f => ({ ...f, outputs: f.outputs.filter((_,idx) => idx !== i) }))}><X size={12} /></button>}
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowForm(false)} disabled={saving}>{isUrdu?'منسوخ':'Cancel'}</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}><Save size={13} />{saving?'…':(isUrdu?'محفوظ کریں':'Save Recipe')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
