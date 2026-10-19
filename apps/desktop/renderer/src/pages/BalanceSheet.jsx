import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Printer } from 'lucide-react';
import { useLang } from '../context/LanguageContext';
import { printBalanceSheet } from '../utils/printPDF';

const api = window.electronAPI;

function fmt(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Render one BS section (Assets / Liabilities / Equity)
// groups: array of { subAccId, subName, subNameU, accounts[], total }
// side: 'debit' = assets (red), 'credit' = liabilities/equity (green)
function BSSection({ title, headClass, groups, isUrdu, t, side = 'debit' }) {
  if (!groups?.length) return (
    <div className="bs-card">
      <div className={`bs-card-head ${headClass}`}>{title}</div>
      <div style={{ padding: '20px 16px', color: 'var(--text-muted)', fontSize: 13 }}>{t.noData}</div>
    </div>
  );

  const sectionTotal = groups.reduce((s, g) => s + (g.total || 0), 0);
  const amtClass = side === 'credit' ? 'amount-credit' : 'amount-debit';

  return (
    <div className="bs-card">
      <div className={`bs-card-head ${headClass}`}>{title}</div>
      <table className="data-table" style={{ width: '100%' }}>
        <tbody>
          {groups.map(g => {
            const groupLabel = isUrdu
              ? (g.subNameU && g.subNameU.trim() ? g.subNameU.trim() : g.subName)
              : g.subName;
            return (
              <React.Fragment key={g.subAccId}>
                <tr className="group-row">
                  <td colSpan={2}>{groupLabel}</td>
                </tr>
                {(g.accounts || []).map(a => {
                  const name    = isUrdu ? (a.accountNameUr || a.accountName) : a.accountName;
                  const bal     = a.balance || 0;
                  const display = fmt(Math.abs(bal));
                  return (
                    <tr key={a.accountId}>
                      <td style={{ paddingLeft: 20 }} className="account-name">{name}</td>
                      <td className={`text-right ${amtClass}`}>
                        {display}
                      </td>
                    </tr>
                  );
                })}
                <tr style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ paddingLeft: 12, fontWeight: 700, fontSize: 12, color: 'var(--text-secondary)' }}>
                    {isUrdu ? `${groupLabel} ذیلی کل` : `${groupLabel} Subtotal`}
                  </td>
                  <td className={`text-right ${amtClass}`} style={{ fontWeight: 700 }}>
                    {fmt(Math.abs(g.total))}
                  </td>
                </tr>
              </React.Fragment>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td style={{ fontWeight: 700 }}>{isUrdu ? `کل ${title}` : `Total ${title}`}</td>
            <td className={`text-right ${amtClass}`} style={{ fontWeight: 700, fontSize: 14 }}>
              Rs. {fmt(Math.abs(sectionTotal))}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default function BalanceSheet({ currentDb, dbInfo, showNotification }) {
  const { t, isUrdu } = useLang();
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [printing,  setPrinting]  = useState(false);
  const [error,     setError]     = useState(null);
  const [asOfDate,  setAsOfDate]  = useState('');
  const dir = isUrdu ? 'rtl' : 'ltr';

  const load = useCallback(async () => {
    if (!currentDb || !api) return;
    setLoading(true); setError(null);
    try {
      const res = await api.getBalanceSheet({ dbPath: currentDb, asOfDate: asOfDate || undefined });
      if (res.success) setData(res.data);
      else setError(res.error);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [currentDb, asOfDate]);

  useEffect(() => { load(); }, [load, dbInfo?.lastRefresh]);

  // Use the pre-computed section totals from the server (algebraic sums)
  const totalAssets = data?.totalAssets ?? 0;
  const totalLE     = data?.totalLiabilitiesAndEquity ?? 0;
  const balanceDiff = data?.balanceDiff ?? null;                   // null = not yet loaded
  const isBalanced  = balanceDiff !== null && balanceDiff < 1;

  async function handlePrint() {
    if (!data) return;
    setPrinting(true);
    try {
      const companyName = currentDb?.split('/').pop().replace('.sqlite', '') || 'Flouris';
      const subtitle    = asOfDate
        ? `${isUrdu ? 'بتاریخ:' : 'As of:'} ${asOfDate}`
        : (isUrdu ? 'تمام تاریخیں' : 'All Dates');

      const res = await printBalanceSheet({
        title:      t.balanceSheetTitle,
        subtitle,   companyName,   isUrdu,
        assets:      data.assets      || [],
        liabilities: data.liabilities || [],
        equity:      data.equity      || [],
        totalAssets,
        totalLE,
        balanceDiff: balanceDiff ?? 0,
        generatedAt: new Date().toLocaleString(),
        defaultFileName: `BalanceSheet_${new Date().toISOString().slice(0, 10)}.pdf`,
      });

      if (res.success)
        showNotification(isUrdu ? 'پی ڈی ایف محفوظ ہو گئی' : 'PDF saved successfully', 'success');
      else if (!res.canceled)
        showNotification(res.error || 'PDF failed', 'error');
    } catch (e) { showNotification(e.message, 'error'); }
    finally { setPrinting(false); }
  }

  return (
    <div className="page" dir={dir}>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t.balanceSheetTitle}</h1>
          <p className="page-subtitle">{t.balanceSheetSubtitle}</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-accent" onClick={handlePrint} disabled={printing || !data}>
            <Printer size={14} /> {printing ? '…' : t.print}
          </button>
          <button className="btn btn-secondary" onClick={load} disabled={loading}>
            <RefreshCw size={14} /> {t.refresh}
          </button>
        </div>
      </div>

      <div className="report-controls">
        <div className="date-group">
          <span className="date-label">{t.asOf}</span>
          <input type="date" className="input-field" value={asOfDate}
            onChange={e => setAsOfDate(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={load} disabled={loading}>{t.apply}</button>
        <button className="btn btn-ghost"   onClick={() => setAsOfDate('')}>{t.clear}</button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {!currentDb ? (
        <div className="empty-state">
          <div className="empty-state-icon">📂</div>
          <h3>{t.noDatabaseSelected}</h3>
        </div>
      ) : loading ? (
        <div className="empty-state">
          <div className="loading-spinner" style={{ margin: '0 auto' }} />
        </div>
      ) : !data ? null : (
        <>
          <div className="bs-columns" style={{ marginBottom: 14 }}>
            {/* Left column: Assets */}
            <BSSection
              title={t.assets}
              headClass="assets-head"
              groups={data.assets}
              isUrdu={isUrdu}
              t={t}
              side="debit"
            />
            {/* Right column: Liabilities + Equity stacked */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <BSSection
                title={t.liabilities}
                headClass="liabilities-head"
                groups={data.liabilities}
                isUrdu={isUrdu}
                t={t}
                side="credit"
              />
              <BSSection
                title={t.equityCapital}
                headClass="equity-head"
                groups={data.equity}
                isUrdu={isUrdu}
                t={t}
                side="credit"
              />
            </div>
          </div>

          {/* Summary pills */}
          <div className="report-summary">
            <div className="summary-pill">
              <div className="summary-pill-label">{t.totalAssets}</div>
              <div className="summary-pill-value pill-debit">
                Rs. {fmt(Math.abs(totalAssets))}
              </div>
            </div>
            <div className="summary-pill">
              <div className="summary-pill-label">{t.totalLiabAndEquity}</div>
              <div className="summary-pill-value pill-credit">
                Rs. {fmt(Math.abs(totalLE))}
              </div>
            </div>
            <div className="summary-pill">
              <div className="summary-pill-label">{t.balanceCheck}</div>
              <div className={`summary-pill-value ${isBalanced ? 'pill-zero' : 'pill-diff'}`}>
                {balanceDiff === null
                  ? '—'
                  : isBalanced
                    ? t.balanced
                    : `Rs. ${fmt(balanceDiff)}`}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
