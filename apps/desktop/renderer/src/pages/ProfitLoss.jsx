import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, TrendingUp, TrendingDown, Printer } from 'lucide-react';
import { useLang } from '../context/LanguageContext';
import { printProfitLoss } from '../utils/printPDF';

const api = window.electronAPI;

function fmt(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function GroupTable({ heading, groups, colorClass, t }) {
  if (!groups?.length) return null;
  const total = groups.reduce((s, g) => s + (g.total || 0), 0);
  // Map pill class to amount class
  const amtClass = colorClass === 'pill-credit' ? 'amount-credit' : 'amount-debit';
  return (
    <div className="data-table-wrap" style={{ marginBottom: 14 }}>
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>{heading}</span>
        <span className={amtClass} style={{ fontWeight: 700, fontSize: 14 }}>Rs. {fmt(total)}</span>
      </div>
      <table className="data-table">
        <tbody>
          {groups.map(g => (
            <React.Fragment key={g.headName}>
              {g.accounts?.map(a => (
                <tr key={a.accountId}>
                  <td style={{ paddingLeft: 20 }} className="account-name">{a.accountName}</td>
                  <td className={`text-right ${amtClass}`}>{fmt(a.amount)}</td>
                </tr>
              ))}
              <tr className="group-row">
                <td style={{ paddingLeft: 10 }}>{g.headName} — {t.subtotal}</td>
                <td className={`text-right ${amtClass}`}>{fmt(g.total)}</td>
              </tr>
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CogsSection({ data, isUrdu }) {
  const { openingInventoryValue: opening, closingInventoryValue: closing, purchases, totalPurchases, cogs } = data;
  if (!data.hasInventoryData && (!purchases || purchases.length === 0)) {
    // No inventory data — render purchases as a simple expense group
    return null;
  }
  return (
    <div className="data-table-wrap" style={{ marginBottom: 14, border: '1px solid var(--accent-muted, #c5dff8)' }}>
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary,#f0f7ff)' }}>
        <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
          {isUrdu ? 'فروختہ مال کی لاگت (کوگس)' : 'Cost of Goods Sold (COGS)'}
        </span>
      </div>
      <table className="data-table">
        <tbody>
          {data.hasInventoryData && (
            <tr>
              <td style={{ paddingLeft: 20, color: 'var(--text-secondary)' }}>{isUrdu ? 'اوپننگ انوینٹری' : 'Opening Inventory'}</td>
              <td className="text-right amount-debit">{fmt(opening)}</td>
            </tr>
          )}
          {(purchases || []).map(g =>
            (g.accounts || []).map(a => (
              <tr key={a.accountId}>
                <td style={{ paddingLeft: 20 }} className="account-name">{a.accountName}</td>
                <td className="text-right amount-debit">{fmt(a.amount)}</td>
              </tr>
            ))
          )}
          <tr className="group-row">
            <td style={{ paddingLeft: 10 }}>{isUrdu ? 'کل خرید' : 'Total Purchases'}</td>
            <td className="text-right">{fmt(totalPurchases)}</td>
          </tr>
          {data.hasInventoryData && (
            <tr>
              <td style={{ paddingLeft: 20, color: 'var(--text-secondary)' }}>{isUrdu ? 'کلوزنگ انوینٹری (منفی)' : 'Less: Closing Inventory'}</td>
              <td className="text-right amount-credit">({fmt(closing)})</td>
            </tr>
          )}
          <tr style={{ background: 'var(--bg-secondary,#f0f7ff)', fontWeight: 700 }}>
            <td style={{ paddingLeft: 10 }}>{isUrdu ? 'کل فروختہ مال کی لاگت' : 'Total COGS'}</td>
            <td className="text-right amount-debit">{fmt(cogs)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function ProfitLoss({ currentDb, dbInfo, showNotification }) {
  const { t, isUrdu } = useLang();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [error, setError]     = useState(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate]     = useState('');

  const load = useCallback(async () => {
    if (!currentDb || !api) return;
    setLoading(true); setError(null);
    try {
      const res = await api.getProfitLoss({ dbPath: currentDb, startDate: startDate || undefined, endDate: endDate || undefined });
      if (res.success) setData(res.data);
      else setError(res.error);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [currentDb, startDate, endDate]);

  useEffect(() => { load(); }, [load, dbInfo?.lastRefresh]);

  const netProfit = data ? (data.netProfitLoss ?? data.netProfit ?? 0) : 0;
  const isProfit  = netProfit >= 0;
  const dir = isUrdu ? 'rtl' : 'ltr';

  async function handlePrint() {
    if (!data) return;
    setPrinting(true);
    try {
      const companyName = currentDb?.split('/').pop().replace('.sqlite', '') || 'ERA';
      const dateRange   = (startDate || endDate) ? `${startDate || '—'} → ${endDate || '—'}` : (isUrdu ? 'تمام تاریخیں' : 'All Dates');

      // Flatten income groups
      const res = await printProfitLoss({
        title: t.profitLossTitle, subtitle: dateRange, companyName, isUrdu,
        income:        data.income        || [],
        expenses:      data.expenses      || [],
        totalIncome:   data.totalIncome   || 0,
        totalExpenses: data.totalExpenses || 0,
        netProfitLoss: netProfit,
        generatedAt:   new Date().toLocaleString(),
        defaultFileName: `ProfitLoss_${new Date().toISOString().slice(0,10)}.pdf`,
      });

      if (res.success) showNotification(isUrdu ? 'پی ڈی ایف محفوظ ہو گئی' : 'PDF saved successfully', 'success');
      else if (!res.canceled) showNotification(res.error || 'PDF failed', 'error');
    } catch (e) { showNotification(e.message, 'error'); }
    finally { setPrinting(false); }
  }

  return (
    <div className="page" dir={dir}>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t.profitLossTitle}</h1>
          <p className="page-subtitle">{t.profitLossSubtitle}</p>
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
          <span className="date-label">{t.from}</span>
          <input type="date" className="input-field" value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>
        <div className="date-group">
          <span className="date-label">{t.to}</span>
          <input type="date" className="input-field" value={endDate} onChange={e => setEndDate(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={load} disabled={loading}>{t.apply}</button>
        <button className="btn btn-ghost" onClick={() => { setStartDate(''); setEndDate(''); }}>{t.clear}</button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="info-banner" style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 8, background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.18)', color: 'var(--text-secondary)', fontSize: 12 }}>
        {isUrdu
          ? 'نوٹ: P&L تفصیل صرف ان اکاؤنٹس کو دکھاتی ہے جن کے Head Income / Expenses میں assign ہو۔ اگر اکاؤنٹس ان ہیڈز میں نہ ہوں تو تفصیلی فہرست خالی نظر آ سکتی ہے۔'
          : 'Note: P&L detail only shows accounts assigned to the Income / Expenses heads. If accounts are not assigned to these heads, the detail section may appear empty.'}
      </div>

      {!currentDb ? (
        <div className="empty-state"><div className="empty-state-icon">📂</div><h3>{t.noDatabaseSelected}</h3></div>
      ) : loading ? (
        <div className="empty-state"><div className="loading-spinner" style={{ margin: '0 auto' }} /></div>
      ) : !data ? null : (
        <>
          <GroupTable heading={t.incomeRevenue} groups={data.income}   colorClass="pill-credit" t={t} />

          {/* COGS section (between Income and Operating Expenses) */}
          <CogsSection data={data} isUrdu={isUrdu} />

          {/* Gross Profit pill */}
          {(data.hasInventoryData || (data.purchases && data.purchases.length > 0)) && (
            <div className="report-summary" style={{ marginBottom: 14, padding: '10px 16px', background: 'var(--bg-secondary,#f0f7ff)', borderRadius: 8, border: '1px solid var(--accent-muted,#c5dff8)' }}>
              <div className="summary-pill">
                <div className="summary-pill-label">{isUrdu ? 'مجموعی آمدنی' : 'Total Income'}</div>
                <div className="summary-pill-value pill-credit">Rs. {fmt(data.totalIncome)}</div>
              </div>
              <div className="summary-pill">
                <div className="summary-pill-label">{isUrdu ? 'فروختہ مال کی لاگت' : 'COGS'}</div>
                <div className="summary-pill-value pill-debit">Rs. {fmt(data.cogs)}</div>
              </div>
              <div className="summary-pill" style={{ flex: 2 }}>
                <div className="summary-pill-label">{isUrdu ? 'مجموعی نفع' : 'Gross Profit'}</div>
                <div className={`summary-pill-value ${(data.grossProfit ?? 0) >= 0 ? 'pill-profit' : 'pill-loss'}`} style={{ fontSize: 18 }}>
                  Rs. {fmt(Math.abs(data.grossProfit ?? 0))}
                </div>
              </div>
            </div>
          )}

          <GroupTable heading={t.expenses} groups={data.expenses} colorClass="pill-debit" t={t} />

          <div className="report-summary">
            <div className="summary-pill">
              <div className="summary-pill-label">{isUrdu ? 'مجموعی آمدنی' : 'Total Income'}</div>
              <div className="summary-pill-value pill-credit">Rs. {fmt(data.totalIncome)}</div>
            </div>
            <div className="summary-pill">
              <div className="summary-pill-label">{isUrdu ? 'کل اخراجات' : 'Total Expenses'}</div>
              <div className="summary-pill-value pill-debit">Rs. {fmt((data.cogs || 0) + (data.totalExpenses || 0))}</div>
            </div>
            <div className="summary-pill" style={{ flex: 2 }}>
              <div className="summary-pill-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {isProfit ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                {isProfit ? t.netProfit : t.netLoss}
              </div>
              <div className={`summary-pill-value ${isProfit ? 'pill-profit' : 'pill-loss'}`} style={{ fontSize: 22 }}>
                Rs. {fmt(Math.abs(netProfit))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
