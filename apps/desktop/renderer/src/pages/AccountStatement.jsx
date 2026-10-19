import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Search, Printer } from 'lucide-react';
import { useLang } from '../context/LanguageContext';
import { printAccountStatement } from '../utils/printPDF';

const api = window.electronAPI;

function fmt(n) {
  if (n == null || n === 0) return '—';
  return Number(n).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function AccountStatement({ currentDb, dbInfo, showNotification }) {
  const { t, isUrdu } = useLang();
  const [accounts, setAccounts]       = useState([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [statement, setStatement]     = useState(null);
  const [loading, setLoading]         = useState(false);
  const [printing, setPrinting]       = useState(false);
  const [error, setError]             = useState(null);
  const [startDate, setStartDate]     = useState('');
  const [endDate, setEndDate]         = useState('');
  const [search, setSearch]           = useState('');

  // Load accounts list for the selector
  useEffect(() => {
    if (!currentDb || !api) return;
    api.getChartOfAccounts(currentDb).then(res => {
      if (res.success && res.data) setAccounts(res.data);
    }).catch(() => {});
  }, [currentDb]);

  const load = useCallback(async () => {
    if (!currentDb || !selectedAccount || !api) return;
    setLoading(true); setError(null);
    try {
      const res = await api.getAccountStatement({
        dbPath: currentDb,
        accountId: Number(selectedAccount),
        startDate: startDate || undefined,
        endDate:   endDate   || undefined,
      });
      if (res.success)
        setStatement(Array.isArray(res.data) ? { transactions: res.data } : res.data);
      else setError(res.error);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [currentDb, selectedAccount, startDate, endDate]);

  const filtered = statement?.transactions?.filter(tx =>
    !search ||
    (tx.narration || tx.Narration || '').toLowerCase().includes(search.toLowerCase()) ||
    String(tx.voucherType || tx.VType || '').toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  const closingBalance = statement?.closingBalance ??
    (filtered.length ? (filtered[filtered.length - 1]?.balance ?? filtered[filtered.length - 1]?.Balance ?? 0) : 0);
  const dir = isUrdu ? 'rtl' : 'ltr';

  async function handlePrint() {
    if (!filtered.length) return;
    setPrinting(true);
    try {
      const companyName   = currentDb?.split('/').pop().replace('.sqlite', '') || 'ERA';
      const accountLabel  = accounts.find(a => String(a.CA || a.AccountID) === String(selectedAccount));
      const accountTitle  = accountLabel ? `${accountLabel.CA || accountLabel.AccountID} — ${accountLabel.AC_TITLE1 || accountLabel.AccountName}` : `A/C #${selectedAccount}`;
      const dateRange     = (startDate || endDate) ? `${startDate || '—'} → ${endDate || '—'}` : (isUrdu ? 'تمام تاریخیں' : 'All Dates');
      const subtitle      = `${accountTitle}  |  ${dateRange}`;

      const summaryRows = [
        { label: t.openingBalance, value: `Rs. ${fmt(Math.abs(statement?.openingBalance || 0))} ${(statement?.openingBalance || 0) >= 0 ? t.dr : t.cr}` },
        { label: t.transactions,   value: String(filtered.length) },
        { label: t.closingBalance, value: `Rs. ${fmt(Math.abs(closingBalance))} ${closingBalance >= 0 ? t.dr : t.cr}`, highlight: true },
      ];

      const res = await printAccountStatement({
        title: t.accountStatementTitle, subtitle, companyName, isUrdu,
        accountName:    statement.accountName    || accountTitle,
        accountNameUr:  statement.accountNameUr  || accountTitle,
        openingBalance: statement.openingBalance || 0,
        closingBalance,
        transactions:   filtered,
        generatedAt:    new Date().toLocaleString(),
        defaultFileName: `Statement_AC${selectedAccount}_${new Date().toISOString().slice(0,10)}.pdf`,
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
          <h1 className="page-title">{t.accountStatementTitle}</h1>
          <p className="page-subtitle">{t.accountStatementSubtitle}</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-accent" onClick={handlePrint} disabled={printing || !filtered.length}>
            <Printer size={14} /> {printing ? '…' : t.print}
          </button>
          <button className="btn btn-secondary" onClick={load} disabled={loading || !selectedAccount}>
            <RefreshCw size={14} /> {t.refresh}
          </button>
        </div>
      </div>

      <div className="account-select-row">
        <select className="select-field" value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)}>
          <option value="">{t.selectAccount}</option>
          {accounts.map(a => (
            <option key={a.CA || a.AccountID} value={a.CA || a.AccountID}>
              {a.CA || a.AccountID} — {a.AC_TITLE1 || a.AccountName || a.AccountHead}
            </option>
          ))}
        </select>

        <div className="date-group">
          <span className="date-label">{t.from}</span>
          <input type="date" className="input-field" value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>
        <div className="date-group">
          <span className="date-label">{t.to}</span>
          <input type="date" className="input-field" value={endDate} onChange={e => setEndDate(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={load} disabled={!selectedAccount || loading}>{t.load}</button>
        <button className="btn btn-ghost" onClick={() => { setStartDate(''); setEndDate(''); setStatement(null); setSelectedAccount(''); }}>{t.clear}</button>
      </div>

      {statement && (
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <Search size={14} style={{ position: 'absolute', [isUrdu ? 'right' : 'left']: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text" placeholder={t.filterNarration} className="input-field"
            style={{ [isUrdu ? 'paddingRight' : 'paddingLeft']: 30, width: 360 }}
            value={search} onChange={e => setSearch(e.target.value)}
          />
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}

      {!currentDb ? (
        <div className="empty-state"><div className="empty-state-icon">📂</div><h3>{t.noDatabaseSelected}</h3><p>{t.selectDbFirst}</p></div>
      ) : !statement && !loading ? (
        <div className="empty-state">
          <div className="empty-state-icon">📖</div>
          <h3>{t.selectAccountFirst}</h3>
          <p>{t.selectAccountHint}</p>
        </div>
      ) : loading ? (
        <div className="empty-state"><div className="loading-spinner" style={{ margin: '0 auto' }} /></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state"><div className="empty-state-icon">🔍</div><h3>{t.noTransactions}</h3></div>
      ) : (
        <>
          {statement.openingBalance != null && (
            <div className="report-summary" style={{ marginBottom: 12 }}>
              <div className="summary-pill">
                <div className="summary-pill-label">{t.openingBalance}</div>
                <div className={`summary-pill-value ${statement.openingBalance >= 0 ? 'pill-debit' : 'pill-credit'}`}>
                  Rs. {fmt(Math.abs(statement.openingBalance))} {statement.openingBalance >= 0 ? t.dr : t.cr}
                </div>
              </div>
              <div className="summary-pill">
                <div className="summary-pill-label">{t.transactions}</div>
                <div className="summary-pill-value" style={{ color: 'var(--text-primary)' }}>{filtered.length}</div>
              </div>
              <div className="summary-pill">
                <div className="summary-pill-label">{t.closingBalance}</div>
                <div className={`summary-pill-value ${closingBalance >= 0 ? 'pill-debit' : 'pill-credit'}`}>
                  Rs. {fmt(Math.abs(closingBalance))} {closingBalance >= 0 ? t.dr : t.cr}
                </div>
              </div>
            </div>
          )}

          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 110 }}>{t.date}</th>
                  <th style={{ width: 120 }}>{t.voucherType}</th>
                  <th style={{ width: 75 }}>{t.voucherNo}</th>
                  <th>{t.narration}</th>
                  <th className="text-right" style={{ width: 140 }}>{t.debit}</th>
                  <th className="text-right" style={{ width: 140 }}>{t.credit}</th>
                  <th className="text-right" style={{ width: 155 }}>{t.balance}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((tx, i) => {
                  const bal = tx.balance ?? tx.Balance ?? 0;
                  return (
                    <tr key={i}>
                      <td>{fmtDate(tx.date || tx.Date)}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 11 }}>{tx.voucherType || tx.VType}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{tx.voucherNo || tx.VoucherNo || '—'}</td>
                      <td className="account-name">{tx.narration || tx.Narration || '—'}</td>
                      <td className={`text-right ${(tx.debit || tx.Debit) > 0 ? 'amount-debit' : ''}`}>{fmt(tx.debit || tx.Debit)}</td>
                      <td className={`text-right ${(tx.credit || tx.Credit) > 0 ? 'amount-credit' : ''}`}>{fmt(tx.credit || tx.Credit)}</td>
                      <td className="text-right">
                        <span className={`balance-pill ${bal >= 0 ? 'balance-positive' : 'balance-negative'}`}>
                          {fmt(Math.abs(bal))} {bal >= 0 ? t.dr : t.cr}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
