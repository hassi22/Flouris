import React, { useState, useCallback } from 'react';
import { RefreshCw, AlertTriangle, CheckCircle } from 'lucide-react';
import { useLang } from '../context/LanguageContext';

const api = window.electronAPI;

function fmt(n) { return Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

export default function ReconciliationReport({ currentDb, showNotification }) {
  const { isUrdu } = useLang();
  const dir = isUrdu ? 'rtl' : 'ltr';

  const [asOfDate,   setAsOfDate]   = useState(new Date().toISOString().slice(0, 10));
  const [result,     setResult]     = useState(null);
  const [periodCheck, setPeriodCheck] = useState(null);
  const [loading,    setLoading]    = useState(false);

  const run = useCallback(async () => {
    if (!currentDb) return;
    setLoading(true);
    try {
      const [recRes, pcRes] = await Promise.all([
        api.getReconciliationReport({ dbPath: currentDb, asOfDate }),
        api.runPeriodEndCheck({ dbPath: currentDb }),
      ]);
      if (recRes.success) setResult(recRes.data);
      else showNotification(recRes.error || 'Failed', 'error');
      if (pcRes.success) setPeriodCheck(pcRes);
    } finally { setLoading(false); }
  }, [currentDb, asOfDate]);

  return (
    <div className="page" dir={dir}>
      <div className="page-header">
        <div>
          <h1 className="page-title">{isUrdu ? 'تطبیقی رپورٹ' : 'Reconciliation Report'}</h1>
          <p className="page-subtitle">{isUrdu ? 'جی ایل اور انوینٹری کی مطابقت کی جانچ' : 'GL vs Inventory consistency check & period-end validation'}</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={run} disabled={loading || !currentDb}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} />{isUrdu ? 'رپورٹ چلائیں' : 'Run Check'}
          </button>
        </div>
      </div>

      <div className="report-controls" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{isUrdu ? 'بتاریخ:' : 'As of Date:'}</label>
          <input type="date" className="input-field" style={{ width: 160 }} value={asOfDate} onChange={e => setAsOfDate(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={run} disabled={loading || !currentDb}>
          {loading ? '…' : (isUrdu ? 'تجزیہ کریں' : 'Analyze')}
        </button>
      </div>

      {!currentDb ? (
        <div className="empty-state"><h3>{isUrdu ? 'ڈیٹا بیس منتخب نہیں' : 'No Database Selected'}</h3></div>
      ) : loading ? (
        <div className="empty-state"><div className="loading-spinner" style={{ margin: '0 auto' }} /></div>
      ) : result ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Inventory GL vs Stock Movements */}
          {Object.keys(result.inventory || {}).length > 0 && (
            <div className="card">
              <h3 style={{ margin: '0 0 14px', fontSize: 14 }}>{isUrdu ? 'انوینٹری تطبیق' : 'Inventory Reconciliation'}</h3>
              <table className="data-table">
                <thead><tr>
                  <th>{isUrdu ? 'مقصد' : 'Purpose'}</th>
                  <th className="text-right">{isUrdu ? 'جی ایل بیلنس' : 'GL Balance'}</th>
                  <th className="text-right">{isUrdu ? 'اسٹاک موومنٹ قیمت' : 'Stock Movements Value'}</th>
                  <th className="text-right">{isUrdu ? 'فرق' : 'Difference'}</th>
                  <th>{isUrdu ? 'حالت' : 'Status'}</th>
                </tr></thead>
                <tbody>
                  {Object.entries(result.inventory).map(([purpose, data]) => (
                    <tr key={purpose}>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{purpose}</td>
                      <td className="text-right">{fmt(data.glBalance)}</td>
                      <td className="text-right">{fmt(data.stockMovementsValue)}</td>
                      <td className="text-right" style={{ color: Math.abs(data.difference || 0) > 0.01 ? 'var(--rose)' : 'var(--emerald)', fontWeight: 700 }}>
                        {fmt(data.difference)}
                      </td>
                      <td>
                        {Math.abs(data.difference || 0) < 0.01
                          ? <span style={{ color: 'var(--emerald)', fontSize: 12 }}>✓ {isUrdu ? 'مطابق' : 'Balanced'}</span>
                          : <span style={{ color: 'var(--rose)', fontSize: 12 }}>✗ {isUrdu ? 'غیر مطابق' : 'Mismatch'}</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Issues from result */}
          {(result.issues || []).length > 0 && (
            <div className="card" style={{ borderColor: 'rgba(244,63,94,0.3)' }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--rose)' }}>
                <AlertTriangle size={14} style={{ marginRight: 6 }} />{isUrdu ? 'مسائل پائے گئے' : 'Issues Found'}
              </h3>
              {result.issues.map((issue, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)', alignItems: 'flex-start' }}>
                  <AlertTriangle size={14} style={{ color: 'var(--rose)', flexShrink: 0, marginTop: 2 }} />
                  <span style={{ fontSize: 13 }}>{issue.message}</span>
                </div>
              ))}
            </div>
          )}

          {/* Period-end check results */}
          {periodCheck && (
            <div className="card">
              <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>{isUrdu ? 'مدت کے اختتامی جائزے' : 'Period-End Checks'}</h3>
              {periodCheck.clean ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--emerald)', fontWeight: 600 }}>
                  <CheckCircle size={16} />{isUrdu ? 'تمام جانچ مکمل — کوئی مسئلہ نہیں' : 'All checks passed — no issues found'}
                </div>
              ) : (
                <>
                  {periodCheck.issues?.map((issue, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                      <AlertTriangle size={14} style={{ color: 'var(--rose)', flexShrink: 0, marginTop: 2 }} />
                      <span style={{ fontSize: 13, color: 'var(--rose)' }}>[{issue.type}] {issue.message}</span>
                    </div>
                  ))}
                  {periodCheck.warnings?.map((warn, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                      <AlertTriangle size={14} style={{ color: 'var(--amber)', flexShrink: 0, marginTop: 2 }} />
                      <span style={{ fontSize: 13, color: 'var(--amber)' }}>[{warn.type}] {warn.message}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="empty-state">
          <h3 style={{ color: 'var(--text-muted)' }}>{isUrdu ? 'رپورٹ چلانے کے لیے اوپر کا بٹن دبائیں' : 'Click "Analyze" to run the reconciliation check'}</h3>
        </div>
      )}
    </div>
  );
}
