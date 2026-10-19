/**
 * LanguageContext.js — Flouris ERP Mobile (bare RN)
 * Bilingual EN/UR — persisted via AsyncStorage.
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const TRANSLATIONS = {
  en: {
    appName: 'Flouris ERP',
    dashboard: 'Dashboard',
    reports: 'Reports',
    trialBalance: 'Trial Balance',
    balanceSheet: 'Balance Sheet',
    profitLoss: 'Profit & Loss',
    accountStatement: 'Account Statement',
    voucherEntry: 'Voucher Entry',
    accountManager: 'Accounts & Parties',
    voucherTypeMgr: 'Voucher Types',
    groupManager: 'Account Groups',
    createDatabase: 'New Database',
    importDatabase: 'Import Database',
    settings: 'Settings',
    noDatabase: 'No Database',
    databases: 'Databases',
    googleDrive: 'Google Drive',
    signIn: 'Sign In with Google',
    signOut: 'Sign Out',
    sync: 'Sync Now',
    download: 'Download from Drive',
    upload: 'Upload to Drive',
    from: 'From', to: 'To', asOf: 'As of',
    apply: 'Apply', clear: 'Clear', refresh: 'Refresh',
    print: 'Print PDF', download_pdf: 'Download PDF', share: 'Share PDF', load: 'Load',
    search: 'Search...', searchAccounts: 'Search accounts…',
    filterNarration: 'Filter by narration or voucher type…',
    selectAccount: '— Select Account —',
    trialBalanceTitle: 'Trial Balance',
    trialBalanceSubtitle: 'Debit and credit totals for all accounts',
    balanceSheetTitle: 'Balance Sheet',
    balanceSheetSubtitle: 'Financial position as of selected date',
    profitLossTitle: 'Profit & Loss',
    profitLossSubtitle: 'Income and expense statement for the selected period',
    accountStatementTitle: 'Account Statement',
    accountStatementSubtitle: 'Ledger statement with running balance',
    acNo: 'A/C #', accountName: 'Account Name',
    debit: 'Debit (Rs.)', credit: 'Credit (Rs.)',
    total: 'Total', date: 'Date', voucherType: 'Voucher Type',
    voucherNo: 'V. No', narration: 'Narration',
    balance: 'Balance (Rs.)', amount: 'Amount',
    totalDebit: 'Total Debit', totalCredit: 'Total Credit',
    difference: 'Difference', balanced: '✓ Balanced',
    accounts: 'Accounts', totalAssets: 'Total Assets',
    totalLiabAndEquity: 'Total Liabilities + Equity',
    balanceCheck: 'Balance Check', totalIncome: 'Total Income',
    totalExpenses: 'Total Expenses', netProfit: 'Net Profit', netLoss: 'Net Loss',
    openingBalance: 'Opening Balance', closingBalance: 'Closing Balance',
    transactions: 'Transactions', assets: 'Assets', liabilities: 'Liabilities',
    equityCapital: 'Equity / Capital', incomeRevenue: 'Income / Revenue',
    expenses: 'Expenses', subtotal: 'Subtotal',
    noDatabaseSelected: 'No Database Selected',
    selectDbFirst: 'Select a database to continue.',
    noData: 'No data', noTransactions: 'No Transactions Found',
    selectAccountFirst: 'Select an Account',
    selectAccountHint: 'Choose an account and date range, then tap Load.',
    noTransactionsRange: 'No transactions found for the selected date range.',
    dr: 'Dr', cr: 'Cr',
    save: 'Save', cancel: 'Cancel', delete: 'Delete', edit: 'Edit',
    add: 'Add', new: 'New', confirm: 'Confirm',
    confirmDelete: 'Confirm Delete',
    deleteConfirmMsg: 'Are you sure you want to delete this item?',
    success: 'Success', error: 'Error', loading: 'Loading...',
    companyName: 'Company Name', companyNameUr: 'Company Name (Urdu)',
    createNewDb: 'Create New Database', databaseName: 'Database Name',
    party: 'Party', party2: 'Party 2', remarks: 'Remarks',
    vtype: 'Voucher Type', addLine: 'Add Line', removeLine: 'Remove',
    viewAll: 'View All',
    financialStatements: 'Financial Statements',
    salesPurchase: 'Sales & Purchase',
    cashIncomeExpense: 'Cash, Income & Expense',
    registersStock: 'Registers & Stock',
    balancesParties: 'Balances & Parties',
    salesRegister: 'Sales Register', purchaseRegister: 'Purchase Register',
    cashBook: 'Cash Book', receiptDetail: 'Receipt Detail',
    paymentDetail: 'Payment Detail', incomeDetail: 'Income Detail',
    expenseDetail: 'Expense Detail', voucherRegister: 'Voucher Register',
    allPartyBalances: 'All Party Balances', vendorBalance: 'Vendor Balance',
    customerBalance: 'Customer Balance',
    openReport: 'Open, filter and print PDF',
    connected: 'Connected', notConnected: 'Not Connected',
    driveConnected: 'Google Drive Connected',
    driveNotConnected: 'Google Drive — Tap to connect',
    logo: 'Company Logo', chooseLogo: 'Choose Logo', removeLogo: 'Remove Logo',
    appInfo: 'App Info', version: 'Version', platform: 'Platform',
    downloadingDb: 'Downloading database…', uploadingDb: 'Uploading database…',
    syncComplete: 'Sync complete',
  },
  ur: {
    appName: 'فلوریس ای آر پی',
    dashboard: 'ڈیش بورڈ',
    reports: 'رپورٹس',
    trialBalance: 'ٹرائل بیلنس',
    balanceSheet: 'بیلنس شیٹ',
    profitLoss: 'نفع و نقصان',
    accountStatement: 'اکاؤنٹ بیان',
    voucherEntry: 'وصول نامہ اندراج',
    accountManager: 'اکاؤنٹس و پارٹیز',
    voucherTypeMgr: 'وصول نامہ اقسام',
    groupManager: 'اکاؤنٹ گروپس',
    createDatabase: 'نئی ڈیٹا بیس',
    importDatabase: 'ڈیٹا بیس درآمد',
    settings: 'ترتیبات',
    noDatabase: 'کوئی ڈیٹا بیس نہیں',
    databases: 'ڈیٹا بیسز',
    googleDrive: 'گوگل ڈرائیو',
    signIn: 'گوگل سے سائن ان کریں',
    signOut: 'سائن آؤٹ',
    sync: 'ابھی سنک کریں',
    download: 'ڈرائیو سے ڈاؤنلوڈ',
    upload: 'ڈرائیو پر اپلوڈ',
    from: 'سے', to: 'تک', asOf: 'بتاریخ',
    apply: 'لگائیں', clear: 'صاف کریں', refresh: 'تازہ کریں',
    print: 'پی ڈی ایف پرنٹ', download_pdf: 'پی ڈی ایف ڈاؤنلوڈ',
    share: 'پی ڈی ایف شیئر کریں', load: 'لوڈ کریں',
    search: 'تلاش کریں...', searchAccounts: 'اکاؤنٹ تلاش کریں…',
    filterNarration: 'تفصیل یا وصول نامہ قسم سے فلٹر…',
    selectAccount: '— اکاؤنٹ منتخب کریں —',
    trialBalanceTitle: 'ٹرائل بیلنس',
    trialBalanceSubtitle: 'تمام اکاؤنٹس کے ڈیبٹ اور کریڈٹ کل',
    balanceSheetTitle: 'بیلنس شیٹ',
    balanceSheetSubtitle: 'منتخب تاریخ تک مالی پوزیشن',
    profitLossTitle: 'نفع و نقصان',
    profitLossSubtitle: 'منتخب مدت کے لیے آمدنی اور اخراجات',
    accountStatementTitle: 'اکاؤنٹ بیان',
    accountStatementSubtitle: 'چلتے بیلنس کے ساتھ کھاتہ',
    acNo: 'کھاتہ نمبر', accountName: 'اکاؤنٹ کا نام',
    debit: 'ڈیبٹ (روپے)', credit: 'کریڈٹ (روپے)',
    total: 'کل', date: 'تاریخ', voucherType: 'وصول نامہ قسم',
    voucherNo: 'و. نمبر', narration: 'تفصیل',
    balance: 'بیلنس (روپے)', amount: 'رقم',
    totalDebit: 'کل ڈیبٹ', totalCredit: 'کل کریڈٹ',
    difference: 'فرق', balanced: '✓ متوازن',
    accounts: 'اکاؤنٹس', totalAssets: 'کل اثاثے',
    totalLiabAndEquity: 'کل واجبات + سرمایہ',
    balanceCheck: 'بیلنس جانچ', totalIncome: 'کل آمدنی',
    totalExpenses: 'کل اخراجات', netProfit: 'خالص نفع', netLoss: 'خالص نقصان',
    openingBalance: 'ابتدائی بیلنس', closingBalance: 'اختتامی بیلنس',
    transactions: 'لین دین', assets: 'اثاثے', liabilities: 'واجبات',
    equityCapital: 'سرمایہ', incomeRevenue: 'آمدنی',
    expenses: 'اخراجات', subtotal: 'ذیلی کل',
    noDatabaseSelected: 'کوئی ڈیٹا بیس منتخب نہیں',
    selectDbFirst: 'جاری رکھنے کے لیے ڈیٹا بیس منتخب کریں۔',
    noData: 'کوئی ڈیٹا نہیں', noTransactions: 'کوئی لین دین نہیں ملا',
    selectAccountFirst: 'اکاؤنٹ منتخب کریں',
    selectAccountHint: 'اکاؤنٹ اور تاریخ منتخب کریں، پھر لوڈ کریں۔',
    noTransactionsRange: 'منتخب تاریخ میں کوئی لین دین نہیں۔',
    dr: 'ڈی آر', cr: 'سی آر',
    save: 'محفوظ کریں', cancel: 'منسوخ', delete: 'حذف کریں',
    edit: 'ترمیم', add: 'شامل کریں', new: 'نئی', confirm: 'تصدیق',
    confirmDelete: 'حذف کی تصدیق',
    deleteConfirmMsg: 'کیا آپ واقعی اسے حذف کرنا چاہتے ہیں؟',
    success: 'کامیابی', error: 'خرابی', loading: 'لوڈ ہو رہا ہے...',
    companyName: 'کمپنی کا نام', companyNameUr: 'کمپنی کا نام (اردو)',
    createNewDb: 'نئی ڈیٹا بیس بنائیں', databaseName: 'ڈیٹا بیس کا نام',
    party: 'پارٹی', party2: 'پارٹی ۲', remarks: 'ملاحظات',
    vtype: 'وصول نامہ قسم', addLine: 'لائن شامل کریں', removeLine: 'ہٹائیں',
    viewAll: 'سب دیکھیں',
    financialStatements: 'مالی بیانات',
    salesPurchase: 'فروخت و خرید',
    cashIncomeExpense: 'نقد، آمدنی و اخراجات',
    registersStock: 'رجسٹر و اسٹاک',
    balancesParties: 'بیلنس و پارٹیز',
    salesRegister: 'سیل رجسٹر', purchaseRegister: 'خرید رجسٹر',
    cashBook: 'کیش بک', receiptDetail: 'وصولی تفصیل',
    paymentDetail: 'ادائیگی تفصیل', incomeDetail: 'آمدنی تفصیل',
    expenseDetail: 'اخراجات تفصیل', voucherRegister: 'واؤچر رجسٹر',
    allPartyBalances: 'تمام پارٹی بیلنس', vendorBalance: 'وینڈر بیلنس',
    customerBalance: 'کسٹمر بیلنس',
    openReport: 'رپورٹ کھولیں اور پی ڈی ایف بنائیں',
    connected: 'جڑا ہوا', notConnected: 'نہیں جڑا',
    driveConnected: 'گوگل ڈرائیو جڑ گئی',
    driveNotConnected: 'گوگل ڈرائیو — سائن ان کریں',
    logo: 'کمپنی لوگو', chooseLogo: 'لوگو منتخب کریں', removeLogo: 'لوگو ہٹائیں',
    appInfo: 'ایپ معلومات', version: 'ورژن', platform: 'پلیٹ فارم',
    downloadingDb: 'ڈیٹا بیس ڈاؤنلوڈ ہو رہی ہے…',
    uploadingDb: 'ڈیٹا بیس اپلوڈ ہو رہی ہے…',
    syncComplete: 'سنک مکمل',
  },
};

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState('en');

  // Load persisted language on mount
  useEffect(() => {
    AsyncStorage.getItem('@flouris/lang')
      .then(v => { if (v === 'en' || v === 'ur') setLang(v); })
      .catch(() => {});
  }, []);

  const toggleLang = async () => {
    const next = lang === 'en' ? 'ur' : 'en';
    setLang(next);
    await AsyncStorage.setItem('@flouris/lang', next).catch(() => {});
  };

  const t      = TRANSLATIONS[lang];
  const isUrdu = lang === 'ur';
  const dir    = isUrdu ? 'rtl' : 'ltr';

  return (
    <LanguageContext.Provider value={{ lang, t, toggleLang, isUrdu, dir }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang() {
  return useContext(LanguageContext);
}
