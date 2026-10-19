import React from 'react';
import {
  BookOpen, ShoppingCart, Package, Wallet, ArrowDownToLine, ArrowUpFromLine,
  TrendingUp, TrendingDown, ClipboardList, Scale, FileSpreadsheet, BarChart3,
  Users, Truck, Factory, Target,
} from 'lucide-react';
import { useLang } from '../context/LanguageContext';

const groups = [
  { title: 'Financial Statements', urdu: 'مالی بیانات', items: [
    { id: 'trial-balance',     title: 'Trial Balance',     urdu: 'ٹرائل بیلنس',      icon: Scale,          page: 'trial-balance' },
    { id: 'balance-sheet',     title: 'Balance Sheet',     urdu: 'بیلنس شیٹ',         icon: FileSpreadsheet, page: 'balance-sheet' },
    { id: 'profit-loss',       title: 'Profit & Loss',     urdu: 'نفع و نقصان',        icon: TrendingUp,      page: 'profit-loss' },
    { id: 'account-statement', title: 'Account Ledger',    urdu: 'اکاؤنٹ لیجر',        icon: BookOpen,        page: 'account-statement' },
    { id: 'ledger-combine',    title: 'Ledger Combine',    urdu: 'لیجر کمبائن',        icon: BookOpen,        page: 'account-statement' },
    { id: 'account-chart',     title: 'Account Chart',     urdu: 'اکاؤنٹ چارٹ',       icon: ClipboardList,   page: 'accounts' },
  ]},
  { title: 'Sales & Purchase', urdu: 'فروخت و خرید', items: [
    { id: 'sales',             title: 'Sales Register',            urdu: 'سیل رجسٹر',           icon: ShoppingCart, codes: [401, 402, 404] },
    { id: 'purchases',         title: 'Purchase Register',         urdu: 'خرید رجسٹر',          icon: Package,      codes: [301, 302, 304] },
    { id: 'sales-purchases',   title: 'Sales & Purchase Summary',  urdu: 'فروخت و خرید خلاصہ', icon: BarChart3,    codes: [301, 302, 304, 401, 402, 404] },
    { id: 'daily-report',      title: 'Daily Report',              urdu: 'روزانہ رپورٹ',        icon: ClipboardList },
  ]},
  { title: 'Cash, Income & Expense', urdu: 'نقد، آمدنی و اخراجات', items: [
    { id: 'cash-book',      title: 'Cash Book',          urdu: 'کیش بک',        icon: Wallet,         codes: [101, 102, 203, 204, 207, 208, 301, 401] },
    { id: 'receipts',       title: 'Receipt Detail',     urdu: 'وصولی تفصیل',  icon: ArrowDownToLine, codes: [101, 203, 207] },
    { id: 'payments',       title: 'Payment Detail',     urdu: 'ادائیگی تفصیل', icon: ArrowUpFromLine, codes: [102, 204, 208] },
    { id: 'income',         title: 'Income Detail',      urdu: 'آمدنی تفصیل',  icon: TrendingUp,      codes: [401, 402, 404] },
    { id: 'expenses',       title: 'Expense Detail',     urdu: 'اخراجات تفصیل', icon: TrendingDown,   codes: [301, 302, 304] },
    { id: 'monthly-income', title: 'Monthly Income',     urdu: 'ماہانہ آمدنی', icon: TrendingUp,      codes: [401, 402, 404] },
    { id: 'monthly-expense',title: 'Monthly Expense',    urdu: 'ماہانہ اخراجات',icon: TrendingDown,   codes: [301, 302, 304] },
  ]},
  { title: 'Registers & Stock', urdu: 'رجسٹر و اسٹاک', items: [
    { id: 'voucher-register',    title: 'Voucher Register',        urdu: 'واؤچر رجسٹر',    icon: ClipboardList },
    { id: 'stock-register',      title: 'Stock / Inventory Register', urdu: 'اسٹاک رجسٹر', icon: Package, codes: [301, 302, 304, 401, 402, 404] },
    { id: 'opening-stock',       title: 'Opening Stock',           urdu: 'اوپننگ اسٹاک',  icon: Package, codes: [301, 302, 304] },
    { id: 'quantitative-ledger', title: 'Quantitative Ledger',     urdu: 'کوانٹیٹیٹو لیجر', icon: Package, codes: [301, 302, 304, 401, 402, 404] },
    { id: 'salary',              title: 'Salary Reports',          urdu: 'تنخواہ رپورٹس', icon: ClipboardList },
    { id: 'production',          title: 'Production Reports',      urdu: 'پروڈکشن رپورٹس', icon: Package },
    { id: 'bardana',             title: 'Bardana Reports',         urdu: 'بار دانہ رپورٹس', icon: Package },
  ]},
  { title: 'Balances & Parties', urdu: 'بیلنس و پارٹیز', items: [
    { id: 'vendor-balance',   title: 'Vendor Balance',       urdu: 'وینڈر بیلنس',        icon: BookOpen, mode: 'balances', partyRole: 'vendor' },
    { id: 'customer-balance', title: 'Customer Balances',    urdu: 'کسٹمر بیلنس',        icon: BookOpen, mode: 'balances', partyRole: 'customer' },
    { id: 'staff-balance',    title: 'Staff Balance',        urdu: 'اسٹاف بیلنس',        icon: BookOpen, mode: 'balances', partyRole: 'staff' },
    { id: 'bank-balance',     title: 'Bank Balance',         urdu: 'بینک بیلنس',         icon: Wallet,   mode: 'balances', partyRole: 'bank' },
    { id: 'all-party-balances',title: 'All Party Balances',  urdu: 'تمام پارٹی بیلنس',  icon: BookOpen, mode: 'balances', partyRole: 'all' },
  ]},
  // ── ERP-specific groups ──
  { title: 'ERP Reports', urdu: 'ERP رپورٹس', items: [
    { id: 'customer-outstanding',  title: 'Customer Outstanding',   urdu: 'کسٹمر واجبات',       icon: Users,    page: 'customer-outstanding' },
    { id: 'supplier-outstanding',  title: 'Supplier Outstanding',   urdu: 'سپلائر واجبات',      icon: Truck,    page: 'supplier-outstanding' },
    { id: 'stock-valuation',       title: 'Stock Valuation',        urdu: 'اسٹاک تخمینہ',       icon: Package,  page: 'stock-valuation' },
    { id: 'product-profitability', title: 'Product Profitability',  urdu: 'پروڈکٹ منافع',       icon: TrendingUp, page: 'product-profitability' },
    { id: 'production-report',     title: 'Production Report',      urdu: 'پیداوار رپورٹ',      icon: Factory,  page: 'production-report' },
    { id: 'wheat-recovery',        title: 'Wheat Recovery Report',  urdu: 'گندم ریکوری رپورٹ', icon: Target,   page: 'production-report' },
  ]},
];

