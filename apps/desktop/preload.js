const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Database ──────────────────────────────────────────────────────────────
  listDatabases:      ()       => ipcRenderer.invoke('listDatabases'),
  openDatabase:       (p)      => ipcRenderer.invoke('openDatabase', p),
  migrateSchema:      (p)      => ipcRenderer.invoke('migrateSchema', p),
  getChartOfAccounts: (p)      => ipcRenderer.invoke('getChartOfAccounts', p),

  // ── Voucher types CRUD ────────────────────────────────────────────────────
  getVoucherTypes:   (p) => ipcRenderer.invoke('getVoucherTypes', p),
  saveVoucherType:   (p) => ipcRenderer.invoke('saveVoucherType', p),
  deleteVoucherType: (p) => ipcRenderer.invoke('deleteVoucherType', p),

  // ── Account groups CRUD ───────────────────────────────────────────────────
  getAccountHeads:         (p) => ipcRenderer.invoke('getAccountHeads', p),
  saveAccountGroup:        (p) => ipcRenderer.invoke('saveAccountGroup', p),
  deleteAccountGroup:      (p) => ipcRenderer.invoke('deleteAccountGroup', p),
  findUnclassifiedGroups:  (p) => ipcRenderer.invoke('findUnclassifiedGroups', p),
  getVouchers:   (params)     => ipcRenderer.invoke('getVouchers', params),
  saveVoucher:   (params)     => ipcRenderer.invoke('saveVoucher', params),
  deleteVoucher: (params)     => ipcRenderer.invoke('deleteVoucher', params),

  // ── Mill items (inventory) ────────────────────────────────────────────────
  getMillItems:        (p) => ipcRenderer.invoke('getMillItems', p),
  saveMillItem:        (p) => ipcRenderer.invoke('saveMillItem', p),
  deleteMillItem:      (p) => ipcRenderer.invoke('deleteMillItem', p),
  getWarehouses:       (p) => ipcRenderer.invoke('getWarehouses', p),
  saveWarehouse:       (p) => ipcRenderer.invoke('saveWarehouse', p),
  getStockMovements:   (p) => ipcRenderer.invoke('getStockMovements', p),
  saveStockMovement:   (p) => ipcRenderer.invoke('saveStockMovement', p),
  deleteStockMovement: (p) => ipcRenderer.invoke('deleteStockMovement', p),

  // ── Financial reports ─────────────────────────────────────────────────────
  getTrialBalance:      (p) => ipcRenderer.invoke('getTrialBalance', p),
  getBalanceSheet:      (p) => ipcRenderer.invoke('getBalanceSheet', p),
  getProfitLoss:        (p) => ipcRenderer.invoke('getProfitLoss', p),
  getAccountStatement:  (p) => ipcRenderer.invoke('getAccountStatement', p),
  getOperationalReport: (p) => ipcRenderer.invoke('getOperationalReport', p),

  // ── Import / PDF ──────────────────────────────────────────────────────────
  importAccdb: (p)      => ipcRenderer.invoke('importAccdb', p),
  savePDF:     (params) => ipcRenderer.invoke('savePDF', params),

  // ── Database management ───────────────────────────────────────────────────
  createDatabase: (p) => ipcRenderer.invoke('createDatabase', p),
  renameDatabase: (p) => ipcRenderer.invoke('renameDatabase', p),

  // ── Account CRUD ──────────────────────────────────────────────────────────
  getSubAccounts: (p) => ipcRenderer.invoke('getSubAccounts', p),
  saveAccount:    (p) => ipcRenderer.invoke('saveAccount', p),
  deleteAccount:  (p) => ipcRenderer.invoke('deleteAccount', p),

  // ── File / folder dialogs ─────────────────────────────────────────────────
  selectFile:   (opts) => ipcRenderer.invoke('selectFile', opts),
  getImageData: (p)    => ipcRenderer.invoke('getImageData', p),
  selectFolder: ()     => ipcRenderer.invoke('selectFolder'),

  // ── Prefs & info ──────────────────────────────────────────────────────────
  getPrefs:           ()      => ipcRenderer.invoke('getPrefs'),
  savePrefs:          (prefs) => ipcRenderer.invoke('savePrefs', prefs),
  getGoogleDrivePath: ()      => ipcRenderer.invoke('getGoogleDrivePath'),
  getAppInfo:         ()      => ipcRenderer.invoke('getAppInfo'),

  // ── Password protection ───────────────────────────────────────────────────
  verifyPassword: (p) => ipcRenderer.invoke('verifyPassword', p),
  setPassword:    (p) => ipcRenderer.invoke('setPassword', p),

  // ── Google Drive sync ─────────────────────────────────────────────────────
  syncToGDrive:        (p) => ipcRenderer.invoke('syncToGDrive', p),
  syncFromGDrive:      (p) => ipcRenderer.invoke('syncFromGDrive', p),
  listGDriveDatabases: ()  => ipcRenderer.invoke('listGDriveDatabases'),

  // ══════════════════════════════════════════════════════════════════════════
  // ERP EXTENSION – New channels
  // ══════════════════════════════════════════════════════════════════════════

  // ── ERP migration ─────────────────────────────────────────────────────────
  erpMigrateSchema: (p) => ipcRenderer.invoke('erpMigrateSchema', p),

  // ── Customers ─────────────────────────────────────────────────────────────
  getCustomers:   (p) => ipcRenderer.invoke('getCustomers', p),
  saveCustomer:   (p) => ipcRenderer.invoke('saveCustomer', p),
  deleteCustomer: (p) => ipcRenderer.invoke('deleteCustomer', p),

  // ── Suppliers ─────────────────────────────────────────────────────────────
  getSuppliers:   (p) => ipcRenderer.invoke('getSuppliers', p),
  saveSupplier:   (p) => ipcRenderer.invoke('saveSupplier', p),
  deleteSupplier: (p) => ipcRenderer.invoke('deleteSupplier', p),

  // ── Purchase Invoices ─────────────────────────────────────────────────────
  getPurchaseInvoices:   (p) => ipcRenderer.invoke('getPurchaseInvoices', p),
  getPurchaseInvoice:    (p) => ipcRenderer.invoke('getPurchaseInvoice', p),
  savePurchaseInvoice:   (p) => ipcRenderer.invoke('savePurchaseInvoice', p),
  postPurchaseInvoice:   (p) => ipcRenderer.invoke('postPurchaseInvoice', p),
  cancelPurchaseInvoice: (p) => ipcRenderer.invoke('cancelPurchaseInvoice', p),

  // ── Sales Invoices ────────────────────────────────────────────────────────
  getSalesInvoices:   (p) => ipcRenderer.invoke('getSalesInvoices', p),
  getSalesInvoice:    (p) => ipcRenderer.invoke('getSalesInvoice', p),
  saveSalesInvoice:   (p) => ipcRenderer.invoke('saveSalesInvoice', p),
  postSalesInvoice:   (p) => ipcRenderer.invoke('postSalesInvoice', p),
  cancelSalesInvoice: (p) => ipcRenderer.invoke('cancelSalesInvoice', p),

  // ── Recipes / BOM ─────────────────────────────────────────────────────────
  getRecipes:   (p) => ipcRenderer.invoke('getRecipes', p),
  saveRecipe:   (p) => ipcRenderer.invoke('saveRecipe', p),
  deleteRecipe: (p) => ipcRenderer.invoke('deleteRecipe', p),

  // ── Production Batches ────────────────────────────────────────────────────
  getProductionBatches:  (p) => ipcRenderer.invoke('getProductionBatches', p),
  saveProductionBatch:   (p) => ipcRenderer.invoke('saveProductionBatch', p),
  postProductionBatch:   (p) => ipcRenderer.invoke('postProductionBatch', p),

  // ── Stock Transfer & Adjustment ───────────────────────────────────────────
  saveStockTransfer:   (p) => ipcRenderer.invoke('saveStockTransfer', p),
  saveStockAdjustment: (p) => ipcRenderer.invoke('saveStockAdjustment', p),

  // ── Account Mappings ──────────────────────────────────────────────────────
  getAccountMappings:  (p) => ipcRenderer.invoke('getAccountMappings', p),
  saveAccountMapping:  (p) => ipcRenderer.invoke('saveAccountMapping', p),

  // ── Cost Centers ─────────────────────────────────────────────────────────
  getCostCenters:  (p) => ipcRenderer.invoke('getCostCenters', p),
  saveCostCenter:  (p) => ipcRenderer.invoke('saveCostCenter', p),

  // ── Fiscal Years ──────────────────────────────────────────────────────────
  getFiscalYears:  (p) => ipcRenderer.invoke('getFiscalYears', p),
  saveFiscalYear:  (p) => ipcRenderer.invoke('saveFiscalYear', p),

  // ── Tax Rates ─────────────────────────────────────────────────────────────
  getTaxRates:  (p) => ipcRenderer.invoke('getTaxRates', p),
  saveTaxRate:  (p) => ipcRenderer.invoke('saveTaxRate', p),

  // ── ERP Reports ───────────────────────────────────────────────────────────
  getCustomerOutstanding:  (p) => ipcRenderer.invoke('getCustomerOutstanding', p),
  getSupplierOutstanding:  (p) => ipcRenderer.invoke('getSupplierOutstanding', p),
  getStockValuation:       (p) => ipcRenderer.invoke('getStockValuation', p),
  getProductProfitability: (p) => ipcRenderer.invoke('getProductProfitability', p),
  getProductionReport:     (p) => ipcRenderer.invoke('getProductionReport', p),
  getErpDashboard:         (p) => ipcRenderer.invoke('getErpDashboard', p),

  // ── Audit Log ─────────────────────────────────────────────────────────────
  getAuditLog:        (p) => ipcRenderer.invoke('getAuditLog', p),

  // ── Utility ───────────────────────────────────────────────────────────────
  getNextInvoiceNo:   (p) => ipcRenderer.invoke('getNextInvoiceNo', p),

  // ── Packaging Units ───────────────────────────────────────────────────────
  erpMigrateSchemaEx:    (p) => ipcRenderer.invoke('erpMigrateSchemaEx', p),
  getPackagingUnits:     (p) => ipcRenderer.invoke('getPackagingUnits', p),
  savePackagingUnit:     (p) => ipcRenderer.invoke('savePackagingUnit', p),
  deletePackagingUnit:   (p) => ipcRenderer.invoke('deletePackagingUnit', p),

  // ── Party Payments (Customer Receipts / Supplier Payments) ────────────────
  getPartyPayments:    (p) => ipcRenderer.invoke('getPartyPayments', p),
  savePartyPayment:    (p) => ipcRenderer.invoke('savePartyPayment', p),
  deletePartyPayment:  (p) => ipcRenderer.invoke('deletePartyPayment', p),
  getNextPaymentRef:   (p) => ipcRenderer.invoke('getNextPaymentRef', p),

  // ── Customer / Supplier Account Statements ────────────────────────────────
  getCustomerStatement: (p) => ipcRenderer.invoke('getCustomerStatement', p),
  getSupplierStatement: (p) => ipcRenderer.invoke('getSupplierStatement', p),

  // ── Enhanced Import (COA only) ────────────────────────────────────────────
  importChartOfAccountsOnly: (p) => ipcRenderer.invoke('importChartOfAccountsOnly', p),

  // ── Stock Ledger / Reports ────────────────────────────────────────────────
  getStockLedger:  (p) => ipcRenderer.invoke('getStockLedger', p),
  getStockReport:  (p) => ipcRenderer.invoke('getStockReport', p),
  getErpProfitLoss:(p) => ipcRenderer.invoke('getErpProfitLoss', p),

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 2–5  — Flour-Mill ERP Enhancement Channels
  // ══════════════════════════════════════════════════════════════════════════

  // ── Full flour-mill migration ─────────────────────────────────────────────
  erpMigrateFlourMill: (p) => ipcRenderer.invoke('erpMigrateFlourMill', p),

  // ── Unit Conversions (KG/Maund/Ton/Bag/Bora) ─────────────────────────────
  getUnitConversions:  (p) => ipcRenderer.invoke('getUnitConversions', p),
  saveUnitConversion:  (p) => ipcRenderer.invoke('saveUnitConversion', p),

  // ── Cheque Management ─────────────────────────────────────────────────────
  getCheques:          (p) => ipcRenderer.invoke('getCheques', p),
  saveCheque:          (p) => ipcRenderer.invoke('saveCheque', p),
  updateChequeStatus:  (p) => ipcRenderer.invoke('updateChequeStatus', p),

  // ── Opening Balances ──────────────────────────────────────────────────────
  getOpeningBalances:  (p) => ipcRenderer.invoke('getOpeningBalances', p),
  postOpeningBalance:  (p) => ipcRenderer.invoke('postOpeningBalance', p),

  // ── Company Configuration ─────────────────────────────────────────────────
  getCompanyConfig:    (p) => ipcRenderer.invoke('getCompanyConfig', p),
  saveCompanyConfig:   (p) => ipcRenderer.invoke('saveCompanyConfig', p),

  // ── Aging Reports ─────────────────────────────────────────────────────────
  getAgingReport:      (p) => ipcRenderer.invoke('getAgingReport', p),

  // ── Period-End Validation ─────────────────────────────────────────────────
  runPeriodEndCheck:   (p) => ipcRenderer.invoke('runPeriodEndCheck', p),

  // ── Admin Utilities ───────────────────────────────────────────────────────
  rebuildInventoryValuation: (p) => ipcRenderer.invoke('rebuildInventoryValuation', p),
  getReconciliationReport:   (p) => ipcRenderer.invoke('getReconciliationReport', p),

  // ── Dashboard: Monthly GL Summary ────────────────────────────────────────
  getMonthlyGLSummary: (p) => ipcRenderer.invoke('getMonthlyGLSummary', p),

  // ── Google Drive Enhanced Sync ────────────────────────────────────────────
  syncToGDriveWithLog: (p) => ipcRenderer.invoke('syncToGDriveWithLog', p),
  getBackupLog:        (p) => ipcRenderer.invoke('getBackupLog', p),

  // ── Real-time DB change events ────────────────────────────────────────────
  onDbChanged: (callback) => {
    const handler = (_e, data) => callback(data);
    ipcRenderer.on('db-changed', handler);
    return () => ipcRenderer.removeListener('db-changed', handler);
  },
});
