import React, { useState } from 'react';

import {
  LayoutDashboard,
  Scale,
  FileSpreadsheet,
  TrendingUp,
  BookOpen,
  Upload,
  Settings,
  Database,
  ChevronDown,
  ChevronRight,
  Languages,
  ClipboardEdit,
  Users,
  PlusSquare,
  Tag,
  Layers,
  BarChart3,
  Package,
  Calculator,
  ShoppingCart,
  Truck,
  Factory,
  FlaskConical,
  ArrowRightLeft,
  ClipboardCheck,
  Link,
  Target,
  Calendar,
  UserCheck,
  PackageOpen,
  FileText,
  CreditCard,
  Clock,
  DollarSign,
  GitMerge,
} from 'lucide-react';

import { useLang } from '../context/LanguageContext';

// Use the packaged desktop app icon for the sidebar brand so the UI stays aligned
// with the actual app icon across dev and production builds.
const flourisLogo = new URL('../../../assets/icon.png', import.meta.url).href;


/* Collapsible sidebar section */
function NavSection({
  label,
  icon: Icon,
  children,
  defaultOpen = false,
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div style={{ marginBottom: 2 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '7px 10px',
          borderRadius: 'var(--radius-sm)',
          background: 'none',
          border: 'none',
          color: 'var(--text-muted)',
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          cursor: 'pointer',
          transition: 'all 0.15s',
        }}
      >
        {Icon && <Icon size={13} />}

        <span
          style={{
            flex: 1,
            textAlign: 'start',
          }}
        >
          {label}
        </span>

        {open ? (
          <ChevronDown size={12} />
        ) : (
          <ChevronRight size={12} />
        )}
      </button>

      {open && (
        <div style={{ paddingInlineStart: 6 }}>
          {children}
        </div>
      )}
    </div>
  );
}