export default function ReportsHub({ onNavigate, onOpenReport }) {
  const { isUrdu } = useLang();
  return (
    <div className="page reports-hub" dir={isUrdu ? 'rtl' : 'ltr'}>
      <div className="page-header">
        <div>
          <h1 className="page-title">{isUrdu ? 'رپورٹس' : 'Reports'}</h1>
          <p className="page-subtitle">{isUrdu ? 'فروخت، خرید، اسٹاک اور مالی بیانات' : 'Sales, purchases, stock and financial statements'}</p>
        </div>
      </div>
      {groups.map(group => (
        <section className="report-group" key={group.title}>
          <div className="report-group-title">
            <span>{isUrdu ? group.urdu : group.title}</span>
            <span className="report-group-line" />
          </div>
          <div className="report-card-grid">
            {group.items.map(item => {
              const Icon = item.icon;
              return (
                <button
                  className="report-card"
                  key={item.id}
                  onClick={() => item.page ? onNavigate(item.page) : onOpenReport(item)}
                >
                  <span className="report-card-icon"><Icon size={22} /></span>
                  <span className="report-card-text">
                    <strong>{isUrdu ? item.urdu : item.title}</strong>
                    <small>{isUrdu ? 'رپورٹ کھولیں اور پی ڈی ایف بنائیں' : 'Open, filter and print PDF'}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
