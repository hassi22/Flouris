import React, { useState, useEffect, useCallback, useRef } from 'react';
import { LanguageProvider } from './context/LanguageContext';
import Sidebar from './components/Sidebar';

// Existing pages
import Dashboard        from './pages/Dashboard';
import TrialBalance     from './pages/TrialBalance';
import BalanceSheet     from './pages/BalanceSheet';
import ProfitLoss       from './pages/ProfitLoss';
import AccountStatement from './pages/AccountStatement';
import VoucherEntry     from './pages/VoucherEntry';
import CreateDatabase   from './pages/CreateDatabase';
import VoucherTypeManager from './pages/VoucherTypeManager';
import GroupManager     from './pages/GroupManager';
import AccountManager   from './pages/AccountManager';
import ImportDatabase   from './pages/ImportDatabase';
import Settings         from './pages/Settings';
import ReportsHub       from './pages/ReportsHub';
import ReportRegister   from './pages/ReportRegister';
import Login            from './pages/Login';
import InventoryManager from './pages/InventoryManager';
import MillPLCalculator from './pages/MillPLCalculator';

// New ERP pages
import CustomerManager       from './pages/CustomerManager';
import SupplierManager       from './pages/SupplierManager';
import PurchaseInvoice       from './pages/PurchaseInvoice';
import SalesInvoice          from './pages/SalesInvoice';
import RecipeManager         from './pages/RecipeManager';
import ProductionBatch       from './pages/ProductionBatch';
import StockTransfer         from './pages/StockTransfer';
import StockAdjustment       from './pages/StockAdjustment';
import AccountMappings       from './pages/AccountMappings';
import CostCenterManager     from './pages/CostCenterManager';
import FiscalYearManager     from './pages/FiscalYearManager';
import CustomerOutstanding   from './pages/CustomerOutstanding';
import SupplierOutstanding   from './pages/SupplierOutstanding';
import StockValuation        from './pages/StockValuation';
import ProductProfitability  from './pages/ProductProfitability';
import ProductionReport      from './pages/ProductionReport';
// New v2 pages
import PackagingUnitsManager from './pages/PackagingUnitsManager';
// Phase 2-5 pages
import ChequeManager         from './pages/ChequeManager';
import AgingReport           from './pages/AgingReport';
import OpeningBalances       from './pages/OpeningBalances';
import ReconciliationReport  from './pages/ReconciliationReport';

const api = window.electronAPI;

