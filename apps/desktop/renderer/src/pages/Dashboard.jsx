import React, { useState, useEffect, useCallback } from 'react';
import {
  DollarSign, TrendingUp, TrendingDown, Wallet,
  ArrowUpRight, ArrowDownRight, BarChart3, Activity,
  Package, ShoppingCart, Factory, Users, Truck,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar,
} from 'recharts';
import { useLang } from '../context/LanguageContext';

const api = window.electronAPI;

const placeholderChartData = [
  { month: 'Jul', income: 245000, expenses: 189000 },
  { month: 'Aug', income: 312000, expenses: 201000 },
  { month: 'Sep', income: 289000, expenses: 215000 },
  { month: 'Oct', income: 356000, expenses: 198000 },
  { month: 'Nov', income: 401000, expenses: 256000 },
  { month: 'Dec', income: 378000, expenses: 234000 },
  { month: 'Jan', income: 425000, expenses: 267000 },
  { month: 'Feb', income: 390000, expenses: 245000 },
  { month: 'Mar', income: 467000, expenses: 289000 },
  { month: 'Apr', income: 445000, expenses: 312000 },
  { month: 'May', income: 498000, expenses: 334000 },
  { month: 'Jun', income: 523000, expenses: 356000 },
];

function fmtC(value) {
  if (!value && value !== 0) return 'Rs. 0';
  return `Rs. ${Number(value).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtQ(value, unit = 'KG') {
  if (!value && value !== 0) return '0';
  return `${Number(value).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ${unit}`;
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-label">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} style={{ color: entry.color }}>{entry.name}: {fmtC(entry.value)}</p>
      ))}
    </div>
  );
}

// Mini stock bar (visual indicator)
function StockBar({ label, value, max, color, unit }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
        <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{ fontWeight: 600, color }}>{fmtQ(value, unit)}</span>
      </div>
      <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.4s' }} />
      </div>
    </div>
  );
}

export default function Dashboard({ currentDb, dbInfo, onNavigate }) {
  const { isUrdu } = useLang();
  const dir = isUrdu ? 'rtl' : 'ltr';

  const [summary, setSummary] = useState({
    totalAssets: 0, totalLiabilities: 0, netIncome: 0, totalRevenue: 0,
  });
  const [erpKPIs, setErpKPIs] = useState({
    todaySales: 0, todayPurchases: 0, todayProduction: 0,
    totalReceivables: 0, totalPayables: 0,
    stockBalances: {},
  });
  const [hasErp, setHasErp] = useState(false);
  const [chartData, setChartData] = useState(placeholderChartData);

  const load = useCallback(async () => {
    if (!currentDb || !api) return;
    try {
      const [bsRes, plRes] = await Promise.all([
        api.getBalanceSheet({ dbPath: currentDb }),
        api.getProfitLoss({ dbPath: currentDb }),
      ]);
      if (bsRes.success && bsRes.data) {
        const totalAssets = (bsRes.data.assets || []).reduce((s, g) => s + (g.total || 0), 0);
        const totalLiab   = (bsRes.data.liabilities || []).reduce((s, g) => s + (g.total || 0), 0);
        setSummary(prev => ({ ...prev, totalAssets, totalLiabilities: totalLiab }));
      }
      if (plRes.success && plRes.data) {
        setSummary(prev => ({ ...prev, netIncome: plRes.data.netProfitLoss || 0, totalRevenue: plRes.data.totalIncome || 0 }));
      }

      // Monthly GL chart data (real data)
      if (api.getMonthlyGLSummary) {
        const year = new Date().getFullYear();
        const mRes = await api.getMonthlyGLSummary({ dbPath: currentDb, year });
        if (mRes.success && mRes.data && mRes.data.some(m => m.income > 0 || m.expense > 0)) {
          setChartData(mRes.data.map(m => ({
            month: m.monthName,
            income: Math.round(m.income),
            expenses: Math.round(m.expense),
          })));
        }
      }

      // ERP KPIs (only if ERP tables exist)
      if (api.getErpDashboard) {
        const erpRes = await api.getErpDashboard({ dbPath: currentDb });
        if (erpRes.success && erpRes.data) {
          setErpKPIs(erpRes.data);
          setHasErp(
            erpRes.data.todaySales !== undefined ||
            Object.keys(erpRes.data.stockBalances || {}).length > 0
          );
        }
      }
    } catch (err) {
      console.error('Dashboard load error:', err);
    }
  }, [currentDb]);

  useEffect(() => { load(); }, [load, dbInfo?.lastRefresh]);

  const stockEntries = Object.entries(erpKPIs.stockBalances || {});
  const maxStock = stockEntries.length ? Math.max(...stockEntries.map(([, v]) => Number(v) || 0), 1) : 1;
  const stockColors = ['#4f46e5', '#16a34a', '#d97706', '#dc2626', '#0891b2', '#7c3aed'];

  const topCards = [
    { title: isUrdu ? 'کل اثاثے'   : 'Total Assets',      value: fmtC(summary.totalAssets),      icon: DollarSign, color: 'emerald', up: true  },
    { title: isUrdu ? 'کل واجبات'  : 'Total Liabilities',  value: fmtC(summary.totalLiabilities), icon: TrendingDown, color: 'rose',  up: false },
    { title: isUrdu ? 'خالص منافع' : 'Net Profit/Loss',    value: fmtC(summary.netIncome),        icon: TrendingUp,  color: summary.netIncome >= 0 ? 'emerald' : 'rose', up: summary.netIncome >= 0 },
    { title: isUrdu ? 'کل آمدنی'   : 'Total Revenue',      value: fmtC(summary.totalRevenue),     icon: Wallet,      color: 'blue',    up: true  },
  ];

  const erpCards = hasErp ? [
    { title: isUrdu ? 'آج کی فروخت'    : "Today's Sales",     value: fmtC(erpKPIs.todaySales),         icon: ShoppingCart, color: 'emerald' },
    { title: isUrdu ? 'آج کی خرید'     : "Today's Purchases", value: fmtC(erpKPIs.todayPurchases),     icon: Package,      color: 'amber'   },
    { title: isUrdu ? 'کل وصولی'       : 'Total Receivables', value: fmtC(erpKPIs.totalReceivables),   icon: Users,        color: 'blue'    },
    { title: isUrdu ? 'کل ادائیگی'     : 'Total Payables',    value: fmtC(erpKPIs.totalPayables),     icon: Truck,        color: 'rose'    },
  ] : [];

  return (
    <div className="page dashboard-page" dir={dir}>
      <div className="page-header">
        <div>
          <h1 className="page-title">{isUrdu ? 'ڈیش بورڈ' : 'Dashboard'}</h1>
          <p className="page-subtitle">{isUrdu ? 'مالی اور آپریشنل جائزہ' : 'Financial & operational overview'}</p>
        </div>
        <div className="header-actions">
          <span className="db-badge">{currentDb ? currentDb.split('/').pop().replace('.sqlite','') : (isUrdu ? 'کوئی ڈیٹا بیس نہیں' : 'No database')}</span>
        </div>
      </div>

      {/* Financial summary cards */}
      <div className="summary-cards">
        {topCards.map(card => {
          const Icon = card.icon;
          return (
            <div key={card.title} className="summary-card">
              <div className="card-header-row">
                <span className="card-label">{card.title}</span>
                <div className={`card-icon icon-${card.color}`}><Icon size={20} /></div>
              </div>
              <div className="card-value">{card.value}</div>
              <div className={`card-trend ${card.up ? 'trend-up' : 'trend-down'}`}>
                {card.up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
              </div>
            </div>
          );
        })}
      </div>

      {/* ERP mill KPI cards */}
      {hasErp && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10, marginTop: 6 }}>
            🏭 {isUrdu ? 'آٹا مل KPIs' : 'Flour Mill KPIs'}
          </div>
          <div className="summary-cards" style={{ marginBottom: 14 }}>
            {erpCards.map(card => {
              const Icon = card.icon;
              return (
                <div key={card.title} className="summary-card">
                  <div className="card-header-row">
                    <span className="card-label">{card.title}</span>
                    <div className={`card-icon icon-${card.color}`}><Icon size={20} /></div>
                  </div>
                  <div className="card-value" style={{ fontSize: 17 }}>{card.value}</div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Charts row */}
      <div className="charts-section">
        <div className="chart-card">
          <div className="chart-card-header"><h3><BarChart3 size={18} /> {isUrdu ? 'آمدنی بمقابلہ اخراجات' : 'Revenue vs Expenses'}</h3></div>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gInc" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.3} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                <linearGradient id="gExp" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3} /><stop offset="95%" stopColor="#f43f5e" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" stroke="var(--text-muted)" fontSize={11} />
              <YAxis stroke="var(--text-muted)" fontSize={11} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="income" name={isUrdu?'آمدنی':'Income'} stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#gInc)" />
              <Area type="monotone" dataKey="expenses" name={isUrdu?'اخراجات':'Expenses'} stroke="#f43f5e" strokeWidth={2} fillOpacity={1} fill="url(#gExp)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Stock balances card */}
        <div className="chart-card" style={{ minWidth: 0 }}>
          <div className="chart-card-header"><h3><Activity size={18} /> {isUrdu ? 'موجودہ اسٹاک' : 'Current Stock'}</h3></div>
          {stockEntries.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              {isUrdu ? 'اسٹاک موومنٹ درج کریں' : 'Add stock movements to see balances'}
            </div>
          ) : (
            <div style={{ padding: '8px 4px' }}>
              {stockEntries.slice(0, 8).map(([name, qty], i) => (
                <StockBar
                  key={name}
                  label={name}
                  value={Number(qty) || 0}
                  max={maxStock}
                  color={stockColors[i % stockColors.length]}
                  unit="KG"
                />
              ))}
              {stockEntries.length > 8 && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, textAlign: 'center' }}>
                  +{stockEntries.length - 8} {isUrdu ? 'مزید آئٹمز' : 'more items'}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="quick-stats-card" style={{ marginTop: 14 }}>
        <div className="chart-card-header">
          <h3>{isUrdu ? 'فوری اعداد و شمار' : 'Quick Statistics'}</h3>
        </div>
        <div className="quick-stats-grid">
          <div className="stat-item">
            <span className="stat-label">{isUrdu ? 'ڈیٹا بیس' : 'Database'}</span>
            <span className="stat-value">{currentDb ? currentDb.split('/').pop().replace('.sqlite','') : '—'}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">{isUrdu ? 'آج کی پیداوار' : "Today's Production"}</span>
            <span className="stat-value">{hasErp ? `${erpKPIs.todayProduction || 0} ${isUrdu ? 'بیچ' : 'batches'}` : '—'}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">{isUrdu ? 'آخری تازہ کاری' : 'Last Refresh'}</span>
            <span className="stat-value">{dbInfo?.lastRefresh ? new Date(dbInfo.lastRefresh).toLocaleTimeString() : '—'}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">{isUrdu ? 'حالت' : 'Status'}</span>
            <span className="stat-value stat-online">● {currentDb ? (isUrdu ? 'منسلک' : 'Connected') : (isUrdu ? 'غیر منسلک' : 'Disconnected')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
