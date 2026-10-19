import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Printer, Search, ChevronDown, ChevronRight } from 'lucide-react';
import { useLang } from '../context/LanguageContext';
import { printTrialBalance } from '../utils/printPDF';

const api = window.electronAPI;

// Head ID → section label (matches tblAccHead.AccountID)
const HEAD_LABELS_EN = { 1:'Capital / Equity', 2:'Liabilities', 3:'Assets', 4:'Sales & Revenue', 5:'Expenses', 0:'Unclassified' };
const HEAD_LABELS_UR = { 1:'سرمایہ / ایکویٹی', 2:'واجبات', 3:'اثاثے', 4:'فروخت و آمدنی', 5:'اخراجات', 0:'غیر درجہ بند' };

function fmt(n) {
  if (n == null || n === 0) return '—';
  return Number(n).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function TrialBalance({ currentDb, dbInfo, showNotification }) {
  const { t, isUrdu } = useLang();
  const dir = isUrdu ? 'rtl' : 'ltr';

  const [groups,    setGroups]    = useState([]);   // grouped by SubAccID
  const [flatRows,  setFlatRows]  = useState([]);   // for search / PDF
  const [totals,    setTotals]    = useState({ debit: 0, credit: 0, difference: 0 });
  const [loading,   setLoading]   = useState(false);
  const [printing,  setPrinting]  = useState(false);
  const [error,     setError]     = useState(null);
  const [startDate, setStartDate] = useState('');
  const [endDate,   setEndDate]   = useState('');
  const [search,    setSearch]    = useState('');
  const [collapsed, setCollapsed] = useState(new Set()); // collapsed group subAccIds
  const [viewMode,  setViewMode]  = useState('grouped'); // 'grouped' | 'flat'

  const load = useCallback(async () => {
    if (!currentDb || !api) return;
    setLoading(true); setError(null);
    try {
      const res = await api.getTrialBalance({
        dbPath:    currentDb,
        startDate: startDate || undefined,
        endDate:   endDate   || undefined,
      });
      if (res.success) {
        setGroups(res.data.groups || []);
        setFlatRows(res.data.rows  || []);
        setTotals({
          debit:      res.data.totalDebit  || 0,
          credit:     res.data.totalCredit || 0,
          difference: res.data.difference  || 0,
        });
      } else {
        setError(res.error || 'Failed to load trial balance.');
      }
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [currentDb, startDate, endDate]);

  useEffect(() => { load(); }, [load, dbInfo?.lastRefresh]);

  // ── Search applies to flat rows; grouped view shows all ──────────────────
  const searchLower = search.toLowerCase();
  const searchedFlat = flatRows.filter(r =>
    !search ||
    (isUrdu ? r.accountNameUr : r.accountName)?.toLowerCase().includes(searchLower) ||
    String(r.accountId).includes(search)
  );

  // Rows for PDF — use searched flat list
  const pdfRows = search ? searchedFlat : flatRows;

  function toggleCollapse(subAccId) {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(subAccId) ? next.delete(subAccId) : next.add(subAccId);
      return next;
    });
  }

  // ── Group rows by headId for section headers ──────────────────────────────
  // headId 1=Capital, 2=Liab, 3=Assets, 4=Income, 5=Expenses
  // Order: 3→2→1→4→5 (Assets, Liabilities, Capital, Income, Expenses)
  const HEAD_ORDER = [3, 2, 1, 4, 5, 0];
  const byHead = new Map();
  for (const g of groups) {
    const hid = g.headId || 0;
    if (!byHead.has(hid)) byHead.set(hid, []);
    byHead.get(hid).push(g);
  }

  async function handlePrint() {
    if (!pdfRows.length) return;
    setPrinting(true);
    try {
      const companyName = currentDb?.split('/').pop().replace('.sqlite', '') || 'Flouris';
      const dateRange   = (startDate || endDate)
        ? `${startDate || '—'} → ${endDate || '—'}`
        : (isUrdu ? 'تمام تاریخیں' : 'All Dates');

      const res = await printTrialBalance({
        title:      t.trialBalanceTitle,
        subtitle:   dateRange,
        companyName, isUrdu,
        rows:       pdfRows,
        groups,
        totals,
        generatedAt:     new Date().toLocaleString(),
        defaultFileName: `TrialBalance_${new Date().toISOString().slice(0,10)}.pdf`,
      });

      if (res.success) showNotification(isUrdu ? 'پی ڈی ایف محفوظ ہو گئی' : 'PDF saved', 'success');
      else if (!res.canceled) showNotification(res.error || 'PDF failed', 'error');
    } catch (e) { showNotification(e.message, 'error'); }
    finally { setPrinting(false); }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="page" dir={dir}>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t.trialBalanceTitle}</h1>
          <p className="page-subtitle">{t.trialBalanceSubtitle}</p>
        </div>
        <div className="header-actions">
          {/* View toggle */}
          <div className="view-toggle">
            <button
              className={`view-toggle-btn ${viewMode==='grouped'?'active':''}`}
              onClick={() => setViewMode('grouped')}
            >{isUrdu ? 'گروپ نما' : 'Grouped'}</button>
            <button
              className={`view-toggle-btn ${viewMode==='flat'?'active':''}`}
              onClick={() => setViewMode('flat')}
            >{isUrdu ? 'فہرست' : 'Flat'}</button>
          </div>
          <button className="btn btn-accent" onClick={handlePrint} disabled={printing || !pdfRows.length}>
            <Printer size={14} /> {printing ? '…' : t.print}
          </button>
          <button className="btn btn-secondary" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> {t.refresh}
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="report-controls">
        <div className="date-group">
          <span className="date-label">{t.from}</span>
          <input type="date" className="input-field" value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>
        <div className="date-group">
          <span className="date-label">{t.to}</span>
          <input type="date" className="input-field" value={endDate} onChange={e => setEndDate(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={load} disabled={loading}>{t.apply}</button>
        <button className="btn btn-ghost"   onClick={() => { setStartDate(''); setEndDate(''); }}>{t.clear}</button>
        <div style={{ flex: 1 }} />
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position:'absolute', [isUrdu?'right':'left']:10, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)', pointerEvents:'none' }} />
          <input
            type="text" placeholder={t.searchAccounts} className="input-field"
            style={{ [isUrdu?'paddingRight':'paddingLeft']: 30, width: 240 }}
            value={search} onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {!currentDb ? (
        <div className="empty-state"><div className="empty-state-icon">📂</div><h3>{t.noDatabaseSelected}</h3><p>{t.selectDbFirst}</p></div>
      ) : loading ? (
        <div className="empty-state"><div className="loading-spinner" style={{ margin:'0 auto' }} /></div>
      ) : (search ? searchedFlat : flatRows).length === 0 ? (
        <div className="empty-state"><div className="empty-state-icon">📋</div><h3>{t.noData}</h3></div>
      ) : viewMode === 'flat' || search ? (
        /* ── FLAT TABLE ── */
        <>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width:65 }}>{t.acNo}</th>
                  <th>{t.accountName}</th>
                  <th className="text-right" style={{ width:150 }}>{t.debit}</th>
                  <th className="text-right" style={{ width:150 }}>{t.credit}</th>
                </tr>
              </thead>
              <tbody>
                {(search ? searchedFlat : flatRows).map(row => (
                  <tr key={row.accountId}>
                    <td style={{ color:'var(--text-muted)', fontFamily:'monospace' }}>{row.accountId}</td>
                    <td className="account-name">
                      {isUrdu ? (row.accountNameUr || row.accountName) : row.accountName}
                    </td>
                    <td className={`text-right ${row.debit >0?'amount-debit':''}`}>{fmt(row.debit)}</td>
                    <td className={`text-right ${row.credit>0?'amount-credit':''}`}>{fmt(row.credit)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>{t.total}</td>
                  <td className="text-right">{fmt(totals.debit)}</td>
                  <td className="text-right">{fmt(totals.credit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {renderSummary(totals, t, isUrdu)}
        </>
      ) : (
        /* ── GROUPED TABLE ── */
        <>
          {HEAD_ORDER.map(hid => {
            const sectionGroups = byHead.get(hid);
            if (!sectionGroups?.length) return null;
            const headLabel = isUrdu ? (HEAD_LABELS_UR[hid]||String(hid)) : (HEAD_LABELS_EN[hid]||String(hid));
            const sectionDr  = sectionGroups.reduce((s,g)=>s+g.groupDebit,0);
            const sectionCr  = sectionGroups.reduce((s,g)=>s+g.groupCredit,0);
            return (
              <div key={hid} className="tb-section" style={{ marginBottom: 18 }}>
                {/* Section header */}
                <div className="tb-section-head">
                  <span className="tb-section-label">{headLabel}</span>
                  <span className="tb-section-totals">
                    <span style={{ color:'var(--rose)' }}>{fmt(sectionDr)}</span>
                    <span style={{ margin:'0 6px', color:'var(--text-muted)' }}>|</span>
                    <span style={{ color:'var(--emerald)' }}>{fmt(sectionCr)}</span>
                  </span>
                </div>

                <div className="data-table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th style={{ width:65 }}>{t.acNo}</th>
                        <th>{t.accountName}</th>
                        <th className="text-right" style={{ width:150 }}>{t.debit}</th>
                        <th className="text-right" style={{ width:150 }}>{t.credit}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sectionGroups.map(g => {
                        const isOpen = !collapsed.has(g.subAccId);
                        const groupLabel = isUrdu ? (g.subNameU||g.subName) : g.subName;
                        return (
                          <React.Fragment key={g.subAccId}>
                            {/* SubAccount group header row */}
                            <tr
                              className="tb-group-row"
                              onClick={() => toggleCollapse(g.subAccId)}
                              style={{ cursor:'pointer' }}
                            >
                              <td colSpan={2} style={{ display:'flex', alignItems:'center', gap:6 }}>
                                {isOpen
                                  ? <ChevronDown size={13} style={{ flexShrink:0 }} />
                                  : <ChevronRight size={13} style={{ flexShrink:0 }} />}
                                <span>{groupLabel}</span>
                              </td>
                              <td className="text-right" style={{ color:'var(--rose)', fontWeight:600 }}>{fmt(g.groupDebit)}</td>
                              <td className="text-right" style={{ color:'var(--emerald)', fontWeight:600 }}>{fmt(g.groupCredit)}</td>
                            </tr>

                            {/* Individual account rows */}
                            {isOpen && g.rows.map(row => (
                              <tr key={row.accountId} className="tb-account-row">
                                <td style={{ color:'var(--text-muted)', fontFamily:'monospace', paddingLeft:28 }}>
                                  {row.accountId}
                                </td>
                                <td className="account-name" style={{ paddingLeft:28 }}>
                                  {isUrdu ? (row.accountNameUr || row.accountName) : row.accountName}
                                </td>
                                <td className={`text-right ${row.debit >0?'amount-debit':''}`}>{fmt(row.debit)}</td>
                                <td className={`text-right ${row.credit>0?'amount-credit':''}`}>{fmt(row.credit)}</td>
                              </tr>
                            ))}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

          {/* Grand total */}
          <div className="data-table-wrap" style={{ marginTop: -8 }}>
            <table className="data-table">
              <tfoot>
                <tr>
                  <td colSpan={2} style={{ fontWeight:700 }}>{t.total}</td>
                  <td className="text-right" style={{ fontWeight:700 }}>{fmt(totals.debit)}</td>
                  <td className="text-right" style={{ fontWeight:700 }}>{fmt(totals.credit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {renderSummary(totals, t, isUrdu)}
        </>
      )}
    </div>
  );
}

function renderSummary(totals, t, isUrdu) {
  return (
    <div className="report-summary">
      <div className="summary-pill">
        <div className="summary-pill-label">{t.totalDebit}</div>
        <div className="summary-pill-value pill-debit">{formatPKR(totals.debit)}</div>
      </div>
      <div className="summary-pill">
        <div className="summary-pill-label">{t.totalCredit}</div>
        <div className="summary-pill-value pill-credit">{formatPKR(totals.credit)}</div>
      </div>
      <div className="summary-pill">
        <div className="summary-pill-label">{t.difference}</div>
        <div className={`summary-pill-value ${totals.difference === 0 ? 'pill-zero' : 'pill-diff'}`}>
          {totals.difference === 0 ? t.balanced : formatPKR(Math.abs(totals.difference))}
        </div>
      </div>
      <div className="summary-pill">
        <div className="summary-pill-label">{t.accounts}</div>
        <div className="summary-pill-value" style={{ color:'var(--text-primary)' }}>
          {isUrdu ? `${totals.count||''}` : `${totals.count||''}`}
        </div>
      </div>
    </div>
  );
}

function formatPKR(n) {
  if (n == null || n === 0) return '—';
  return Number(n).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