export default function App() {
  const [activePage,    setActivePage]    = useState('dashboard');
  const [activeReport,  setActiveReport]  = useState(null);
  const [databases,     setDatabases]     = useState([]);
  const [currentDb,     setCurrentDb]     = useState(null);
  const [dbInfo,        setDbInfo]        = useState(null);
  const [loading,       setLoading]       = useState(false);
  const [notification,  setNotification]  = useState(null);
  const [prefs,         setPrefs]         = useState({});
  const [pendingDbPath, setPendingDbPath] = useState(null);
  const [pendingDbName, setPendingDbName] = useState('');

  useEffect(() => { api?.getPrefs().then(setPrefs).catch(() => {}); }, []);

  const currentDbRef = useRef(currentDb);
  useEffect(() => { currentDbRef.current = currentDb; }, [currentDb]);

  const selectDatabase = useCallback(async (dbPath) => {
    if (!api) return;
    setLoading(true);
    try {
      const result = await api.openDatabase(dbPath);
      if (result.success) {
        if (result.passwordProtected) {
          setPendingDbPath(dbPath);
          setPendingDbName(dbPath.split('/').pop().replace('.sqlite', ''));
          setLoading(false);
          return;
        }
        try { await api.migrateSchema(dbPath); } catch (_) {}
        setCurrentDb(dbPath);
        setDbInfo({ ...result, lastRefresh: Date.now() });
        showNotification(`Opened: ${dbPath.split('/').pop()}`, 'success');
      } else {
        showNotification(`Error: ${result.error}`, 'error');
      }
    } catch (err) {
      showNotification(`Failed to open database: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleUnlocked() {
    const dbPath = pendingDbPath;
    setPendingDbPath(null);
    setPendingDbName('');
    setLoading(true);
    try {
      const result = await api.openDatabase(dbPath);
      try { await api.migrateSchema(dbPath); } catch (_) {}
      setCurrentDb(dbPath);
      setDbInfo({ ...result, lastRefresh: Date.now() });
      showNotification(`Opened: ${dbPath.split('/').pop()}`, 'success');
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  const loadDatabases = useCallback(async () => {
    if (!api) return;
    try {
      const dbs = await api.listDatabases();
      setDatabases(dbs);
      if (!currentDbRef.current && dbs.length > 0) {
        await selectDatabase(dbs[0].path);
      }
    } catch (err) {
      console.error('Failed to load databases:', err);
    }
  }, [selectDatabase]);

  useEffect(() => { loadDatabases(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!api) return;
    const unsub = api.onDbChanged(() => {
      showNotification('Database updated — refreshing…', 'info');
      setDbInfo(prev => ({ ...prev, lastRefresh: Date.now() }));
    });
    return unsub;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const showNotification = useCallback((message, type = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  }, []);

  if (pendingDbPath) {
    return (
      <LanguageProvider>
        <Login
          dbPath={pendingDbPath}
          dbName={pendingDbName}
          onUnlocked={handleUnlocked}
          onCancel={() => { setPendingDbPath(null); setPendingDbName(''); }}
        />
      </LanguageProvider>
    );
  }

  const pageProps = {
    currentDb, dbInfo, showNotification,
    databases, loadDatabases, selectDatabase, prefs, setPrefs,
    onNavigate: setActivePage,
  };

  const renderPage = () => {
    switch (activePage) {
      // ── Existing ──────────────────────────────────────────────────────────
      case 'dashboard':          return <Dashboard          {...pageProps} />;
      case 'reports':            return <ReportsHub         {...pageProps} onNavigate={setActivePage} onOpenReport={r => { setActiveReport(r); setActivePage('report-register'); }} />;
      case 'report-register':    return <ReportRegister     {...pageProps} report={activeReport} onBack={() => setActivePage('reports')} />;
      case 'trial-balance':      return <TrialBalance       {...pageProps} />;
      case 'balance-sheet':      return <BalanceSheet       {...pageProps} />;
      case 'profit-loss':        return <ProfitLoss         {...pageProps} />;
      case 'account-statement':  return <AccountStatement   {...pageProps} />;
      case 'voucher-entry':      return <VoucherEntry       {...pageProps} />;
      case 'accounts':           return <AccountManager     {...pageProps} />;
      case 'voucher-types':      return <VoucherTypeManager {...pageProps} />;
      case 'group-manager':      return <GroupManager       {...pageProps} />;
      case 'create-db':          return <CreateDatabase     {...pageProps} />;
      case 'import':             return <ImportDatabase     {...pageProps} />;
      case 'inventory':          return <InventoryManager   {...pageProps} />;
      case 'mill-calculator':    return <MillPLCalculator   />;
      case 'settings':           return <Settings           {...pageProps} />;

      // ── ERP — Purchases ───────────────────────────────────────────────────
      case 'suppliers':          return <SupplierManager    {...pageProps} />;
      case 'purchase-invoice':   return <PurchaseInvoice    {...pageProps} />;
      case 'supplier-outstanding': return <SupplierOutstanding {...pageProps} />;

      // ── ERP — Sales ───────────────────────────────────────────────────────
      case 'customers':          return <CustomerManager    {...pageProps} />;
      case 'sales-invoice':      return <SalesInvoice       {...pageProps} />;
      case 'customer-outstanding': return <CustomerOutstanding {...pageProps} />;
      case 'product-profitability': return <ProductProfitability {...pageProps} />;

      // ── ERP — Production ─────────────────────────────────────────────────
      case 'recipe-manager':     return <RecipeManager      {...pageProps} />;
      case 'production-batch':   return <ProductionBatch    {...pageProps} />;
      case 'production-report':  return <ProductionReport   {...pageProps} />;

      // ── ERP — Inventory ───────────────────────────────────────────────────
      case 'stock-valuation':    return <StockValuation     {...pageProps} />;
      case 'stock-transfer':     return <StockTransfer      {...pageProps} />;
      case 'stock-adjustment':   return <StockAdjustment    {...pageProps} />;

      // ── ERP — Accounting/Setup ────────────────────────────────────────────
      case 'account-mappings':   return <AccountMappings    {...pageProps} />;
      case 'cost-centers':       return <CostCenterManager  {...pageProps} />;
      case 'fiscal-years':       return <FiscalYearManager  {...pageProps} />;

      // ── v2 — Packaging / Statements ───────────────────────────────────────
      case 'packaging-units':      return <PackagingUnitsManager {...pageProps} />;

      // ── Phase 2-5 — Cheques / Aging / Opening Balances / Reconciliation ──
      case 'cheque-manager':       return <ChequeManager         {...pageProps} />;
      case 'aging-report':         return <AgingReport           {...pageProps} />;
      case 'opening-balances':     return <OpeningBalances       {...pageProps} />;
      case 'reconciliation':       return <ReconciliationReport  {...pageProps} />;

      default:                   return <Dashboard          {...pageProps} />;
    }
  };

  return (
    <LanguageProvider>
      <div className="app-container">
        <Sidebar
          activePage={activePage}
          onNavigate={setActivePage}
          currentDb={currentDb}
          databases={databases}
          onSelectDb={selectDatabase}
          logoData={prefs.logoData}
        />
        <main className="main-content">
          <div className="drag-region" />
          {notification && (
            <div className={`notification notification-${notification.type}`}>
              <span>{notification.message}</span>
              <button onClick={() => setNotification(null)} className="notification-close">×</button>
            </div>
          )}
          {loading && (
            <div className="loading-overlay">
              <div className="loading-spinner" />
              <p>Loading…</p>
            </div>
          )}
          <div className="page-content">
            {renderPage()}
          </div>
        </main>
      </div>
    </LanguageProvider>
  );
}
