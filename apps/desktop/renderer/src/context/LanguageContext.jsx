import React, { createContext, useContext, useState } from 'react';

// ── All UI strings in English and Urdu ────────────────────────────────────────
export const TRANSLATIONS = {
  en: {
    // App
    appName: 'Flouris ERP',
    // Sidebar nav
    dashboard: 'Dashboard',
    reports: 'Reports',
    trialBalance: 'Trial Balance',
    balanceSheet: 'Balance Sheet',
    profitLoss: 'Profit & Loss',
    accountStatement: 'Account Statement',
    voucherEntry: 'Voucher Entry',
    accountManager: 'Accounts & Parties',
    voucherTypeMgr: 'Voucher Types',
    groupManager:   'Account Groups',
    createDatabase: 'New Database',
    importDatabase: 'Import Database',
    settings: 'Settings',
    noDatabase: 'No Database',
    // Common controls
    from: 'From',
    to: 'To',
    asOf: 'As of',
    apply: 'Apply',
    clear: 'Clear',
    refresh: 'Refresh',
    print: 'Print PDF',
    load: 'Load',
    searchAccounts: 'Search accounts…',
    filterNarration: 'Filter by narration or voucher type…',
    selectAccount: '— Select Account —',
    // Report titles
    trialBalanceTitle: 'Trial Balance',
    trialBalanceSubtitle: 'Debit and credit totals for all accounts',
    balanceSheetTitle: 'Balance Sheet',
    balanceSheetSubtitle: 'Financial position as of selected date',
    profitLossTitle: 'Profit & Loss',
    profitLossSubtitle: 'Income and expense statement for the selected period',
    accountStatementTitle: 'Account Statement',
    accountStatementSubtitle: 'Ledger statement with running balance',
    // Table headers
    acNo: 'A/C #',
    accountName: 'Account Name',
    debit: 'Debit (Rs.)',
    credit: 'Credit (Rs.)',
    total: 'Total',
    date: 'Date',
    voucherType: 'Voucher Type',
    voucherNo: 'V. No',
    narration: 'Narration',
    balance: 'Balance (Rs.)',
    // Summary labels
    totalDebit: 'Total Debit',
    totalCredit: 'Total Credit',
    difference: 'Difference',
    balanced: '✓ Balanced',
    accounts: 'Accounts',
    totalAssets: 'Total Assets',
    totalLiabAndEquity: 'Total Liabilities + Equity',
    balanceCheck: 'Balance Check',
    totalIncome: 'Total Income',
    totalExpenses: 'Total Expenses',
    netProfit: 'Net Profit',
    netLoss: 'Net Loss',
    openingBalance: 'Opening Balance',
    closingBalance: 'Closing Balance',
    transactions: 'Transactions',
    // Sections
    assets: 'Assets',
    liabilities: 'Liabilities',
    equityCapital: 'Equity / Capital',
    incomeRevenue: 'Income / Revenue',
    expenses: 'Expenses',
    subtotal: 'Subtotal',
    // Empty states
    noDatabaseSelected: 'No Database Selected',
    selectDbFirst: 'Select a database from the sidebar.',
    noData: 'No data',
    noTransactions: 'No Transactions Found',
    selectAccountFirst: 'Select an Account',
    selectAccountHint: 'Choose an account and date range, then click Load.',
    noTransactionsRange: 'No transactions found for the selected date range.',
    // Dr / Cr
    dr: 'Dr',
    cr: 'Cr',
    // ERP — Purchases
    suppliers: 'Suppliers',
    purchaseInvoice: 'Purchase Invoice',
    supplierOutstanding: 'Supplier Outstanding',
    // ERP — Sales
    customers: 'Customers',
    salesInvoice: 'Sales Invoice',
    customerOutstanding: 'Customer Outstanding',
    productProfitability: 'Product Profitability',
    // ERP — Production
    recipes: 'Recipes / BOM',
    productionBatch: 'Production Batches',
    productionReport: 'Production Report',
    // ERP — Inventory
    stockValuation: 'Stock Valuation',
    stockTransfer: 'Stock Transfer',
    stockAdjustment: 'Stock Adjustment',
    // ERP — Setup
    accountMappings: 'Account Mappings',
    costCenters: 'Cost Centers',
    fiscalYears: 'Fiscal Years',
  },
  ur: {
    // App
    appName: 'فلوریس ای آر پی',
    // Sidebar nav
    dashboard: 'ڈیش بورڈ',
    reports: 'رپورٹس',
    trialBalance: 'ٹرائل بیلنس',
    balanceSheet: 'بیلنس شیٹ',
    profitLoss: 'نفع و نقصان',
    accountStatement: 'اکاؤنٹ بیان',
    voucherEntry: 'وصول نامہ اندراج',
    accountManager: 'اکاؤنٹس و پارٹیز',
    voucherTypeMgr: 'وصول نامہ اقسام',
    groupManager:   'اکاؤنٹ گروپس',
    createDatabase: 'نئی ڈیٹا بیس',
    importDatabase: 'ڈیٹا بیس درآمد',
    settings: 'ترتیبات',
    noDatabase: 'کوئی ڈیٹا بیس نہیں',
    // Common controls
    from: 'سے',
    to: 'تک',
    asOf: 'بتاریخ',
    apply: 'لگائیں',
    clear: 'صاف کریں',
    refresh: 'تازہ کریں',
    print: 'پی ڈی ایف پرنٹ',
    load: 'لوڈ کریں',
    searchAccounts: 'اکاؤنٹ تلاش کریں…',
    filterNarration: 'تفصیل یا وصول نامہ قسم سے فلٹر…',
    selectAccount: '— اکاؤنٹ منتخب کریں —',
    // Report titles
    trialBalanceTitle: 'ٹرائل بیلنس',
    trialBalanceSubtitle: 'تمام اکاؤنٹس کے ڈیبٹ اور کریڈٹ کل',
    balanceSheetTitle: 'بیلنس شیٹ',
    balanceSheetSubtitle: 'منتخب تاریخ تک مالی پوزیشن',
    profitLossTitle: 'نفع و نقصان',
    profitLossSubtitle: 'منتخب مدت کے لیے آمدنی اور اخراجات',
    accountStatementTitle: 'اکاؤنٹ بیان',
    accountStatementSubtitle: 'چلتے بیلنس کے ساتھ کھاتہ',
    // Table headers
    acNo: 'کھاتہ نمبر',
    accountName: 'اکاؤنٹ کا نام',
    debit: 'ڈیبٹ (روپے)',
    credit: 'کریڈٹ (روپے)',
    total: 'کل',
    date: 'تاریخ',
    voucherType: 'وصول نامہ قسم',
    voucherNo: 'و. نمبر',
    narration: 'تفصیل',
    balance: 'بیلنس (روپے)',
    // Summary labels
    totalDebit: 'کل ڈیبٹ',
    totalCredit: 'کل کریڈٹ',
    difference: 'فرق',
    balanced: '✓ متوازن',
    accounts: 'اکاؤنٹس',
    totalAssets: 'کل اثاثے',
    totalLiabAndEquity: 'کل واجبات + سرمایہ',
    balanceCheck: 'بیلنس جانچ',
    totalIncome: 'کل آمدنی',
    totalExpenses: 'کل اخراجات',
    netProfit: 'خالص نفع',
    netLoss: 'خالص نقصان',
    openingBalance: 'ابتدائی بیلنس',
    closingBalance: 'اختتامی بیلنس',
    transactions: 'لین دین',
    // Sections
    assets: 'اثاثے',
    liabilities: 'واجبات',
    equityCapital: 'سرمایہ',
    incomeRevenue: 'آمدنی',
    expenses: 'اخراجات',
    subtotal: 'ذیلی کل',
    // Empty states
    noDatabaseSelected: 'کوئی ڈیٹا بیس منتخب نہیں',
    selectDbFirst: 'سائیڈبار سے ڈیٹا بیس منتخب کریں۔',
    noData: 'کوئی ڈیٹا نہیں',
    noTransactions: 'کوئی لین دین نہیں ملا',
    selectAccountFirst: 'اکاؤنٹ منتخب کریں',
    selectAccountHint: 'اکاؤنٹ اور تاریخ منتخب کریں، پھر لوڈ کریں کلک کریں۔',
    noTransactionsRange: 'منتخب تاریخ کی حد میں کوئی لین دین نہیں ملا۔',
    // Dr / Cr
    dr: 'ڈی آر',
    cr: 'سی آر',
    // ERP — Purchases
    suppliers: 'سپلائرز',
    purchaseInvoice: 'خرید انوائس',
    supplierOutstanding: 'سپلائر واجبات',
    // ERP — Sales
    customers: 'کسٹمرز',
    salesInvoice: 'فروخت انوائس',
    customerOutstanding: 'کسٹمر واجبات',
    productProfitability: 'پروڈکٹ منافع',
    // ERP — Production
    recipes: 'ریسیپیز / BOM',
    productionBatch: 'پیداواری بیچ',
    productionReport: 'پیداوار رپورٹ',
    // ERP — Inventory
    stockValuation: 'اسٹاک تخمینہ',
    stockTransfer: 'اسٹاک ٹرانسفر',
    stockAdjustment: 'اسٹاک ایڈجسٹمنٹ',
    // ERP — Setup
    accountMappings: 'اکاؤنٹ میپنگ',
    costCenters: 'لاگت مراکز',
    fiscalYears: 'مالی سال',
  },
};

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState('en');
  const t = TRANSLATIONS[lang];
  const toggleLang = () => setLang(l => l === 'en' ? 'ur' : 'en');
  const isUrdu = lang === 'ur';

  return (
    <LanguageContext.Provider value={{ lang, t, toggleLang, isUrdu }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang() {
  return useContext(LanguageContext);
}