export default function Sidebar({
  activePage,
  onNavigate,
  currentDb,
  databases,
  onSelectDb,
  logoData,
}) {
  const [dbDropdownOpen, setDbDropdownOpen] = useState(false);

  const {
    t,
    toggleLang,
    lang,
    isUrdu,
  } = useLang();


  function NavItem({ id, label, icon: Icon }) {
    return (
      <button
        className={`nav-item ${
          activePage === id ? 'active' : ''
        }`}
        onClick={() => onNavigate(id)}
      >
        <div className="nav-icon">
          <Icon size={16} />
        </div>

        <span className="nav-label">
          {label}
        </span>

        {activePage === id && (
          <div className="nav-indicator" />
        )}
      </button>
    );
  }


  const currentDbName = currentDb
    ? currentDb
        .split('/')
        .pop()
        .replace('.sqlite', '')
    : t.noDatabase;


  return (
    <aside
      className="sidebar"
      dir={isUrdu ? 'rtl' : 'ltr'}
      style={{
        overflowY: 'auto',
        overflowX: 'hidden',
      }}
    >

      {/* =====================================================
          BRAND / LOGO
          ===================================================== */}

      <div className="sidebar-brand">

        <div
          className="brand-icon"
          style={{
            width: 40,
            height: 40,
            minWidth: 40,
            minHeight: 40,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          <img
            src={flourisLogo}
            alt="Flouris ERP"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              display: 'block',
            }}
            onError={(event) => {
              console.error(
                'FAILED TO LOAD FLOURIS LOGO:',
                event.currentTarget.src
              );
            }}
          />
        </div>

        <div className="brand-text">
          <h1>Flouris</h1>

          <span>
            {isUrdu
              ? 'فلور مل ای آر پی'
              : 'Flour Mill ERP'}
          </span>
        </div>

      </div>


      {/* =====================================================
          LANGUAGE TOGGLE
          ===================================================== */}

      <button
        className="lang-toggle"
        onClick={toggleLang}
        title="Switch Language / زبان تبدیل کریں"
      >
        <Languages size={15} />

        <span className="lang-toggle-label">
          {lang === 'en'
            ? 'English'
            : 'اردو'}
        </span>

        <span className="lang-toggle-alt">
          {lang === 'en'
            ? '→ اردو'
            : '→ EN'}
        </span>
      </button>


      {/* =====================================================
          DATABASE SELECTOR
          ===================================================== */}

      <div className="db-selector">

        <button
          className="db-selector-btn"
          onClick={() =>
            setDbDropdownOpen(!dbDropdownOpen)
          }
        >
          <Database size={16} />

          <span className="db-name">
            {currentDbName}
          </span>

          {dbDropdownOpen ? (
            <ChevronDown size={14} />
          ) : (
            <ChevronRight size={14} />
          )}
        </button>


        {dbDropdownOpen && (
          <div className="db-dropdown">

            {databases.map((db) => (
              <button
                key={db.path}
                className={`db-option ${
                  db.path === currentDb
                    ? 'active'
                    : ''
                }`}
                onClick={() => {
                  onSelectDb(db.path);
                  setDbDropdownOpen(false);
                }}
              >
                <Database size={14} />

                <span>
                  {db.name}
                </span>
              </button>
            ))}


            {databases.length === 0 && (
              <div className="db-option disabled">
                {t.noDatabase}
              </div>
            )}

          </div>
        )}

      </div>


      {/* =====================================================
          NAVIGATION
          ===================================================== */}

      <nav className="sidebar-nav">

        {/* Always-visible top items */}

        <NavItem
          id="dashboard"
          label={t.dashboard}
          icon={LayoutDashboard}
        />

        <NavItem
          id="voucher-entry"
          label={t.voucherEntry}
          icon={ClipboardEdit}
        />


        {/* =================================================
            FINANCIAL REPORTING
            ================================================= */}

        <NavSection
          label={
            isUrdu
              ? 'مالی رپورٹس'
              : 'Financial Reports'
          }
          icon={BarChart3}
          defaultOpen={false}
        >
          <NavItem
            id="trial-balance"
            label={t.trialBalance}
            icon={Scale}
          />

          <NavItem
            id="balance-sheet"
            label={t.balanceSheet}
            icon={FileSpreadsheet}
          />

          <NavItem
            id="profit-loss"
            label={t.profitLoss}
            icon={TrendingUp}
          />

          <NavItem
            id="account-statement"
            label={t.accountStatement}
            icon={BookOpen}
          />

          <NavItem
            id="reports"
            label={t.reports}
            icon={BarChart3}
          />
        </NavSection>


        {/* =================================================
            PURCHASES
            ================================================= */}

        <NavSection
          label={
            isUrdu
              ? 'خریداری'
              : 'Purchases'
          }
          icon={Package}
          defaultOpen={false}
        >
          <NavItem
            id="suppliers"
            label={
              isUrdu
                ? 'سپلائرز'
                : 'Suppliers'
            }
            icon={Truck}
          />

          <NavItem
            id="purchase-invoice"
            label={
              isUrdu
                ? 'خرید انوائس'
                : 'Purchase Invoice'
            }
            icon={Package}
          />

          <NavItem
            id="supplier-outstanding"
            label={
              isUrdu
                ? 'سپلائر واجبات'
                : 'Supplier Outstanding'
            }
            icon={Truck}
          />
        </NavSection>


        {/* =================================================
            SALES
            ================================================= */}

        <NavSection
          label={
            isUrdu
              ? 'فروخت'
              : 'Sales'
          }
          icon={ShoppingCart}
          defaultOpen={false}
        >
          <NavItem
            id="customers"
            label={
              isUrdu
                ? 'کسٹمرز'
                : 'Customers'
            }
            icon={Users}
          />

          <NavItem
            id="sales-invoice"
            label={
              isUrdu
                ? 'فروخت انوائس'
                : 'Sales Invoice'
            }
            icon={ShoppingCart}
          />

          <NavItem
            id="customer-outstanding"
            label={
              isUrdu
                ? 'کسٹمر واجبات'
                : 'Customer Outstanding'
            }
            icon={UserCheck}
          />

          <NavItem
            id="product-profitability"
            label={
              isUrdu
                ? 'پروڈکٹ منافع'
                : 'Product Profitability'
            }
            icon={TrendingUp}
          />
        </NavSection>


        {/* =================================================
            PRODUCTION
            ================================================= */}

        <NavSection
          label={
            isUrdu
              ? 'پیداوار'
              : 'Production'
          }
          icon={Factory}
          defaultOpen={false}
        >
          <NavItem
            id="recipe-manager"
            label={
              isUrdu
                ? 'ریسیپیز / BOM'
                : 'Recipes / BOM'
            }
            icon={FlaskConical}
          />

          <NavItem
            id="production-batch"
            label={
              isUrdu
                ? 'پیداواری بیچ'
                : 'Production Batch'
            }
            icon={Factory}
          />

          <NavItem
            id="production-report"
            label={
              isUrdu
                ? 'پیداوار رپورٹ'
                : 'Production Report'
            }
            icon={BarChart3}
          />
        </NavSection>


        {/* =================================================
            INVENTORY
            ================================================= */}

        <NavSection
          label={
            isUrdu
              ? 'انوینٹری'
              : 'Inventory'
          }
          icon={Package}
          defaultOpen={false}
        >
          <NavItem
            id="inventory"
            label={
              isUrdu
                ? 'اسٹاک مینیجر'
                : 'Stock Manager'
            }
            icon={Package}
          />

          <NavItem
            id="packaging-units"
            label={
              isUrdu
                ? 'پیکیجنگ یونٹس'
                : 'Packaging Units'
            }
            icon={PackageOpen}
          />

          <NavItem
            id="stock-valuation"
            label={
              isUrdu
                ? 'اسٹاک تخمینہ'
                : 'Stock Valuation'
            }
            icon={TrendingUp}
          />

          <NavItem
            id="stock-transfer"
            label={
              isUrdu
                ? 'اسٹاک ٹرانسفر'
                : 'Stock Transfer'
            }
            icon={ArrowRightLeft}
          />

          <NavItem
            id="stock-adjustment"
            label={
              isUrdu
                ? 'اسٹاک ایڈجسٹمنٹ'
                : 'Stock Adjustment'
            }
            icon={ClipboardCheck}
          />

          <NavItem
            id="mill-calculator"
            label={
              isUrdu
                ? 'پی ایل کیلکولیٹر'
                : 'Mill P&L Calc'
            }
            icon={Calculator}
          />
        </NavSection>


        {/* =================================================
            ACCOUNTING
            ================================================= */}

        <NavSection
          label={
            isUrdu
              ? 'اکاؤنٹنگ'
              : 'Accounting'
          }
          icon={Scale}
          defaultOpen={false}
        >
          <NavItem
            id="accounts"
            label={t.accountManager}
            icon={Users}
          />

          <NavItem
            id="voucher-types"
            label={t.voucherTypeMgr}
            icon={Tag}
          />

          <NavItem
            id="group-manager"
            label={t.groupManager}
            icon={Layers}
          />

          <NavItem
            id="account-mappings"
            label={
              isUrdu
                ? 'اکاؤنٹ میپنگ'
                : 'Account Mappings'
            }
            icon={Link}
          />
        </NavSection>


        {/* =================================================
            SETUP
            ================================================= */}

        <NavSection
          label={
            isUrdu
              ? 'ترتیبات'
              : 'Setup'
          }
          icon={Settings}
          defaultOpen={false}
        >
          <NavItem
            id="opening-balances"
            label={
              isUrdu
                ? 'ابتدائی بیلنس'
                : 'Opening Balances'
            }
            icon={DollarSign}
          />

          <NavItem
            id="fiscal-years"
            label={
              isUrdu
                ? 'مالی سال'
                : 'Fiscal Years'
            }
            icon={Calendar}
          />

          <NavItem
            id="cost-centers"
            label={
              isUrdu
                ? 'لاگت مراکز'
                : 'Cost Centers'
            }
            icon={Target}
          />

          <NavItem
            id="create-db"
            label={t.createDatabase}
            icon={PlusSquare}
          />

          <NavItem
            id="import"
            label={t.importDatabase}
            icon={Upload}
          />

          <NavItem
            id="settings"
            label={t.settings}
            icon={Settings}
          />
        </NavSection>


        {/* =================================================
            FINANCE UTILITIES
            ================================================= */}

        <NavSection
          label={
            isUrdu
              ? 'مالی ٹولز'
              : 'Finance Tools'
          }
          icon={CreditCard}
          defaultOpen={false}
        >
          <NavItem
            id="cheque-manager"
            label={
              isUrdu
                ? 'چیک مینیجر'
                : 'Cheque Manager'
            }
            icon={CreditCard}
          />

          <NavItem
            id="aging-report"
            label={
              isUrdu
                ? 'بقایا رپورٹ'
                : 'Aging Report'
            }
            icon={Clock}
          />

          <NavItem
            id="reconciliation"
            label={
              isUrdu
                ? 'تطبیقی رپورٹ'
                : 'Reconciliation Report'
            }
            icon={GitMerge}
          />
        </NavSection>

      </nav>


      {/* Footer */}
      <div className="sidebar-footer">
        <div className="sidebar-version">
          Flouris ERP v1.3.0
        </div>
      </div>

    </aside>
  );
}