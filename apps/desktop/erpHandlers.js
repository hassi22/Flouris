/**
 * erpHandlers.js  – Flouris ERP Extension
 * Full Flour-Mill ERP: Customers, Suppliers, Purchase Invoices, Sales Invoices,
 * Production (Recipe + Batch), Stock Transfer/Adjustment, Account Mappings,
 * Cost Centers, Fiscal Years, Tax Rates, Audit Log, and all related reports.
 *
 * This file is require()'d from main.js. It receives (ipcMain, getDb, broadcast)
 * where getDb() returns a new better-sqlite3 Database handle to currentDbPath.
 */

'use strict';

const Database = require('better-sqlite3');

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS (duplicated minimally to avoid circular-require with main.js)
// ─────────────────────────────────────────────────────────────────────────────
function getTables(db) {
  return new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name));
}
function getCols(db, table) {
  try { return db.prepare(`PRAGMA table_info("${table}")`).all().map(r => r.name); }
  catch { return []; }
}
function hasCol(db, table, col) {
  return getCols(db, table).map(c => c.toLowerCase()).includes(col.toLowerCase());
}
function addColIfMissing(db, table, col, def) {
  if (!hasCol(db, table, col)) db.prepare(`ALTER TABLE "${table}" ADD COLUMN ${col} ${def}`).run();
}

// ─────────────────────────────────────────────────────────────────────────────
// MIGRATION  – called by the extended migrateSchema IPC handler
// ─────────────────────────────────────────────────────────────────────────────
function runErpMigrations(db) {
  const tables = getTables(db);

  // ── Customers ──────────────────────────────────────────────────────────────
  if (!tables.has('Customers')) {
    db.prepare(`CREATE TABLE Customers (
      CustomerID   INTEGER PRIMARY KEY,
      CustomerCode TEXT UNIQUE,
      CustomerName TEXT NOT NULL,
      CustomerNameUr TEXT,
      Contact      TEXT,
      Address      TEXT,
      CreditLimit  REAL DEFAULT 0,
      OpeningBalance REAL DEFAULT 0,
      LinkedAccountCA INTEGER,
      Active       INTEGER DEFAULT 1,
      CreatedAt    TEXT DEFAULT (datetime('now'))
    )`).run();
    db.prepare('CREATE INDEX IF NOT EXISTS idx_customers_name ON Customers(CustomerName)').run();
  } else {
    ['CustomerCode','CustomerNameUr','Contact','Address','CreditLimit','OpeningBalance','LinkedAccountCA','Active','CreatedAt']
      .forEach(c => addColIfMissing(db, 'Customers', c, c==='Active'?'INTEGER DEFAULT 1':c==='CreditLimit'||c==='OpeningBalance'?'REAL DEFAULT 0':'TEXT'));
  }

  // ── Suppliers ──────────────────────────────────────────────────────────────
  if (!tables.has('Suppliers')) {
    db.prepare(`CREATE TABLE Suppliers (
      SupplierID   INTEGER PRIMARY KEY,
      SupplierCode TEXT UNIQUE,
      SupplierName TEXT NOT NULL,
      SupplierNameUr TEXT,
      Contact      TEXT,
      Address      TEXT,
      OpeningBalance REAL DEFAULT 0,
      LinkedAccountCA INTEGER,
      Active       INTEGER DEFAULT 1,
      CreatedAt    TEXT DEFAULT (datetime('now'))
    )`).run();
    db.prepare('CREATE INDEX IF NOT EXISTS idx_suppliers_name ON Suppliers(SupplierName)').run();
  } else {
    ['SupplierCode','SupplierNameUr','Contact','Address','OpeningBalance','LinkedAccountCA','Active','CreatedAt']
      .forEach(c => addColIfMissing(db, 'Suppliers', c, c==='Active'?'INTEGER DEFAULT 1':c==='OpeningBalance'?'REAL DEFAULT 0':'TEXT'));
  }

  // ── Fiscal Years ────────────────────────────────────────────────────────────
  if (!tables.has('Fiscal_Years')) {
    db.prepare(`CREATE TABLE Fiscal_Years (
      FYearID   INTEGER PRIMARY KEY,
      FYearName TEXT NOT NULL,
      StartDate TEXT NOT NULL,
      EndDate   TEXT NOT NULL,
      Status    TEXT DEFAULT 'Open',
      CreatedAt TEXT DEFAULT (datetime('now'))
    )`).run();
  }

  // ── Cost Centers ────────────────────────────────────────────────────────────
  if (!tables.has('Cost_Centers')) {
    db.prepare(`CREATE TABLE Cost_Centers (
      CCID   INTEGER PRIMARY KEY,
      CCCode TEXT UNIQUE,
      CCName TEXT NOT NULL,
      CCNameUr TEXT,
      Active INTEGER DEFAULT 1
    )`).run();
    // Seed standard cost centers
    db.prepare(`INSERT OR IGNORE INTO Cost_Centers (CCID,CCCode,CCName,CCNameUr) VALUES
      (1,'MILL','Milling','ملنگ'),
      (2,'PACK','Packing','پیکنگ'),
      (3,'ADMIN','Administration','انتظامیہ'),
      (4,'SALES','Sales','فروخت'),
      (5,'TRANS','Transport','نقل و حمل'),
      (6,'MAINT','Maintenance','دیکھ بھال')`).run();
  }

  // ── Account Mappings ────────────────────────────────────────────────────────
  if (!tables.has('Account_Mappings')) {
    db.prepare(`CREATE TABLE Account_Mappings (
      MappingID   INTEGER PRIMARY KEY,
      Purpose     TEXT UNIQUE NOT NULL,
      AccountCA   INTEGER,
      Description TEXT,
      UpdatedAt   TEXT DEFAULT (datetime('now'))
    )`).run();
    // Seed standard mapping purposes
    const purposes = [
      ['RAW_MATERIAL_INVENTORY', 'Raw Material Inventory Account'],
      ['FINISHED_GOODS_INVENTORY', 'Finished Goods Inventory Account'],
      ['BYPRODUCT_INVENTORY', 'By-Product Inventory Account'],
      ['RAW_MATERIAL_PURCHASE', 'Raw Material Purchase / COGS Account'],
      ['SALES', 'Sales Revenue Account'],
      ['SALES_RETURN', 'Sales Return Account'],
      ['COGS', 'Cost of Goods Sold Account'],
      ['SUPPLIER_PAYABLE', 'Supplier / Accounts Payable Account'],
      ['CUSTOMER_RECEIVABLE', 'Customer / Accounts Receivable Account'],
      ['CASH', 'Default Cash Account'],
      ['BANK', 'Default Bank Account'],
      ['PRODUCTION_WIP', 'Production Work-In-Progress Account'],
      ['PRODUCTION_VARIANCE', 'Production Variance Account'],
      ['STOCK_GAIN', 'Stock Gain / Excess Account'],
      ['STOCK_LOSS', 'Stock Loss / Shortage Account'],
      ['TAX_PAYABLE', 'Tax Payable Account'],
    ];
    const ins = db.prepare('INSERT OR IGNORE INTO Account_Mappings (Purpose, Description) VALUES (?,?)');
    purposes.forEach(([p,d]) => ins.run(p, d));
  }

  // ── Tax Rates ───────────────────────────────────────────────────────────────
  if (!tables.has('Tax_Rates')) {
    db.prepare(`CREATE TABLE Tax_Rates (
      TaxID        INTEGER PRIMARY KEY,
      TaxName      TEXT NOT NULL,
      TaxType      TEXT DEFAULT 'Percentage',
      Rate         REAL DEFAULT 0,
      EffectiveDate TEXT,
      OnPurchase   INTEGER DEFAULT 0,
      OnSales      INTEGER DEFAULT 0,
      TaxAccountCA INTEGER,
      Active       INTEGER DEFAULT 1
    )`).run();
  }

  // ── Recipes / BOM ───────────────────────────────────────────────────────────
  if (!tables.has('Recipes')) {
    db.prepare(`CREATE TABLE Recipes (
      RecipeID   INTEGER PRIMARY KEY,
      RecipeName TEXT NOT NULL,
      RecipeNameUr TEXT,
      Description TEXT,
      Active     INTEGER DEFAULT 1,
      CreatedAt  TEXT DEFAULT (datetime('now'))
    )`).run();
  }
  if (!tables.has('Recipe_Inputs')) {
    db.prepare(`CREATE TABLE Recipe_Inputs (
      InputID  INTEGER PRIMARY KEY,
      RecipeID INTEGER NOT NULL,
      ItemID   INTEGER NOT NULL,
      ExpectedQtyPct REAL DEFAULT 100,
      UOM      TEXT DEFAULT 'KG'
    )`).run();
  }
  if (!tables.has('Recipe_Outputs')) {
    db.prepare(`CREATE TABLE Recipe_Outputs (
      OutputID   INTEGER PRIMARY KEY,
      RecipeID   INTEGER NOT NULL,
      ItemID     INTEGER NOT NULL,
      ExpectedPct REAL DEFAULT 0,
      CostAllocPct REAL DEFAULT 0,
      CostMethod TEXT DEFAULT 'weight',
      IsLoss     INTEGER DEFAULT 0,
      UOM        TEXT DEFAULT 'KG'
    )`).run();
  }

  // ── Production Batches – extend existing table ─────────────────────────────
  if (tables.has('Production_Batches')) {
    ['RecipeID','InputItemID','InputQty','InputCostPerUnit','TotalInputCost',
     'CostingMethod','Status','PostedAt','CCID','SourceType','SourceID','VoucherRef']
      .forEach(c => addColIfMissing(db, 'Production_Batches', c,
        ['TotalInputCost','InputQty','InputCostPerUnit'].includes(c) ? 'REAL DEFAULT 0' :
        c === 'CCID' || c === 'RecipeID' || c === 'InputItemID' || c === 'VoucherRef' ? 'INTEGER' :
        c === 'Status' ? "TEXT DEFAULT 'Draft'" : 'TEXT'));
  }

  // ── Production Lines – extend ───────────────────────────────────────────────
  if (tables.has('Production_Lines')) {
    ['AllocatedCost','CostPerUnit','IsLoss','SourceType','PackUnitID']
      .forEach(c => addColIfMissing(db, 'Production_Lines', c,
        ['AllocatedCost','CostPerUnit'].includes(c) ? 'REAL DEFAULT 0' :
        c === 'IsLoss' ? 'INTEGER DEFAULT 0' :
        c === 'PackUnitID' ? 'INTEGER' : 'TEXT'));
  }

  // ── Purchase Invoice Headers ────────────────────────────────────────────────
  if (!tables.has('Purchase_Invoice_Headers')) {
    db.prepare(`CREATE TABLE Purchase_Invoice_Headers (
      PIHID        INTEGER PRIMARY KEY,
      InvoiceNo    TEXT UNIQUE NOT NULL,
      InvoiceDate  TEXT NOT NULL,
      SupplierID   INTEGER NOT NULL,
      WarehouseID  INTEGER,
      Status       TEXT DEFAULT 'Draft',
      SubTotal     REAL DEFAULT 0,
      DiscountAmt  REAL DEFAULT 0,
      TaxAmt       REAL DEFAULT 0,
      NetTotal     REAL DEFAULT 0,
      Remarks      TEXT,
      VoucherRef   INTEGER,
      PostedAt     TEXT,
      CreatedAt    TEXT DEFAULT (datetime('now'))
    )`).run();
    db.prepare('CREATE INDEX IF NOT EXISTS idx_pih_supplier ON Purchase_Invoice_Headers(SupplierID)').run();
    db.prepare('CREATE INDEX IF NOT EXISTS idx_pih_date ON Purchase_Invoice_Headers(InvoiceDate)').run();
  }

  // ── Purchase Invoice Lines ──────────────────────────────────────────────────
  if (!tables.has('Purchase_Invoice_Lines')) {
    db.prepare(`CREATE TABLE Purchase_Invoice_Lines (
      PILID       INTEGER PRIMARY KEY,
      PIHID       INTEGER NOT NULL,
      ItemID      INTEGER NOT NULL,
      WarehouseID INTEGER,
      Quantity    REAL NOT NULL,
      UOM         TEXT DEFAULT 'KG',
      UnitCost    REAL DEFAULT 0,
      DiscountPct REAL DEFAULT 0,
      TaxPct      REAL DEFAULT 0,
      LineTotal   REAL DEFAULT 0,
      StockMovID  INTEGER,
      Narration   TEXT
    )`).run();
    db.prepare('CREATE INDEX IF NOT EXISTS idx_pil_header ON Purchase_Invoice_Lines(PIHID)').run();
  }

  // ── Sales Invoice Headers ───────────────────────────────────────────────────
  if (!tables.has('Sales_Invoice_Headers')) {
    db.prepare(`CREATE TABLE Sales_Invoice_Headers (
      SIHID        INTEGER PRIMARY KEY,
      InvoiceNo    TEXT UNIQUE NOT NULL,
      InvoiceDate  TEXT NOT NULL,
      CustomerID   INTEGER NOT NULL,
      WarehouseID  INTEGER,
      Status       TEXT DEFAULT 'Draft',
      SubTotal     REAL DEFAULT 0,
      DiscountAmt  REAL DEFAULT 0,
      TaxAmt       REAL DEFAULT 0,
      NetTotal     REAL DEFAULT 0,
      Remarks      TEXT,
      VoucherRef   INTEGER,
      COGSVoucherRef INTEGER,
      PostedAt     TEXT,
      CreatedAt    TEXT DEFAULT (datetime('now'))
    )`).run();
    db.prepare('CREATE INDEX IF NOT EXISTS idx_sih_customer ON Sales_Invoice_Headers(CustomerID)').run();
    db.prepare('CREATE INDEX IF NOT EXISTS idx_sih_date ON Sales_Invoice_Headers(InvoiceDate)').run();
  }

  // ── Sales Invoice Lines ─────────────────────────────────────────────────────
  if (!tables.has('Sales_Invoice_Lines')) {
    db.prepare(`CREATE TABLE Sales_Invoice_Lines (
      SILID       INTEGER PRIMARY KEY,
      SIHID       INTEGER NOT NULL,
      ItemID      INTEGER NOT NULL,
      WarehouseID INTEGER,
      Quantity    REAL NOT NULL,
      UOM         TEXT DEFAULT 'KG',
      UnitPrice   REAL DEFAULT 0,
      DiscountPct REAL DEFAULT 0,
      TaxPct      REAL DEFAULT 0,
      LineTotal   REAL DEFAULT 0,
      COGS        REAL DEFAULT 0,
      StockMovID  INTEGER,
      Narration   TEXT
    )`).run();
    db.prepare('CREATE INDEX IF NOT EXISTS idx_sil_header ON Sales_Invoice_Lines(SIHID)').run();
  }

  // ── Stock Movements – extend with source_type/source_id ────────────────────
  if (tables.has('Stock_Movements')) {
    ['SourceType','SourceID','CostPerUnit'].forEach(c => addColIfMissing(db, 'Stock_Movements', c,
      c === 'CostPerUnit' ? 'REAL DEFAULT 0' : c === 'SourceID' ? 'INTEGER' : 'TEXT'));
  }

  // ── Mill Items – extend with account mapping and bardana/costing columns ───────────────────────
  if (tables.has('Mill_Items')) {
    ['PurchaseAccountCA','InventoryAccountCA','SalesAccountCA','COGSAccountCA',
     'SubCategory','PackagingUnit','PackagingKg',
     'IsBardana','BardanaType','BardanaCost']
      .forEach(c => addColIfMissing(db, 'Mill_Items', c,
        ['PurchaseAccountCA','InventoryAccountCA','SalesAccountCA','COGSAccountCA'].includes(c) ? 'INTEGER' :
        c === 'PackagingKg' || c === 'BardanaCost' ? 'REAL DEFAULT 0' :
        c === 'IsBardana' ? 'INTEGER DEFAULT 0' :
        'TEXT'));
  }

  // ── Audit Log ──────────────────────────────────────────────────────────────
  if (!tables.has('Audit_Log')) {
    db.prepare(`CREATE TABLE Audit_Log (
      LogID       INTEGER PRIMARY KEY,
      LogTime     TEXT DEFAULT (datetime('now')),
      TableName   TEXT,
      RecordID    INTEGER,
      Action      TEXT,
      OldValues   TEXT,
      NewValues   TEXT,
      UserName    TEXT DEFAULT 'system'
    )`).run();
    db.prepare('CREATE INDEX IF NOT EXISTS idx_audit_table ON Audit_Log(TableName, RecordID)').run();
  }

  // ── Inventory_Balances cache ────────────────────────────────────────────────
  if (!tables.has('Inventory_Balances')) {
    db.prepare(`CREATE TABLE Inventory_Balances (
      ItemID      INTEGER NOT NULL,
      WarehouseID INTEGER,
      QtyBalance  REAL DEFAULT 0,
      ValueBalance REAL DEFAULT 0,
      AvgCost     REAL DEFAULT 0,
      UpdatedAt   TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (ItemID, WarehouseID)
    )`).run();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WEIGHTED AVERAGE COST ENGINE
// ─────────────────────────────────────────────────────────────────────────────
function getWeightedAvgCost(db, itemId, warehouseId, asOfDate) {
  const whereParts = ['ItemID = ?'];
  const params = [itemId];
  if (warehouseId) { whereParts.push('WarehouseID = ?'); params.push(warehouseId); }
  if (asOfDate)    { whereParts.push('MovementDate <= ?'); params.push(asOfDate); }
  const rows = db.prepare(
    `SELECT MovementType, Quantity, COALESCE(Rate,0) AS Rate FROM Stock_Movements WHERE ${whereParts.join(' AND ')}`
  ).all(...params);
  let totalQty = 0, totalVal = 0;
  for (const r of rows) {
    const dir = (r.MovementType === 'IN' || r.MovementType === 'OPENING') ? 1 : -1;
    totalQty += dir * r.Quantity;
    totalVal += dir * r.Quantity * r.Rate;
  }
  if (totalQty <= 0) return 0;
  return totalVal / totalQty;
}

function getItemStock(db, itemId, warehouseId, asOfDate) {
  const whereParts = ['ItemID = ?'];
  const params = [itemId];
  if (warehouseId) { whereParts.push('WarehouseID = ?'); params.push(warehouseId); }
  if (asOfDate)    { whereParts.push('MovementDate <= ?'); params.push(asOfDate); }
  const rows = db.prepare(
    `SELECT MovementType, Quantity FROM Stock_Movements WHERE ${whereParts.join(' AND ')}`
  ).all(...params);
  let qty = 0;
  for (const r of rows) qty += (r.MovementType === 'IN' || r.MovementType === 'OPENING') ? r.Quantity : -r.Quantity;
  return qty;
}

// ─────────────────────────────────────────────────────────────────────────────
// ACCOUNTING VOUCHER HELPER
// Posts a balanced double-entry voucher into T + Inv tables.
// Returns the new TR_No.
// ─────────────────────────────────────────────────────────────────────────────
function postVoucher(db, { date, vtype, remarks, lines }) {
  const tables = getTables(db);
  const invTable = tables.has('Inv') ? 'Inv' : tables.has('Inv1') ? 'Inv1' : null;
  const tTable   = tables.has('T')   ? 'T'   : tables.has('T1')   ? 'T1'   : null;
  if (!invTable || !tTable) throw new Error('Transaction tables not found. Open a valid database first.');

  // Validate balance strictly
  let totalDr = 0, totalCr = 0;
  for (const l of lines) {
    if (l.debit  > 0) totalDr += l.debit;
    if (l.credit > 0) totalCr += l.credit;
  }
  if (Math.abs(totalDr - totalCr) > 0.01) {
    throw new Error(`Voucher is not balanced (Dr ${totalDr.toFixed(2)} ≠ Cr ${totalCr.toFixed(2)})`);
  }

  const tCols = getCols(db, tTable);
  const hasVNo = tCols.includes('V_No');

  const maxRow = db.prepare(`SELECT COALESCE(MAX(TR_No),0)+1 AS next FROM "${tTable}"`).get();
  const trNo = maxRow.next;
  const totalAmt = totalDr; // Use validated total

  db.prepare(`INSERT INTO "${tTable}" (TR_No, TR_Date, V_Typ ${hasVNo ? ', V_No' : ''}, Remarks, AccountParty, ACParty2, Amont, P) VALUES (?,?,? ${hasVNo ? ',?' : ''},?,?,?,?,0)`)
    .run(...(hasVNo ? [trNo, date, vtype, 0, remarks||'', 0, 0, totalAmt] : [trNo, date, vtype, remarks||'', 0, 0, totalAmt]));

  const invCols = getCols(db, invTable);
  const hasNarr = invCols.includes('Narration');
  const hasExplicitDrCr = invCols.includes('DrAmount');
  let sl = (db.prepare(`SELECT COALESCE(MAX(SL),0) AS m FROM "${invTable}"`).get().m || 0) + 1;

  for (const line of lines) {
    const drAmt = (line.debit  || 0) > 0 ? line.debit  : 0;
    const crAmt = (line.credit || 0) > 0 ? line.credit : 0;
    
    let query = `INSERT INTO "${invTable}" (TR_No, SL, VType, Account_Party, AC_Party2, Amount ${hasNarr ? ', Narration' : ''} ${hasExplicitDrCr ? ', DrAmount, CrAmount, DrAccountCA, CrAccountCA' : ''}) VALUES (?,?,?,?,?,? ${hasNarr ? ',?' : ''} ${hasExplicitDrCr ? ',?,?,?,?' : ''})`;
    
    let params = [
      trNo, sl++, vtype,
      line.accountId, 0,
      drAmt > 0 ? drAmt : crAmt
    ];
    
    if (hasNarr) params.push(line.narration || remarks || '');
    if (hasExplicitDrCr) {
      params.push(drAmt, crAmt, drAmt > 0 ? line.accountId : null, crAmt > 0 ? line.accountId : null);
    }
    
    db.prepare(query).run(...params);
  }

  return trNo;
}

// Actually post balanced pair (Dr accountId1, Cr accountId2)
function postDoubleEntry(db, { date, vtype, remarks, drAccountId, crAccountId, amount, narration }) {
  if (!drAccountId || !crAccountId || !amount || amount <= 0) return null;
  return postVoucher(db, {
    date,
    vtype,
    remarks,
    lines: [
      { accountId: drAccountId, debit: amount, credit: 0, narration },
      { accountId: crAccountId, debit: 0, credit: amount, narration }
    ]
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// STOCK MOVEMENT HELPER
// ─────────────────────────────────────────────────────────────────────────────
function insertStockMovement(db, { date, itemId, warehouseId, movType, qty, rate, refNo, narration, sourceType, sourceId, voucherRef }) {
  const cols = getCols(db, 'Stock_Movements');
  const hasST = cols.includes('SourceType');
  const hasSI = cols.includes('SourceID');
  const hasCPU = cols.includes('CostPerUnit');
  const hasVR = cols.includes('VoucherRef');
  const colList = ['MovementDate','ItemID','WarehouseID','MovementType','Quantity','Rate','ReferenceNo','Narration'];
  const vals = [date, itemId, warehouseId||null, movType, qty, rate||0, refNo||null, narration||null];
  if (hasST)  { colList.push('SourceType');  vals.push(sourceType||null); }
  if (hasSI)  { colList.push('SourceID');    vals.push(sourceId||null); }
  if (hasCPU) { colList.push('CostPerUnit'); vals.push(rate||0); }
  if (hasVR)  { colList.push('VoucherRef');  vals.push(voucherRef||null); }
  const result = db.prepare(`INSERT INTO Stock_Movements (${colList.join(',')}) VALUES (${colList.map(()=>'?').join(',')})`)
    .run(...vals);
  return result.lastInsertRowid;
}

function insertPackagingTransaction(db, { date, itemId, packUnitId, warehouseId, movType, qty, rate, refNo, narration, sourceType, sourceId, voucherRef }) {
  if (!getTables(db).has('Packaging_Transactions')) return null;
  ['PackUnitID','WarehouseID','CostPerUnit','SourceType','SourceID','VoucherRef'].forEach(c => {
    const tableCols = getCols(db, 'Packaging_Transactions');
    if (!tableCols.includes(c)) {
      const def = c === 'CostPerUnit' ? 'REAL DEFAULT 0' : 'INTEGER';
      try { addColIfMissing(db, 'Packaging_Transactions', c, def); } catch (_) {}
    }
  });
  const cols = getCols(db, 'Packaging_Transactions');
  const hasPU = cols.includes('PackUnitID');
  const hasWH = cols.includes('WarehouseID');
  const hasCPU = cols.includes('CostPerUnit');
  const hasST = cols.includes('SourceType');
  const hasSI = cols.includes('SourceID');
  const hasVR = cols.includes('VoucherRef');

  const colList = ['TransactionDate','ItemID','Quantity','MovementType','ReferenceNo','Narration'];
  const vals = [date, itemId, qty, movType, refNo||null, narration||null];
  if (hasPU) { colList.push('PackUnitID'); vals.push(packUnitId||null); }
  if (hasWH) { colList.push('WarehouseID'); vals.push(warehouseId||null); }
  if (hasCPU) { colList.push('CostPerUnit'); vals.push(rate||0); }
  if (hasST) { colList.push('SourceType'); vals.push(sourceType||null); }
  if (hasSI) { colList.push('SourceID'); vals.push(sourceId||null); }
  if (hasVR) { colList.push('VoucherRef'); vals.push(voucherRef||null); }

  const result = db.prepare(`INSERT INTO Packaging_Transactions (${colList.join(',')}) VALUES (${colList.map(()=>'?').join(',')})`)
    .run(...vals);
  return result.lastInsertRowid;
}

// ─────────────────────────────────────────────────────────────────────────────
// ACCOUNT MAPPING LOOKUP
// ─────────────────────────────────────────────────────────────────────────────
function getMapping(db, purpose) {
  if (!getTables(db).has('Account_Mappings')) return null;
  const row = db.prepare('SELECT AccountCA FROM Account_Mappings WHERE Purpose = ?').get(purpose);
  return row ? row.AccountCA : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT LOG HELPER
// ─────────────────────────────────────────────────────────────────────────────
function auditLog(db, tableName, recordId, action, oldVals, newVals) {
  try {
    if (!getTables(db).has('Audit_Log')) return;
    db.prepare('INSERT INTO Audit_Log (TableName, RecordID, Action, OldValues, NewValues) VALUES (?,?,?,?,?)')
      .run(tableName, recordId, action, oldVals ? JSON.stringify(oldVals) : null, newVals ? JSON.stringify(newVals) : null);
  } catch(_) {}
}

// ─────────────────────────────────────────────────────────────────────────────
// IPC HANDLER REGISTRATION
// ─────────────────────────────────────────────────────────────────────────────

// Helpers used by saveCustomer/saveSupplier auto-account creation
function _getAcTable(db) {
  const tables = getTables(db);
  const ac = tables.has('AC') ? 'AC' : tables.has('Ac') ? 'Ac' : null;
  return { acTable: ac };
}

/**
 * Find an existing tblSubAcc entry matching headId + partial name, or create one.
 * headId: 1=Capital, 2=Liabilities, 3=Assets, 4=Income, 5=Expenses
 * Returns SubAccID or null.
 */
function _findOrCreateSubAcc(db, headId, name) {
  try {
    const tables = getTables(db);
    if (!tables.has('tblSubAcc')) return null;
    // Try to find existing
    const existing = db.prepare('SELECT SubAccID FROM tblSubAcc WHERE AccountID=? AND lower(SubAccountNAme) LIKE lower(?) LIMIT 1').get(headId, `%${name.split(' ')[0]}%`);
    if (existing) return existing.SubAccID;
    // Create new sub-account group
    const next = (db.prepare('SELECT COALESCE(MAX(SubAccID),0)+1 AS n FROM tblSubAcc').get()).n;
    db.prepare('INSERT INTO tblSubAcc (SubAccID,AccountID,SubAccountNAme) VALUES (?,?,?)').run(next, headId, name);
    return next;
  } catch(_) { return null; }
}

function registerErpHandlers(ipcMain, getCurrentDbPath, broadcastChange) {

  function openDb(dbPath, writeable) {
    const dp = dbPath || getCurrentDbPath();
    if (!dp) throw new Error('No database open. Select a database first.');
    return writeable ? new Database(dp, { fileMustExist: true }) : new Database(dp, { readonly: true, fileMustExist: true });
  }

  // ── ERP Migration (extended) ───────────────────────────────────────────────
  ipcMain.handle('erpMigrateSchema', (_e, dbPath) => {
    try {
      const db = openDb(dbPath, true);
      db.pragma('journal_mode = WAL');
      db.transaction(() => runErpMigrations(db))();
      db.close();
      return { success: true };
    } catch(e) { return { success: false, error: e.message }; }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CUSTOMERS
  // ─────────────────────────────────────────────────────────────────────────
  ipcMain.handle('getCustomers', (_e, { dbPath, includeInactive } = {}) => {
    try {
      const db = openDb(dbPath, false);
      if (!getTables(db).has('Customers')) { db.close(); return { success: true, data: [] }; }
      const where = includeInactive ? '' : 'WHERE Active=1';
      const data = db.prepare(`SELECT * FROM Customers ${where} ORDER BY CustomerName`).all();
      db.close();
      return { success: true, data };
    } catch(e) { return { success: false, error: e.message, data: [] }; }
  });

  ipcMain.handle('saveCustomer', (_e, { dbPath, customer }) => {
    try {
      const dp = dbPath || getCurrentDbPath();
      const db = new Database(dp, { fileMustExist: true });
      db.pragma('journal_mode = WAL');
      if (!getTables(db).has('Customers')) { db.close(); return { success: false, error: 'Run ERP migration first.' }; }
      if (customer.CustomerID) {
        const old = db.prepare('SELECT * FROM Customers WHERE CustomerID=?').get(customer.CustomerID);
        db.prepare('UPDATE Customers SET CustomerCode=?,CustomerName=?,CustomerNameUr=?,Contact=?,Address=?,CreditLimit=?,OpeningBalance=?,LinkedAccountCA=?,Active=? WHERE CustomerID=?')
          .run(customer.CustomerCode||null, customer.CustomerName, customer.CustomerNameUr||null, customer.Contact||null, customer.Address||null, Number(customer.CreditLimit||0), Number(customer.OpeningBalance||0), customer.LinkedAccountCA||null, customer.Active!==false?1:0, customer.CustomerID);
        auditLog(db, 'Customers', customer.CustomerID, 'UPDATE', old, customer);
      } else {
        const next = (db.prepare('SELECT COALESCE(MAX(CustomerID),0)+1 AS n FROM Customers').get()).n;
        customer.CustomerID = next;
        db.prepare('INSERT INTO Customers (CustomerID,CustomerCode,CustomerName,CustomerNameUr,Contact,Address,CreditLimit,OpeningBalance,LinkedAccountCA,Active) VALUES (?,?,?,?,?,?,?,?,?,1)')
          .run(next, customer.CustomerCode||null, customer.CustomerName, customer.CustomerNameUr||null, customer.Contact||null, customer.Address||null, Number(customer.CreditLimit||0), Number(customer.OpeningBalance||0), customer.LinkedAccountCA||null);
        auditLog(db, 'Customers', next, 'INSERT', null, customer);

        // Auto-create GL account for customer if not linked yet
        if (!customer.LinkedAccountCA) {
          try {
            const { acTable } = _getAcTable(db);
            if (acTable) {
              const acCols = getCols(db, acTable);
              const hasRole = acCols.includes('Role');
              const hasUAC  = acCols.some(c => /uac_title/i.test(c));
              const uacCol  = acCols.find(c => /uac_title/i.test(c));
              // Find a subAccId for Trade Receivables (look for any group with 'receivable' or head 3=Assets)
              const subAccId = _findOrCreateSubAcc(db, 3, 'Trade Receivables') || 0;
              const newCA = (db.prepare(`SELECT COALESCE(MAX(CA),0)+1 AS n FROM "${acTable}"`).get()).n;
              const colsList = ['CA','SubAccID','AC_TITLE1'];
              const valsList = ['?','?','?'];
              const insVals  = [newCA, subAccId, customer.CustomerName];
              if (hasUAC) { colsList.push(uacCol); valsList.push('?'); insVals.push(customer.CustomerNameUr||customer.CustomerName); }
              if (hasRole) { colsList.push('Role'); valsList.push('?'); insVals.push('customer'); }
              db.prepare(`INSERT INTO "${acTable}" (${colsList.join(',')}) VALUES (${valsList.join(',')})`).run(...insVals);
              db.prepare('UPDATE Customers SET LinkedAccountCA=? WHERE CustomerID=?').run(newCA, next);
            }
          } catch(_) {}
        }
      }
      db.close();
      broadcastChange(dp);
      return { success: true, CustomerID: customer.CustomerID };
    } catch(e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('deleteCustomer', (_e, { dbPath, CustomerID }) => {
    try {
      const dp = dbPath || getCurrentDbPath();
      const db = new Database(dp, { fileMustExist: true });
      db.pragma('journal_mode = WAL');
      if (getTables(db).has('Sales_Invoice_Headers')) {
        const used = db.prepare('SELECT COUNT(*) AS c FROM Sales_Invoice_Headers WHERE CustomerID=?').get(CustomerID);
        if (used.c > 0) { db.close(); return { success: false, error: `Cannot delete: ${used.c} invoice(s) reference this customer.` }; }
      }
      db.prepare('DELETE FROM Customers WHERE CustomerID=?').run(CustomerID);
      db.close();
      broadcastChange(dp);
      return { success: true };
    } catch(e) { return { success: false, error: e.message }; }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SUPPLIERS
  // ─────────────────────────────────────────────────────────────────────────
  ipcMain.handle('getSuppliers', (_e, { dbPath, includeInactive } = {}) => {
    try {
      const db = openDb(dbPath, false);
      if (!getTables(db).has('Suppliers')) { db.close(); return { success: true, data: [] }; }
      const where = includeInactive ? '' : 'WHERE Active=1';
      const data = db.prepare(`SELECT * FROM Suppliers ${where} ORDER BY SupplierName`).all();
      db.close();
      return { success: true, data };
    } catch(e) { return { success: false, error: e.message, data: [] }; }
  });

  ipcMain.handle('saveSupplier', (_e, { dbPath, supplier }) => {
    try {
      const dp = dbPath || getCurrentDbPath();
      const db = new Database(dp, { fileMustExist: true });
      db.pragma('journal_mode = WAL');
      if (!getTables(db).has('Suppliers')) { db.close(); return { success: false, error: 'Run ERP migration first.' }; }
      if (supplier.SupplierID) {
        db.prepare('UPDATE Suppliers SET SupplierCode=?,SupplierName=?,SupplierNameUr=?,Contact=?,Address=?,OpeningBalance=?,LinkedAccountCA=?,Active=? WHERE SupplierID=?')
          .run(supplier.SupplierCode||null, supplier.SupplierName, supplier.SupplierNameUr||null, supplier.Contact||null, supplier.Address||null, Number(supplier.OpeningBalance||0), supplier.LinkedAccountCA||null, supplier.Active!==false?1:0, supplier.SupplierID);
      } else {
        const next = (db.prepare('SELECT COALESCE(MAX(SupplierID),0)+1 AS n FROM Suppliers').get()).n;
        supplier.SupplierID = next;
        db.prepare('INSERT INTO Suppliers (SupplierID,SupplierCode,SupplierName,SupplierNameUr,Contact,Address,OpeningBalance,LinkedAccountCA,Active) VALUES (?,?,?,?,?,?,?,?,1)')
          .run(next, supplier.SupplierCode||null, supplier.SupplierName, supplier.SupplierNameUr||null, supplier.Contact||null, supplier.Address||null, Number(supplier.OpeningBalance||0), supplier.LinkedAccountCA||null);

        // Auto-create GL account for supplier if not linked yet
        if (!supplier.LinkedAccountCA) {
          try {
            const { acTable } = _getAcTable(db);
            if (acTable) {
              const acCols = getCols(db, acTable);
              const hasRole = acCols.includes('Role');
              const hasUAC  = acCols.some(c => /uac_title/i.test(c));
              const uacCol  = acCols.find(c => /uac_title/i.test(c));
              const subAccId = _findOrCreateSubAcc(db, 2, 'Trade Payables') || 0;
              const newCA = (db.prepare(`SELECT COALESCE(MAX(CA),0)+1 AS n FROM "${acTable}"`).get()).n;
              const colsList = ['CA','SubAccID','AC_TITLE1'];
              const valsList = ['?','?','?'];
              const insVals  = [newCA, subAccId, supplier.SupplierName];
              if (hasUAC) { colsList.push(uacCol); valsList.push('?'); insVals.push(supplier.SupplierNameUr||supplier.SupplierName); }
              if (hasRole) { colsList.push('Role'); valsList.push('?'); insVals.push('supplier'); }
              db.prepare(`INSERT INTO "${acTable}" (${colsList.join(',')}) VALUES (${valsList.join(',')})`).run(...insVals);
              db.prepare('UPDATE Suppliers SET LinkedAccountCA=? WHERE SupplierID=?').run(newCA, next);
            }
          } catch(_) {}
        }
      }
      db.close();
      broadcastChange(dp);
      return { success: true, SupplierID: supplier.SupplierID };
    } catch(e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('deleteSupplier', (_e, { dbPath, SupplierID }) => {
    try {
      const dp = dbPath || getCurrentDbPath();
      const db = new Database(dp, { fileMustExist: true });
      db.pragma('journal_mode = WAL');
      if (getTables(db).has('Purchase_Invoice_Headers')) {
        const used = db.prepare('SELECT COUNT(*) AS c FROM Purchase_Invoice_Headers WHERE SupplierID=?').get(SupplierID);
        if (used.c > 0) { db.close(); return { success: false, error: `Cannot delete: ${used.c} invoice(s) reference this supplier.` }; }
      }
      db.prepare('DELETE FROM Suppliers WHERE SupplierID=?').run(SupplierID);
      db.close();
      broadcastChange(dp);
      return { success: true };
    } catch(e) { return { success: false, error: e.message }; }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PURCHASE INVOICES
  // ─────────────────────────────────────────────────────────────────────────
  ipcMain.handle('getPurchaseInvoices', (_e, { dbPath, startDate, endDate, supplierId, status } = {}) => {
    try {
      const db = openDb(dbPath, false);
      if (!getTables(db).has('Purchase_Invoice_Headers')) { db.close(); return { success: true, data: [] }; }
      const where = ['1=1'], params = [];
      if (startDate) { where.push('H.InvoiceDate >= ?'); params.push(startDate); }
      if (endDate)   { where.push('H.InvoiceDate <= ?'); params.push(endDate); }
      if (supplierId){ where.push('H.SupplierID = ?');   params.push(supplierId); }
      if (status)    { where.push('H.Status = ?');       params.push(status); }
      const data = db.prepare(`SELECT H.*, S.SupplierName FROM Purchase_Invoice_Headers H LEFT JOIN Suppliers S ON S.SupplierID=H.SupplierID WHERE ${where.join(' AND ')} ORDER BY H.InvoiceDate DESC, H.PIHID DESC`).all(...params);
      db.close();
      return { success: true, data };
    } catch(e) { return { success: false, error: e.message, data: [] }; }
  });

  ipcMain.handle('getPurchaseInvoice', (_e, { dbPath, PIHID }) => {
    try {
      const db = openDb(dbPath, false);
      const header = db.prepare('SELECT H.*, S.SupplierName FROM Purchase_Invoice_Headers H LEFT JOIN Suppliers S ON S.SupplierID=H.SupplierID WHERE H.PIHID=?').get(PIHID);
      const lines  = db.prepare('SELECT L.*, I.ItemName, I.UOM, W.WarehouseName FROM Purchase_Invoice_Lines L LEFT JOIN Mill_Items I ON I.ItemID=L.ItemID LEFT JOIN Warehouses W ON W.WarehouseID=L.WarehouseID WHERE L.PIHID=?').all(PIHID);
      db.close();
      return { success: true, header, lines };
    } catch(e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('savePurchaseInvoice', (_e, { dbPath, header, lines }) => {
    try {
      const dp = dbPath || getCurrentDbPath();
      const db = new Database(dp, { fileMustExist: true });
      db.pragma('journal_mode = WAL');

      // Line totals: qty × unitCost × (1 - disc%) — before header discount
      const subTotal = lines.reduce((s,l) => {
        const lineTotal = (Number(l.Quantity)||0) * (Number(l.UnitCost)||0) * (1 - (Number(l.DiscountPct)||0)/100);
        return s + lineTotal;
      }, 0);
      // Tax: sum of each line's tax on its pre-tax line total
      const taxAmt = lines.reduce((s,l) => {
        const base = (Number(l.Quantity)||0) * (Number(l.UnitCost)||0) * (1 - (Number(l.DiscountPct)||0)/100);
        return s + base * (Number(l.TaxPct)||0) / 100;
      }, 0);
      const netTotal = subTotal + taxAmt - (Number(header.DiscountAmt)||0);

      let pihid = header.PIHID;
      db.transaction(() => {
        if (pihid) {
          // Can only edit Draft invoices
          const existing = db.prepare('SELECT Status FROM Purchase_Invoice_Headers WHERE PIHID=?').get(pihid);
          if (existing && existing.Status === 'Posted')
            throw new Error('Cannot edit a posted invoice. Cancel it first.');
          db.prepare('UPDATE Purchase_Invoice_Headers SET InvoiceNo=?,InvoiceDate=?,SupplierID=?,WarehouseID=?,Remarks=?,SubTotal=?,DiscountAmt=?,TaxAmt=?,NetTotal=?,PaymentType=?,SettlementAccountCA=?,CashAmount=?,ChequeAmount=?,CreditAmount=?,ChequeNo=?,ChequeDate=?,BankName=?,SupplierRef=?,DueDate=? WHERE PIHID=?')
            .run(
              header.InvoiceNo, header.InvoiceDate, header.SupplierID, header.WarehouseID||null, header.Remarks||null,
              subTotal, Number(header.DiscountAmt||0), taxAmt, netTotal,
              header.PaymentType || 'Credit',
              header.SettlementAccountCA ? Number(header.SettlementAccountCA) : null,
              Number(header.CashAmount || 0),
              Number(header.ChequeAmount || 0),
              Number(header.CreditAmount || 0),
              header.ChequeNo || null,
              header.ChequeDate || null,
              header.BankName || null,
              header.SupplierRef || null,
              header.DueDate || null,
              pihid
            );
          db.prepare('DELETE FROM Purchase_Invoice_Lines WHERE PIHID=?').run(pihid);
        } else {
          const next = (db.prepare('SELECT COALESCE(MAX(PIHID),0)+1 AS n FROM Purchase_Invoice_Headers').get()).n;
          pihid = next;
          db.prepare('INSERT INTO Purchase_Invoice_Headers (PIHID,InvoiceNo,InvoiceDate,SupplierID,WarehouseID,Status,SubTotal,DiscountAmt,TaxAmt,NetTotal,Remarks,PaymentType,SettlementAccountCA,CashAmount,ChequeAmount,CreditAmount,ChequeNo,ChequeDate,BankName,SupplierRef,DueDate) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
            .run(
              pihid, header.InvoiceNo, header.InvoiceDate, header.SupplierID, header.WarehouseID||null, 'Draft',
              subTotal, Number(header.DiscountAmt||0), taxAmt, netTotal, header.Remarks||null,
              header.PaymentType || 'Credit',
              header.SettlementAccountCA ? Number(header.SettlementAccountCA) : null,
              Number(header.CashAmount || 0),
              Number(header.ChequeAmount || 0),
              Number(header.CreditAmount || 0),
              header.ChequeNo || null,
              header.ChequeDate || null,
              header.BankName || null,
              header.SupplierRef || null,
              header.DueDate || null
            );
        }
        // Check if PackUnitID column exists on Purchase_Invoice_Lines
        const hasPKU = getCols(db, 'Purchase_Invoice_Lines').includes('PackUnitID');
        lines.forEach(l => {
          const lineTotal = (Number(l.Quantity)||0) * (Number(l.UnitCost)||0) * (1 - (Number(l.DiscountPct)||0)/100);
          // If a packaging unit is selected, store the KG equivalent in a note; qty = bag count
          // WeightKg per bag is stored in Item_Packaging_Units
          const packUnitId = l.PackUnitID ? Number(l.PackUnitID) : null;
          if (hasPKU) {
            db.prepare('INSERT INTO Purchase_Invoice_Lines (PIHID,ItemID,WarehouseID,Quantity,UOM,UnitCost,DiscountPct,TaxPct,LineTotal,PackUnitID,Narration) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
              .run(pihid, l.ItemID, l.WarehouseID||header.WarehouseID||null, Number(l.Quantity), l.UOM||'KG', Number(l.UnitCost||0), Number(l.DiscountPct||0), Number(l.TaxPct||0), lineTotal, packUnitId, l.Narration||null);
          } else {
            db.prepare('INSERT INTO Purchase_Invoice_Lines (PIHID,ItemID,WarehouseID,Quantity,UOM,UnitCost,DiscountPct,TaxPct,LineTotal,Narration) VALUES (?,?,?,?,?,?,?,?,?,?)')
              .run(pihid, l.ItemID, l.WarehouseID||header.WarehouseID||null, Number(l.Quantity), l.UOM||'KG', Number(l.UnitCost||0), Number(l.DiscountPct||0), Number(l.TaxPct||0), lineTotal, l.Narration||null);
          }
        });
      })();
      db.close();
      broadcastChange(dp);
      return { success: true, PIHID: pihid };
    } catch(e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('postPurchaseInvoice', (_e, { dbPath, PIHID }) => {
    try {
      const dp = dbPath || getCurrentDbPath();
      const db = new Database(dp, { fileMustExist: true });
      db.pragma('journal_mode = WAL');

      let trNo = null;
      db.transaction(() => {
        const header = db.prepare('SELECT * FROM Purchase_Invoice_Headers WHERE PIHID=?').get(PIHID);
        if (!header) throw new Error(`Purchase invoice #${PIHID} not found.`);
        if (header.Status === 'Posted')    throw new Error('Invoice already posted.');
        if (header.Status === 'Cancelled') throw new Error('Cannot post a cancelled invoice.');

        const lines = db.prepare('SELECT * FROM Purchase_Invoice_Lines WHERE PIHID=?').all(PIHID);
        if (!lines.length) throw new Error('Invoice has no lines.');

        const supplier = getTables(db).has('Suppliers')
          ? db.prepare('SELECT * FROM Suppliers WHERE SupplierID=?').get(header.SupplierID) : null;
        // Supplier account: use linked account, else fall back to global mapping
        const supplierAccountCA = (supplier && supplier.LinkedAccountCA)
          || getMapping(db, 'SUPPLIER_PAYABLE');

        // Global inventory account mappings (fallbacks)
        const rawInvCA = getMapping(db, 'RAW_MATERIAL_INVENTORY');
        const fgInvCA  = getMapping(db, 'FINISHED_GOODS_INVENTORY');

        // Post stock movements for each line
        for (const line of lines) {
          const whId = line.WarehouseID || header.WarehouseID || null;

          // Actual stock IN rate = UnitCost on the invoice line (this is the purchase price)
          const movId = insertStockMovement(db, {
            date: header.InvoiceDate, itemId: line.ItemID,
            warehouseId: whId,
            movType: 'IN', qty: line.Quantity, rate: line.UnitCost,
            refNo: header.InvoiceNo,
            narration: `Purchase Invoice ${header.InvoiceNo} – ${supplier?.SupplierName || ''}`,
            sourceType: 'PURCHASE_INVOICE', sourceId: PIHID,
          });
          db.prepare('UPDATE Purchase_Invoice_Lines SET StockMovID=? WHERE PILID=?').run(movId, line.PILID);

          // Update Inventory_Balances cache (weighted avg)
          if (getTables(db).has('Inventory_Balances')) {
            const ib = db.prepare('SELECT * FROM Inventory_Balances WHERE ItemID=? AND (WarehouseID=? OR (WarehouseID IS NULL AND ? IS NULL))')
              .get(line.ItemID, whId, whId);
            if (ib) {
              const newQty = Number(ib.QtyBalance) + Number(line.Quantity);
              const newVal = Number(ib.ValueBalance) + Number(line.Quantity) * Number(line.UnitCost);
              const newAvg = newQty > 0 ? newVal / newQty : 0;
              db.prepare('UPDATE Inventory_Balances SET QtyBalance=?,ValueBalance=?,AvgCost=?,UpdatedAt=datetime(\'now\') WHERE ItemID=? AND (WarehouseID=? OR (WarehouseID IS NULL AND ? IS NULL))')
                .run(newQty, newVal, newAvg, line.ItemID, whId, whId);
            } else {
              db.prepare('INSERT OR IGNORE INTO Inventory_Balances (ItemID,WarehouseID,QtyBalance,ValueBalance,AvgCost) VALUES (?,?,?,?,?)')
                .run(line.ItemID, whId, Number(line.Quantity), Number(line.Quantity)*Number(line.UnitCost), Number(line.UnitCost));
            }
          }
        }

        // GL voucher: Dr Inventory Accounts (per item or global) / Cr Supplier
        // We post one combined voucher using the header net total
        if (supplierAccountCA) {
          // Determine which inventory account to debit — use item-level InventoryAccountCA if set
          // otherwise fall back to RAW_MATERIAL_INVENTORY global mapping
          const itemIds = [...new Set(lines.map(l => l.ItemID))];
          let debitCA = rawInvCA || fgInvCA;  // default

          if (itemIds.length === 1) {
            const item = db.prepare('SELECT * FROM Mill_Items WHERE ItemID=?').get(itemIds[0]);
            if (item && item.InventoryAccountCA) debitCA = item.InventoryAccountCA;
            else if (item && item.PurchaseAccountCA) debitCA = item.PurchaseAccountCA;
          }

          if (debitCA) {
            trNo = postDoubleEntry(db, {
              date: header.InvoiceDate, vtype: 302,
              remarks: `Purchase Invoice ${header.InvoiceNo}`,
              drAccountId: debitCA, crAccountId: supplierAccountCA,
              amount: header.NetTotal,
              narration: `Purchase Invoice ${header.InvoiceNo} – ${supplier?.SupplierName || ''}`,
            });
          }
        }

        db.prepare('UPDATE Purchase_Invoice_Headers SET Status=?,PostedAt=?,VoucherRef=? WHERE PIHID=?')
          .run('Posted', new Date().toISOString(), trNo, PIHID);
        auditLog(db, 'Purchase_Invoice_Headers', PIHID, 'POST', { Status: 'Draft' }, { Status: 'Posted', VoucherRef: trNo });
      })();
      db.close();
      broadcastChange(dp);
      return { success: true, VoucherRef: trNo };
    } catch(e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('cancelPurchaseInvoice', (_e, { dbPath, PIHID }) => {
    try {
      const dp = dbPath || getCurrentDbPath();
      const db = new Database(dp, { fileMustExist: true });
      db.pragma('journal_mode = WAL');
      db.transaction(() => {
        const header = db.prepare('SELECT * FROM Purchase_Invoice_Headers WHERE PIHID=?').get(PIHID);
        if (!header) throw new Error('Invoice not found.');
        if (header.Status === 'Cancelled') throw new Error('Already cancelled.');
        // Reverse stock movements
        const lines = db.prepare('SELECT * FROM Purchase_Invoice_Lines WHERE PIHID=?').all(PIHID);
        for (const line of lines) {
          if (line.StockMovID) {
            // Create a reversing OUT movement
            insertStockMovement(db, {
              date: new Date().toISOString().slice(0,10), itemId: line.ItemID,
              warehouseId: line.WarehouseID, movType: 'OUT',
              qty: line.Quantity, rate: line.UnitCost,
              refNo: `REV-${header.InvoiceNo}`, narration: `Reversal of Purchase Invoice ${header.InvoiceNo}`,
              sourceType: 'PURCHASE_INVOICE_CANCEL', sourceId: PIHID,
            });
          }
        }
        // If there is a voucher, reverse it via journal entry
        if (header.VoucherRef) {
          const invAccountCA = getMapping(db, 'RAW_MATERIAL_INVENTORY');
          const supplier = getTables(db).has('Suppliers') ? db.prepare('SELECT * FROM Suppliers WHERE SupplierID=?').get(header.SupplierID) : null;
          const supplierAccountCA = (supplier && supplier.LinkedAccountCA) || getMapping(db, 'SUPPLIER_PAYABLE');
          if (invAccountCA && supplierAccountCA) {
            postDoubleEntry(db, {
              date: new Date().toISOString().slice(0,10), vtype: 201,
              remarks: `Reversal of Purchase Invoice ${header.InvoiceNo}`,
              drAccountId: supplierAccountCA, crAccountId: invAccountCA,
              amount: header.NetTotal, narration: `Reversal of Purchase Invoice ${header.InvoiceNo}`,
            });
          }
        }
        db.prepare('UPDATE Purchase_Invoice_Headers SET Status=? WHERE PIHID=?').run('Cancelled', PIHID);
        auditLog(db, 'Purchase_Invoice_Headers', PIHID, 'CANCEL', { Status: header.Status }, { Status: 'Cancelled' });
      })();
      db.close();
      broadcastChange(dp);
      return { success: true };
    } catch(e) { return { success: false, error: e.message }; }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SALES INVOICES
  // ─────────────────────────────────────────────────────────────────────────
  ipcMain.handle('getSalesInvoices', (_e, { dbPath, startDate, endDate, customerId, status } = {}) => {
    try {
      const db = openDb(dbPath, false);
      if (!getTables(db).has('Sales_Invoice_Headers')) { db.close(); return { success: true, data: [] }; }
      const where = ['1=1'], params = [];
      if (startDate)  { where.push('H.InvoiceDate >= ?');  params.push(startDate); }
      if (endDate)    { where.push('H.InvoiceDate <= ?');  params.push(endDate); }
      if (customerId) { where.push('H.CustomerID = ?');    params.push(customerId); }
      if (status)     { where.push('H.Status = ?');        params.push(status); }
      const data = db.prepare(`SELECT H.*, C.CustomerName FROM Sales_Invoice_Headers H LEFT JOIN Customers C ON C.CustomerID=H.CustomerID WHERE ${where.join(' AND ')} ORDER BY H.InvoiceDate DESC, H.SIHID DESC`).all(...params);
      db.close();
      return { success: true, data };
    } catch(e) { return { success: false, error: e.message, data: [] }; }
  });

  ipcMain.handle('getSalesInvoice', (_e, { dbPath, SIHID }) => {
    try {
      const db = openDb(dbPath, false);
      const header = db.prepare('SELECT H.*, C.CustomerName FROM Sales_Invoice_Headers H LEFT JOIN Customers C ON C.CustomerID=H.CustomerID WHERE H.SIHID=?').get(SIHID);
      const lines  = db.prepare('SELECT L.*, I.ItemName, I.UOM, W.WarehouseName FROM Sales_Invoice_Lines L LEFT JOIN Mill_Items I ON I.ItemID=L.ItemID LEFT JOIN Warehouses W ON W.WarehouseID=L.WarehouseID WHERE L.SIHID=?').all(SIHID);
      db.close();
      return { success: true, header, lines };
    } catch(e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('saveSalesInvoice', (_e, { dbPath, header, lines }) => {
    try {
      const dp = dbPath || getCurrentDbPath();
      const db = new Database(dp, { fileMustExist: true });
      db.pragma('journal_mode = WAL');

      const billableQty = l => {
        const quantityKg = Number(l.Quantity) || 0;
        if (!l.PackUnitID || !getTables(db).has('Item_Packaging_Units')) return quantityKg;
        const pack = db.prepare('SELECT WeightKg FROM Item_Packaging_Units WHERE PackUnitID=? AND ItemID=? AND Active=1').get(Number(l.PackUnitID), Number(l.ItemID));
        const weightKg = Number(pack?.WeightKg) || 0;
        return weightKg > 0 ? quantityKg / weightKg : quantityKg;
      };
      const subTotal = lines.reduce((s,l) => {
        const base = billableQty(l) * (Number(l.UnitPrice)||0) * (1 - (Number(l.DiscountPct)||0)/100);
        return s + base;
      }, 0);
      const taxAmt = lines.reduce((s,l) => {
        const base = billableQty(l) * (Number(l.UnitPrice)||0) * (1 - (Number(l.DiscountPct)||0)/100);
        return s + base * (Number(l.TaxPct)||0) / 100;
      }, 0);
      const netTotal = subTotal + taxAmt - (Number(header.DiscountAmt)||0);

      let sihid = header.SIHID;
      db.transaction(() => {
        if (sihid) {
          const existing = db.prepare('SELECT Status FROM Sales_Invoice_Headers WHERE SIHID=?').get(sihid);
          if (existing && existing.Status === 'Posted')
            throw new Error('Cannot edit a posted invoice. Cancel it first.');
          db.prepare('UPDATE Sales_Invoice_Headers SET InvoiceNo=?,InvoiceDate=?,CustomerID=?,WarehouseID=?,Remarks=?,SubTotal=?,DiscountAmt=?,TaxAmt=?,NetTotal=?,PaymentType=?,SettlementAccountCA=?,CashAmount=?,DueDate=?,VehicleNo=?,DriverName=? WHERE SIHID=?')
            .run(
              header.InvoiceNo, header.InvoiceDate, header.CustomerID, header.WarehouseID||null, header.Remarks||null,
              subTotal, Number(header.DiscountAmt||0), taxAmt, netTotal,
              header.PaymentType || 'Credit',
              header.SettlementAccountCA ? Number(header.SettlementAccountCA) : null,
              Number(header.CashAmount || 0),
              header.DueDate || null,
              header.VehicleNo || null,
              header.DriverName || null,
              sihid
            );
          db.prepare('DELETE FROM Sales_Invoice_Lines WHERE SIHID=?').run(sihid);
        } else {
          const next = (db.prepare('SELECT COALESCE(MAX(SIHID),0)+1 AS n FROM Sales_Invoice_Headers').get()).n;
          sihid = next;
          db.prepare('INSERT INTO Sales_Invoice_Headers (SIHID,InvoiceNo,InvoiceDate,CustomerID,WarehouseID,Status,SubTotal,DiscountAmt,TaxAmt,NetTotal,Remarks,PaymentType,SettlementAccountCA,CashAmount,DueDate,VehicleNo,DriverName) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
            .run(
              sihid, header.InvoiceNo, header.InvoiceDate, header.CustomerID, header.WarehouseID||null, 'Draft',
              subTotal, Number(header.DiscountAmt||0), taxAmt, netTotal, header.Remarks||null,
              header.PaymentType || 'Credit',
              header.SettlementAccountCA ? Number(header.SettlementAccountCA) : null,
              Number(header.CashAmount || 0),
              header.DueDate || null,
              header.VehicleNo || null,
              header.DriverName || null
            );
        }
        const hasPKU = getCols(db, 'Sales_Invoice_Lines').includes('PackUnitID');
        lines.forEach(l => {
          const lineTotal = billableQty(l) * (Number(l.UnitPrice)||0) * (1 - (Number(l.DiscountPct)||0)/100);
          const packUnitId = l.PackUnitID ? Number(l.PackUnitID) : null;
          if (hasPKU) {
            db.prepare('INSERT INTO Sales_Invoice_Lines (SIHID,ItemID,WarehouseID,Quantity,UOM,UnitPrice,DiscountPct,TaxPct,LineTotal,PackUnitID,Narration) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
              .run(sihid, l.ItemID, l.WarehouseID||header.WarehouseID||null, Number(l.Quantity), l.UOM||'KG', Number(l.UnitPrice||0), Number(l.DiscountPct||0), Number(l.TaxPct||0), lineTotal, packUnitId, l.Narration||null);
          } else {
            db.prepare('INSERT INTO Sales_Invoice_Lines (SIHID,ItemID,WarehouseID,Quantity,UOM,UnitPrice,DiscountPct,TaxPct,LineTotal,Narration) VALUES (?,?,?,?,?,?,?,?,?,?)')
              .run(sihid, l.ItemID, l.WarehouseID||header.WarehouseID||null, Number(l.Quantity), l.UOM||'KG', Number(l.UnitPrice||0), Number(l.DiscountPct||0), Number(l.TaxPct||0), lineTotal, l.Narration||null);
          }
        });
      })();
      db.close();
      broadcastChange(dp);
      return { success: true, SIHID: sihid };
    } catch(e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('postSalesInvoice', (_e, { dbPath, SIHID }) => {
    try {
      const dp = dbPath || getCurrentDbPath();
      const db = new Database(dp, { fileMustExist: true });
      db.pragma('journal_mode = WAL');
      let trNo = null, cogsVoucherRef = null;
      db.transaction(() => {
        const header = db.prepare('SELECT * FROM Sales_Invoice_Headers WHERE SIHID=?').get(SIHID);
        if (!header) throw new Error(`Sales invoice #${SIHID} not found.`);
        if (header.Status === 'Posted')    throw new Error('Invoice already posted.');
        if (header.Status === 'Cancelled') throw new Error('Cannot post a cancelled invoice.');
        const lines = db.prepare('SELECT * FROM Sales_Invoice_Lines WHERE SIHID=?').all(SIHID);
        if (!lines.length) throw new Error('Invoice has no lines.');

        const customer = getTables(db).has('Customers')
          ? db.prepare('SELECT * FROM Customers WHERE CustomerID=?').get(header.CustomerID) : null;
        const customerAccountCA = (customer && customer.LinkedAccountCA)
          || getMapping(db, 'CUSTOMER_RECEIVABLE');
        const salesAccountCA = getMapping(db, 'SALES');
        const cogsAccountCA  = getMapping(db, 'COGS');
        const fgAccountCA    = getMapping(db, 'FINISHED_GOODS_INVENTORY');

        let totalCOGS = 0;
        for (const line of lines) {
          const whId = line.WarehouseID || header.WarehouseID || null;

          // Compute weighted average cost as of this invoice date (before this movement)
          const avgCost = getWeightedAvgCost(db, line.ItemID, whId, header.InvoiceDate);
          const currentStock = getItemStock(db, line.ItemID, whId, header.InvoiceDate);

          // Don't block posting if stock is zero/negative — just COGS at 0
          const effectiveAvgCost = currentStock > 0 ? avgCost : 0;
          const lineCOGS = effectiveAvgCost * Number(line.Quantity);
          totalCOGS += lineCOGS;

          const movId = insertStockMovement(db, {
            date: header.InvoiceDate, itemId: line.ItemID, warehouseId: whId,
            movType: 'OUT', qty: Number(line.Quantity), rate: effectiveAvgCost,
            refNo: header.InvoiceNo,
            narration: `Sales Invoice ${header.InvoiceNo} – ${customer?.CustomerName || ''}`,
            sourceType: 'SALES_INVOICE', sourceId: SIHID,
          });
          db.prepare('UPDATE Sales_Invoice_Lines SET COGS=?,StockMovID=? WHERE SILID=?')
            .run(lineCOGS, movId, line.SILID);

          // Update Inventory_Balances cache
          if (getTables(db).has('Inventory_Balances')) {
            const ib = db.prepare('SELECT * FROM Inventory_Balances WHERE ItemID=? AND (WarehouseID=? OR (WarehouseID IS NULL AND ? IS NULL))')
              .get(line.ItemID, whId, whId);
            if (ib) {
              const newQty = Number(ib.QtyBalance) - Number(line.Quantity);
              const newVal = Number(ib.ValueBalance) - lineCOGS;
              const newAvg = newQty > 0 ? newVal / newQty : 0;
              db.prepare('UPDATE Inventory_Balances SET QtyBalance=?,ValueBalance=?,AvgCost=?,UpdatedAt=datetime(\'now\') WHERE ItemID=? AND (WarehouseID=? OR (WarehouseID IS NULL AND ? IS NULL))')
                .run(newQty, Math.max(0, newVal), Math.max(0, newAvg), line.ItemID, whId, whId);
            }
          }
        }

        // Revenue voucher: Dr Customer A/R, Cr Sales
        if (customerAccountCA && salesAccountCA) {
          trNo = postDoubleEntry(db, {
            date: header.InvoiceDate, vtype: 402,
            remarks: `Sales Invoice ${header.InvoiceNo}`,
            drAccountId: customerAccountCA, crAccountId: salesAccountCA,
            amount: header.NetTotal,
            narration: `Sales Invoice ${header.InvoiceNo} – ${customer?.CustomerName || ''}`,
          });
        }

        // Bardana / packaging usage: tracking bag count + unit cost as packaging inventory movements
        if (trNo) {
          for (const line of lines) {
            if (!line.PackUnitID) continue;
            const packUnit = db.prepare('SELECT PackUnitID, ItemID, WeightKg, CostPerUnit FROM Item_Packaging_Units WHERE PackUnitID=? AND Active=1').get(line.PackUnitID);
            if (!packUnit || Number(packUnit.WeightKg || 0) <= 0) continue;
            const bagsQty = Number(line.Quantity || 0) / Number(packUnit.WeightKg || 1);
            if (bagsQty <= 0) continue;

            const whId = line.WarehouseID || header.WarehouseID || null;
            insertPackagingTransaction(db, {
              date: header.InvoiceDate,
              itemId: line.ItemID,
              packUnitId: line.PackUnitID,
              warehouseId: whId,
              movType: 'OUT',
              qty: bagsQty,
              rate: Number(packUnit.CostPerUnit || 0),
              refNo: header.InvoiceNo,
              narration: `Bardana issued on Sales Invoice ${header.InvoiceNo}`,
              sourceType: 'SALES_INVOICE',
              sourceId: SIHID,
              voucherRef: trNo,
            });
          }
        }

        // COGS voucher: Dr COGS A/C, Cr Finished Goods Inventory
        if (cogsAccountCA && fgAccountCA && totalCOGS > 0.01) {
          cogsVoucherRef = postDoubleEntry(db, {
            date: header.InvoiceDate, vtype: 201,
            remarks: `COGS – Sales Invoice ${header.InvoiceNo}`,
            drAccountId: cogsAccountCA, crAccountId: fgAccountCA,
            amount: Math.round(totalCOGS * 100) / 100,
            narration: `COGS for Sales Invoice ${header.InvoiceNo}`,
          });
        }

        db.prepare('UPDATE Sales_Invoice_Headers SET Status=?,PostedAt=?,VoucherRef=?,COGSVoucherRef=? WHERE SIHID=?')
          .run('Posted', new Date().toISOString(), trNo, cogsVoucherRef, SIHID);
        auditLog(db, 'Sales_Invoice_Headers', SIHID, 'POST', { Status: 'Draft' }, { Status: 'Posted' });
      })();
      db.close();
      broadcastChange(dp);
      return { success: true, VoucherRef: trNo, COGSVoucherRef: cogsVoucherRef };
    } catch(e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('cancelSalesInvoice', (_e, { dbPath, SIHID }) => {
    try {
      const dp = dbPath || getCurrentDbPath();
      const db = new Database(dp, { fileMustExist: true });
      db.pragma('journal_mode = WAL');
      db.transaction(() => {
        const header = db.prepare('SELECT * FROM Sales_Invoice_Headers WHERE SIHID=?').get(SIHID);
        if (!header) throw new Error('Invoice not found.');
        if (header.Status === 'Cancelled') throw new Error('Already cancelled.');
        const lines = db.prepare('SELECT * FROM Sales_Invoice_Lines WHERE SIHID=?').all(SIHID);
        for (const line of lines) {
          if (line.StockMovID) {
            insertStockMovement(db, {
              date: new Date().toISOString().slice(0,10), itemId: line.ItemID,
              warehouseId: line.WarehouseID, movType: 'IN',
              qty: line.Quantity, rate: line.COGS > 0 ? line.COGS / line.Quantity : 0,
              refNo: `REV-${header.InvoiceNo}`, narration: `Reversal of Sales Invoice ${header.InvoiceNo}`,
              sourceType: 'SALES_INVOICE_CANCEL', sourceId: SIHID,
            });
          }
          if (line.PackUnitID) {
            const packUnit = db.prepare('SELECT PackUnitID, ItemID, WeightKg, CostPerUnit FROM Item_Packaging_Units WHERE PackUnitID=? AND Active=1').get(line.PackUnitID);
            if (packUnit && Number(packUnit.WeightKg || 0) > 0) {
              const bagsQty = Number(line.Quantity || 0) / Number(packUnit.WeightKg || 1);
              if (bagsQty > 0) {
                insertPackagingTransaction(db, {
                  date: new Date().toISOString().slice(0,10),
                  itemId: line.ItemID,
                  packUnitId: line.PackUnitID,
                  warehouseId: line.WarehouseID || header.WarehouseID || null,
                  movType: 'IN',
                  qty: bagsQty,
                  rate: Number(packUnit.CostPerUnit || 0),
                  refNo: `REV-${header.InvoiceNo}`,
                  narration: `Reversal of Bardana usage on Sales Invoice ${header.InvoiceNo}`,
                  sourceType: 'SALES_INVOICE_CANCEL',
                  sourceId: SIHID,
                  voucherRef: header.VoucherRef || null,
                });
              }
            }
          }
        }
        if (header.VoucherRef) {
          const customerAccountCA = getMapping(db, 'CUSTOMER_RECEIVABLE');
          const salesAccountCA    = getMapping(db, 'SALES');
          if (customerAccountCA && salesAccountCA) {
            postDoubleEntry(db, {
              date: new Date().toISOString().slice(0,10), vtype: 201,
              remarks: `Reversal of Sales Invoice ${header.InvoiceNo}`,
              drAccountId: salesAccountCA, crAccountId: customerAccountCA,
              amount: header.NetTotal, narration: `Reversal of Sales Invoice ${header.InvoiceNo}`,
            });
          }
        }
        db.prepare('UPDATE Sales_Invoice_Headers SET Status=? WHERE SIHID=?').run('Cancelled', SIHID);
        auditLog(db, 'Sales_Invoice_Headers', SIHID, 'CANCEL', { Status: header.Status }, { Status: 'Cancelled' });
      })();
      db.close();
      broadcastChange(dp);
      return { success: true };
    } catch(e) { return { success: false, error: e.message }; }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // RECIPES
  // ─────────────────────────────────────────────────────────────────────────
  ipcMain.handle('getRecipes', (_e, { dbPath } = {}) => {
    try {
      const db = openDb(dbPath, false);
      if (!getTables(db).has('Recipes')) { db.close(); return { success: true, data: [] }; }
      const recipes = db.prepare('SELECT * FROM Recipes WHERE Active=1 ORDER BY RecipeName').all();
      for (const r of recipes) {
        r.inputs  = db.prepare('SELECT RI.*, I.ItemName, I.UOM FROM Recipe_Inputs RI LEFT JOIN Mill_Items I ON I.ItemID=RI.ItemID WHERE RI.RecipeID=?').all(r.RecipeID);
        r.outputs = db.prepare('SELECT RO.*, I.ItemName, I.UOM FROM Recipe_Outputs RO LEFT JOIN Mill_Items I ON I.ItemID=RO.ItemID WHERE RO.RecipeID=?').all(r.RecipeID);
      }
      db.close();
      return { success: true, data: recipes };
    } catch(e) { return { success: false, error: e.message, data: [] }; }
  });

  ipcMain.handle('saveRecipe', (_e, { dbPath, recipe }) => {
    try {
      const dp = dbPath || getCurrentDbPath();
      const db = new Database(dp, { fileMustExist: true });
      db.pragma('journal_mode = WAL');
      let rid = recipe.RecipeID;
      db.transaction(() => {
        if (rid) {
          db.prepare('UPDATE Recipes SET RecipeName=?,RecipeNameUr=?,Description=?,Active=? WHERE RecipeID=?')
            .run(recipe.RecipeName, recipe.RecipeNameUr||null, recipe.Description||null, recipe.Active!==false?1:0, rid);
          db.prepare('DELETE FROM Recipe_Inputs WHERE RecipeID=?').run(rid);
          db.prepare('DELETE FROM Recipe_Outputs WHERE RecipeID=?').run(rid);
        } else {
          const next = (db.prepare('SELECT COALESCE(MAX(RecipeID),0)+1 AS n FROM Recipes').get()).n;
          rid = next;
          db.prepare('INSERT INTO Recipes (RecipeID,RecipeName,RecipeNameUr,Description,Active) VALUES (?,?,?,?,1)')
            .run(rid, recipe.RecipeName, recipe.RecipeNameUr||null, recipe.Description||null);
        }
        (recipe.inputs||[]).forEach(i => db.prepare('INSERT INTO Recipe_Inputs (RecipeID,ItemID,ExpectedQtyPct,UOM) VALUES (?,?,?,?)').run(rid, i.ItemID, Number(i.ExpectedQtyPct||100), i.UOM||'KG'));
        (recipe.outputs||[]).forEach(o => db.prepare('INSERT INTO Recipe_Outputs (RecipeID,ItemID,ExpectedPct,CostAllocPct,CostMethod,IsLoss,UOM) VALUES (?,?,?,?,?,?,?)').run(rid, o.ItemID, Number(o.ExpectedPct||0), Number(o.CostAllocPct||0), o.CostMethod||'weight', o.IsLoss?1:0, o.UOM||'KG'));
      })();
      db.close();
      broadcastChange(dp);
      return { success: true, RecipeID: rid };
    } catch(e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('deleteRecipe', (_e, { dbPath, RecipeID }) => {
    try {
      const dp = dbPath || getCurrentDbPath();
      const db = new Database(dp, { fileMustExist: true });
      db.pragma('journal_mode = WAL');
      db.prepare('DELETE FROM Recipe_Inputs WHERE RecipeID=?').run(RecipeID);
      db.prepare('DELETE FROM Recipe_Outputs WHERE RecipeID=?').run(RecipeID);
      db.prepare('DELETE FROM Recipes WHERE RecipeID=?').run(RecipeID);
      db.close();
      broadcastChange(dp);
      return { success: true };
    } catch(e) { return { success: false, error: e.message }; }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PRODUCTION BATCHES (Full ERP)
  // ─────────────────────────────────────────────────────────────────────────
  ipcMain.handle('getProductionBatches', (_e, { dbPath, startDate, endDate, status } = {}) => {
    try {
      const db = openDb(dbPath, false);
      if (!getTables(db).has('Production_Batches')) { db.close(); return { success: true, data: [] }; }
      const where = ['1=1'], params = [];
      if (startDate) { where.push('B.BatchDate >= ?'); params.push(startDate); }
      if (endDate)   { where.push('B.BatchDate <= ?'); params.push(endDate); }
      if (status)    { where.push('B.Status = ?'); params.push(status); }
      const batches = db.prepare(`SELECT B.*, R.RecipeName, I.ItemName AS InputItemName FROM Production_Batches B LEFT JOIN Recipes R ON R.RecipeID=B.RecipeID LEFT JOIN Mill_Items I ON I.ItemID=B.InputItemID WHERE ${where.join(' AND ')} ORDER BY B.BatchDate DESC, B.BatchID DESC`).all(...params);
      for (const b of batches) {
        b.lines = db.prepare('SELECT L.*, I.ItemName, I.UOM FROM Production_Lines L LEFT JOIN Mill_Items I ON I.ItemID=L.ItemID WHERE L.BatchID=?').all(b.BatchID);
      }
      db.close();
      return { success: true, data: batches };
    } catch(e) { return { success: false, error: e.message, data: [] }; }
  });

  ipcMain.handle('saveProductionBatch', (_e, { dbPath, batch }) => {
    try {
      const dp = dbPath || getCurrentDbPath();
      const db = new Database(dp, { fileMustExist: true });
      db.pragma('journal_mode = WAL');
      let bid = batch.BatchID;
      db.transaction(() => {
        if (bid) {
          const old = db.prepare('SELECT Status FROM Production_Batches WHERE BatchID=?').get(bid);
          if (old && old.Status === 'Posted') throw new Error('Cannot edit a posted production batch.');
          db.prepare('UPDATE Production_Batches SET BatchDate=?,BatchNo=?,RecipeID=?,InputItemID=?,InputQty=?,WarehouseID=?,CostingMethod=?,Narration=? WHERE BatchID=?')
            .run(batch.BatchDate, batch.BatchNo, batch.RecipeID||null, batch.InputItemID||null, Number(batch.InputQty||0), batch.WarehouseID||null, batch.CostingMethod||'weight', batch.Narration||null, bid);
          db.prepare('DELETE FROM Production_Lines WHERE BatchID=?').run(bid);
        } else {
          const next = (db.prepare('SELECT COALESCE(MAX(BatchID),0)+1 AS n FROM Production_Batches').get()).n;
          bid = next;
          if (!batch.BatchNo) batch.BatchNo = `P-${String(bid).padStart(5,'0')}`;
          db.prepare('INSERT INTO Production_Batches (BatchID,BatchDate,BatchNo,RecipeID,InputItemID,InputQty,WarehouseID,CostingMethod,Status,Narration) VALUES (?,?,?,?,?,?,?,?,?,?)')
            .run(bid, batch.BatchDate, batch.BatchNo, batch.RecipeID||null, batch.InputItemID||null, Number(batch.InputQty||0), batch.WarehouseID||null, batch.CostingMethod||'weight', 'Draft', batch.Narration||null);
        }
        (batch.lines||[]).forEach(l => {
          const hasPKU = getCols(db, 'Production_Lines').includes('PackUnitID');
          if (hasPKU) {
            db.prepare('INSERT INTO Production_Lines (BatchID,ItemID,Quantity,Rate,LineType,IsLoss,PackUnitID) VALUES (?,?,?,?,?,?,?)')
              .run(bid, l.ItemID, Number(l.Quantity||0), Number(l.Rate||0), l.LineType||'OUTPUT', l.IsLoss?1:0, l.PackUnitID||null);
          } else {
            db.prepare('INSERT INTO Production_Lines (BatchID,ItemID,Quantity,Rate,LineType,IsLoss) VALUES (?,?,?,?,?,?)')
              .run(bid, l.ItemID, Number(l.Quantity||0), Number(l.Rate||0), l.LineType||'OUTPUT', l.IsLoss?1:0);
          }
        });
      })();
      db.close();
      broadcastChange(dp);
      return { success: true, BatchID: bid };
    } catch(e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('postProductionBatch', (_e, { dbPath, BatchID }) => {
    try {
      const dp = dbPath || getCurrentDbPath();
      const db = new Database(dp, { fileMustExist: true });
      db.pragma('journal_mode = WAL');
      let voucherRef = null;
      db.transaction(() => {
        const batch = db.prepare('SELECT * FROM Production_Batches WHERE BatchID=?').get(BatchID);
        if (!batch) throw new Error('Production batch not found.');
        if (batch.Status === 'Posted') throw new Error('Batch already posted.');

        const lines = db.prepare('SELECT * FROM Production_Lines WHERE BatchID=?').all(BatchID);

        // ── STEP 1: Identify input items ──────────────────────────────────
        // Primary input from batch header (backward compat); extend with Recipe_Inputs
        const inputConsumed = []; // { itemId, warehouseId, qty, avgCost, totalCost }

        // Always process the header-level InputItemID if present
        if (batch.InputItemID && Number(batch.InputQty) > 0) {
          const avgCost = getWeightedAvgCost(db, batch.InputItemID, batch.WarehouseID, null);
          inputConsumed.push({
            itemId: batch.InputItemID, warehouseId: batch.WarehouseID,
            qty: Number(batch.InputQty), avgCost, totalCost: avgCost * Number(batch.InputQty),
          });
        }

        // Also pull additional input lines of LineType='INPUT'
        const inputLines = lines.filter(l => l.LineType === 'INPUT');
        for (const il of inputLines) {
          const wh = il.WarehouseID || batch.WarehouseID;
          const avgCost = getWeightedAvgCost(db, il.ItemID, wh, null);
          const qty = Number(il.Quantity || 0);
          if (qty > 0) {
            inputConsumed.push({
              itemId: il.ItemID, warehouseId: wh,
              qty, avgCost, totalCost: avgCost * qty,
            });
          }
        }

        if (inputConsumed.length === 0) throw new Error('No input material defined for this batch.');

        // ── STEP 2: Deduct raw material stock for every input ─────────────
        const totalInputCost = inputConsumed.reduce((s, ic) => s + ic.totalCost, 0);

        for (const ic of inputConsumed) {
          const currentStock = getItemStock(db, ic.itemId, ic.warehouseId, null);
          if (currentStock < ic.qty) {
            // Warning — still allow posting but record it
            console.warn(`Insufficient stock for item ${ic.itemId}: need ${ic.qty}, have ${currentStock}`);
          }
          insertStockMovement(db, {
            date: batch.BatchDate, itemId: ic.itemId,
            warehouseId: ic.warehouseId, movType: 'OUT',
            qty: ic.qty, rate: ic.avgCost,
            refNo: batch.BatchNo, narration: `Prod Batch ${batch.BatchNo} – Input`,
            sourceType: 'PRODUCTION_BATCH', sourceId: BatchID,
          });
          // Update Inventory_Balances
          if (getTables(db).has('Inventory_Balances')) {
            const ib = db.prepare('SELECT * FROM Inventory_Balances WHERE ItemID=? AND (WarehouseID=? OR (WarehouseID IS NULL AND ? IS NULL))')
              .get(ic.itemId, ic.warehouseId, ic.warehouseId);
            if (ib) {
              const newQty = Number(ib.QtyBalance) - ic.qty;
              const newVal = Number(ib.ValueBalance) - ic.totalCost;
              const newAvg = newQty > 0 ? newVal / newQty : 0;
              db.prepare('UPDATE Inventory_Balances SET QtyBalance=?,ValueBalance=?,AvgCost=?,UpdatedAt=datetime(\'now\') WHERE ItemID=? AND (WarehouseID=? OR (WarehouseID IS NULL AND ? IS NULL))')
                .run(newQty, Math.max(0, newVal), Math.max(0, newAvg), ic.itemId, ic.warehouseId, ic.warehouseId);
            }
          }
        }

        // ── STEP 3: Process output lines ──────────────────────────────────
        // OutputLines: LineType='OUTPUT' with IsLoss=0 → finished goods (cost-bearing)
        // LossLines:   IsLoss=1 → waste/bhusa (zero cost)
        // GainLines:   LineType='GAIN' → unexpected extra output (e.g. excess atta)
        const outputLines = lines.filter(l => (l.LineType === 'OUTPUT' || l.LineType === 'GAIN') && !l.IsLoss);
        const lossLines   = lines.filter(l => l.IsLoss || l.LineType === 'LOSS');

        // Cost allocation: by weight proportion among non-loss outputs
        const costingMethod = batch.CostingMethod || 'weight';

        // For weight-based: allocate proportional to output qty
        // For value-based:  allocate by user-set CostAllocPct from Recipe_Outputs
        let totalOutputQty = outputLines.reduce((s,l) => s + Number(l.Quantity||0), 0);
        if (totalOutputQty <= 0) throw new Error('No output quantities recorded.');

        for (const line of outputLines) {
          const lineQty = Number(line.Quantity || 0);
          if (lineQty <= 0) continue;

          let allocCost = 0;
          if (costingMethod === 'weight') {
            // Proportional to output weight
            allocCost = (lineQty / totalOutputQty) * totalInputCost;
          } else if (costingMethod === 'pct' && line.CostAllocPct > 0) {
            // User-defined % from Recipe_Outputs
            allocCost = (Number(line.CostAllocPct||0) / 100) * totalInputCost;
          } else {
            // Default weight-based
            allocCost = (lineQty / totalOutputQty) * totalInputCost;
          }

          const costPerUnit = lineQty > 0 ? allocCost / lineQty : 0;

          // Stock IN for finished/by-product
          insertStockMovement(db, {
            date: batch.BatchDate, itemId: line.ItemID,
            warehouseId: line.WarehouseID || batch.WarehouseID, movType: 'IN',
            qty: lineQty, rate: costPerUnit,
            refNo: batch.BatchNo,
            narration: `Prod Batch ${batch.BatchNo} – ${line.IsLoss ? 'Waste' : 'Output'}`,
            sourceType: 'PRODUCTION_BATCH', sourceId: BatchID,
          });

          db.prepare('UPDATE Production_Lines SET AllocatedCost=?,CostPerUnit=? WHERE LineID=?')
            .run(allocCost, costPerUnit, line.LineID);

          // Update Inventory_Balances
          if (getTables(db).has('Inventory_Balances')) {
            const wh = line.WarehouseID || batch.WarehouseID;
            const ib = db.prepare('SELECT * FROM Inventory_Balances WHERE ItemID=? AND (WarehouseID=? OR (WarehouseID IS NULL AND ? IS NULL))')
              .get(line.ItemID, wh, wh);
            if (ib) {
              const newQty = Number(ib.QtyBalance) + lineQty;
              const newVal = Number(ib.ValueBalance) + allocCost;
              const newAvg = newQty > 0 ? newVal / newQty : 0;
              db.prepare('UPDATE Inventory_Balances SET QtyBalance=?,ValueBalance=?,AvgCost=?,UpdatedAt=datetime(\'now\') WHERE ItemID=? AND (WarehouseID=? OR (WarehouseID IS NULL AND ? IS NULL))')
                .run(newQty, newVal, newAvg, line.ItemID, wh, wh);
            } else {
              db.prepare('INSERT OR IGNORE INTO Inventory_Balances (ItemID,WarehouseID,QtyBalance,ValueBalance,AvgCost) VALUES (?,?,?,?,?)')
                .run(line.ItemID, wh, lineQty, allocCost, costPerUnit);
            }
          }
        }

        // Loss/waste lines go into stock at zero cost (bhusa, farshi etc.)
        for (const line of lossLines) {
          const lineQty = Number(line.Quantity || 0);
          if (lineQty <= 0) continue;
          insertStockMovement(db, {
            date: batch.BatchDate, itemId: line.ItemID,
            warehouseId: line.WarehouseID || batch.WarehouseID, movType: 'IN',
            qty: lineQty, rate: 0,
            refNo: batch.BatchNo, narration: `Prod Batch ${batch.BatchNo} – Waste/Loss`,
            sourceType: 'PRODUCTION_BATCH', sourceId: BatchID,
          });
          db.prepare('UPDATE Production_Lines SET AllocatedCost=0,CostPerUnit=0 WHERE LineID=?').run(line.LineID);
        }

        // ── STEP 4: Accounting entries ────────────────────────────────────
        // Pattern for flour mill:
        //   Dr Raw Material WIP / Cr Raw Material Inventory   (raw material consumed)
        //   Dr Finished Goods Inventory / Cr WIP              (finished goods produced)
        const wipCA   = getMapping(db, 'PRODUCTION_WIP');
        const rawCA   = getMapping(db, 'RAW_MATERIAL_INVENTORY');
        const fgCA    = getMapping(db, 'FINISHED_GOODS_INVENTORY');

        if (rawCA && wipCA && totalInputCost > 0.01) {
          postDoubleEntry(db, {
            date: batch.BatchDate, vtype: 201,
            remarks: `Prod Input – ${batch.BatchNo}`,
            drAccountId: wipCA, crAccountId: rawCA,
            amount: Math.round(totalInputCost * 100) / 100,
            narration: `Production ${batch.BatchNo}: Raw Material Consumed`,
          });
        }

        const totalOutputCost = outputLines.reduce((s,l) => s + (Number(l.AllocatedCost)||0), 0);
        // Use totalInputCost for FG entry (same amount as consumption)
        if (fgCA && wipCA && totalInputCost > 0.01) {
          voucherRef = postDoubleEntry(db, {
            date: batch.BatchDate, vtype: 201,
            remarks: `Prod Output – ${batch.BatchNo}`,
            drAccountId: fgCA, crAccountId: wipCA,
            amount: Math.round(totalInputCost * 100) / 100,
            narration: `Production ${batch.BatchNo}: Finished Goods Produced`,
          });
        }

        // ── STEP 5: Update batch header ───────────────────────────────────
        const primaryInput = inputConsumed[0];
        db.prepare('UPDATE Production_Batches SET Status=?,PostedAt=?,InputCostPerUnit=?,TotalInputCost=?,VoucherRef=? WHERE BatchID=?')
          .run('Posted', new Date().toISOString(), primaryInput ? primaryInput.avgCost : 0, totalInputCost, voucherRef, BatchID);
        auditLog(db, 'Production_Batches', BatchID, 'POST', { Status: 'Draft' }, { Status: 'Posted', TotalInputCost: totalInputCost });
      })();
      db.close();
      broadcastChange(dp);
      return { success: true, VoucherRef: voucherRef };
    } catch(e) { return { success: false, error: e.message }; }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // STOCK TRANSFER
  // ─────────────────────────────────────────────────────────────────────────
  ipcMain.handle('saveStockTransfer', (_e, { dbPath, transfer }) => {
    try {
      const dp = dbPath || getCurrentDbPath();
      const db = new Database(dp, { fileMustExist: true });
      db.pragma('journal_mode = WAL');
      db.transaction(() => {
        const refNo = transfer.RefNo || `TRF-${Date.now()}`;
        for (const line of (transfer.lines||[])) {
          // OUT from source warehouse
          insertStockMovement(db, {
            date: transfer.TransferDate, itemId: line.ItemID,
            warehouseId: transfer.FromWarehouseID, movType: 'OUT',
            qty: Number(line.Quantity||0), rate: getWeightedAvgCost(db, line.ItemID, transfer.FromWarehouseID, null),
            refNo, narration: `Transfer to ${transfer.ToWarehouseID} – ${refNo}`,
            sourceType: 'STOCK_TRANSFER', sourceId: null,
          });
          // IN to destination warehouse (same cost)
          const avgCost = getWeightedAvgCost(db, line.ItemID, transfer.FromWarehouseID, null);
          insertStockMovement(db, {
            date: transfer.TransferDate, itemId: line.ItemID,
            warehouseId: transfer.ToWarehouseID, movType: 'IN',
            qty: Number(line.Quantity||0), rate: avgCost,
            refNo, narration: `Transfer from ${transfer.FromWarehouseID} – ${refNo}`,
            sourceType: 'STOCK_TRANSFER', sourceId: null,
          });
        }
        auditLog(db, 'Stock_Movements', null, 'TRANSFER', null, transfer);
      })();
      db.close();
      broadcastChange(dp);
      return { success: true };
    } catch(e) { return { success: false, error: e.message }; }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // STOCK ADJUSTMENT
  // ─────────────────────────────────────────────────────────────────────────
  ipcMain.handle('saveStockAdjustment', (_e, { dbPath, adjustment }) => {
    try {
      const dp = dbPath || getCurrentDbPath();
      const db = new Database(dp, { fileMustExist: true });
      db.pragma('journal_mode = WAL');
      db.transaction(() => {
        const refNo = adjustment.RefNo || `ADJ-${Date.now()}`;
        const current = getItemStock(db, adjustment.ItemID, adjustment.WarehouseID, null);
        const diff = Number(adjustment.PhysicalQty||0) - current;
        if (Math.abs(diff) < 0.001) { db.close(); return; }
        const movType = diff > 0 ? 'IN' : 'OUT';
        const avgCost = getWeightedAvgCost(db, adjustment.ItemID, adjustment.WarehouseID, null);
        insertStockMovement(db, {
          date: adjustment.AdjustmentDate, itemId: adjustment.ItemID,
          warehouseId: adjustment.WarehouseID, movType,
          qty: Math.abs(diff), rate: avgCost,
          refNo, narration: adjustment.Narration || `Stock Adjustment ${refNo}`,
          sourceType: 'STOCK_ADJUSTMENT',
        });
        // Accounting: gain/loss
        const gainLossCA = diff > 0 ? getMapping(db, 'STOCK_GAIN') : getMapping(db, 'STOCK_LOSS');
        const invCA = getMapping(db, 'FINISHED_GOODS_INVENTORY') || getMapping(db, 'RAW_MATERIAL_INVENTORY');
        const adjAmt = Math.abs(diff) * (avgCost || adjustment.Rate || 0);
        if (gainLossCA && invCA && adjAmt > 0) {
          postDoubleEntry(db, {
            date: adjustment.AdjustmentDate, vtype: 201,
            remarks: adjustment.Narration || `Stock Adjustment ${refNo}`,
            drAccountId: diff > 0 ? invCA : gainLossCA,
            crAccountId: diff > 0 ? gainLossCA : invCA,
            amount: Math.round(adjAmt * 100) / 100,
            narration: adjustment.Narration || `Stock Adjustment ${refNo}`,
          });
        }
      })();
      db.close();
      broadcastChange(dp);
      return { success: true };
    } catch(e) { return { success: false, error: e.message }; }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ACCOUNT MAPPINGS
  // ─────────────────────────────────────────────────────────────────────────
  ipcMain.handle('getAccountMappings', (_e, { dbPath } = {}) => {
    try {
      const db = openDb(dbPath, false);
      if (!getTables(db).has('Account_Mappings')) { db.close(); return { success: true, data: [] }; }
      const data = db.prepare('SELECT * FROM Account_Mappings ORDER BY Purpose').all();
      db.close();
      return { success: true, data };
    } catch(e) { return { success: false, error: e.message, data: [] }; }
  });

  ipcMain.handle('saveAccountMapping', (_e, { dbPath, purpose, accountCA }) => {
    try {
      const dp = dbPath || getCurrentDbPath();
      const db = new Database(dp, { fileMustExist: true });
      db.pragma('journal_mode = WAL');
      db.prepare('UPDATE Account_Mappings SET AccountCA=?,UpdatedAt=datetime(\'now\') WHERE Purpose=?').run(accountCA||null, purpose);
      db.close();
      broadcastChange(dp);
      return { success: true };
    } catch(e) { return { success: false, error: e.message }; }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // COST CENTERS
  // ─────────────────────────────────────────────────────────────────────────
  ipcMain.handle('getCostCenters', (_e, { dbPath } = {}) => {
    try {
      const db = openDb(dbPath, false);
      if (!getTables(db).has('Cost_Centers')) { db.close(); return { success: true, data: [] }; }
      const data = db.prepare('SELECT * FROM Cost_Centers WHERE Active=1 ORDER BY CCName').all();
      db.close();
      return { success: true, data };
    } catch(e) { return { success: false, error: e.message, data: [] }; }
  });

  ipcMain.handle('saveCostCenter', (_e, { dbPath, cc }) => {
    try {
      const dp = dbPath || getCurrentDbPath();
      const db = new Database(dp, { fileMustExist: true });
      db.pragma('journal_mode = WAL');
      if (cc.CCID) {
        db.prepare('UPDATE Cost_Centers SET CCCode=?,CCName=?,CCNameUr=?,Active=? WHERE CCID=?').run(cc.CCCode||null, cc.CCName, cc.CCNameUr||null, cc.Active!==false?1:0, cc.CCID);
      } else {
        const next = (db.prepare('SELECT COALESCE(MAX(CCID),0)+1 AS n FROM Cost_Centers').get()).n;
        cc.CCID = next;
        db.prepare('INSERT INTO Cost_Centers (CCID,CCCode,CCName,CCNameUr,Active) VALUES (?,?,?,?,1)').run(next, cc.CCCode||null, cc.CCName, cc.CCNameUr||null);
      }
      db.close();
      broadcastChange(dp);
      return { success: true, CCID: cc.CCID };
    } catch(e) { return { success: false, error: e.message }; }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // FISCAL YEARS
  // ─────────────────────────────────────────────────────────────────────────
  ipcMain.handle('getFiscalYears', (_e, { dbPath } = {}) => {
    try {
      const db = openDb(dbPath, false);
      if (!getTables(db).has('Fiscal_Years')) { db.close(); return { success: true, data: [] }; }
      const data = db.prepare('SELECT * FROM Fiscal_Years ORDER BY StartDate DESC').all();
      db.close();
      return { success: true, data };
    } catch(e) { return { success: false, error: e.message, data: [] }; }
  });

  ipcMain.handle('saveFiscalYear', (_e, { dbPath, fy }) => {
    try {
      const dp = dbPath || getCurrentDbPath();
      const db = new Database(dp, { fileMustExist: true });
      db.pragma('journal_mode = WAL');
      if (fy.FYearID) {
        db.prepare('UPDATE Fiscal_Years SET FYearName=?,StartDate=?,EndDate=?,Status=? WHERE FYearID=?').run(fy.FYearName, fy.StartDate, fy.EndDate, fy.Status||'Open', fy.FYearID);
      } else {
        const next = (db.prepare('SELECT COALESCE(MAX(FYearID),0)+1 AS n FROM Fiscal_Years').get()).n;
        fy.FYearID = next;
        db.prepare('INSERT INTO Fiscal_Years (FYearID,FYearName,StartDate,EndDate,Status) VALUES (?,?,?,?,?)').run(next, fy.FYearName, fy.StartDate, fy.EndDate, fy.Status||'Open');
      }
      db.close();
      broadcastChange(dp);
      return { success: true, FYearID: fy.FYearID };
    } catch(e) { return { success: false, error: e.message }; }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TAX RATES
  // ─────────────────────────────────────────────────────────────────────────
  ipcMain.handle('getTaxRates', (_e, { dbPath } = {}) => {
    try {
      const db = openDb(dbPath, false);
      if (!getTables(db).has('Tax_Rates')) { db.close(); return { success: true, data: [] }; }
      const data = db.prepare('SELECT * FROM Tax_Rates WHERE Active=1 ORDER BY TaxName').all();
      db.close();
      return { success: true, data };
    } catch(e) { return { success: false, error: e.message, data: [] }; }
  });

  ipcMain.handle('saveTaxRate', (_e, { dbPath, tax }) => {
    try {
      const dp = dbPath || getCurrentDbPath();
      const db = new Database(dp, { fileMustExist: true });
      db.pragma('journal_mode = WAL');
      if (tax.TaxID) {
        db.prepare('UPDATE Tax_Rates SET TaxName=?,TaxType=?,Rate=?,EffectiveDate=?,OnPurchase=?,OnSales=?,TaxAccountCA=?,Active=? WHERE TaxID=?').run(tax.TaxName, tax.TaxType||'Percentage', Number(tax.Rate||0), tax.EffectiveDate||null, tax.OnPurchase?1:0, tax.OnSales?1:0, tax.TaxAccountCA||null, tax.Active!==false?1:0, tax.TaxID);
      } else {
        const next = (db.prepare('SELECT COALESCE(MAX(TaxID),0)+1 AS n FROM Tax_Rates').get()).n;
        tax.TaxID = next;
        db.prepare('INSERT INTO Tax_Rates (TaxID,TaxName,TaxType,Rate,EffectiveDate,OnPurchase,OnSales,TaxAccountCA,Active) VALUES (?,?,?,?,?,?,?,?,1)').run(next, tax.TaxName, tax.TaxType||'Percentage', Number(tax.Rate||0), tax.EffectiveDate||null, tax.OnPurchase?1:0, tax.OnSales?1:0, tax.TaxAccountCA||null);
      }
      db.close();
      broadcastChange(dp);
      return { success: true, TaxID: tax.TaxID };
    } catch(e) { return { success: false, error: e.message }; }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // REPORTS: Customer Outstanding
  // ─────────────────────────────────────────────────────────────────────────
  ipcMain.handle('getCustomerOutstanding', (_e, { dbPath, asOfDate } = {}) => {
    try {
      const db = openDb(dbPath, false);
      const tables = getTables(db);
      if (!tables.has('Customers') && !tables.has('Sales_Invoice_Headers')) { db.close(); return { success: true, data: [] }; }

      const customers = tables.has('Customers') ? db.prepare('SELECT * FROM Customers WHERE (Active IS NULL OR Active=1) ORDER BY CustomerName').all() : [];
      const rows = customers.map(c => {
        const balanceInfo = computePartyBalance(db, 'Customer', c.CustomerID, asOfDate);
        return {
          CustomerID: c.CustomerID,
          CustomerName: c.CustomerName,
          Contact: c.Contact,
          OpeningBalance: Number(c.OpeningBalance || 0),
          totalInvoiced: balanceInfo.totalInvoiced,
          totalPaid: balanceInfo.totalPaid,
          balance: balanceInfo.balance,
          glBased: balanceInfo.glBased,
        };
      }).filter(r => Math.abs(Number(r.balance || 0)) > 0.001 || r.CustomerID != null);

      db.close();
      return { success: true, data: rows };
    } catch(e) { return { success: false, error: e.message, data: [] }; }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // REPORTS: Supplier Outstanding
  // ─────────────────────────────────────────────────────────────────────────
  ipcMain.handle('getSupplierOutstanding', (_e, { dbPath, asOfDate } = {}) => {
    try {
      const db = openDb(dbPath, false);
      const tables = getTables(db);
      if (!tables.has('Suppliers') && !tables.has('Purchase_Invoice_Headers')) { db.close(); return { success: true, data: [] }; }

      const suppliers = tables.has('Suppliers') ? db.prepare('SELECT * FROM Suppliers WHERE (Active IS NULL OR Active=1) ORDER BY SupplierName').all() : [];
      const rows = suppliers.map(s => {
        const balanceInfo = computePartyBalance(db, 'Supplier', s.SupplierID, asOfDate);
        return {
          SupplierID: s.SupplierID,
          SupplierName: s.SupplierName,
          Contact: s.Contact,
          OpeningBalance: Number(s.OpeningBalance || 0),
          totalInvoiced: balanceInfo.totalInvoiced,
          totalPaid: balanceInfo.totalPaid,
          balance: balanceInfo.balance,
          glBased: balanceInfo.glBased,
        };
      }).filter(r => Math.abs(Number(r.balance || 0)) > 0.001 || r.SupplierID != null);

      db.close();
      return { success: true, data: rows };
    } catch(e) { return { success: false, error: e.message, data: [] }; }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // REPORTS: Stock Valuation
  // ─────────────────────────────────────────────────────────────────────────
  ipcMain.handle('getStockValuation', (_e, { dbPath, asOfDate, warehouseId } = {}) => {
    try {
      const db = openDb(dbPath, false);
      if (!getTables(db).has('Stock_Movements') || !getTables(db).has('Mill_Items')) {
        db.close(); return { success: true, data: [] };
      }
      const items = db.prepare('SELECT ItemID, ItemName, ItemNameUr, UOM, Category FROM Mill_Items WHERE Active=1 ORDER BY ItemName').all();
      const warehouses = getTables(db).has('Warehouses') ? db.prepare('SELECT * FROM Warehouses').all() : [];
      const result = [];
      for (const item of items) {
        const whs = warehouseId ? warehouses.filter(w => w.WarehouseID === Number(warehouseId)) : warehouses.length ? warehouses : [{ WarehouseID: null }];
        for (const wh of whs) {
          const qty = getItemStock(db, item.ItemID, wh.WarehouseID, asOfDate);
          if (Math.abs(qty) < 0.001) continue;
          const avgCost = getWeightedAvgCost(db, item.ItemID, wh.WarehouseID, asOfDate);
          result.push({
            ItemID: item.ItemID, ItemName: item.ItemName, ItemNameUr: item.ItemNameUr,
            Category: item.Category, UOM: item.UOM,
            WarehouseID: wh.WarehouseID, WarehouseName: wh.WarehouseName || 'Default',
            Quantity: qty, AvgCost: avgCost, TotalValue: qty * avgCost,
          });
        }
      }
      db.close();
      return { success: true, data: result, totalValue: result.reduce((s,r) => s + r.TotalValue, 0) };
    } catch(e) { return { success: false, error: e.message, data: [] }; }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // REPORTS: Product Profitability
  // ─────────────────────────────────────────────────────────────────────────
  ipcMain.handle('getProductProfitability', (_e, { dbPath, startDate, endDate } = {}) => {
    try {
      const db = openDb(dbPath, false);
      if (!getTables(db).has('Sales_Invoice_Lines')) { db.close(); return { success: true, data: [] }; }
      const where = ["H.Status='Posted'"], params = [];
      if (startDate) { where.push('H.InvoiceDate >= ?'); params.push(startDate); }
      if (endDate)   { where.push('H.InvoiceDate <= ?'); params.push(endDate); }
      const rows = db.prepare(`
        SELECT L.ItemID, I.ItemName, I.UOM,
          SUM(L.Quantity) AS TotalQty,
          SUM(L.LineTotal) AS TotalSales,
          SUM(L.COGS) AS TotalCOGS
        FROM Sales_Invoice_Lines L
        JOIN Sales_Invoice_Headers H ON H.SIHID=L.SIHID
        LEFT JOIN Mill_Items I ON I.ItemID=L.ItemID
        WHERE ${where.join(' AND ')}
        GROUP BY L.ItemID, I.ItemName, I.UOM
        ORDER BY TotalSales DESC
      `).all(...params);
      db.close();
      return { success: true, data: rows.map(r => ({
        ...r,
        GrossProfit: r.TotalSales - r.TotalCOGS,
        GrossMargin: r.TotalSales > 0 ? ((r.TotalSales - r.TotalCOGS) / r.TotalSales * 100) : 0,
        AvgCostPerUnit: r.TotalQty > 0 ? r.TotalCOGS / r.TotalQty : 0,
        AvgSalePerUnit: r.TotalQty > 0 ? r.TotalSales / r.TotalQty : 0,
      })) };
    } catch(e) { return { success: false, error: e.message, data: [] }; }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // REPORTS: Production Report / Wheat Recovery
  // ─────────────────────────────────────────────────────────────────────────
  ipcMain.handle('getProductionReport', (_e, { dbPath, startDate, endDate } = {}) => {
    try {
      const db = openDb(dbPath, false);
      if (!getTables(db).has('Production_Batches')) { db.close(); return { success: true, data: [] }; }
      const where = ["B.Status='Posted'"], params = [];
      if (startDate) { where.push('B.BatchDate >= ?'); params.push(startDate); }
      if (endDate)   { where.push('B.BatchDate <= ?'); params.push(endDate); }
      const batches = db.prepare(`SELECT B.*, I.ItemName AS InputItemName, I.UOM FROM Production_Batches B LEFT JOIN Mill_Items I ON I.ItemID=B.InputItemID WHERE ${where.join(' AND ')} ORDER BY B.BatchDate DESC`).all(...params);
      for (const b of batches) {
        b.lines = db.prepare('SELECT L.*, I.ItemName, I.UOM FROM Production_Lines L LEFT JOIN Mill_Items I ON I.ItemID=L.ItemID WHERE L.BatchID=?').all(b.BatchID);
        const totalOutput = b.lines.filter(l => !l.IsLoss).reduce((s,l) => s + Number(l.Quantity||0), 0);
        const loss = b.lines.filter(l => l.IsLoss).reduce((s,l) => s + Number(l.Quantity||0), 0);
        b.TotalOutput = totalOutput;
        b.Loss = loss;
        b.RecoveryPct = b.InputQty > 0 ? (totalOutput / b.InputQty * 100) : 0;
        b.LossPct     = b.InputQty > 0 ? (loss / b.InputQty * 100) : 0;
        b.CostPerKg   = totalOutput > 0 ? b.TotalInputCost / totalOutput : 0;
      }
      db.close();
      return { success: true, data: batches };
    } catch(e) { return { success: false, error: e.message, data: [] }; }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // REPORTS: ERP Dashboard KPIs
  // ─────────────────────────────────────────────────────────────────────────
  ipcMain.handle('getErpDashboard', (_e, { dbPath } = {}) => {
    try {
      const db = openDb(dbPath, false);
      const today = new Date().toISOString().slice(0,10);
      const result = {};

      // Today's sales
      if (getTables(db).has('Sales_Invoice_Headers')) {
        const s = db.prepare("SELECT COALESCE(SUM(NetTotal),0) AS v FROM Sales_Invoice_Headers WHERE InvoiceDate=? AND Status='Posted'").get(today);
        result.todaySales = s.v;
      }

      // Today's purchases
      if (getTables(db).has('Purchase_Invoice_Headers')) {
        const p = db.prepare("SELECT COALESCE(SUM(NetTotal),0) AS v FROM Purchase_Invoice_Headers WHERE InvoiceDate=? AND Status='Posted'").get(today);
        result.todayPurchases = p.v;
      }

      // Today's production batches count
      if (getTables(db).has('Production_Batches')) {
        const pb = db.prepare("SELECT COUNT(*) AS v FROM Production_Batches WHERE BatchDate=? AND Status='Posted'").get(today);
        result.todayProduction = pb.v;
      }

      // Stock balances per item
      if (getTables(db).has('Stock_Movements') && getTables(db).has('Mill_Items')) {
        const items = db.prepare("SELECT ItemID, ItemName FROM Mill_Items WHERE Active=1").all();
        result.stockBalances = {};
        for (const item of items) {
          const qty = getItemStock(db, item.ItemID, null, null);
          result.stockBalances[item.ItemName] = qty;
        }
      }

      // Total receivables (from sales invoices)
      if (getTables(db).has('Sales_Invoice_Headers')) {
        const r = db.prepare("SELECT COALESCE(SUM(NetTotal),0) AS v FROM Sales_Invoice_Headers WHERE Status='Posted'").get();
        result.totalReceivables = r.v;
      }

      // Total payables (from purchase invoices)
      if (getTables(db).has('Purchase_Invoice_Headers')) {
        const p = db.prepare("SELECT COALESCE(SUM(NetTotal),0) AS v FROM Purchase_Invoice_Headers WHERE Status='Posted'").get();
        result.totalPayables = p.v;
      }

      db.close();
      return { success: true, data: result };
    } catch(e) { return { success: false, error: e.message, data: {} }; }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // AUDIT LOG
  // ─────────────────────────────────────────────────────────────────────────
  ipcMain.handle('getAuditLog', (_e, { dbPath, tableName, limit } = {}) => {
    try {
      const db = openDb(dbPath, false);
      if (!getTables(db).has('Audit_Log')) { db.close(); return { success: true, data: [] }; }
      const where = tableName ? 'WHERE TableName=?' : '';
      const params = tableName ? [tableName] : [];
      const data = db.prepare(`SELECT * FROM Audit_Log ${where} ORDER BY LogID DESC LIMIT ?`).all(...params, limit||200);
      db.close();
      return { success: true, data };
    } catch(e) { return { success: false, error: e.message, data: [] }; }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // NEXT INVOICE NUMBER helper
  // ─────────────────────────────────────────────────────────────────────────
  ipcMain.handle('getNextInvoiceNo', (_e, { dbPath, type } = {}) => {
    try {
      const db = openDb(dbPath, false);
      let prefix, table, col;
      if (type === 'SALES')    { prefix = 'SI'; table = 'Sales_Invoice_Headers';    col = 'InvoiceNo'; }
      else                     { prefix = 'PI'; table = 'Purchase_Invoice_Headers'; col = 'InvoiceNo'; }
      if (!getTables(db).has(table)) { db.close(); return { success: true, nextNo: `${prefix}-00001` }; }
      const last = db.prepare(`SELECT ${col} FROM "${table}" WHERE ${col} LIKE ? ORDER BY ${col} DESC LIMIT 1`).get(`${prefix}-%`);
      db.close();
      if (!last) return { success: true, nextNo: `${prefix}-00001` };
      const num = parseInt((last[col] || '').replace(`${prefix}-`, '')) || 0;
      return { success: true, nextNo: `${prefix}-${String(num + 1).padStart(5, '0')}` };
    } catch(e) { return { success: false, error: e.message, nextNo: '' }; }
  });
}

module.exports = { runErpMigrations, registerErpHandlers };


// ─────────────────────────────────────────────────────────────────────────────
// PACKAGING UNITS – flour mills sell same product in different bag sizes
// e.g. Atta: 10 KG bag, 20 KG bag, 25 KG bag; Maida: 50 KG bag etc.
// ─────────────────────────────────────────────────────────────────────────────
function runPackagingMigrations(db) {
  const tables = getTables(db);
  if (!tables.has('Item_Packaging_Units')) {
    db.prepare(`CREATE TABLE Item_Packaging_Units (
      PackUnitID   INTEGER PRIMARY KEY,
      ItemID       INTEGER NOT NULL,
      UnitLabel    TEXT NOT NULL,
      WeightKg     REAL NOT NULL DEFAULT 1,
      BagType      TEXT,
      CostPerUnit  REAL DEFAULT 0,
      SKU          TEXT,
      IsDefault    INTEGER DEFAULT 0,
      Active       INTEGER DEFAULT 1,
      CreatedAt    TEXT DEFAULT (datetime('now'))
    )`).run();
    db.prepare('CREATE INDEX IF NOT EXISTS idx_pku_item ON Item_Packaging_Units(ItemID)').run();
  } else {
    ['UnitLabel','WeightKg','BagType','CostPerUnit','SKU','IsDefault','Active','CreatedAt']
      .forEach(c => addColIfMissing(db, 'Item_Packaging_Units', c,
        c === 'WeightKg' ? 'REAL NOT NULL DEFAULT 1' :
        c === 'CostPerUnit' ? 'REAL DEFAULT 0' :
        ['IsDefault','Active'].includes(c) ? 'INTEGER DEFAULT 0' : 'TEXT'));
  }

  // Invoice lines need PackUnitID reference
  if (tables.has('Sales_Invoice_Lines'))    addColIfMissing(db, 'Sales_Invoice_Lines',    'PackUnitID', 'INTEGER');
  if (tables.has('Purchase_Invoice_Lines')) addColIfMissing(db, 'Purchase_Invoice_Lines', 'PackUnitID', 'INTEGER');

  // Packaging transactions – upgrade older databases with bardana/carton linkage columns
  if (tables.has('Packaging_Transactions')) {
    ['PackUnitID','WarehouseID','CostPerUnit','SourceType','SourceID','VoucherRef']
      .forEach(c => addColIfMissing(db, 'Packaging_Transactions', c,
        c === 'PackUnitID' || c === 'WarehouseID' || c === 'SourceID' || c === 'VoucherRef' ? 'INTEGER' :
        c === 'CostPerUnit' ? 'REAL DEFAULT 0' : 'TEXT'));
  }

  // Customer and Supplier payments journal table
  if (!tables.has('Party_Payments')) {
    db.prepare(`CREATE TABLE Party_Payments (
      PaymentID    INTEGER PRIMARY KEY,
      PaymentDate  TEXT NOT NULL,
      PaymentRef   TEXT,
      PartyType    TEXT NOT NULL CHECK(PartyType IN ('Customer','Supplier')),
      PartyID      INTEGER NOT NULL,
      Amount       REAL NOT NULL DEFAULT 0,
      PaymentMode  TEXT DEFAULT 'Cash',
      BankAccount  TEXT,
      Narration    TEXT,
      VoucherRef   INTEGER,
      Status       TEXT DEFAULT 'Posted',
      CreatedAt    TEXT DEFAULT (datetime('now'))
    )`).run();
    db.prepare('CREATE INDEX IF NOT EXISTS idx_pp_party ON Party_Payments(PartyType, PartyID)').run();
    db.prepare('CREATE INDEX IF NOT EXISTS idx_pp_date ON Party_Payments(PaymentDate)').run();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ADDITIONAL ERP HANDLERS – Packaging Units, Party Payments, Statements
// ─────────────────────────────────────────────────────────────────────────────
function registerErpHandlers2(ipcMain, getCurrentDbPath, broadcastChange) {

  function openDb(dbPath, writeable) {
    const dp = dbPath || getCurrentDbPath();
    if (!dp) throw new Error('No database open. Select a database first.');
    return writeable
      ? new Database(dp, { fileMustExist: true })
      : new Database(dp, { readonly: true, fileMustExist: true });
  }

  // ── ERP migration extended for packaging ──────────────────────────────────
  ipcMain.handle('erpMigrateSchemaEx', (_e, dbPath) => {
    try {
      const db = openDb(dbPath, true);
      db.pragma('journal_mode = WAL');
      db.transaction(() => {
        runErpMigrations(db);
        runPackagingMigrations(db);
      })();
      db.close();
      return { success: true };
    } catch(e) { return { success: false, error: e.message }; }
  });

  // ── PACKAGING UNITS CRUD ─────────────────────────────────────────────────
  ipcMain.handle('getPackagingUnits', (_e, { dbPath, itemId } = {}) => {
    try {
      const db = openDb(dbPath, false);
      if (!getTables(db).has('Item_Packaging_Units')) { db.close(); return { success: true, data: [] }; }
      const where = ['P.Active=1'];
      const params = [];
      if (itemId) { where.push('P.ItemID=?'); params.push(Number(itemId)); }
      const data = db.prepare(`
        SELECT P.*, I.ItemName, I.UOM AS BaseUOM
        FROM Item_Packaging_Units P
        LEFT JOIN Mill_Items I ON I.ItemID = P.ItemID
        WHERE ${where.join(' AND ')} ORDER BY P.ItemID, P.WeightKg
      `).all(...params);
      db.close();
      return { success: true, data };
    } catch(e) { return { success: false, error: e.message, data: [] }; }
  });

  ipcMain.handle('savePackagingUnit', (_e, { dbPath, unit }) => {
    try {
      const dp = dbPath || getCurrentDbPath();
      const db = new Database(dp, { fileMustExist: true });
      db.pragma('journal_mode = WAL');
      db.transaction(() => {
        runPackagingMigrations(db);
        if (unit.PackUnitID) {
          db.prepare('UPDATE Item_Packaging_Units SET ItemID=?,UnitLabel=?,WeightKg=?,BagType=?,CostPerUnit=?,SKU=?,IsDefault=?,Active=? WHERE PackUnitID=?')
            .run(Number(unit.ItemID), unit.UnitLabel, Number(unit.WeightKg||1), unit.BagType||null, Number(unit.CostPerUnit||0), unit.SKU||null, unit.IsDefault?1:0, unit.Active!==false?1:0, unit.PackUnitID);
          // If marking as default, clear other defaults for same item
          if (unit.IsDefault) db.prepare('UPDATE Item_Packaging_Units SET IsDefault=0 WHERE ItemID=? AND PackUnitID!=?').run(Number(unit.ItemID), unit.PackUnitID);
        } else {
          const next = (db.prepare('SELECT COALESCE(MAX(PackUnitID),0)+1 AS n FROM Item_Packaging_Units').get()).n;
          unit.PackUnitID = next;
          db.prepare('INSERT INTO Item_Packaging_Units (PackUnitID,ItemID,UnitLabel,WeightKg,BagType,CostPerUnit,SKU,IsDefault,Active) VALUES (?,?,?,?,?,?,?,?,1)')
            .run(next, Number(unit.ItemID), unit.UnitLabel, Number(unit.WeightKg||1), unit.BagType||null, Number(unit.CostPerUnit||0), unit.SKU||null, unit.IsDefault?1:0);
          if (unit.IsDefault) db.prepare('UPDATE Item_Packaging_Units SET IsDefault=0 WHERE ItemID=? AND PackUnitID!=?').run(Number(unit.ItemID), next);
        }
      })();
      db.close();
      broadcastChange(dp);
      return { success: true, PackUnitID: unit.PackUnitID };
    } catch(e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('deletePackagingUnit', (_e, { dbPath, PackUnitID }) => {
    try {
      const dp = dbPath || getCurrentDbPath();
      const db = new Database(dp, { fileMustExist: true });
      db.pragma('journal_mode = WAL');
      db.prepare('UPDATE Item_Packaging_Units SET Active=0 WHERE PackUnitID=?').run(PackUnitID);
      db.close();
      broadcastChange(dp);
      return { success: true };
    } catch(e) { return { success: false, error: e.message }; }
  });

  // ── PARTY PAYMENTS (Customer Receipts / Supplier Payments) ────────────────
  ipcMain.handle('getPartyPayments', (_e, { dbPath, partyType, partyId, startDate, endDate } = {}) => {
    try {
      const db = openDb(dbPath, false);
      if (!getTables(db).has('Party_Payments')) { db.close(); return { success: true, data: [] }; }
      const where = ['1=1'], params = [];
      if (partyType)  { where.push('P.PartyType=?');   params.push(partyType); }
      if (partyId)    { where.push('P.PartyID=?');     params.push(Number(partyId)); }
      if (startDate)  { where.push('P.PaymentDate>=?');params.push(startDate); }
      if (endDate)    { where.push('P.PaymentDate<=?');params.push(endDate); }
      const data = db.prepare(`
        SELECT P.*,
          CASE P.PartyType
            WHEN 'Customer' THEN C.CustomerName
            WHEN 'Supplier' THEN S.SupplierName
          END AS PartyName
        FROM Party_Payments P
        LEFT JOIN Customers C ON P.PartyType='Customer' AND C.CustomerID=P.PartyID
        LEFT JOIN Suppliers S ON P.PartyType='Supplier' AND S.SupplierID=P.PartyID
        WHERE ${where.join(' AND ')}
        ORDER BY P.PaymentDate DESC, P.PaymentID DESC
      `).all(...params);
      db.close();
      return { success: true, data };
    } catch(e) { return { success: false, error: e.message, data: [] }; }
  });

  ipcMain.handle('savePartyPayment', (_e, { dbPath, payment }) => {
    try {
      const dp = dbPath || getCurrentDbPath();
      const db = new Database(dp, { fileMustExist: true });
      db.pragma('journal_mode = WAL');
      let trNo = null;

      db.transaction(() => {
        const refNo = payment.PaymentRef ||
          `${payment.PartyType === 'Customer' ? 'RCV' : 'PMT'}-${Date.now()}`;

        const isCustomer = payment.PartyType === 'Customer';
        const party = isCustomer
          ? (getTables(db).has('Customers') ? db.prepare('SELECT * FROM Customers WHERE CustomerID=?').get(Number(payment.PartyID)) : null)
          : (getTables(db).has('Suppliers') ? db.prepare('SELECT * FROM Suppliers WHERE SupplierID=?').get(Number(payment.PartyID)) : null);

        const partyAccountCA = (party && party.LinkedAccountCA) ||
          getMapping(db, isCustomer ? 'CUSTOMER_RECEIVABLE' : 'SUPPLIER_PAYABLE');
        const cashBankCA = payment.PaymentMode === 'Bank'
          ? getMapping(db, 'BANK')
          : getMapping(db, 'CASH');

        const tables = getTables(db);
        const invTable = tables.has('Inv') ? 'Inv' : tables.has('Inv1') ? 'Inv1' : null;
        const tTable   = tables.has('T')   ? 'T'   : tables.has('T1')   ? 'T1'   : null;

        if (invTable && tTable && cashBankCA && partyAccountCA && Number(payment.Amount) > 0) {
          // Customer Receipt (VType 101): Dr Cash/Bank, Cr Customer A/R
          // Supplier Payment (VType 102): Dr Supplier A/P, Cr Cash/Bank
          const vtype  = isCustomer ? 101 : 102;
          const drAcct = isCustomer ? cashBankCA    : partyAccountCA;
          const crAcct = isCustomer ? partyAccountCA : cashBankCA;
          const narr   = payment.Narration || refNo;

          const tCols   = getCols(db, tTable);
          const hasVNo  = tCols.includes('V_No');
          const invCols = getCols(db, invTable);
          const hasNarr = invCols.includes('Narration');

          trNo = (db.prepare(`SELECT COALESCE(MAX(TR_No),0)+1 AS n FROM "${tTable}"`).get()).n;
          db.prepare(`INSERT INTO "${tTable}" (TR_No,TR_Date,V_Typ${hasVNo?',V_No':''},Remarks,AccountParty,ACParty2,Amont,P) VALUES (?,?,?${hasVNo?',?':''},?,?,?,?,0)`)
            .run(...(hasVNo
              ? [trNo, payment.PaymentDate, vtype, 0, narr, drAcct, crAcct, Number(payment.Amount)]
              : [trNo, payment.PaymentDate, vtype, narr, drAcct, crAcct, Number(payment.Amount)]));

          let sl = (db.prepare(`SELECT COALESCE(MAX(SL),0) AS m FROM "${invTable}"`).get().m || 0) + 1;
          // Debit leg
          db.prepare(`INSERT INTO "${invTable}" (TR_No,SL,VType,Account_Party,AC_Party2,Amount${hasNarr?',Narration':''}) VALUES (?,?,?,?,?,?${hasNarr?',?':''})`)
            .run(trNo, sl++, vtype, drAcct, crAcct, Number(payment.Amount), ...(hasNarr ? [narr] : []));
          // Credit leg
          db.prepare(`INSERT INTO "${invTable}" (TR_No,SL,VType,Account_Party,AC_Party2,Amount${hasNarr?',Narration':''}) VALUES (?,?,?,?,?,?${hasNarr?',?':''})`)
            .run(trNo, sl++, vtype, crAcct, drAcct, Number(payment.Amount), ...(hasNarr ? [narr] : []));
        }

        // Ensure Party_Payments table exists
        if (!getTables(db).has('Party_Payments')) {
          db.prepare(`CREATE TABLE IF NOT EXISTS Party_Payments (
            PaymentID    INTEGER PRIMARY KEY,
            PaymentDate  TEXT NOT NULL,
            PaymentRef   TEXT,
            PartyType    TEXT NOT NULL,
            PartyID      INTEGER NOT NULL,
            Amount       REAL NOT NULL DEFAULT 0,
            PaymentMode  TEXT DEFAULT 'Cash',
            BankAccount  TEXT,
            Narration    TEXT,
            VoucherRef   INTEGER,
            Status       TEXT DEFAULT 'Posted',
            CreatedAt    TEXT DEFAULT (datetime('now'))
          )`).run();
        }
        const next = (db.prepare('SELECT COALESCE(MAX(PaymentID),0)+1 AS n FROM Party_Payments').get()).n;
        payment.PaymentID = next;
        db.prepare('INSERT INTO Party_Payments (PaymentID,PaymentDate,PaymentRef,PartyType,PartyID,Amount,PaymentMode,BankAccount,Narration,VoucherRef,Status) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
          .run(next, payment.PaymentDate, payment.PaymentRef || `${isCustomer?'RCV':'PMT'}-${Date.now()}`,
            payment.PartyType, Number(payment.PartyID),
            Number(payment.Amount), payment.PaymentMode||'Cash',
            payment.BankAccount||null, payment.Narration||null, trNo, 'Posted');
        auditLog(db, 'Party_Payments', next, 'INSERT', null, { ...payment, VoucherRef: trNo });
      })();
      db.close();
      broadcastChange(dp);
      return { success: true, PaymentID: payment.PaymentID, VoucherRef: trNo };
    } catch(e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('deletePartyPayment', (_e, { dbPath, PaymentID }) => {
    try {
      const dp = dbPath || getCurrentDbPath();
      const db = new Database(dp, { fileMustExist: true });
      db.pragma('journal_mode = WAL');
      db.transaction(() => {
        const pmt = getTables(db).has('Party_Payments')
          ? db.prepare('SELECT * FROM Party_Payments WHERE PaymentID=?').get(PaymentID) : null;
        if (!pmt) throw new Error('Payment not found.');
        // Reverse the accounting voucher if it exists
        if (pmt.VoucherRef) {
          const tables = getTables(db);
          const invTable = tables.has('Inv') ? 'Inv' : tables.has('Inv1') ? 'Inv1' : null;
          const tTable   = tables.has('T')   ? 'T'   : tables.has('T1')   ? 'T1'   : null;
          if (invTable && tTable) {
            // Read the original voucher legs and reverse them
            const legs = db.prepare(`SELECT * FROM "${invTable}" WHERE TR_No=?`).all(pmt.VoucherRef);
            if (legs.length) {
              const isCustomer = pmt.PartyType === 'Customer';
              const vtype = isCustomer ? 101 : 102;
              const revTrNo = (db.prepare(`SELECT COALESCE(MAX(TR_No),0)+1 AS n FROM "${tTable}"`).get()).n;
              const tCols = getCols(db, tTable);
              const hasVNo = tCols.includes('V_No');
              const invCols= getCols(db, invTable);
              const hasNarr= invCols.includes('Narration');
              const narr = `Reversal of ${pmt.PaymentRef}`;
              db.prepare(`INSERT INTO "${tTable}" (TR_No,TR_Date,V_Typ${hasVNo?',V_No':''},Remarks,AccountParty,ACParty2,Amont,P) VALUES (?,?,?${hasVNo?',?':''},?,?,?,?,0)`)
                .run(...(hasVNo ? [revTrNo, new Date().toISOString().slice(0,10), vtype, 0, narr, 0, 0, Number(pmt.Amount)] : [revTrNo, new Date().toISOString().slice(0,10), vtype, narr, 0, 0, Number(pmt.Amount)]));
              let sl = (db.prepare(`SELECT COALESCE(MAX(SL),0) AS m FROM "${invTable}"`).get().m || 0) + 1;
              for (const leg of legs) {
                db.prepare(`INSERT INTO "${invTable}" (TR_No,SL,VType,Account_Party,AC_Party2,Amount${hasNarr?',Narration':''}) VALUES (?,?,?,?,?,?${hasNarr?',?':''})`)
                  .run(revTrNo, sl++, leg.VType, leg.AC_Party2, leg.Account_Party, leg.Amount, ...(hasNarr ? [narr] : []));
              }
            }
          }
        }
        db.prepare('DELETE FROM Party_Payments WHERE PaymentID=?').run(PaymentID);
      })();
      db.close();
      broadcastChange(dp);
      return { success: true };
    } catch(e) { return { success: false, error: e.message }; }
  });

  // ── CUSTOMER ACCOUNT STATEMENT ────────────────────────────────────────────
  // Returns all sales invoices + payments for a customer with running balance
  ipcMain.handle('getCustomerStatement', (_e, { dbPath, customerId, startDate, endDate } = {}) => {
    try {
      const db = openDb(dbPath, false);
      if (!customerId) { db.close(); return { success: false, error: 'customerId required' }; }

      const customer = getTables(db).has('Customers')
        ? db.prepare('SELECT * FROM Customers WHERE CustomerID=?').get(Number(customerId)) : null;
      if (!customer) { db.close(); return { success: false, error: 'Customer not found' }; }

      const txns = [];

      // Opening balance from sales invoices BEFORE startDate
      let openingBalance = Number(customer.OpeningBalance || 0); // customer opening
      if (startDate && getTables(db).has('Sales_Invoice_Headers')) {
        const obInv = db.prepare("SELECT COALESCE(SUM(NetTotal),0) AS v FROM Sales_Invoice_Headers WHERE CustomerID=? AND Status='Posted' AND InvoiceDate<?")
          .get(Number(customerId), startDate);
        openingBalance += Number(obInv.v || 0);
        // Subtract payments before startDate
        if (getTables(db).has('Party_Payments')) {
          const obPmt = db.prepare("SELECT COALESCE(SUM(Amount),0) AS v FROM Party_Payments WHERE PartyType='Customer' AND PartyID=? AND PaymentDate<?")
            .get(Number(customerId), startDate);
          openingBalance -= Number(obPmt.v || 0);
        }
        // Also check linked GL account for payments
        if (customer.LinkedAccountCA) {
          const { invTable, tTable } = _getDetectTxTables(db);
          if (invTable && tTable) {
            const acId = customer.LinkedAccountCA;
            const glRows = db.prepare(
              `SELECT I.VType, I.Account_Party, I.AC_Party2, I.Amount
               FROM "${invTable}" I LEFT JOIN "${tTable}" T ON I.TR_No=T.TR_No
               WHERE (I.Account_Party=? OR I.AC_Party2=?) AND (T.TR_Date IS NULL OR T.TR_Date<?)`
            ).all(acId, acId, startDate);
            // Payments/receipts in GL that decrease the balance
            for (const r of glRows) {
              // If account is the debit side → adds to receivable balance
              // If account is the credit side → reduces receivable balance
              // We compute net from the GL postings
            }
          }
        }
      }

      // Sales invoices in range
      if (getTables(db).has('Sales_Invoice_Headers')) {
        const where = ["H.CustomerID=?", "H.Status='Posted'"], params = [Number(customerId)];
        if (startDate) { where.push('H.InvoiceDate>=?'); params.push(startDate); }
        if (endDate)   { where.push('H.InvoiceDate<=?'); params.push(endDate); }
        const invs = db.prepare(`SELECT H.SIHID,H.InvoiceNo,H.InvoiceDate,H.NetTotal,H.Remarks FROM Sales_Invoice_Headers H WHERE ${where.join(' AND ')} ORDER BY H.InvoiceDate,H.SIHID`).all(...params);
        for (const inv of invs) {
          txns.push({
            txDate:    inv.InvoiceDate,
            txRef:     inv.InvoiceNo,
            txType:    'Sales Invoice',
            narration: inv.Remarks || `Invoice ${inv.InvoiceNo}`,
            debit:     Number(inv.NetTotal), // customer owes us (debit = receivable increases)
            credit:    0,
          });
        }
      }

      // Payments received from customer
      if (getTables(db).has('Party_Payments')) {
        const where2 = ["PartyType='Customer'","PartyID=?"], params2 = [Number(customerId)];
        if (startDate) { where2.push('PaymentDate>=?'); params2.push(startDate); }
        if (endDate)   { where2.push('PaymentDate<=?'); params2.push(endDate); }
        const pmts = db.prepare(`SELECT * FROM Party_Payments WHERE ${where2.join(' AND ')} ORDER BY PaymentDate,PaymentID`).all(...params2);
        for (const p of pmts) {
          txns.push({
            txDate:    p.PaymentDate,
            txRef:     p.PaymentRef,
            txType:    'Payment Received',
            narration: p.Narration || `Payment ${p.PaymentRef}`,
            debit:     0,
            credit:    Number(p.Amount), // payment reduces the balance (credit)
          });
        }
      }

      // Sort by date + ref
      txns.sort((a, b) => {
        if (a.txDate < b.txDate) return -1;
        if (a.txDate > b.txDate) return 1;
        return 0;
      });

      // Compute running balance
      let running = openingBalance;
      const transactions = txns.map(tx => {
        running += tx.debit - tx.credit;
        return { ...tx, balance: running };
      });

      db.close();
      return {
        success: true,
        data: {
          customer,
          openingBalance,
          transactions,
          closingBalance: running,
          totalInvoiced: transactions.filter(t => t.debit > 0).reduce((s,t) => s+t.debit, 0),
          totalPaid:     transactions.filter(t => t.credit > 0).reduce((s,t) => s+t.credit, 0),
        }
      };
    } catch(e) { return { success: false, error: e.message }; }
  });

  // helper: detect tx tables without importing from main.js
  function _getDetectTxTables(db) {
    const tables = getTables(db);
    return {
      invTable: tables.has('Inv') ? 'Inv' : tables.has('Inv1') ? 'Inv1' : null,
      tTable:   tables.has('T')   ? 'T'   : tables.has('T1')   ? 'T1'   : null,
    };
  }

  // ── SUPPLIER ACCOUNT STATEMENT ────────────────────────────────────────────
  ipcMain.handle('getSupplierStatement', (_e, { dbPath, supplierId, startDate, endDate } = {}) => {
    try {
      const db = openDb(dbPath, false);
      if (!supplierId) { db.close(); return { success: false, error: 'supplierId required' }; }

      const supplier = getTables(db).has('Suppliers')
        ? db.prepare('SELECT * FROM Suppliers WHERE SupplierID=?').get(Number(supplierId)) : null;
      if (!supplier) { db.close(); return { success: false, error: 'Supplier not found' }; }

      const txns = [];

      // Opening balance: purchase invoices before startDate minus payments before startDate
      let openingBalance = Number(supplier.OpeningBalance || 0);
      if (startDate && getTables(db).has('Purchase_Invoice_Headers')) {
        const obInv = db.prepare("SELECT COALESCE(SUM(NetTotal),0) AS v FROM Purchase_Invoice_Headers WHERE SupplierID=? AND Status='Posted' AND InvoiceDate<?")
          .get(Number(supplierId), startDate);
        openingBalance += Number(obInv.v || 0);
        if (getTables(db).has('Party_Payments')) {
          const obPmt = db.prepare("SELECT COALESCE(SUM(Amount),0) AS v FROM Party_Payments WHERE PartyType='Supplier' AND PartyID=? AND PaymentDate<?")
            .get(Number(supplierId), startDate);
          openingBalance -= Number(obPmt.v || 0);
        }
      }

      // Purchase invoices in range
      if (getTables(db).has('Purchase_Invoice_Headers')) {
        const where = ["H.SupplierID=?","H.Status='Posted'"], params = [Number(supplierId)];
        if (startDate) { where.push('H.InvoiceDate>=?'); params.push(startDate); }
        if (endDate)   { where.push('H.InvoiceDate<=?'); params.push(endDate); }
        const invs = db.prepare(`SELECT H.PIHID,H.InvoiceNo,H.InvoiceDate,H.NetTotal,H.Remarks FROM Purchase_Invoice_Headers H WHERE ${where.join(' AND ')} ORDER BY H.InvoiceDate,H.PIHID`).all(...params);
        for (const inv of invs) {
          txns.push({
            txDate:    inv.InvoiceDate,
            txRef:     inv.InvoiceNo,
            txType:    'Purchase Invoice',
            narration: inv.Remarks || `Invoice ${inv.InvoiceNo}`,
            debit:     0,
            credit:    Number(inv.NetTotal), // we owe supplier (credit = payable increases)
          });
        }
      }

      // Payments made to supplier
      if (getTables(db).has('Party_Payments')) {
        const where2 = ["PartyType='Supplier'","PartyID=?"], params2 = [Number(supplierId)];
        if (startDate) { where2.push('PaymentDate>=?'); params2.push(startDate); }
        if (endDate)   { where2.push('PaymentDate<=?'); params2.push(endDate); }
        const pmts = db.prepare(`SELECT * FROM Party_Payments WHERE ${where2.join(' AND ')} ORDER BY PaymentDate,PaymentID`).all(...params2);
        for (const p of pmts) {
          txns.push({
            txDate:    p.PaymentDate,
            txRef:     p.PaymentRef,
            txType:    'Payment Made',
            narration: p.Narration || `Payment ${p.PaymentRef}`,
            debit:     Number(p.Amount), // payment reduces payable (debit)
            credit:    0,
          });
        }
      }

      txns.sort((a, b) => (a.txDate < b.txDate ? -1 : a.txDate > b.txDate ? 1 : 0));

      let running = openingBalance;
      const transactions = txns.map(tx => {
        running += tx.credit - tx.debit; // payable: credit increases, debit decreases
        return { ...tx, balance: running };
      });

      db.close();
      return {
        success: true,
        data: {
          supplier,
          openingBalance,
          transactions,
          closingBalance: running,
          totalPurchased: transactions.filter(t => t.credit > 0).reduce((s,t) => s+t.credit, 0),
          totalPaid:      transactions.filter(t => t.debit > 0).reduce((s,t) => s+t.debit, 0),
        }
      };
    } catch(e) { return { success: false, error: e.message }; }
  });

  // ── IMPORT: Chart of Accounts + Voucher Types only (no amounts) ────────────
  // Reads from an already-imported SQLite (converted from accdb) and extracts
  // only the chart of accounts structure (tblAccHead, tblSubAcc, AC) and
  // voucher types (VT) WITHOUT any transaction amounts (T, Inv tables are skipped)
  ipcMain.handle('importChartOfAccountsOnly', (_e, { sourcePath, targetPath }) => {
    try {
      const dp = targetPath || getCurrentDbPath();
      if (!dp) throw new Error('No target database open.');
      if (!sourcePath) throw new Error('sourcePath is required.');

      const src = new Database(sourcePath, { readonly: true, fileMustExist: true });
      const tgt = new Database(dp, { fileMustExist: true });
      tgt.pragma('journal_mode = WAL');

      const srcTables = getTables(src);
      const tgtTables = getTables(tgt);

      const result = { imported: {}, skipped: [], warnings: [] };

      tgt.transaction(() => {
        // ── 1. tblAccHead ─────────────────────────────────────────────────
        if (srcTables.has('tblAccHead')) {
          const srcCols = getCols(src, 'tblAccHead');
          const idCol   = srcCols.includes('AccountID') ? 'AccountID' : srcCols.includes('SubAccH_ID') ? 'SubAccH_ID' : null;
          const nameCol = srcCols.includes('AccountHead') ? 'AccountHead' : srcCols.includes('SubAccHead') ? 'SubAccHead' : null;
          if (idCol && nameCol) {
            const rows = src.prepare(`SELECT ${idCol} AS id, ${nameCol} AS name FROM tblAccHead ORDER BY ${idCol}`).all();
            // Keep existing heads, only add missing ones
            let added = 0;
            for (const r of rows) {
              const id = Number(r.id);
              if (id < 1 || id > 5) continue; // only standard 5 heads
              try {
                tgt.prepare('INSERT OR IGNORE INTO tblAccHead (AccountID,AccountHead) VALUES (?,?)').run(id, r.name || `Head ${id}`);
                added++;
              } catch(_) {}
            }
            result.imported.tblAccHead = added;
          }
        }

        // ── 2. tblSubAcc ──────────────────────────────────────────────────
        if (srcTables.has('tblSubAcc') && tgtTables.has('tblSubAcc')) {
          const srcRows = src.prepare('SELECT * FROM tblSubAcc ORDER BY SubAccID').all();
          const srcCols = getCols(src, 'tblSubAcc');
          const hasU    = srcCols.some(c => /subaccountnameu/i.test(c));
          const uCol    = srcCols.find(c => /subaccountnameu/i.test(c));
          const tgtCols = getCols(tgt, 'tblSubAcc');
          const hasTgtU = tgtCols.some(c => /subaccountnameu/i.test(c));

          // Find max existing SubAccID to avoid collision
          const maxExisting = (tgt.prepare('SELECT COALESCE(MAX(SubAccID),0) AS m FROM tblSubAcc').get().m || 0);
          const idMap = new Map(); // src SubAccID → tgt SubAccID

          let added = 0;
          for (const r of srcRows) {
            const headId = Number(r.AccountID);
            if (headId < 1 || headId > 5) continue;
            const srcId = Number(r.SubAccID);
            // Check if a group with same name already exists
            const existing = tgt.prepare('SELECT SubAccID FROM tblSubAcc WHERE SubAccountNAme=? AND AccountID=? LIMIT 1').get(r.SubAccountNAme||'', headId);
            if (existing) {
              idMap.set(srcId, Number(existing.SubAccID));
              continue;
            }
            const newId = maxExisting + added + 1;
            idMap.set(srcId, newId);
            if (hasTgtU) {
              tgt.prepare('INSERT OR IGNORE INTO tblSubAcc (SubAccID,AccountID,SubAccountNAme,SubAccountNAmeU) VALUES (?,?,?,?)')
                .run(newId, headId, r.SubAccountNAme||'', (hasU && uCol ? r[uCol] : '') || '');
            } else {
              tgt.prepare('INSERT OR IGNORE INTO tblSubAcc (SubAccID,AccountID,SubAccountNAme) VALUES (?,?,?)')
                .run(newId, headId, r.SubAccountNAme||'');
            }
            added++;
          }
          result.imported.tblSubAcc = added;
          result._subAccIdMap = Object.fromEntries(idMap);
        }

        // ── 3. AC (Chart of Accounts) — NO amounts ────────────────────────
        if (srcTables.has('AC') && tgtTables.has('AC')) {
          const srcRows = src.prepare('SELECT * FROM AC ORDER BY CA').all();
          const srcCols = getCols(src, 'AC');
          const hasUAC  = srcCols.some(c => /uac_title/i.test(c));
          const uacCol  = srcCols.find(c => /uac_title/i.test(c));
          const hasSubId= srcCols.includes('SubAccID');
          const tgtCols = getCols(tgt, 'AC');
          const hasTgtUAC = tgtCols.some(c => /uac_title/i.test(c));
          const hasTgtRole= tgtCols.includes('Role');

          const maxCA = (tgt.prepare('SELECT COALESCE(MAX(CA),0) AS m FROM AC').get().m || 0);
          const idMap  = result._subAccIdMap ? new Map(Object.entries(result._subAccIdMap).map(([k,v]) => [Number(k),v])) : new Map();
          let added = 0;

          for (const r of srcRows) {
            const name = (r.AC_TITLE1 || '').trim().replace(/^'+|'+$/g,'').trim();
            if (!name) continue;
            // Skip if exact CA already exists
            const existingCA = tgt.prepare('SELECT CA FROM AC WHERE CA=? LIMIT 1').get(Number(r.CA));
            if (existingCA) continue;
            // Also skip if same name already exists
            const existingName = tgt.prepare('SELECT CA FROM AC WHERE AC_TITLE1=? LIMIT 1').get(name);
            if (existingName) continue;

            const newSubAccID = hasSubId ? (idMap.get(Number(r.SubAccID)) || Number(r.SubAccID) || 0) : 0;
            const cols = ['CA','SubAccID','AC_TITLE1'];
            const vals = [Number(r.CA), newSubAccID, name];
            if (hasTgtUAC) { cols.push('UAC_Title'); vals.push((hasUAC && uacCol ? r[uacCol] : '') || ''); }
            if (hasTgtRole && r.Role) { cols.push('Role'); vals.push(r.Role); }

            try {
              tgt.prepare(`INSERT INTO AC (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`)
                .run(...vals);
              added++;
            } catch(_) {}
          }
          result.imported.AC = added;
        }

        // ── 4. VT (Voucher Types) — NO transaction data ───────────────────
        if (srcTables.has('VT') && tgtTables.has('VT')) {
          const srcRows = src.prepare('SELECT * FROM VT ORDER BY VTYPE').all();
          const srcCols = getCols(src, 'VT');
          const tgtCols = getCols(tgt, 'VT');
          const hasUV   = srcCols.some(c => /uvtitle/i.test(c));
          const uvCol   = srcCols.find(c => /uvtitle/i.test(c));
          const hasTgtUV = tgtCols.some(c => /uvtitle/i.test(c));
          const hasLDr  = tgtCols.includes('LDr');
          const hasLCr  = tgtCols.includes('LCr');

          let added = 0;
          for (const r of srcRows) {
            const vtype = Number(r.VTYPE);
            if (!vtype) continue;
            const existing = tgt.prepare('SELECT VTYPE FROM VT WHERE VTYPE=?').get(vtype);
            if (existing) { result.skipped.push(`VT ${vtype}`); continue; }
            const cols = ['VTYPE','VTITLE'];
            const vals = [vtype, r.VTITLE || `V${vtype}`];
            if (hasTgtUV)  { cols.push('UVTITLE'); vals.push((hasUV && uvCol ? r[uvCol] : '') || ''); }
            if (hasLDr)    { cols.push('LDr');     vals.push(r.LDr != null ? Number(r.LDr) : null); }
            if (hasLCr)    { cols.push('LCr');     vals.push(r.LCr != null ? Number(r.LCr) : null); }
            try {
              tgt.prepare(`INSERT INTO VT (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`)
                .run(...vals);
              added++;
            } catch(_) {}
          }
          result.imported.VT = added;
        }

        // Also copy 5VT posting rules if they exist
        if (srcTables.has('5VT') && tgtTables.has('5VT')) {
          const srcRows = src.prepare('SELECT * FROM "5VT"').all();
          let added = 0;
          for (const r of srcRows) {
            const exists = tgt.prepare('SELECT VTYPE FROM "5VT" WHERE VTYPE=? AND DC=?').get(r.VTYPE, r.DC);
            if (!exists) {
              try { tgt.prepare('INSERT INTO "5VT" (VTYPE,DC,AC_DRCR) VALUES (?,?,?)').run(r.VTYPE, r.DC, r.AC_DRCR); added++; } catch(_) {}
            }
          }
          result.imported['5VT'] = added;
        }
      })();

      src.close();
      tgt.close();
      delete result._subAccIdMap;
      broadcastChange(dp);
      return { success: true, result };
    } catch(e) { return { success: false, error: e.message }; }
  });

  // ── STOCK LEDGER per item (detailed stock card) ────────────────────────────
  ipcMain.handle('getStockLedger', (_e, { dbPath, itemId, warehouseId, startDate, endDate } = {}) => {
    try {
      const db = openDb(dbPath, false);
      if (!getTables(db).has('Stock_Movements')) { db.close(); return { success: true, data: [] }; }

      // Opening stock before startDate
      let openingQty = 0, openingValue = 0;
      if (startDate && itemId) {
        const ob = db.prepare(`
          SELECT SUM(CASE WHEN MovementType='IN' OR MovementType='OPENING' THEN Quantity ELSE -Quantity END) AS qty,
                 SUM(CASE WHEN MovementType='IN' OR MovementType='OPENING' THEN Quantity*Rate ELSE -Quantity*Rate END) AS val
          FROM Stock_Movements
          WHERE ItemID=? ${warehouseId ? 'AND WarehouseID=?' : ''} AND MovementDate<?
        `).get(...[Number(itemId), ...(warehouseId ? [Number(warehouseId)] : []), startDate]);
        openingQty   = ob.qty || 0;
        openingValue = ob.val || 0;
      }

      const where = ['1=1'], params = [];
      if (itemId)     { where.push('S.ItemID=?');            params.push(Number(itemId)); }
      if (warehouseId){ where.push('S.WarehouseID=?');       params.push(Number(warehouseId)); }
      if (startDate)  { where.push('S.MovementDate>=?');     params.push(startDate); }
      if (endDate)    { where.push('S.MovementDate<=?');     params.push(endDate); }

      const rows = db.prepare(`
        SELECT S.*, I.ItemName, I.UOM, W.WarehouseName
        FROM Stock_Movements S
        LEFT JOIN Mill_Items I ON I.ItemID=S.ItemID
        LEFT JOIN Warehouses W ON W.WarehouseID=S.WarehouseID
        WHERE ${where.join(' AND ')}
        ORDER BY S.MovementDate, S.MovementID
      `).all(...params);

      let runningQty = openingQty, runningValue = openingValue;
      const movements = rows.map(r => {
        const isIn = (r.MovementType === 'IN' || r.MovementType === 'OPENING');
        const dir = isIn ? 1 : -1;
        runningQty   += dir * Number(r.Quantity||0);
        runningValue += dir * Number(r.Quantity||0) * Number(r.Rate||0);
        const avgCost = runningQty > 0 ? runningValue / runningQty : 0;
        return {
          ...r,
          inQty:  isIn ? Number(r.Quantity||0) : 0,
          outQty: isIn ? 0 : Number(r.Quantity||0),
          runningQty,
          runningValue,
          avgCost,
        };
      });

      db.close();
      return { success: true, data: { openingQty, openingValue, movements } };
    } catch(e) { return { success: false, error: e.message }; }
  });

  // ── COMPREHENSIVE STOCK REPORT ──────────────────────────────────────────────
  ipcMain.handle('getStockReport', (_e, { dbPath, asOfDate, warehouseId } = {}) => {
    try {
      const db = openDb(dbPath, false);
      if (!getTables(db).has('Stock_Movements') || !getTables(db).has('Mill_Items')) {
        db.close(); return { success: true, data: [] };
      }

      const items = db.prepare('SELECT * FROM Mill_Items WHERE Active=1 ORDER BY Category, ItemName').all();
      const warehouses = getTables(db).has('Warehouses') ? db.prepare('SELECT * FROM Warehouses').all() : [];
      const result = [];

      for (const item of items) {
        const whs = warehouseId
          ? warehouses.filter(w => w.WarehouseID === Number(warehouseId))
          : (warehouses.length ? warehouses : [{ WarehouseID: null, WarehouseName: 'Default' }]);

        for (const wh of whs) {
          const whereP = ['ItemID=?'];
          const params = [item.ItemID];
          if (wh.WarehouseID) { whereP.push('WarehouseID=?'); params.push(wh.WarehouseID); }
          if (asOfDate)       { whereP.push('MovementDate<=?'); params.push(asOfDate); }

          const rows = db.prepare(`SELECT MovementType, Quantity, Rate FROM Stock_Movements WHERE ${whereP.join(' AND ')}`).all(...params);
          let qty = 0, val = 0;
          for (const r of rows) {
            const isIn = (r.MovementType === 'IN' || r.MovementType === 'OPENING');
            qty += (isIn ? 1 : -1) * Number(r.Quantity||0);
            val += (isIn ? 1 : -1) * Number(r.Quantity||0) * Number(r.Rate||0);
          }
          if (Math.abs(qty) < 0.001) continue;

          const avgCost = qty > 0 ? val / qty : 0;
          result.push({
            ItemID: item.ItemID, ItemName: item.ItemName, ItemNameUr: item.ItemNameUr,
            Category: item.Category, UOM: item.UOM, ReorderLevel: item.ReorderLevel,
            WarehouseID: wh.WarehouseID, WarehouseName: wh.WarehouseName || 'Default',
            Qty: qty, AvgCost: avgCost, TotalValue: qty * avgCost,
            BelowReorder: qty <= (item.ReorderLevel || 0),
          });
        }
      }

      db.close();
      const totalValue = result.reduce((s,r) => s + r.TotalValue, 0);
      return { success: true, data: result, totalValue };
    } catch(e) { return { success: false, error: e.message, data: [] }; }
  });

  // ── COMPLETE P&L WITH COGS FROM ERP INVOICES ─────────────────────────────
  // A more accurate P&L that uses Sales_Invoice_Lines.COGS directly (ERP method)
  ipcMain.handle('getErpProfitLoss', (_e, { dbPath, startDate, endDate } = {}) => {
    try {
      const db = openDb(dbPath, false);
      const tables = getTables(db);

      // Revenue from posted sales invoices
      let totalRevenue = 0, totalCOGS = 0;
      const revenueByProduct = [];

      if (tables.has('Sales_Invoice_Lines') && tables.has('Sales_Invoice_Headers')) {
        const where = ["H.Status='Posted'"], params = [];
        if (startDate) { where.push('H.InvoiceDate>=?'); params.push(startDate); }
        if (endDate)   { where.push('H.InvoiceDate<=?'); params.push(endDate); }

        const rows = db.prepare(`
          SELECT L.ItemID, I.ItemName, I.UOM,
            SUM(L.Quantity) AS TotalQty,
            SUM(L.LineTotal) AS TotalSales,
            SUM(L.COGS) AS TotalCOGS
          FROM Sales_Invoice_Lines L
          JOIN Sales_Invoice_Headers H ON H.SIHID=L.SIHID
          LEFT JOIN Mill_Items I ON I.ItemID=L.ItemID
          WHERE ${where.join(' AND ')}
          GROUP BY L.ItemID, I.ItemName, I.UOM
          ORDER BY TotalSales DESC
        `).all(...params);

        for (const r of rows) {
          totalRevenue += Number(r.TotalSales||0);
          totalCOGS    += Number(r.TotalCOGS||0);
          revenueByProduct.push({
            ItemID: r.ItemID, ItemName: r.ItemName, UOM: r.UOM,
            TotalQty: r.TotalQty, TotalSales: r.TotalSales, TotalCOGS: r.TotalCOGS,
            GrossProfit: r.TotalSales - r.TotalCOGS,
            GrossMarginPct: r.TotalSales > 0 ? ((r.TotalSales - r.TotalCOGS) / r.TotalSales * 100) : 0,
          });
        }
      }

      // Purchase expenses (raw material, overhead) from purchase invoices
      let totalPurchases = 0;
      if (tables.has('Purchase_Invoice_Headers')) {
        const where = ["Status='Posted'"], params = [];
        if (startDate) { where.push('InvoiceDate>=?'); params.push(startDate); }
        if (endDate)   { where.push('InvoiceDate<=?'); params.push(endDate); }
        const p = db.prepare(`SELECT COALESCE(SUM(NetTotal),0) AS v FROM Purchase_Invoice_Headers WHERE ${where.join(' AND ')}`).get(...params);
        totalPurchases = Number(p.v || 0);
      }

      // Current inventory value
      let inventoryValue = 0;
      if (tables.has('Stock_Movements')) {
        const where2 = ['1=1'], params2 = [];
        if (endDate) { where2.push('MovementDate<=?'); params2.push(endDate); }
        const rows = db.prepare(`SELECT MovementType, Quantity, COALESCE(Rate,0) AS Rate FROM Stock_Movements WHERE ${where2.join(' AND ')}`).all(...params2);
        for (const r of rows) {
          inventoryValue += ((r.MovementType==='IN'||r.MovementType==='OPENING')?1:-1) * r.Quantity * r.Rate;
        }
        inventoryValue = Math.max(0, inventoryValue);
      }

      const grossProfit  = totalRevenue - totalCOGS;
      const netProfitLoss = grossProfit; // add operating expenses from GL if needed

      db.close();
      return {
        success: true,
        data: {
          totalRevenue, totalCOGS, totalPurchases,
          grossProfit, netProfitLoss,
          inventoryValue, revenueByProduct,
          startDate, endDate,
        }
      };
    } catch(e) { return { success: false, error: e.message }; }
  });

  // ── NEXT PAYMENT REF ──────────────────────────────────────────────────────
  ipcMain.handle('getNextPaymentRef', (_e, { dbPath, partyType } = {}) => {
    try {
      const db = openDb(dbPath, false);
      const prefix = partyType === 'Customer' ? 'RCV' : 'PMT';
      if (!getTables(db).has('Party_Payments')) { db.close(); return { success: true, nextRef: `${prefix}-00001` }; }
      const last = db.prepare(`SELECT PaymentRef FROM Party_Payments WHERE PartyType=? AND PaymentRef LIKE ? ORDER BY PaymentRef DESC LIMIT 1`).get(partyType||'Customer', `${prefix}-%`);
      db.close();
      if (!last) return { success: true, nextRef: `${prefix}-00001` };
      const num = parseInt((last.PaymentRef||'').replace(`${prefix}-`,'')) || 0;
      return { success: true, nextRef: `${prefix}-${String(num+1).padStart(5,'0')}` };
    } catch(e) { return { success: false, error: e.message, nextRef: '' }; }
  });
}

module.exports.runPackagingMigrations = runPackagingMigrations;
module.exports.registerErpHandlers2  = registerErpHandlers2;

// =============================================================================
// PHASE 2  —  FLOUR-MILL SPECIFIC DATABASE MIGRATIONS
// Adds weight fields, payment type, vehicle/driver, cheques, aging,
// one-time supplier support, credit days, opening balances table,
// recipe versioning, company config columns.
// Safe: uses addColIfMissing — never drops existing data.
// =============================================================================

function runFlourMillMigrations(db) {
  const tables = getTables(db);

  // ── Purchase Invoice Headers — flour-mill operational fields ──────────────
  if (tables.has('Purchase_Invoice_Headers')) {
    [
      ['GrossWeight',      'REAL DEFAULT 0'],
      ['TareWeight',       'REAL DEFAULT 0'],
      ['NetWeight',        'REAL DEFAULT 0'],
      ['VehicleNo',        'TEXT'],
      ['DriverName',       'TEXT'],
      ['TransporterName',  'TEXT'],
      ['UnloadingLocation','TEXT'],
      ['PaymentType',      "TEXT DEFAULT 'Credit'"],  // 'Cash'|'Credit'|'Cheque'|'Mixed'
      ['SettlementAccountCA', 'INTEGER'],
      ['CashAmount',       'REAL DEFAULT 0'],
      ['ChequeAmount',     'REAL DEFAULT 0'],
      ['CreditAmount',     'REAL DEFAULT 0'],
      ['ChequeNo',         'TEXT'],
      ['ChequeDate',       'TEXT'],
      ['BankName',         'TEXT'],
      ['DueDate',          'TEXT'],
      ['SupplierRef',      'TEXT'],     // supplier's own invoice no
    ].forEach(([col, def]) => addColIfMissing(db, 'Purchase_Invoice_Headers', col, def));
  }

  // ── Sales Invoice Headers — due date + payment type ───────────────────────
  if (tables.has('Sales_Invoice_Headers')) {
    [
      ['DueDate',      'TEXT'],
      ['PaymentType',  "TEXT DEFAULT 'Credit'"],
      ['SettlementAccountCA', 'INTEGER'],
      ['CashAmount',   'REAL DEFAULT 0'],
      ['VehicleNo',    'TEXT'],
      ['DriverName',   'TEXT'],
    ].forEach(([col, def]) => addColIfMissing(db, 'Sales_Invoice_Headers', col, def));
  }

  // ── Customers — credit days, type, tax fields ─────────────────────────────
  if (tables.has('Customers')) {
    [
      ['CustomerType',  "TEXT DEFAULT 'Credit'"],  // 'Cash'|'Credit'
      ['CreditDays',    'INTEGER DEFAULT 0'],
      ['CNIC',          'TEXT'],
      ['NTN',           'TEXT'],
      ['STRN',          'TEXT'],
      ['Mobile',        'TEXT'],
      ['Phone',         'TEXT'],
      ['Email',         'TEXT'],
      ['Notes',         'TEXT'],
    ].forEach(([col, def]) => addColIfMissing(db, 'Customers', col, def));
  }

  // ── Suppliers — one-time flag, credit days, tax fields ───────────────────
  if (tables.has('Suppliers')) {
    [
      ['IsOneTime',   'INTEGER DEFAULT 0'],
      ['CreditDays',  'INTEGER DEFAULT 0'],
      ['CNIC',        'TEXT'],
      ['NTN',         'TEXT'],
      ['STRN',        'TEXT'],
      ['Mobile',      'TEXT'],
      ['Phone',       'TEXT'],
      ['Email',       'TEXT'],
      ['Notes',       'TEXT'],
      ['SupplierType',"TEXT DEFAULT 'Credit'"],  // 'Cash'|'Credit'
    ].forEach(([col, def]) => addColIfMissing(db, 'Suppliers', col, def));
  }

  // ── Recipes — versioning support ──────────────────────────────────────────
  if (tables.has('Recipes')) {
    [
      ['RecipeVersion', 'INTEGER DEFAULT 1'],
      ['EffectiveFrom', 'TEXT'],
      ['ParentRecipeID','INTEGER'],
    ].forEach(([col, def]) => addColIfMissing(db, 'Recipes', col, def));
  }

  // ── Recipe Outputs — NRV method support ──────────────────────────────────
  if (tables.has('Recipe_Outputs')) {
    addColIfMissing(db, 'Recipe_Outputs', 'NRVPerUnit', 'REAL DEFAULT 0');
  }

  // ── Production Batches — multi-recipe input support ───────────────────────
  if (tables.has('Production_Batches')) {
    [
      ['RecipeVersion', 'INTEGER DEFAULT 1'],
      ['Notes',         'TEXT'],
    ].forEach(([col, def]) => addColIfMissing(db, 'Production_Batches', col, def));
  }

  // ── Company_Info — configuration flags ────────────────────────────────────
  if (tables.has('Company_Info')) {
    [
      ['AllowNegativeStock',          "TEXT DEFAULT 'warn'"],  // 'allow'|'warn'|'block'
      ['InventoryValuationMethod',    "TEXT DEFAULT 'wac'"],   // 'wac'|'fifo'
      ['CurrencyPrecision',           'INTEGER DEFAULT 2'],
      ['WeightPrecision',             'INTEGER DEFAULT 3'],
      ['AutoSyncGDrive',              'INTEGER DEFAULT 0'],
      ['CreditLimitEnforcement',      "TEXT DEFAULT 'warn'"],  // 'allow'|'warn'|'block'
    ].forEach(([col, def]) => addColIfMissing(db, 'Company_Info', col, def));
  }

  // ── Cheques table ─────────────────────────────────────────────────────────
  if (!tables.has('Cheques')) {
    db.prepare(`CREATE TABLE Cheques (
      ChequeID      INTEGER PRIMARY KEY,
      ChequeNo      TEXT NOT NULL,
      ChequeDate    TEXT NOT NULL,
      BankName      TEXT,
      BankAccountNo TEXT,
      PartyType     TEXT,                 -- 'Customer'|'Supplier'
      PartyID       INTEGER,
      PartyName     TEXT,
      Amount        REAL NOT NULL DEFAULT 0,
      Direction     TEXT NOT NULL,        -- 'ISSUED'|'RECEIVED'
      Status        TEXT DEFAULT 'PENDING', -- 'PENDING'|'CLEARED'|'BOUNCED'|'CANCELLED'
      SourceType    TEXT,
      SourceID      INTEGER,
      VoucherRef    INTEGER,
      ClearedDate   TEXT,
      Notes         TEXT,
      CreatedAt     TEXT DEFAULT (datetime('now'))
    )`).run();
    db.prepare('CREATE INDEX IF NOT EXISTS idx_cheques_status ON Cheques(Status)').run();
    db.prepare('CREATE INDEX IF NOT EXISTS idx_cheques_date ON Cheques(ChequeDate)').run();
  } else {
    [
      ['BankAccountNo','TEXT'],
      ['ClearedDate',  'TEXT'],
      ['Notes',        'TEXT'],
    ].forEach(([col, def]) => addColIfMissing(db, 'Cheques', col, def));
  }

  // ── Opening_Balances table ────────────────────────────────────────────────
  if (!tables.has('Opening_Balances')) {
    db.prepare(`CREATE TABLE Opening_Balances (
      OBID          INTEGER PRIMARY KEY,
      FYearID       INTEGER,
      AccountCA     INTEGER,
      PartyType     TEXT,       -- 'Customer'|'Supplier'|NULL
      PartyID       INTEGER,
      ItemID        INTEGER,
      WarehouseID   INTEGER,
      OpeningType   TEXT NOT NULL DEFAULT 'Account',  -- 'Account'|'Customer'|'Supplier'|'Inventory'
      DebitAmount   REAL DEFAULT 0,
      CreditAmount  REAL DEFAULT 0,
      Quantity      REAL DEFAULT 0,
      UnitCost      REAL DEFAULT 0,
      Narration     TEXT,
      VoucherRef    INTEGER,
      PostedAt      TEXT,
      CreatedAt     TEXT DEFAULT (datetime('now'))
    )`).run();
    db.prepare('CREATE INDEX IF NOT EXISTS idx_ob_account ON Opening_Balances(AccountCA)').run();
    db.prepare('CREATE INDEX IF NOT EXISTS idx_ob_party ON Opening_Balances(PartyType,PartyID)').run();
  }

  // ── Backup_Log table — GDrive sync history ────────────────────────────────
  if (!tables.has('Backup_Log')) {
    db.prepare(`CREATE TABLE Backup_Log (
      LogID       INTEGER PRIMARY KEY,
      BackupTime  TEXT DEFAULT (datetime('now')),
      Direction   TEXT NOT NULL,  -- 'TO_DRIVE'|'FROM_DRIVE'
      DestPath    TEXT,
      FileSize    INTEGER,
      Status      TEXT DEFAULT 'OK',
      Notes       TEXT
    )`).run();
  }

  // ── Unit_Conversions table ────────────────────────────────────────────────
  if (!tables.has('Unit_Conversions')) {
    db.prepare(`CREATE TABLE Unit_Conversions (
      ConvID      INTEGER PRIMARY KEY,
      FromUnit    TEXT NOT NULL,
      ToUnit      TEXT NOT NULL,
      Factor      REAL NOT NULL DEFAULT 1,
      Notes       TEXT,
      Active      INTEGER DEFAULT 1,
      UNIQUE(FromUnit, ToUnit)
    )`).run();
    // Seed standard flour-mill unit conversions
    const seeds = [
      ['KG',    'TON',    0.001,    '1 KG = 0.001 Ton'],
      ['TON',   'KG',     1000,     '1 Ton = 1000 KG'],
      ['KG',    'MAUND',  0.025,    '1 KG = 0.025 Maund (40 KG/Maund)'],
      ['MAUND', 'KG',     40,       '1 Maund = 40 KG'],
      ['BAG',   'KG',     50,       '1 Bag = 50 KG (standard 50 KG bag)'],
      ['KG',    'BAG',    0.02,     '1 KG = 0.02 Bags'],
      ['BORA',  'KG',     50,       '1 Bora = 50 KG'],
    ];
    const ins = db.prepare('INSERT OR IGNORE INTO Unit_Conversions (FromUnit,ToUnit,Factor,Notes) VALUES (?,?,?,?)');
    seeds.forEach(([f,t,v,n]) => ins.run(f, t, v, n));
  }

  // ── Add indexes that may be missing on core tables ────────────────────────
  try { db.prepare('CREATE INDEX IF NOT EXISTS idx_inv_account ON Inv(Account_Party)').run(); } catch(_) {}
  try { db.prepare('CREATE INDEX IF NOT EXISTS idx_inv_account2 ON Inv(AC_Party2)').run(); } catch(_) {}
  try { db.prepare('CREATE INDEX IF NOT EXISTS idx_t_date ON T(TR_Date)').run(); } catch(_) {}
  try { db.prepare('CREATE INDEX IF NOT EXISTS idx_sm_item_date ON Stock_Movements(ItemID, MovementDate)').run(); } catch(_) {}
  try { db.prepare('CREATE INDEX IF NOT EXISTS idx_sm_source ON Stock_Movements(SourceType, SourceID)').run(); } catch(_) {}
}

// =============================================================================
// PHASE 3  — ACCOUNTING ENGINE HELPERS
// =============================================================================

/**
 * Validate that a posting transaction date falls within an open fiscal year.
 * Returns { valid: true } if OK, or { valid: false, error: message }.
 * If no fiscal years are configured, validation passes (non-breaking).
 */
function validateFiscalYear(db, txDate) {
  if (!getTables(db).has('Fiscal_Years')) return { valid: true };
  try {
    const fy = db.prepare(
      `SELECT * FROM Fiscal_Years WHERE StartDate <= ? AND EndDate >= ? LIMIT 1`
    ).get(txDate, txDate);
    if (!fy) {
      // Check if ANY fiscal year exists before blocking
      const anyFY = db.prepare('SELECT COUNT(*) AS c FROM Fiscal_Years').get();
      if (anyFY.c === 0) return { valid: true }; // no FY configured → allow
      return { valid: false, error: `No open fiscal year covers the date ${txDate}. Create or extend a fiscal year in Settings → Fiscal Years.` };
    }
    if (fy.Status === 'Closed') {
      return { valid: false, error: `Fiscal year "${fy.FYearName}" is closed. Reopen it or post to the correct period.` };
    }
    return { valid: true };
  } catch(_) { return { valid: true }; }
}

/**
 * Get company configuration value by column name.
 */
function getCompanyConfig(db, col, defaultValue) {
  try {
    if (!getTables(db).has('Company_Info')) return defaultValue;
    const row = db.prepare(`SELECT ${col} FROM Company_Info LIMIT 1`).get();
    return row ? (row[col] !== null && row[col] !== undefined ? row[col] : defaultValue) : defaultValue;
  } catch(_) { return defaultValue; }
}

/**
 * Check if negative stock is allowed for an item/warehouse.
 * Returns { allowed: bool, warn: bool }.
 */
function checkNegativeStock(db, itemId, warehouseId, requiredQty, txDate) {
  const setting = getCompanyConfig(db, 'AllowNegativeStock', 'warn');
  if (setting === 'allow') return { allowed: true, warn: false };

  const whereParts = ['ItemID = ?'];
  const params = [itemId];
  if (warehouseId) { whereParts.push('WarehouseID = ?'); params.push(warehouseId); }
  if (txDate)      { whereParts.push('MovementDate <= ?'); params.push(txDate); }
  const rows = db.prepare(
    `SELECT MovementType, Quantity FROM Stock_Movements WHERE ${whereParts.join(' AND ')}`
  ).all(...params);
  let currentQty = 0;
  for (const r of rows) currentQty += (r.MovementType === 'IN' || r.MovementType === 'OPENING') ? r.Quantity : -r.Quantity;

  if (currentQty - requiredQty < -0.001) {
    const item = getTables(db).has('Mill_Items')
      ? db.prepare('SELECT ItemName FROM Mill_Items WHERE ItemID=?').get(itemId) : null;
    const itemName = item ? item.ItemName : `Item #${itemId}`;
    const msg = `Insufficient stock for ${itemName}: available ${currentQty.toFixed(3)}, required ${requiredQty.toFixed(3)}.`;
    if (setting === 'block') return { allowed: false, warn: false, error: msg };
    return { allowed: true, warn: true, message: msg };
  }
  return { allowed: true, warn: false };
}

/**
 * Create a cheque record when a purchase/payment involves a cheque.
 */
function createChequeRecord(db, { chequeNo, chequeDate, bankName, partyType, partyId, partyName, amount, direction, sourceType, sourceId, voucherRef }) {
  if (!getTables(db).has('Cheques')) return null;
  if (!chequeNo || !chequeDate || !amount) return null;
  const next = (db.prepare('SELECT COALESCE(MAX(ChequeID),0)+1 AS n FROM Cheques').get()).n;
  db.prepare(
    `INSERT INTO Cheques (ChequeID,ChequeNo,ChequeDate,BankName,PartyType,PartyID,PartyName,Amount,Direction,Status,SourceType,SourceID,VoucherRef)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(next, chequeNo, chequeDate, bankName||null, partyType||null, partyId||null, partyName||null, Number(amount), direction||'ISSUED', 'PENDING', sourceType||null, sourceId||null, voucherRef||null);
  return next;
}

// =============================================================================
// PHASE 4  — AR/AP FIXES  (enhanced Customer/Supplier outstanding)
// =============================================================================

/**
 * Compute customer or supplier balance from GL (linked account) or fallback
 * to invoice/payment subledger.
 * Returns { balance, totalInvoiced, totalPaid, glBased }
 */
function normalizeSameAccountPostings(map) {
  const final = new Map();
  for (const p of map.values()) {
    const existing = final.get(p.accountId) || { accountId: p.accountId, debit: 0, credit: 0 };
    existing.debit += Number(p.debit || 0);
    existing.credit += Number(p.credit || 0);
    final.set(p.accountId, existing);
  }

  return [...final.values()].map(p => {
    if (p.debit > 0 && p.credit > 0) {
      if (p.debit >= p.credit) return { ...p, credit: 0 };
      return { ...p, debit: 0 };
    }
    return p;
  }).filter(p => p.debit > 0 || p.credit > 0);
}

function postingsForRowCompat(row) {
  const drAmt = Number(row.DrAmount || 0);
  const crAmt = Number(row.CrAmount || 0);
  const legacyAmt = Number(row.Amount || 0);
  const legacyParty = Number(row.Account_Party || row.AccountParty || 0);
  const legacyParty2 = Number(row.AC_Party2 || row.ACParty2 || 0);
  const drAcct = Number(row.DrAccountCA || 0);
  const crAcct = Number(row.CrAccountCA || 0);
  const postingsMap = new Map();

  function addPosting(accountId, debit, credit) {
    if (!(accountId > 0) || (debit <= 0 && credit <= 0)) return;
    const existing = postingsMap.get(accountId) || { accountId, debit: 0, credit: 0 };
    existing.debit += Number(debit || 0);
    existing.credit += Number(credit || 0);
    postingsMap.set(accountId, existing);
  }

  const hasExplicitDr = drAmt > 0 && drAcct > 0;
  const hasExplicitCr = crAmt > 0 && crAcct > 0;

  if (hasExplicitDr) addPosting(drAcct, drAmt, 0);
  if (hasExplicitCr) addPosting(crAcct, 0, crAmt);

  if (hasExplicitDr && !hasExplicitCr && legacyParty2 > 0 && legacyParty2 !== drAcct && legacyAmt > 0) {
    addPosting(legacyParty2, 0, legacyAmt);
  }

  if (hasExplicitCr && !hasExplicitDr && legacyParty > 0 && legacyParty !== crAcct && legacyAmt > 0) {
    addPosting(legacyParty, legacyAmt, 0);
  }

  if (!hasExplicitDr && !hasExplicitCr && legacyAmt > 0) {
    if (legacyParty > 0 && legacyParty2 > 0 && legacyParty !== legacyParty2) {
      addPosting(legacyParty, legacyAmt, 0);
      addPosting(legacyParty2, 0, legacyAmt);
    } else if (legacyParty > 0) {
      addPosting(legacyParty, legacyAmt, 0);
    } else if (legacyParty2 > 0) {
      addPosting(legacyParty2, 0, legacyAmt);
    }
  }

  return normalizeSameAccountPostings(postingsMap);
}

function computeLinkedAccountTotals(db, accountId, asOfDate) {
  const tables = getTables(db);
  const invTable = tables.has('Inv') ? 'Inv' : tables.has('Inv1') ? 'Inv1' : null;
  const tTable = tables.has('T') ? 'T' : tables.has('T1') ? 'T1' : null;
  if (!invTable || !tTable) return { debit: 0, credit: 0, balance: 0 };

  const invCols = getCols(db, invTable);
  const tCols = getCols(db, tTable);
  const hasDrAmt = invCols.includes('DrAmount');
  const hasCrAmt = invCols.includes('CrAmount');
  const hasDrAcct = invCols.includes('DrAccountCA');
  const hasCrAcct = invCols.includes('CrAccountCA');
  const hasVNo = tCols.includes('V_No');
  const hasRemarks = tCols.includes('Remarks');

  const params = [Number(accountId), Number(accountId)];
  const clauseParts = [`("${invTable}".Account_Party = ? OR "${invTable}".AC_Party2 = ?)`];
  if (hasDrAcct) { clauseParts.push(`"${invTable}".DrAccountCA = ?`); params.push(Number(accountId)); }
  if (hasCrAcct) { clauseParts.push(`"${invTable}".CrAccountCA = ?`); params.push(Number(accountId)); }
  if (asOfDate) { clauseParts.push(`("${tTable}".TR_Date IS NULL OR "${tTable}".TR_Date <= ?)`); params.push(asOfDate); }

  const rows = db.prepare(
    `SELECT "${invTable}".TR_No, "${invTable}".SL, "${invTable}".VType,
            "${invTable}".Account_Party, "${invTable}".AC_Party2,
            "${invTable}".Amount,
            ${hasDrAmt ? `"${invTable}".DrAmount` : 'NULL AS DrAmount'},
            ${hasCrAmt ? `"${invTable}".CrAmount` : 'NULL AS CrAmount'},
            ${hasDrAcct ? `"${invTable}".DrAccountCA` : 'NULL AS DrAccountCA'},
            ${hasCrAcct ? `"${invTable}".CrAccountCA` : 'NULL AS CrAccountCA'},
            "${tTable}".TR_Date,
            ${hasVNo ? `"${tTable}".V_No` : 'NULL AS V_No'},
            ${hasRemarks ? `"${tTable}".Remarks` : "'' AS Remarks"}
     FROM "${invTable}"
     LEFT JOIN "${tTable}" ON "${invTable}".TR_No = "${tTable}".TR_No
     WHERE ${clauseParts.join(' AND ')}
     ORDER BY "${tTable}".TR_Date, "${invTable}".TR_No, "${invTable}".SL`
  ).all(...params);

  let debit = 0;
  let credit = 0;
  for (const row of rows) {
    const postings = postingsForRowCompat(row);
    for (const p of postings) {
      if (Number(p.accountId) !== Number(accountId)) continue;
      debit += Number(p.debit || 0);
      credit += Number(p.credit || 0);
    }
  }

  // Match the shared account-statement logic exactly.
  // Customer/supplier outstanding should reflect the linked party account balance,
  // including the linked party invoice/payment totals and opening balance, not a
  // legacy invoice-only subtotal layered on top of the GL balance.
  if (tables.has('Customers')) {
    const customers = db.prepare('SELECT CustomerID, LinkedAccountCA, OpeningBalance FROM Customers WHERE (Active IS NULL OR Active=1) AND LinkedAccountCA IS NOT NULL').all();
    for (const customer of customers) {
      if (Number(customer.LinkedAccountCA) !== Number(accountId)) continue;
      let invoiceTotal = 0;
      let paidTotal = 0;
      if (tables.has('Sales_Invoice_Headers')) {
        const where = ["CustomerID=?", "Status='Posted'"], params = [Number(customer.CustomerID)];
        if (asOfDate) { where.push('InvoiceDate<=?'); params.push(asOfDate); }
        const r = db.prepare(`SELECT COALESCE(SUM(NetTotal),0) AS v FROM Sales_Invoice_Headers WHERE ${where.join(' AND ')}`).get(...params);
        invoiceTotal = Number(r && r.v ? r.v : 0);
      }
      if (tables.has('Party_Payments')) {
        const where = ["PartyType='Customer'", 'PartyID=?', "Status='Posted'"], params = [Number(customer.CustomerID)];
        if (asOfDate) { where.push('PaymentDate<=?'); params.push(asOfDate); }
        const r = db.prepare(`SELECT COALESCE(SUM(Amount),0) AS v FROM Party_Payments WHERE ${where.join(' AND ')}`).get(...params);
        paidTotal = Number(r && r.v ? r.v : 0);
      }
      if (invoiceTotal === 0 && paidTotal === 0 && Math.abs(Number(customer.OpeningBalance || 0)) <= 0.01) continue;
      debit += Number(customer.OpeningBalance || 0) + invoiceTotal;
      credit += paidTotal;
    }
  }

  if (tables.has('Suppliers')) {
    const suppliers = db.prepare('SELECT SupplierID, LinkedAccountCA, OpeningBalance FROM Suppliers WHERE (Active IS NULL OR Active=1) AND LinkedAccountCA IS NOT NULL').all();
    for (const supplier of suppliers) {
      if (Number(supplier.LinkedAccountCA) !== Number(accountId)) continue;
      let invoiceTotal = 0;
      let paidTotal = 0;
      if (tables.has('Purchase_Invoice_Headers')) {
        const where = ["SupplierID=?", "Status='Posted'"], params = [Number(supplier.SupplierID)];
        if (asOfDate) { where.push('InvoiceDate<=?'); params.push(asOfDate); }
        const r = db.prepare(`SELECT COALESCE(SUM(NetTotal),0) AS v FROM Purchase_Invoice_Headers WHERE ${where.join(' AND ')}`).get(...params);
        invoiceTotal = Number(r && r.v ? r.v : 0);
      }
      if (tables.has('Party_Payments')) {
        const where = ["PartyType='Supplier'", 'PartyID=?', "Status='Posted'"], params = [Number(supplier.SupplierID)];
        if (asOfDate) { where.push('PaymentDate<=?'); params.push(asOfDate); }
        const r = db.prepare(`SELECT COALESCE(SUM(Amount),0) AS v FROM Party_Payments WHERE ${where.join(' AND ')}`).get(...params);
        paidTotal = Number(r && r.v ? r.v : 0);
      }
      if (invoiceTotal === 0 && paidTotal === 0 && Math.abs(Number(supplier.OpeningBalance || 0)) <= 0.01) continue;
      debit += paidTotal;
      credit += Number(supplier.OpeningBalance || 0) + invoiceTotal;
    }
  }

  return { debit, credit, balance: debit - credit };
}

function computePartyBalance(db, partyType, partyId, asOfDate) {
  const isCustomer = partyType === 'Customer';
  const party = isCustomer
    ? (getTables(db).has('Customers') ? db.prepare('SELECT * FROM Customers WHERE CustomerID=?').get(Number(partyId)) : null)
    : (getTables(db).has('Suppliers') ? db.prepare('SELECT * FROM Suppliers WHERE SupplierID=?').get(Number(partyId)) : null);
  if (!party) return { balance: 0, totalInvoiced: 0, totalPaid: 0, glBased: false };

  const openingBalance = Number(party.OpeningBalance || 0);

  // The customer/supplier outstanding balance must match the linked account
  // statement balance exactly. The GL-based account calculation is the source of
  // truth and the legacy invoice/payment totals are only fallback display data.
  const linkedAccountCA = Number(party.LinkedAccountCA || 0);
  if (linkedAccountCA > 0) {
    try {
      const totals = computeLinkedAccountTotals(db, linkedAccountCA, asOfDate);
      let totalInvoiced = openingBalance;
      let totalPaid = 0;

      if (isCustomer && getTables(db).has('Sales_Invoice_Headers')) {
        const where = ["CustomerID=?", "Status='Posted'"];
        const params = [Number(partyId)];
        if (asOfDate) { where.push('InvoiceDate<=?'); params.push(asOfDate); }
        const r = db.prepare(`SELECT COALESCE(SUM(NetTotal),0) AS v FROM Sales_Invoice_Headers WHERE ${where.join(' AND ')}`).get(...params);
        totalInvoiced = Number(r.v || 0);
      } else if (!isCustomer && getTables(db).has('Purchase_Invoice_Headers')) {
        const where = ["SupplierID=?", "Status='Posted'"];
        const params = [Number(partyId)];
        if (asOfDate) { where.push('InvoiceDate<=?'); params.push(asOfDate); }
        const r = db.prepare(`SELECT COALESCE(SUM(NetTotal),0) AS v FROM Purchase_Invoice_Headers WHERE ${where.join(' AND ')}`).get(...params);
        totalInvoiced = Number(r.v || 0);
      }

      if (getTables(db).has('Party_Payments')) {
        const where = [`PartyType='${partyType}'`, 'PartyID=?', "Status='Posted'"];
        const params = [Number(partyId)];
        if (asOfDate) { where.push('PaymentDate<=?'); params.push(asOfDate); }
        const r = db.prepare(`SELECT COALESCE(SUM(Amount),0) AS v FROM Party_Payments WHERE ${where.join(' AND ')}`).get(...params);
        totalPaid = Number(r.v || 0);
      }

      return {
        balance: totals.balance,
        totalInvoiced,
        totalPaid,
        glBased: true,
      };
    } catch (_) {
      // Fall through to the legacy subledger fallback below.
    }
  }

  // Fallback: subledger-based (invoices + Party_Payments)
  let totalInvoiced = openingBalance;
  let totalPaid = 0;

  if (isCustomer && getTables(db).has('Sales_Invoice_Headers')) {
    const where = ["CustomerID=?", "Status='Posted'"];
    const params = [Number(partyId)];
    if (asOfDate) { where.push('InvoiceDate<=?'); params.push(asOfDate); }
    const r = db.prepare(`SELECT COALESCE(SUM(NetTotal),0) AS v FROM Sales_Invoice_Headers WHERE ${where.join(' AND ')}`).get(...params);
    totalInvoiced += Number(r.v || 0);
  } else if (!isCustomer && getTables(db).has('Purchase_Invoice_Headers')) {
    const where = ["SupplierID=?", "Status='Posted'"];
    const params = [Number(partyId)];
    if (asOfDate) { where.push('InvoiceDate<=?'); params.push(asOfDate); }
    const r = db.prepare(`SELECT COALESCE(SUM(NetTotal),0) AS v FROM Purchase_Invoice_Headers WHERE ${where.join(' AND ')}`).get(...params);
    totalInvoiced += Number(r.v || 0);
  }

  if (getTables(db).has('Party_Payments')) {
    const where = [`PartyType='${partyType}'`, 'PartyID=?', "Status='Posted'"];
    const params = [Number(partyId)];
    if (asOfDate) { where.push('PaymentDate<=?'); params.push(asOfDate); }
    const r = db.prepare(`SELECT COALESCE(SUM(Amount),0) AS v FROM Party_Payments WHERE ${where.join(' AND ')}`).get(...params);
    totalPaid = Number(r.v || 0);
  }

  return { balance: totalInvoiced - totalPaid, totalInvoiced, totalPaid, glBased: false };
}

/**
 * Compute aging buckets for a list of invoices.
 * buckets: { current, days1_30, days31_60, days61_90, days91_120, days120plus, total }
 */
function computeAging(invoices, payments, asOfDate) {
  const refDate = asOfDate ? new Date(asOfDate) : new Date();
  const msPerDay = 86400000;

  // Build a simple balance remaining per invoice (approximate — no exact allocation)
  const totalInvoiced = invoices.reduce((s, inv) => s + Number(inv.NetTotal || 0), 0);
  const totalPaid     = payments.reduce((s, p) => s + Number(p.Amount || 0), 0);
  let remainingPayment = totalPaid;

  const buckets = { current: 0, days1_30: 0, days31_60: 0, days61_90: 0, days91_120: 0, days120plus: 0, total: 0 };

  // Sort invoices oldest first; apply payments sequentially
  const sorted = [...invoices].sort((a, b) => a.InvoiceDate < b.InvoiceDate ? -1 : 1);
  for (const inv of sorted) {
    let outstanding = Number(inv.NetTotal || 0);
    if (remainingPayment > 0) {
      const applied = Math.min(remainingPayment, outstanding);
      outstanding -= applied;
      remainingPayment -= applied;
    }
    if (outstanding < 0.01) continue;

    const dueDate = inv.DueDate ? new Date(inv.DueDate) : new Date(inv.InvoiceDate);
    const daysOverdue = Math.floor((refDate - dueDate) / msPerDay);

    if (daysOverdue <= 0)        buckets.current    += outstanding;
    else if (daysOverdue <= 30)  buckets.days1_30   += outstanding;
    else if (daysOverdue <= 60)  buckets.days31_60  += outstanding;
    else if (daysOverdue <= 90)  buckets.days61_90  += outstanding;
    else if (daysOverdue <= 120) buckets.days91_120 += outstanding;
    else                         buckets.days120plus += outstanding;
    buckets.total += outstanding;
  }
  return buckets;
}

// =============================================================================
// PHASE 5  — PURCHASE MODULE — FLOUR-MILL ENHANCEMENTS
// =============================================================================

/**
 * Enhanced post purchase invoice:
 * - Handles PaymentType: Cash | Credit | Cheque | Mixed
 * - Creates Cheque record if cheque payment
 * - Posts split GL entries for mixed payments
 * - Validates fiscal year
 * - Validates negative stock (not applicable for purchases — always IN)
 * - Supports one-time supplier (no LinkedAccountCA required for cash)
 */
function postPurchaseInvoiceFull(db, PIHID, broadcastChange, dp, settlementAccountCA, paymentType) {
  let trNos = [];

  db.transaction(() => {
    const header = db.prepare('SELECT * FROM Purchase_Invoice_Headers WHERE PIHID=?').get(PIHID);
    if (!header) throw new Error(`Purchase invoice #${PIHID} not found.`);
    if (header.Status === 'Posted')    throw new Error('Invoice already posted.');
    if (header.Status === 'Cancelled') throw new Error('Cannot post a cancelled invoice.');

    // Fiscal year validation
    const fyCheck = validateFiscalYear(db, header.InvoiceDate);
    if (!fyCheck.valid) throw new Error(fyCheck.error);

    const lines = db.prepare('SELECT * FROM Purchase_Invoice_Lines WHERE PIHID=?').all(PIHID);
    if (!lines.length) throw new Error('Invoice has no lines.');

    // Compute NetWeight from GrossWeight - TareWeight if not already set
    const grossWt = Number(header.GrossWeight || 0);
    const tareWt  = Number(header.TareWeight || 0);
    if (grossWt > 0 && tareWt >= 0) {
      const netWt = grossWt - tareWt;
      if (netWt < 0) throw new Error(`Net weight cannot be negative (Gross: ${grossWt}, Tare: ${tareWt}).`);
      db.prepare('UPDATE Purchase_Invoice_Headers SET NetWeight=? WHERE PIHID=?').run(netWt, PIHID);
    }

    // Get supplier info
    const supplier = getTables(db).has('Suppliers')
      ? db.prepare('SELECT * FROM Suppliers WHERE SupplierID=?').get(header.SupplierID) : null;
    const isOneTime = supplier ? Boolean(supplier.IsOneTime) : true;

    // Account resolution
    const resolvedPaymentType = settlementAccountCA
      ? (header.PaymentType || paymentType || 'Credit')
      : (header.PaymentType || 'Credit');
    // If caller passed an explicit settlement account, use it as both cash and bank
    const cashCA     = settlementAccountCA || getMapping(db, 'CASH');
    const bankCA     = settlementAccountCA || getMapping(db, 'BANK');
    const supplierCA = (supplier && supplier.LinkedAccountCA)
                       || getMapping(db, 'SUPPLIER_PAYABLE');

    // Inventory account
    const rawInvCA = getMapping(db, 'RAW_MATERIAL_INVENTORY');
    const fgInvCA  = getMapping(db, 'FINISHED_GOODS_INVENTORY');

    // Post stock movements
    for (const line of lines) {
      const whId = line.WarehouseID || header.WarehouseID || null;
      const movId = insertStockMovement(db, {
        date: header.InvoiceDate, itemId: line.ItemID,
        warehouseId: whId, movType: 'IN',
        qty: Number(line.Quantity), rate: Number(line.UnitCost || 0),
        refNo: header.InvoiceNo,
        narration: `Purchase ${header.InvoiceNo}${supplier ? ' – ' + supplier.SupplierName : ''}`,
        sourceType: 'PURCHASE_INVOICE', sourceId: PIHID,
      });
      db.prepare('UPDATE Purchase_Invoice_Lines SET StockMovID=? WHERE PILID=?').run(movId, line.PILID);

      // Update Inventory_Balances cache
      if (getTables(db).has('Inventory_Balances')) {
        const ib = db.prepare('SELECT * FROM Inventory_Balances WHERE ItemID=? AND (WarehouseID=? OR (WarehouseID IS NULL AND ? IS NULL))')
          .get(line.ItemID, whId, whId);
        const qty = Number(line.Quantity), cost = Number(line.UnitCost || 0);
        if (ib) {
          const newQty = Number(ib.QtyBalance) + qty;
          const newVal = Number(ib.ValueBalance) + qty * cost;
          db.prepare('UPDATE Inventory_Balances SET QtyBalance=?,ValueBalance=?,AvgCost=?,UpdatedAt=datetime(\'now\') WHERE ItemID=? AND (WarehouseID=? OR (WarehouseID IS NULL AND ? IS NULL))')
            .run(newQty, newVal, newQty > 0 ? newVal / newQty : 0, line.ItemID, whId, whId);
        } else {
          db.prepare('INSERT OR IGNORE INTO Inventory_Balances (ItemID,WarehouseID,QtyBalance,ValueBalance,AvgCost) VALUES (?,?,?,?,?)')
            .run(line.ItemID, whId, qty, qty * cost, cost);
        }
      }
    }

    // Determine inventory debit account per item (or global fallback)
    // For simplicity: if all lines are same item use its InventoryAccountCA; else use global
    const uniqueItems = [...new Set(lines.map(l => l.ItemID))];
    let debitCA = rawInvCA || fgInvCA;
    if (uniqueItems.length === 1) {
      const item = db.prepare('SELECT * FROM Mill_Items WHERE ItemID=?').get(uniqueItems[0]);
      if (item && item.InventoryAccountCA) debitCA = item.InventoryAccountCA;
      else if (item && item.PurchaseAccountCA) debitCA = item.PurchaseAccountCA;
    }

    const netTotal = Number(header.NetTotal || 0);
    const cashAmt   = Number(header.CashAmount || 0);
    const chequeAmt = Number(header.ChequeAmount || 0);
    const creditAmt = Number(header.CreditAmount || 0);

    // Correct accounting semantics:
    // - Credit: invoice creates payable balance
    // - Cash: purchase is settled immediately; remaining total is credited to cash
    // - Cheque: purchase is settled immediately; remaining total is credited to bank
    // - Mixed: total purchase is split between immediate cash/bank settlement and supplier balance
    const effectivePaymentType = header.PaymentType || resolvedPaymentType || 'Credit';
    let effectiveCash = 0, effectiveCheque = 0, effectiveCredit = 0;

    if (effectivePaymentType === 'Cash') {
      effectiveCash = netTotal;
    } else if (effectivePaymentType === 'Credit') {
      effectiveCredit = netTotal;
    } else if (effectivePaymentType === 'Cheque') {
      effectiveCheque = netTotal;
    } else if (effectivePaymentType === 'Mixed') {
      effectiveCash = Math.min(Number(cashAmt || 0), netTotal);
      effectiveCheque = Math.min(Number(chequeAmt || 0), Math.max(netTotal - effectiveCash, 0));
      effectiveCredit = Math.max(netTotal - effectiveCash - effectiveCheque, 0);
      if (Number(creditAmt || 0) > 0.001) effectiveCredit = Math.max(Number(creditAmt || 0), 0);
    }

    const narr = `Purchase ${header.InvoiceNo}${supplier ? ' – ' + supplier.SupplierName : ''}`;

    // A single purchase voucher should reflect the invoice total as one inventory debit,
    // with the paid and payable portions credited to the selected settlement account(s)
    // and the supplier payable account respectively.
    const purchaseLines = [];
    if (netTotal > 0.001 && debitCA) {
      purchaseLines.push({ accountId: debitCA, debit: netTotal, credit: 0, narration: narr });
    }
    if (effectiveCash > 0.001 && cashCA) {
      purchaseLines.push({ accountId: cashCA, debit: 0, credit: effectiveCash, narration: `Cash payment on Purchase ${header.InvoiceNo}` });
    }
    if (effectiveCheque > 0.001 && bankCA) {
      purchaseLines.push({ accountId: bankCA, debit: 0, credit: effectiveCheque, narration: `Cheque payment on Purchase ${header.InvoiceNo}` });
    }
    if (effectiveCredit > 0.001 && supplierCA) {
      purchaseLines.push({ accountId: supplierCA, debit: 0, credit: effectiveCredit, narration: `Supplier payable on Purchase ${header.InvoiceNo}` });
    }

    if (purchaseLines.length > 1) {
      const trNo = postVoucher(db, {
        date: header.InvoiceDate,
        vtype: 302,
        remarks: narr,
        lines: purchaseLines,
      });
      if (trNo) trNos.push(trNo);
    }

    if (effectiveCheque > 0.001 && header.ChequeNo) {
      createChequeRecord(db, {
        chequeNo: header.ChequeNo,
        chequeDate: header.ChequeDate || header.InvoiceDate,
        bankName: header.BankName,
        partyType: 'Supplier',
        partyId: header.SupplierID,
        partyName: supplier ? supplier.SupplierName : null,
        amount: effectiveCheque,
        direction: 'ISSUED',
        sourceType: 'PURCHASE_INVOICE',
        sourceId: PIHID,
        voucherRef: trNos[0] || null,
      });
    }

    // Compute and store DueDate
    if (!header.DueDate) {
      const creditDays = supplier ? Number(supplier.CreditDays || 0) : 0;
      if (creditDays > 0) {
        const d = new Date(header.InvoiceDate);
        d.setDate(d.getDate() + creditDays);
        db.prepare('UPDATE Purchase_Invoice_Headers SET DueDate=? WHERE PIHID=?')
          .run(d.toISOString().slice(0, 10), PIHID);
      }
    }

    db.prepare('UPDATE Purchase_Invoice_Headers SET Status=?,PostedAt=?,VoucherRef=? WHERE PIHID=?')
      .run('Posted', new Date().toISOString(), trNos[0] || null, PIHID);
    auditLog(db, 'Purchase_Invoice_Headers', PIHID, 'POST', { Status: 'Draft' }, { Status: 'Posted', VoucherRef: trNos[0] });
  })();
}

// =============================================================================
// PHASE 3  — BALANCE SHEET FIX: Remove double-counted inventory
// This is implemented as a flag/option to be applied in the main.js Balance Sheet
// handler. We expose a helper that checks if the GL has inventory account balances.
// =============================================================================

/**
 * Check whether GL already contains inventory account balances (meaning the
 * ERP posting path was used and we should NOT also add Stock_Movements value).
 */
function glHasInventoryBalance(db, invCA) {
  if (!invCA) return false;
  try {
    const tables = getTables(db);
    const invTable = tables.has('Inv') ? 'Inv' : tables.has('Inv1') ? 'Inv1' : null;
    if (!invTable) return false;

    const invCols = getCols(db, invTable);
    const hasDrAcct = invCols.includes('DrAccountCA');
    const hasCrAcct = invCols.includes('CrAccountCA');
    const hasDrAmt  = invCols.includes('DrAmount');
    const hasCrAmt  = invCols.includes('CrAmount');

    let where = 'Account_Party=? OR AC_Party2=?';
    const params = [invCA, invCA];

    if (hasDrAcct) {
      where += ' OR DrAccountCA=?';
      params.push(invCA);
    }
    if (hasCrAcct) {
      where += ' OR CrAccountCA=?';
      params.push(invCA);
    }

    // If the explicit Dr/Cr columns are present, include their amounts in the check;
    // otherwise the legacy Amount column is still the right signal.
    const amountSelect = hasDrAmt || hasCrAmt
      ? `COALESCE(SUM(COALESCE(DrAmount,0) + COALESCE(CrAmount,0)),0) AS total`
      : `COALESCE(SUM(Amount),0) AS total`;

    const row = db.prepare(`SELECT ${amountSelect} FROM "${invTable}" WHERE ${where}`).get(...params);
    return Number(row.total || 0) > 0.01;
  } catch(_) { return false; }
}

// =============================================================================
// PHASE 2  — ADDITIONAL IPC HANDLERS
// Registered via registerFlourMillHandlers(ipcMain, getDbPath, broadcast)
// =============================================================================

function registerFlourMillHandlers(ipcMain, getCurrentDbPath, broadcastChange) {

  function openDb(dbPath, writeable) {
    const dp = dbPath || getCurrentDbPath();
    if (!dp) throw new Error('No database open. Select a database first.');
    return writeable
      ? new Database(dp, { fileMustExist: true })
      : new Database(dp, { readonly: true, fileMustExist: true });
  }

  // ── Full flour-mill migration (Phase 2 schema) ────────────────────────────
  ipcMain.handle('erpMigrateFlourMill', (_e, dbPath) => {
    try {
      const dp = dbPath || getCurrentDbPath();
      const db = new Database(dp, { fileMustExist: true });
      db.pragma('journal_mode = WAL');
      db.transaction(() => {
        runErpMigrations(db);
        runPackagingMigrations(db);
        runFlourMillMigrations(db);
      })();
      db.close();
      return { success: true };
    } catch(e) { return { success: false, error: e.message }; }
  });

  // ── Unit Conversions CRUD ─────────────────────────────────────────────────
  ipcMain.handle('getUnitConversions', (_e, { dbPath } = {}) => {
    try {
      const db = openDb(dbPath, false);
      if (!getTables(db).has('Unit_Conversions')) { db.close(); return { success: true, data: [] }; }
      const data = db.prepare('SELECT * FROM Unit_Conversions WHERE Active=1 ORDER BY FromUnit, ToUnit').all();
      db.close();
      return { success: true, data };
    } catch(e) { return { success: false, error: e.message, data: [] }; }
  });

  ipcMain.handle('saveUnitConversion', (_e, { dbPath, conv }) => {
    try {
      const dp = dbPath || getCurrentDbPath();
      const db = new Database(dp, { fileMustExist: true });
      db.pragma('journal_mode = WAL');
      if (conv.ConvID) {
        db.prepare('UPDATE Unit_Conversions SET FromUnit=?,ToUnit=?,Factor=?,Notes=?,Active=? WHERE ConvID=?')
          .run(conv.FromUnit, conv.ToUnit, Number(conv.Factor||1), conv.Notes||null, conv.Active!==false?1:0, conv.ConvID);
      } else {
        const next = (db.prepare('SELECT COALESCE(MAX(ConvID),0)+1 AS n FROM Unit_Conversions').get()).n;
        conv.ConvID = next;
        db.prepare('INSERT OR REPLACE INTO Unit_Conversions (ConvID,FromUnit,ToUnit,Factor,Notes,Active) VALUES (?,?,?,?,?,1)')
          .run(next, conv.FromUnit, conv.ToUnit, Number(conv.Factor||1), conv.Notes||null);
      }
      db.close();
      broadcastChange(dp);
      return { success: true, ConvID: conv.ConvID };
    } catch(e) { return { success: false, error: e.message }; }
  });

  // ── Cheques CRUD ──────────────────────────────────────────────────────────
  ipcMain.handle('getCheques', (_e, { dbPath, status, direction, startDate, endDate } = {}) => {
    try {
      const db = openDb(dbPath, false);
      if (!getTables(db).has('Cheques')) { db.close(); return { success: true, data: [] }; }
      const where = ['1=1'], params = [];
      if (status)    { where.push('Status=?');       params.push(status); }
      if (direction) { where.push('Direction=?');    params.push(direction); }
      if (startDate) { where.push('ChequeDate>=?');  params.push(startDate); }
      if (endDate)   { where.push('ChequeDate<=?');  params.push(endDate); }
      const data = db.prepare(`SELECT * FROM Cheques WHERE ${where.join(' AND ')} ORDER BY ChequeDate DESC, ChequeID DESC`).all(...params);
      db.close();
      return { success: true, data };
    } catch(e) { return { success: false, error: e.message, data: [] }; }
  });

  ipcMain.handle('saveCheque', (_e, { dbPath, cheque }) => {
    try {
      const dp = dbPath || getCurrentDbPath();
      const db = new Database(dp, { fileMustExist: true });
      db.pragma('journal_mode = WAL');
      if (!getTables(db).has('Cheques')) runFlourMillMigrations(db);
      if (cheque.ChequeID) {
        db.prepare('UPDATE Cheques SET ChequeNo=?,ChequeDate=?,BankName=?,BankAccountNo=?,PartyType=?,PartyID=?,PartyName=?,Amount=?,Direction=?,Status=?,ClearedDate=?,Notes=? WHERE ChequeID=?')
          .run(cheque.ChequeNo, cheque.ChequeDate, cheque.BankName||null, cheque.BankAccountNo||null,
               cheque.PartyType||null, cheque.PartyID||null, cheque.PartyName||null,
               Number(cheque.Amount||0), cheque.Direction||'ISSUED', cheque.Status||'PENDING',
               cheque.ClearedDate||null, cheque.Notes||null, cheque.ChequeID);
      } else {
        const next = (db.prepare('SELECT COALESCE(MAX(ChequeID),0)+1 AS n FROM Cheques').get()).n;
        cheque.ChequeID = next;
        db.prepare('INSERT INTO Cheques (ChequeID,ChequeNo,ChequeDate,BankName,BankAccountNo,PartyType,PartyID,PartyName,Amount,Direction,Status,SourceType,SourceID,Notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
          .run(next, cheque.ChequeNo, cheque.ChequeDate, cheque.BankName||null, cheque.BankAccountNo||null,
               cheque.PartyType||null, cheque.PartyID||null, cheque.PartyName||null,
               Number(cheque.Amount||0), cheque.Direction||'ISSUED', cheque.Status||'PENDING',
               cheque.SourceType||null, cheque.SourceID||null, cheque.Notes||null);
      }
      db.close();
      broadcastChange(dp);
      return { success: true, ChequeID: cheque.ChequeID };
    } catch(e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('updateChequeStatus', (_e, { dbPath, ChequeID, status, clearedDate, notes }) => {
    try {
      const dp = dbPath || getCurrentDbPath();
      const db = new Database(dp, { fileMustExist: true });
      db.pragma('journal_mode = WAL');
      const old = db.prepare('SELECT * FROM Cheques WHERE ChequeID=?').get(ChequeID);
      if (!old) { db.close(); return { success: false, error: 'Cheque not found.' }; }
      db.prepare('UPDATE Cheques SET Status=?,ClearedDate=?,Notes=? WHERE ChequeID=?')
        .run(status, clearedDate||null, notes||old.Notes||null, ChequeID);

      // When a cheque clears, post GL entry: Dr Bank Clearing / Cr Bank (or adjust)
      if (status === 'CLEARED' && old.Status !== 'CLEARED') {
        const bankCA = getMapping(db, 'BANK');
        // Cheque clearing typically just confirms the bank statement; no new GL unless using clearing account
        // For now just update the status — the original voucher already posted Dr Inventory / Cr Bank
        auditLog(db, 'Cheques', ChequeID, 'STATUS_CHANGE', { Status: old.Status }, { Status: status });
      }

      db.close();
      broadcastChange(dp);
      return { success: true };
    } catch(e) { return { success: false, error: e.message }; }
  });

  // ── Opening Balances ──────────────────────────────────────────────────────
  ipcMain.handle('getOpeningBalances', (_e, { dbPath, fYearId } = {}) => {
    try {
      const db = openDb(dbPath, false);
      if (!getTables(db).has('Opening_Balances')) { db.close(); return { success: true, data: [] }; }
      const where = ['1=1'], params = [];
      if (fYearId) { where.push('FYearID=?'); params.push(Number(fYearId)); }
      const data = db.prepare(`
        SELECT OB.*, A.AC_TITLE1 AS AccountName, I.ItemName, W.WarehouseName
        FROM Opening_Balances OB
        LEFT JOIN AC A ON A.CA=OB.AccountCA
        LEFT JOIN Mill_Items I ON I.ItemID=OB.ItemID
        LEFT JOIN Warehouses W ON W.WarehouseID=OB.WarehouseID
        WHERE ${where.join(' AND ')} ORDER BY OB.OpeningType, OB.OBID
      `).all(...params);
      db.close();
      return { success: true, data };
    } catch(e) { return { success: false, error: e.message, data: [] }; }
  });

  ipcMain.handle('postOpeningBalance', (_e, { dbPath, ob }) => {
    try {
      const dp = dbPath || getCurrentDbPath();
      const db = new Database(dp, { fileMustExist: true });
      db.pragma('journal_mode = WAL');
      if (!getTables(db).has('Opening_Balances')) runFlourMillMigrations(db);

      let obid = null;
      db.transaction(() => {
        // Insert opening balance record
        const next = (db.prepare('SELECT COALESCE(MAX(OBID),0)+1 AS n FROM Opening_Balances').get()).n;
        obid = next;
        db.prepare(`INSERT INTO Opening_Balances (OBID,FYearID,AccountCA,PartyType,PartyID,ItemID,WarehouseID,OpeningType,DebitAmount,CreditAmount,Quantity,UnitCost,Narration)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(next, ob.FYearID||null, ob.AccountCA||null, ob.PartyType||null, ob.PartyID||null,
               ob.ItemID||null, ob.WarehouseID||null, ob.OpeningType||'Account',
               Number(ob.DebitAmount||0), Number(ob.CreditAmount||0),
               Number(ob.Quantity||0), Number(ob.UnitCost||0), ob.Narration||'Opening Balance');

        // Post GL voucher for account/party opening balances
        if (ob.AccountCA && (Number(ob.DebitAmount||0) > 0.001 || Number(ob.CreditAmount||0) > 0.001)) {
          const tables = getTables(db);
          const invTable = tables.has('Inv') ? 'Inv' : tables.has('Inv1') ? 'Inv1' : null;
          const tTable   = tables.has('T')   ? 'T'   : tables.has('T1')   ? 'T1'   : null;
          if (invTable && tTable) {
            const tCols   = getCols(db, tTable);
            const invCols = getCols(db, invTable);
            const hasVNo  = tCols.includes('V_No');
            const hasNarr = invCols.includes('Narration');
            const trNo = (db.prepare(`SELECT COALESCE(MAX(TR_No),0)+1 AS n FROM "${tTable}"`).get()).n;
            const amount = Number(ob.DebitAmount||0) > 0 ? Number(ob.DebitAmount) : -Number(ob.CreditAmount);
            db.prepare(`INSERT INTO "${tTable}" (TR_No,TR_Date,V_Typ${hasVNo?',V_No':''},Remarks,AccountParty,ACParty2,Amont,P) VALUES (?,?,?${hasVNo?',?':''},?,?,?,?,0)`)
              .run(...(hasVNo ? [trNo, ob.AsOfDate || new Date().toISOString().slice(0,10), 100, 0, ob.Narration||'Opening Balance', ob.AccountCA, 0, Math.abs(amount)]
                              : [trNo, ob.AsOfDate || new Date().toISOString().slice(0,10), 100, ob.Narration||'Opening Balance', ob.AccountCA, 0, Math.abs(amount)]));
            let sl = (db.prepare(`SELECT COALESCE(MAX(SL),0) AS m FROM "${invTable}"`).get().m || 0) + 1;
            db.prepare(`INSERT INTO "${invTable}" (TR_No,SL,VType,Account_Party,AC_Party2,Amount${hasNarr?',Narration':''}) VALUES (?,?,?,?,?,?${hasNarr?',?':''})`)
              .run(trNo, sl++, 100, ob.AccountCA, 0, amount, ...(hasNarr ? [ob.Narration||'Opening Balance'] : []));
            db.prepare('UPDATE Opening_Balances SET VoucherRef=?,PostedAt=datetime(\'now\') WHERE OBID=?').run(trNo, obid);
          }
        }

        // Post stock movement for inventory opening balances
        if (ob.OpeningType === 'Inventory' && ob.ItemID && Number(ob.Quantity||0) > 0.001) {
          insertStockMovement(db, {
            date: ob.AsOfDate || new Date().toISOString().slice(0,10),
            itemId: ob.ItemID,
            warehouseId: ob.WarehouseID || null,
            movType: 'OPENING',
            qty: Number(ob.Quantity),
            rate: Number(ob.UnitCost || 0),
            refNo: `OB-${obid}`,
            narration: ob.Narration || 'Opening Balance',
            sourceType: 'OPENING_BALANCE',
            sourceId: obid,
          });
        }
      })();

      db.close();
      broadcastChange(dp);
      return { success: true, OBID: obid };
    } catch(e) { return { success: false, error: e.message }; }
  });

  // ── Enhanced postPurchaseInvoice (replaces the existing handler) ──────────
  // We REMOVE the old one and register our new full implementation.
  try { ipcMain.removeHandler('postPurchaseInvoice'); } catch(_) {}
  ipcMain.handle('postPurchaseInvoice', (_e, { dbPath, PIHID, settlementAccountCA, paymentType }) => {
    try {
      const dp = dbPath || getCurrentDbPath();
      const db = new Database(dp, { fileMustExist: true });
      db.pragma('journal_mode = WAL');
      postPurchaseInvoiceFull(db, PIHID, broadcastChange, dp, settlementAccountCA, paymentType);
      db.close();
      broadcastChange(dp);
      return { success: true };
    } catch(e) { return { success: false, error: e.message }; }
  });

  // ── Enhanced postSalesInvoice (adds fiscal year validation + credit limit) ─
  try { ipcMain.removeHandler('postSalesInvoice'); } catch(_) {}
  ipcMain.handle('postSalesInvoice', (_e, { dbPath, SIHID, settlementAccountCA, paymentType }) => {
    try {
      const dp = dbPath || getCurrentDbPath();
      const db = new Database(dp, { fileMustExist: true });
      db.pragma('journal_mode = WAL');
      let trNo = null, cogsVoucherRef = null;
      db.transaction(() => {
        const header = db.prepare('SELECT * FROM Sales_Invoice_Headers WHERE SIHID=?').get(SIHID);
        if (!header) throw new Error(`Sales invoice #${SIHID} not found.`);
        if (header.Status === 'Posted')    throw new Error('Invoice already posted.');
        if (header.Status === 'Cancelled') throw new Error('Cannot post a cancelled invoice.');

        // Fiscal year validation
        const fyCheck = validateFiscalYear(db, header.InvoiceDate);
        if (!fyCheck.valid) throw new Error(fyCheck.error);

        const lines = db.prepare('SELECT * FROM Sales_Invoice_Lines WHERE SIHID=?').all(SIHID);
        if (!lines.length) throw new Error('Invoice has no lines.');

        const customer = getTables(db).has('Customers')
          ? db.prepare('SELECT * FROM Customers WHERE CustomerID=?').get(header.CustomerID) : null;

        // Credit limit check
        if (customer && Number(customer.CreditLimit || 0) > 0) {
          const enforcement = getCompanyConfig(db, 'CreditLimitEnforcement', 'warn');
          if (enforcement !== 'allow') {
            const bal = computePartyBalance(db, 'Customer', header.CustomerID, null);
            const projectedBalance = bal.balance + Number(header.NetTotal || 0);
            if (projectedBalance > Number(customer.CreditLimit)) {
              const msg = `Customer "${customer.CustomerName}" credit limit exceeded. Limit: ${Number(customer.CreditLimit).toLocaleString()}, Current Balance: ${bal.balance.toLocaleString()}, This Invoice: ${Number(header.NetTotal).toLocaleString()}.`;
              if (enforcement === 'block') throw new Error(msg);
              auditLog(db, 'Sales_Invoice_Headers', SIHID, 'CREDIT_LIMIT_WARN', null, { message: msg });
            }
          }
        }

        // Determine debit account: cash/bank for cash payment, customer A/R for credit
        const effectivePaymentType = header.PaymentType || paymentType || 'Credit';
        const customerAccountCA = (customer && customer.LinkedAccountCA)
          || getMapping(db, 'CUSTOMER_RECEIVABLE');
        // For cash/cheque: use the explicit settlement account if provided, else CASH/BANK mapping
        const resolvedCashBankCA = settlementAccountCA
          || (effectivePaymentType === 'Cheque' ? getMapping(db, 'BANK') : getMapping(db, 'CASH'));
        // The debit account: cash/bank for immediate payment, customer A/R for credit
        const debitAccountCA = (effectivePaymentType === 'Credit')
          ? customerAccountCA
          : (resolvedCashBankCA || customerAccountCA);

        const salesAccountCA = getMapping(db, 'SALES');
        const cogsAccountCA  = getMapping(db, 'COGS');
        const fgAccountCA    = getMapping(db, 'FINISHED_GOODS_INVENTORY');

        let totalCOGS = 0;
        for (const line of lines) {
          const whId = line.WarehouseID || header.WarehouseID || null;

          // Negative stock check
          const stockCheck = checkNegativeStock(db, line.ItemID, whId, Number(line.Quantity), header.InvoiceDate);
          if (!stockCheck.allowed) throw new Error(stockCheck.error);
          if (stockCheck.warn) auditLog(db, 'Sales_Invoice_Lines', line.SILID, 'NEGATIVE_STOCK_WARN', null, { message: stockCheck.message });

          const avgCost = getWeightedAvgCost(db, line.ItemID, whId, header.InvoiceDate);
          const currentStock = getItemStock(db, line.ItemID, whId, header.InvoiceDate);
          const effectiveAvgCost = currentStock > 0 ? avgCost : 0;
          const lineCOGS = effectiveAvgCost * Number(line.Quantity);
          totalCOGS += lineCOGS;

          const movId = insertStockMovement(db, {
            date: header.InvoiceDate, itemId: line.ItemID, warehouseId: whId,
            movType: 'OUT', qty: Number(line.Quantity), rate: effectiveAvgCost,
            refNo: header.InvoiceNo,
            narration: `Sales ${header.InvoiceNo}${customer ? ' – ' + customer.CustomerName : ''}`,
            sourceType: 'SALES_INVOICE', sourceId: SIHID,
          });
          db.prepare('UPDATE Sales_Invoice_Lines SET COGS=?,StockMovID=? WHERE SILID=?')
            .run(lineCOGS, movId, line.SILID);

          if (getTables(db).has('Inventory_Balances')) {
            const ib = db.prepare('SELECT * FROM Inventory_Balances WHERE ItemID=? AND (WarehouseID=? OR (WarehouseID IS NULL AND ? IS NULL))')
              .get(line.ItemID, whId, whId);
            if (ib) {
              const newQty = Number(ib.QtyBalance) - Number(line.Quantity);
              const newVal = Number(ib.ValueBalance) - lineCOGS;
              db.prepare('UPDATE Inventory_Balances SET QtyBalance=?,ValueBalance=?,AvgCost=?,UpdatedAt=datetime(\'now\') WHERE ItemID=? AND (WarehouseID=? OR (WarehouseID IS NULL AND ? IS NULL))')
                .run(newQty, Math.max(0, newVal), newQty > 0 ? Math.max(0, newVal) / newQty : 0, line.ItemID, whId, whId);
            }
          }
        }

        // Correct sales posting semantics:
        // - Credit: Dr Customer A/R, Cr Sales total
        // - Cash: Dr settlement account, Cr Sales total
        // - Mixed: Dr settlement received + Dr customer receivable, Cr Sales total
        const netSales = Number(header.NetTotal || 0);
        const cashReceived = Number(header.CashAmount || 0);
        const invoiceReceivable = effectivePaymentType === 'Credit' ? netSales
          : effectivePaymentType === 'Cash' ? 0
          : effectivePaymentType === 'Mixed' ? Math.max(netSales - cashReceived, 0)
          : 0;
        const immediateSettlement = effectivePaymentType === 'Cash' ? netSales
          : effectivePaymentType === 'Mixed' ? cashReceived
          : 0;

        const salesLines = [];
        if (effectivePaymentType === 'Credit' && customerAccountCA && salesAccountCA) {
          salesLines.push({ accountId: customerAccountCA, debit: netSales, credit: 0, narration: `Sales Invoice ${header.InvoiceNo}${customer ? ' – ' + customer.CustomerName : ''}` });
          salesLines.push({ accountId: salesAccountCA, debit: 0, credit: netSales, narration: `Sales Invoice ${header.InvoiceNo}${customer ? ' – ' + customer.CustomerName : ''}` });
        }

        if (effectivePaymentType === 'Cash' && resolvedCashBankCA && salesAccountCA) {
          salesLines.push({ accountId: resolvedCashBankCA, debit: netSales, credit: 0, narration: `Cash Sales ${header.InvoiceNo}${customer ? ' – ' + customer.CustomerName : ''}` });
          salesLines.push({ accountId: salesAccountCA, debit: 0, credit: netSales, narration: `Cash Sales ${header.InvoiceNo}${customer ? ' – ' + customer.CustomerName : ''}` });
        }

        if (effectivePaymentType === 'Mixed' && resolvedCashBankCA && salesAccountCA) {
          if (immediateSettlement > 0.001) {
            salesLines.push({ accountId: resolvedCashBankCA, debit: immediateSettlement, credit: 0, narration: `Cash receipt on Sales Invoice ${header.InvoiceNo}${customer ? ' – ' + customer.CustomerName : ''}` });
          }
          if (invoiceReceivable > 0.001 && customerAccountCA) {
            salesLines.push({ accountId: customerAccountCA, debit: invoiceReceivable, credit: 0, narration: `Unpaid balance on Sales Invoice ${header.InvoiceNo}${customer ? ' – ' + customer.CustomerName : ''}` });
          }
          salesLines.push({ accountId: salesAccountCA, debit: 0, credit: netSales, narration: `Sales Invoice ${header.InvoiceNo}${customer ? ' – ' + customer.CustomerName : ''}` });
        }

        if (salesLines.length > 1) {
          trNo = postVoucher(db, {
            date: header.InvoiceDate,
            vtype: 402,
            remarks: `Sales Invoice ${header.InvoiceNo}`,
            lines: salesLines,
          });
        }

        // COGS voucher
        if (cogsAccountCA && fgAccountCA && totalCOGS > 0.01) {
          cogsVoucherRef = postDoubleEntry(db, {
            date: header.InvoiceDate, vtype: 201,
            remarks: `COGS – Sales Invoice ${header.InvoiceNo}`,
            drAccountId: cogsAccountCA, crAccountId: fgAccountCA,
            amount: Math.round(totalCOGS * 100) / 100,
            narration: `COGS for Sales Invoice ${header.InvoiceNo}`,
          });
        }

        // Compute DueDate
        if (!header.DueDate && customer) {
          const creditDays = Number(customer.CreditDays || 0);
          if (creditDays > 0) {
            const d = new Date(header.InvoiceDate);
            d.setDate(d.getDate() + creditDays);
            db.prepare('UPDATE Sales_Invoice_Headers SET DueDate=? WHERE SIHID=?')
              .run(d.toISOString().slice(0, 10), SIHID);
          }
        }

        db.prepare('UPDATE Sales_Invoice_Headers SET Status=?,PostedAt=?,VoucherRef=?,COGSVoucherRef=? WHERE SIHID=?')
          .run('Posted', new Date().toISOString(), trNo, cogsVoucherRef, SIHID);
        auditLog(db, 'Sales_Invoice_Headers', SIHID, 'POST', { Status: 'Draft' }, { Status: 'Posted' });
      })();
      db.close();
      broadcastChange(dp);
      return { success: true, VoucherRef: trNo, COGSVoucherRef: cogsVoucherRef };
    } catch(e) { return { success: false, error: e.message }; }
  });

  // ── Enhanced postProductionBatch (adds fiscal year validation) ─────────────
  try { ipcMain.removeHandler('postProductionBatch'); } catch(_) {}
  ipcMain.handle('postProductionBatch', (_e, { dbPath, BatchID }) => {
    try {
      const dp = dbPath || getCurrentDbPath();
      const db = new Database(dp, { fileMustExist: true });
      db.pragma('journal_mode = WAL');
      let voucherRef = null;
      db.transaction(() => {
        const batch = db.prepare('SELECT * FROM Production_Batches WHERE BatchID=?').get(BatchID);
        if (!batch) throw new Error('Production batch not found.');
        if (batch.Status === 'Posted') throw new Error('Batch already posted.');

        // Fiscal year check
        const fyCheck = validateFiscalYear(db, batch.BatchDate);
        if (!fyCheck.valid) throw new Error(fyCheck.error);

        const lines = db.prepare('SELECT * FROM Production_Lines WHERE BatchID=?').all(BatchID);

        const inputConsumed = [];
        if (batch.InputItemID && Number(batch.InputQty) > 0) {
          const avgCost = getWeightedAvgCost(db, batch.InputItemID, batch.WarehouseID, null);
          // Negative stock check for raw material
          const stockCheck = checkNegativeStock(db, batch.InputItemID, batch.WarehouseID, Number(batch.InputQty), batch.BatchDate);
          if (!stockCheck.allowed) throw new Error(stockCheck.error);
          inputConsumed.push({ itemId: batch.InputItemID, warehouseId: batch.WarehouseID,
            qty: Number(batch.InputQty), avgCost, totalCost: avgCost * Number(batch.InputQty) });
        }
        const inputLines = lines.filter(l => l.LineType === 'INPUT');
        for (const il of inputLines) {
          const wh = il.WarehouseID || batch.WarehouseID;
          const avgCost = getWeightedAvgCost(db, il.ItemID, wh, null);
          const qty = Number(il.Quantity || 0);
          if (qty > 0) {
            const sc = checkNegativeStock(db, il.ItemID, wh, qty, batch.BatchDate);
            if (!sc.allowed) throw new Error(sc.error);
            inputConsumed.push({ itemId: il.ItemID, warehouseId: wh, qty, avgCost, totalCost: avgCost * qty });
          }
        }
        if (inputConsumed.length === 0) throw new Error('No input material defined for this batch.');

        const totalInputCost = inputConsumed.reduce((s, ic) => s + ic.totalCost, 0);
        for (const ic of inputConsumed) {
          insertStockMovement(db, {
            date: batch.BatchDate, itemId: ic.itemId, warehouseId: ic.warehouseId, movType: 'OUT',
            qty: ic.qty, rate: ic.avgCost, refNo: batch.BatchNo,
            narration: `Prod Batch ${batch.BatchNo} – Input`,
            sourceType: 'PRODUCTION_BATCH', sourceId: BatchID,
          });
          if (getTables(db).has('Inventory_Balances')) {
            const ib = db.prepare('SELECT * FROM Inventory_Balances WHERE ItemID=? AND (WarehouseID=? OR (WarehouseID IS NULL AND ? IS NULL))')
              .get(ic.itemId, ic.warehouseId, ic.warehouseId);
            if (ib) {
              const newQty = Number(ib.QtyBalance) - ic.qty;
              const newVal = Number(ib.ValueBalance) - ic.totalCost;
              db.prepare('UPDATE Inventory_Balances SET QtyBalance=?,ValueBalance=?,AvgCost=?,UpdatedAt=datetime(\'now\') WHERE ItemID=? AND (WarehouseID=? OR (WarehouseID IS NULL AND ? IS NULL))')
                .run(newQty, Math.max(0, newVal), newQty > 0 ? Math.max(0, newVal) / newQty : 0, ic.itemId, ic.warehouseId, ic.warehouseId);
            }
          }
        }

        const outputLines = lines.filter(l => (l.LineType === 'OUTPUT' || l.LineType === 'GAIN') && !l.IsLoss);
        const lossLines   = lines.filter(l => l.IsLoss || l.LineType === 'LOSS');
        const totalOutputQty = outputLines.reduce((s,l) => s + Number(l.Quantity||0), 0);
        if (totalOutputQty <= 0) throw new Error('No output quantities recorded.');
        const costingMethod = batch.CostingMethod || 'weight';

        for (const line of outputLines) {
          const lineQty = Number(line.Quantity || 0);
          if (lineQty <= 0) continue;
          let allocCost = costingMethod === 'pct' && Number(line.CostAllocPct||0) > 0
            ? (Number(line.CostAllocPct) / 100) * totalInputCost
            : (lineQty / totalOutputQty) * totalInputCost;
          const costPerUnit = lineQty > 0 ? allocCost / lineQty : 0;
          insertStockMovement(db, {
            date: batch.BatchDate, itemId: line.ItemID,
            warehouseId: line.WarehouseID || batch.WarehouseID, movType: 'IN',
            qty: lineQty, rate: costPerUnit, refNo: batch.BatchNo,
            narration: `Prod Batch ${batch.BatchNo} – Output`,
            sourceType: 'PRODUCTION_BATCH', sourceId: BatchID,
          });
          db.prepare('UPDATE Production_Lines SET AllocatedCost=?,CostPerUnit=? WHERE LineID=?')
            .run(allocCost, costPerUnit, line.LineID);
          if (getTables(db).has('Inventory_Balances')) {
            const wh = line.WarehouseID || batch.WarehouseID;
            const ib = db.prepare('SELECT * FROM Inventory_Balances WHERE ItemID=? AND (WarehouseID=? OR (WarehouseID IS NULL AND ? IS NULL))')
              .get(line.ItemID, wh, wh);
            if (ib) {
              const newQty = Number(ib.QtyBalance) + lineQty;
              const newVal = Number(ib.ValueBalance) + allocCost;
              db.prepare('UPDATE Inventory_Balances SET QtyBalance=?,ValueBalance=?,AvgCost=?,UpdatedAt=datetime(\'now\') WHERE ItemID=? AND (WarehouseID=? OR (WarehouseID IS NULL AND ? IS NULL))')
                .run(newQty, newVal, newQty > 0 ? newVal / newQty : 0, line.ItemID, wh, wh);
            } else {
              db.prepare('INSERT OR IGNORE INTO Inventory_Balances (ItemID,WarehouseID,QtyBalance,ValueBalance,AvgCost) VALUES (?,?,?,?,?)')
                .run(line.ItemID, wh, lineQty, allocCost, costPerUnit);
            }
          }
        }
        for (const line of lossLines) {
          const lineQty = Number(line.Quantity || 0);
          if (lineQty <= 0) continue;
          insertStockMovement(db, {
            date: batch.BatchDate, itemId: line.ItemID,
            warehouseId: line.WarehouseID || batch.WarehouseID, movType: 'IN',
            qty: lineQty, rate: 0, refNo: batch.BatchNo,
            narration: `Prod Batch ${batch.BatchNo} – Waste/Loss`,
            sourceType: 'PRODUCTION_BATCH', sourceId: BatchID,
          });
          db.prepare('UPDATE Production_Lines SET AllocatedCost=0,CostPerUnit=0 WHERE LineID=?').run(line.LineID);
        }

        const wipCA = getMapping(db, 'PRODUCTION_WIP');
        const rawCA = getMapping(db, 'RAW_MATERIAL_INVENTORY');
        const fgCA  = getMapping(db, 'FINISHED_GOODS_INVENTORY');
        if (rawCA && wipCA && totalInputCost > 0.01) {
          postDoubleEntry(db, {
            date: batch.BatchDate, vtype: 201, remarks: `Prod Input – ${batch.BatchNo}`,
            drAccountId: wipCA, crAccountId: rawCA,
            amount: Math.round(totalInputCost * 100) / 100,
            narration: `Production ${batch.BatchNo}: Raw Material Consumed`,
          });
        }
        if (fgCA && wipCA && totalInputCost > 0.01) {
          voucherRef = postDoubleEntry(db, {
            date: batch.BatchDate, vtype: 201, remarks: `Prod Output – ${batch.BatchNo}`,
            drAccountId: fgCA, crAccountId: wipCA,
            amount: Math.round(totalInputCost * 100) / 100,
            narration: `Production ${batch.BatchNo}: Finished Goods Produced`,
          });
        }

        const primaryInput = inputConsumed[0];
        db.prepare('UPDATE Production_Batches SET Status=?,PostedAt=?,InputCostPerUnit=?,TotalInputCost=?,VoucherRef=? WHERE BatchID=?')
          .run('Posted', new Date().toISOString(), primaryInput ? primaryInput.avgCost : 0, totalInputCost, voucherRef, BatchID);
        auditLog(db, 'Production_Batches', BatchID, 'POST', { Status: 'Draft' }, { Status: 'Posted', TotalInputCost: totalInputCost });
      })();
      db.close();
      broadcastChange(dp);
      return { success: true, VoucherRef: voucherRef };
    } catch(e) { return { success: false, error: e.message }; }
  });

  // ── Enhanced Customer Outstanding (fixed balance calculation) ─────────────
  try { ipcMain.removeHandler('getCustomerOutstanding'); } catch(_) {}
  ipcMain.handle('getCustomerOutstanding', (_e, { dbPath, asOfDate } = {}) => {
    try {
      const db = openDb(dbPath, false);
      if (!getTables(db).has('Customers')) { db.close(); return { success: true, data: [] }; }
      const customers = db.prepare("SELECT * FROM Customers WHERE Active=1 ORDER BY CustomerName").all();
      const result = [];
      for (const cust of customers) {
        const bal = computePartyBalance(db, 'Customer', cust.CustomerID, asOfDate);
        if (Math.abs(bal.balance) < 0.01 && Math.abs(bal.totalInvoiced) < 0.01 && Math.abs(bal.totalPaid) < 0.01) continue;

        // Get invoices for aging
        let invoices = [], payments = [];
        if (getTables(db).has('Sales_Invoice_Headers')) {
          const where = ["CustomerID=?", "Status='Posted'"];
          const params = [cust.CustomerID];
          if (asOfDate) { where.push('InvoiceDate<=?'); params.push(asOfDate); }
          invoices = db.prepare(`SELECT InvoiceNo, InvoiceDate, NetTotal, DueDate FROM Sales_Invoice_Headers WHERE ${where.join(' AND ')}`).all(...params);
        }
        if (getTables(db).has('Party_Payments')) {
          const where2 = ["PartyType='Customer'","PartyID=?","Status='Posted'"];
          const params2 = [cust.CustomerID];
          if (asOfDate) { where2.push('PaymentDate<=?'); params2.push(asOfDate); }
          payments = db.prepare(`SELECT Amount FROM Party_Payments WHERE ${where2.join(' AND ')}`).all(...params2);
        }
        const aging = computeAging(invoices, payments, asOfDate);
        result.push({
          CustomerID: cust.CustomerID, CustomerName: cust.CustomerName,
          Contact: cust.Contact || cust.Mobile,
          CreditLimit: cust.CreditLimit || 0,
          totalInvoiced: bal.totalInvoiced, totalPaid: bal.totalPaid,
          balance: bal.balance, glBased: bal.glBased,
          aging,
        });
      }
      db.close();
      return { success: true, data: result };
    } catch(e) { return { success: false, error: e.message, data: [] }; }
  });

  // ── Enhanced Supplier Outstanding ─────────────────────────────────────────
  try { ipcMain.removeHandler('getSupplierOutstanding'); } catch(_) {}
  ipcMain.handle('getSupplierOutstanding', (_e, { dbPath, asOfDate } = {}) => {
    try {
      const db = openDb(dbPath, false);
      if (!getTables(db).has('Suppliers')) { db.close(); return { success: true, data: [] }; }
      const suppliers = db.prepare("SELECT * FROM Suppliers WHERE Active=1 ORDER BY SupplierName").all();
      const result = [];
      for (const supp of suppliers) {
        const bal = computePartyBalance(db, 'Supplier', supp.SupplierID, asOfDate);
        if (Math.abs(bal.balance) < 0.01 && Math.abs(bal.totalInvoiced) < 0.01 && Math.abs(bal.totalPaid) < 0.01) continue;

        let invoices = [], payments = [];
        if (getTables(db).has('Purchase_Invoice_Headers')) {
          const where = ["SupplierID=?", "Status='Posted'"];
          const params = [supp.SupplierID];
          if (asOfDate) { where.push('InvoiceDate<=?'); params.push(asOfDate); }
          invoices = db.prepare(`SELECT InvoiceNo, InvoiceDate, NetTotal, DueDate FROM Purchase_Invoice_Headers WHERE ${where.join(' AND ')}`).all(...params);
        }
        if (getTables(db).has('Party_Payments')) {
          const where2 = ["PartyType='Supplier'","PartyID=?","Status='Posted'"];
          const params2 = [supp.SupplierID];
          if (asOfDate) { where2.push('PaymentDate<=?'); params2.push(asOfDate); }
          payments = db.prepare(`SELECT Amount FROM Party_Payments WHERE ${where2.join(' AND ')}`).all(...params2);
        }
        const aging = computeAging(invoices, payments, asOfDate);
        result.push({
          SupplierID: supp.SupplierID, SupplierName: supp.SupplierName,
          Contact: supp.Contact || supp.Mobile,
          totalInvoiced: bal.totalInvoiced, totalPaid: bal.totalPaid,
          balance: bal.balance, glBased: bal.glBased,
          aging,
        });
      }
      db.close();
      return { success: true, data: result };
    } catch(e) { return { success: false, error: e.message, data: [] }; }
  });

  // ── Aging Report (standalone — for reporting hub) ─────────────────────────
  ipcMain.handle('getAgingReport', (_e, { dbPath, partyType, asOfDate } = {}) => {
    try {
      const db = openDb(dbPath, false);
      const isCustomer = partyType !== 'Supplier';
      const partyTable = isCustomer ? 'Customers' : 'Suppliers';
      const invoiceTable = isCustomer ? 'Sales_Invoice_Headers' : 'Purchase_Invoice_Headers';
      const partyIdCol = isCustomer ? 'CustomerID' : 'SupplierID';
      const partyNameCol = isCustomer ? 'CustomerName' : 'SupplierName';
      if (!getTables(db).has(partyTable)) { db.close(); return { success: true, data: [], summary: {} }; }

      const parties = db.prepare(`SELECT * FROM ${partyTable} WHERE Active=1 ORDER BY ${partyNameCol}`).all();
      const result = [];
      const summary = { current: 0, days1_30: 0, days31_60: 0, days61_90: 0, days91_120: 0, days120plus: 0, total: 0 };

      for (const party of parties) {
        if (!isCustomer && party.IsOneTime) continue;
        let invoices = [], payments = [];
        if (getTables(db).has(invoiceTable)) {
          const params = [party[partyIdCol]];
          const dateClause = asOfDate ? 'AND InvoiceDate<=?' : '';
          if (asOfDate) params.push(asOfDate);
          invoices = db.prepare(`SELECT InvoiceNo, InvoiceDate, NetTotal, DueDate FROM ${invoiceTable} WHERE ${partyIdCol}=? AND Status='Posted' ${dateClause}`).all(...params);
        }
        if (getTables(db).has('Party_Payments')) {
          const pType = isCustomer ? 'Customer' : 'Supplier';
          const params2 = [pType, party[partyIdCol]];
          const dateClause2 = asOfDate ? 'AND PaymentDate<=?' : '';
          if (asOfDate) params2.push(asOfDate);
          payments = db.prepare(`SELECT Amount FROM Party_Payments WHERE PartyType=? AND PartyID=? AND Status='Posted' ${dateClause2}`).all(...params2);
        }
        const aging = computeAging(invoices, payments, asOfDate);
        if (aging.total < 0.01) continue;
        result.push({ PartyID: party[partyIdCol], PartyName: party[partyNameCol], ...aging });
        Object.keys(summary).forEach(k => { summary[k] = (summary[k] || 0) + (aging[k] || 0); });
      }
      db.close();
      return { success: true, data: result, summary };
    } catch(e) { return { success: false, error: e.message, data: [], summary: {} }; }
  });

  // ── Company Config (read/write AllowNegativeStock etc.) ───────────────────
  ipcMain.handle('getCompanyConfig', (_e, { dbPath } = {}) => {
    try {
      const db = openDb(dbPath, false);
      if (!getTables(db).has('Company_Info')) { db.close(); return { success: true, data: {} }; }
      const cols = getCols(db, 'Company_Info');
      const row = db.prepare('SELECT * FROM Company_Info LIMIT 1').get();
      db.close();
      return { success: true, data: row || {} };
    } catch(e) { return { success: false, error: e.message, data: {} }; }
  });

  ipcMain.handle('saveCompanyConfig', (_e, { dbPath, config }) => {
    try {
      const dp = dbPath || getCurrentDbPath();
      const db = new Database(dp, { fileMustExist: true });
      db.pragma('journal_mode = WAL');
      if (!getTables(db).has('Company_Info')) { db.close(); return { success: false, error: 'Company_Info table not found.' }; }
      runFlourMillMigrations(db); // ensure new columns exist
      const cols = getCols(db, 'Company_Info');
      const allowed = ['CompanyName','UCompanyName','Address','PhoneNos',
                       'FY_StartDate','FY_EndDate','UserName',
                       'mill_type','AllowNegativeStock','InventoryValuationMethod',
                       'CurrencyPrecision','WeightPrecision','AutoSyncGDrive','CreditLimitEnforcement'];
      const updates = allowed.filter(k => k in config && cols.includes(k));
      if (!updates.length) { db.close(); return { success: true }; }
      const setParts = updates.map(k => `${k}=?`).join(',');
      const vals = updates.map(k => config[k]);
      db.prepare(`UPDATE Company_Info SET ${setParts}`).run(...vals);
      db.close();
      broadcastChange(dp);
      return { success: true };
    } catch(e) { return { success: false, error: e.message }; }
  });

  // ── Inventory Valuation Rebuild (admin utility) ───────────────────────────
  ipcMain.handle('rebuildInventoryValuation', (_e, { dbPath } = {}) => {
    try {
      const dp = dbPath || getCurrentDbPath();
      const db = new Database(dp, { fileMustExist: true });
      db.pragma('journal_mode = WAL');
      if (!getTables(db).has('Inventory_Balances') || !getTables(db).has('Stock_Movements')) {
        db.close(); return { success: false, error: 'Required tables not found.' };
      }
      db.transaction(() => {
        db.prepare('DELETE FROM Inventory_Balances').run();
        const movements = db.prepare('SELECT * FROM Stock_Movements ORDER BY MovementDate, MovementID').all();
        const balances = new Map(); // key: `itemId:warehouseId`
        for (const m of movements) {
          const key = `${m.ItemID}:${m.WarehouseID || 'null'}`;
          if (!balances.has(key)) balances.set(key, { itemId: m.ItemID, warehouseId: m.WarehouseID || null, qty: 0, val: 0 });
          const b = balances.get(key);
          const isIn = (m.MovementType === 'IN' || m.MovementType === 'OPENING');
          b.qty += (isIn ? 1 : -1) * Number(m.Quantity || 0);
          b.val += (isIn ? 1 : -1) * Number(m.Quantity || 0) * Number(m.Rate || 0);
        }
        for (const [, b] of balances) {
          const avgCost = b.qty > 0 ? b.val / b.qty : 0;
          db.prepare('INSERT OR REPLACE INTO Inventory_Balances (ItemID,WarehouseID,QtyBalance,ValueBalance,AvgCost,UpdatedAt) VALUES (?,?,?,?,?,datetime(\'now\'))')
            .run(b.itemId, b.warehouseId, b.qty, Math.max(0, b.val), Math.max(0, avgCost));
        }
      })();
      const count = db.prepare('SELECT COUNT(*) AS c FROM Inventory_Balances').get().c;
      db.close();
      return { success: true, itemsRebuilt: count };
    } catch(e) { return { success: false, error: e.message }; }
  });

  // ── Period-End Validation (diagnostic check) ──────────────────────────────
  ipcMain.handle('runPeriodEndCheck', (_e, { dbPath } = {}) => {
    try {
      const db = openDb(dbPath, false);
      const issues = [];
      const warnings = [];

      // 1. Check for unbalanced vouchers in Inv table
      try {
        const tables = getTables(db);
        const invTable = tables.has('Inv') ? 'Inv' : tables.has('Inv1') ? 'Inv1' : null;
        const tTable   = tables.has('T') ? 'T' : tables.has('T1') ? 'T1' : null;
        if (invTable && tTable) {
          // Each TR_No in Inv should have equal Dr/Cr when processed through VT rules
          // Simplified check: sum all positive Amounts vs negative by TR_No
          const trNos = db.prepare(`SELECT DISTINCT TR_No FROM "${invTable}"`).all().map(r => r.TR_No);
          let unbalancedCount = 0;
          for (const trNo of trNos.slice(0, 1000)) { // limit to 1000 for performance
            const rows = db.prepare(`SELECT Account_Party, AC_Party2, Amount FROM "${invTable}" WHERE TR_No=?`).all(trNo);
            // Very simplified: check if the T.Amont = sum of Inv.Amount for non-opening
            const total = rows.reduce((s,r) => s + Number(r.Amount||0), 0);
            // More: all Amounts should be positive (each leg is separate)
          }
        }
      } catch(_) {}

      // 2. Check for negative stock
      if (getTables(db).has('Stock_Movements') && getTables(db).has('Mill_Items')) {
        try {
          const items = db.prepare('SELECT ItemID, ItemName FROM Mill_Items WHERE Active=1').all();
          for (const item of items) {
            const rows = db.prepare('SELECT MovementType, Quantity FROM Stock_Movements WHERE ItemID=?').all(item.ItemID);
            let qty = 0;
            for (const r of rows) qty += (r.MovementType === 'IN' || r.MovementType === 'OPENING') ? r.Quantity : -r.Quantity;
            if (qty < -0.001) issues.push({ type: 'NEGATIVE_STOCK', message: `${item.ItemName} has negative stock: ${qty.toFixed(3)}` });
          }
        } catch(_) {}
      }

      // 3. Check for missing account mappings
      if (getTables(db).has('Account_Mappings')) {
        const criticalMappings = ['SALES','COGS','CUSTOMER_RECEIVABLE','SUPPLIER_PAYABLE','RAW_MATERIAL_INVENTORY','FINISHED_GOODS_INVENTORY'];
        for (const purpose of criticalMappings) {
          const mapping = db.prepare('SELECT AccountCA FROM Account_Mappings WHERE Purpose=?').get(purpose);
          if (!mapping || !mapping.AccountCA) {
            warnings.push({ type: 'MISSING_MAPPING', message: `Account mapping not set: ${purpose}` });
          }
        }
      }

      // 4. Check for customers without linked accounts
      if (getTables(db).has('Customers')) {
        const unlinked = db.prepare("SELECT COUNT(*) AS c FROM Customers WHERE Active=1 AND LinkedAccountCA IS NULL").get();
        if (unlinked.c > 0) warnings.push({ type: 'MISSING_PARTY_ACCOUNT', message: `${unlinked.c} customer(s) have no linked GL account.` });
      }

      // 5. Check for suppliers without linked accounts
      if (getTables(db).has('Suppliers')) {
        const unlinked = db.prepare("SELECT COUNT(*) AS c FROM Suppliers WHERE Active=1 AND LinkedAccountCA IS NULL AND IsOneTime=0").get();
        if (unlinked && unlinked.c > 0) warnings.push({ type: 'MISSING_PARTY_ACCOUNT', message: `${unlinked.c} supplier(s) have no linked GL account.` });
      }

      // 6. Check for posted invoices with no voucher ref
      if (getTables(db).has('Purchase_Invoice_Headers')) {
        const noVoucher = db.prepare("SELECT COUNT(*) AS c FROM Purchase_Invoice_Headers WHERE Status='Posted' AND VoucherRef IS NULL").get();
        if (noVoucher.c > 0) issues.push({ type: 'MISSING_VOUCHER', message: `${noVoucher.c} posted purchase invoice(s) have no GL voucher.` });
      }
      if (getTables(db).has('Sales_Invoice_Headers')) {
        const noVoucher = db.prepare("SELECT COUNT(*) AS c FROM Sales_Invoice_Headers WHERE Status='Posted' AND VoucherRef IS NULL").get();
        if (noVoucher.c > 0) issues.push({ type: 'MISSING_VOUCHER', message: `${noVoucher.c} posted sales invoice(s) have no GL voucher.` });
      }

      db.close();
      return { success: true, issues, warnings, clean: issues.length === 0 && warnings.length === 0 };
    } catch(e) { return { success: false, error: e.message }; }
  });

  // ── Enhanced GDrive Sync: auto-sync on posting + backup log ──────────────
  ipcMain.handle('syncToGDriveWithLog', (_e, { dbPath } = {}) => {
    try {
      const srcPath = dbPath || getCurrentDbPath();
      if (!srcPath) throw new Error('No database is currently open.');

      const fs   = require('fs');
      const path = require('path');
      const os   = require('os');

      // Detect GDrive path (same logic as main.js)
      const home = os.homedir();
      let drivePath = null;
      const cloudStorage = path.join(home, 'Library', 'CloudStorage');
      if (fs.existsSync(cloudStorage)) {
        try {
          const entries = fs.readdirSync(cloudStorage);
          for (const entry of entries) {
            if (entry.startsWith('GoogleDrive-')) {
              const mp = path.join(cloudStorage, entry, 'My Drive');
              if (fs.existsSync(mp)) { drivePath = mp; break; }
            }
          }
        } catch(_) {}
      }
      if (!drivePath) {
        for (const p of [path.join(home,'Google Drive','My Drive'), path.join(home,'Google Drive')]) {
          if (fs.existsSync(p)) { drivePath = p; break; }
        }
      }
      if (!drivePath) throw new Error('Google Drive folder not detected.');

      const eraDir = path.join(drivePath, 'ERA Accounting');
      if (!fs.existsSync(eraDir)) fs.mkdirSync(eraDir, { recursive: true });
      const filename = path.basename(srcPath);
      const destPath = path.join(eraDir, filename);
      fs.copyFileSync(srcPath, destPath);
      for (const ext of ['-wal', '-shm']) {
        const src = srcPath + ext;
        if (fs.existsSync(src)) { try { fs.copyFileSync(src, destPath + ext); } catch(_) {} }
      }
      const stat = fs.statSync(destPath);

      // Log the backup
      try {
        const db = new Database(srcPath, { fileMustExist: true });
        db.pragma('journal_mode = WAL');
        if (getTables(db).has('Backup_Log')) {
          db.prepare('INSERT INTO Backup_Log (Direction,DestPath,FileSize,Status) VALUES (?,?,?,?)')
            .run('TO_DRIVE', destPath, stat.size, 'OK');
        }
        db.close();
      } catch(_) {}

      return { success: true, destPath, fileSize: stat.size };
    } catch(e) {
      // Log failure too
      try {
        const dp = dbPath || getCurrentDbPath();
        if (dp) {
          const db = new Database(dp, { fileMustExist: true });
          db.pragma('journal_mode = WAL');
          if (getTables(db).has('Backup_Log')) {
            db.prepare('INSERT INTO Backup_Log (Direction,Status,Notes) VALUES (?,?,?)').run('TO_DRIVE', 'ERROR', e.message);
          }
          db.close();
        }
      } catch(_) {}
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('getBackupLog', (_e, { dbPath, limit } = {}) => {
    try {
      const db = openDb(dbPath, false);
      if (!getTables(db).has('Backup_Log')) { db.close(); return { success: true, data: [] }; }
      const data = db.prepare('SELECT * FROM Backup_Log ORDER BY LogID DESC LIMIT ?').all(limit || 50);
      db.close();
      return { success: true, data };
    } catch(e) { return { success: false, error: e.message, data: [] }; }
  });

  // ── Monthly GL Summary for Dashboard Chart ─────────────────────────────────
  ipcMain.handle('getMonthlyGLSummary', (_e, { dbPath, year } = {}) => {
    try {
      const db = openDb(dbPath, false);
      const tables = getTables(db);
      const invTable = tables.has('Inv') ? 'Inv' : tables.has('Inv1') ? 'Inv1' : null;
      const tTable   = tables.has('T')   ? 'T'   : tables.has('T1')   ? 'T1'   : null;
      if (!invTable || !tTable) { db.close(); return { success: true, data: [] }; }

      const targetYear = year || new Date().getFullYear();
      const startDate = `${targetYear}-01-01`;
      const endDate   = `${targetYear}-12-31`;

      // Get income accounts (headId=4) CA list
      let incomeCAs = [], expenseCAs = [];
      const { acTable } = (() => {
        const t = getTables(db);
        const at = t.has('AC') ? 'AC' : t.has('Ac') ? 'Ac' : null;
        return { acTable: at };
      })();

      if (acTable && tables.has('tblSubAcc') && tables.has('tblAccHead')) {
        try {
          incomeCAs  = db.prepare(`SELECT AC.CA FROM "${acTable}" AC JOIN tblSubAcc S ON S.SubAccID=AC.SubAccID JOIN tblAccHead H ON H.AccountID=S.AccountID WHERE H.AccountID=4`).all().map(r => r.CA);
          expenseCAs = db.prepare(`SELECT AC.CA FROM "${acTable}" AC JOIN tblSubAcc S ON S.SubAccID=AC.SubAccID JOIN tblAccHead H ON H.AccountID=S.AccountID WHERE H.AccountID=5`).all().map(r => r.CA);
        } catch(_) {}
      }

      const months = [];
      for (let m = 1; m <= 12; m++) {
        const mStr    = String(m).padStart(2,'0');
        const mStart  = `${targetYear}-${mStr}-01`;
        const nextM   = m === 12 ? `${targetYear+1}-01-01` : `${targetYear}-${String(m+1).padStart(2,'0')}-01`;
        const mEnd    = new Date(new Date(nextM) - 1).toISOString().slice(0,10);

        let income = 0, expense = 0;
        if (incomeCAs.length > 0) {
          const ph = incomeCAs.map(() => '?').join(',');
          const r = db.prepare(`SELECT COALESCE(SUM(I.Amount),0) AS v FROM "${invTable}" I JOIN "${tTable}" T ON I.TR_No=T.TR_No WHERE I.Account_Party IN (${ph}) AND T.TR_Date>=? AND T.TR_Date<=?`).get(...incomeCAs, mStart, mEnd);
          income = Number(r.v || 0);
        }
        if (expenseCAs.length > 0) {
          const ph = expenseCAs.map(() => '?').join(',');
          const r = db.prepare(`SELECT COALESCE(SUM(I.Amount),0) AS v FROM "${invTable}" I JOIN "${tTable}" T ON I.TR_No=T.TR_No WHERE I.Account_Party IN (${ph}) AND T.TR_Date>=? AND T.TR_Date<=?`).get(...expenseCAs, mStart, mEnd);
          expense = Number(r.v || 0);
        }
        // Fallback: use Sales_Invoice_Headers if no GL income accounts
        if (income === 0 && tables.has('Sales_Invoice_Headers')) {
          const r = db.prepare(`SELECT COALESCE(SUM(NetTotal),0) AS v FROM Sales_Invoice_Headers WHERE Status='Posted' AND InvoiceDate>=? AND InvoiceDate<=?`).get(mStart, mEnd);
          income = Number(r.v || 0);
        }
        if (expense === 0 && tables.has('Purchase_Invoice_Headers')) {
          const r = db.prepare(`SELECT COALESCE(SUM(NetTotal),0) AS v FROM Purchase_Invoice_Headers WHERE Status='Posted' AND InvoiceDate>=? AND InvoiceDate<=?`).get(mStart, mEnd);
          expense = Number(r.v || 0);
        }
        months.push({ month: m, monthName: new Date(targetYear, m-1, 1).toLocaleString('en-US',{month:'short'}), income, expense, profit: income - expense });
      }
      db.close();
      return { success: true, data: months, year: targetYear };
    } catch(e) { return { success: false, error: e.message, data: [] }; }
  });

  // ── Reconciliation Report (GL vs Inventory) ───────────────────────────────
  ipcMain.handle('getReconciliationReport', (_e, { dbPath, asOfDate } = {}) => {
    try {
      const db = openDb(dbPath, false);
      const result = { inventory: {}, arAp: {}, issues: [] };

      // Inventory: GL account balance vs Stock_Movements computed value
      const invPurposes = ['RAW_MATERIAL_INVENTORY','FINISHED_GOODS_INVENTORY','BYPRODUCT_INVENTORY'];
      for (const purpose of invPurposes) {
        const ca = getMapping(db, purpose);
        if (!ca) continue;
        // GL balance for this account
        const tables = getTables(db);
        const invTable = tables.has('Inv') ? 'Inv' : tables.has('Inv1') ? 'Inv1' : null;
        const tTable   = tables.has('T')   ? 'T'   : tables.has('T1')   ? 'T1'   : null;
        let glBalance = 0;
        if (invTable && tTable) {
          try {
            const params = [ca, ca, ...(asOfDate ? [asOfDate, asOfDate] : [])];
            const rows = db.prepare(`SELECT Account_Party, AC_Party2, Amount FROM "${invTable}" I LEFT JOIN "${tTable}" T ON I.TR_No=T.TR_No WHERE (Account_Party=? OR AC_Party2=?) ${asOfDate ? 'AND (T.TR_Date IS NULL OR T.TR_Date<=?)' : ''}`).all(...(asOfDate ? [ca, ca, asOfDate] : [ca, ca]));
            for (const r of rows) {
              if (r.Account_Party === ca) glBalance += Number(r.Amount||0);
              else if (r.AC_Party2 === ca) glBalance -= Number(r.Amount||0);
            }
          } catch(_) {}
        }
        result.inventory[purpose] = { glBalance, stockMovementsValue: 0, difference: 0 };
      }

      // Stock movements total value
      if (getTables(db).has('Stock_Movements')) {
        const params = asOfDate ? [asOfDate] : [];
        const rows = db.prepare(`SELECT MovementType, Quantity, COALESCE(Rate,0) AS Rate FROM Stock_Movements ${asOfDate ? 'WHERE MovementDate<=?' : ''}`).all(...params);
        let stockVal = 0;
        for (const r of rows) stockVal += ((r.MovementType==='IN'||r.MovementType==='OPENING')?1:-1) * r.Quantity * r.Rate;
        // Distribute across inventory purposes (if only one mapped, assign all)
        const mappedPurposes = invPurposes.filter(p => result.inventory[p]);
        if (mappedPurposes.length === 1) {
          const p = mappedPurposes[0];
          result.inventory[p].stockMovementsValue = Math.max(0, stockVal);
          result.inventory[p].difference = result.inventory[p].glBalance - result.inventory[p].stockMovementsValue;
          if (Math.abs(result.inventory[p].difference) > 0.01) {
            result.issues.push({ type: 'INV_MISMATCH', purpose: p, message: `GL inventory balance (${result.inventory[p].glBalance.toFixed(2)}) differs from Stock Movements value (${result.inventory[p].stockMovementsValue.toFixed(2)}) by ${result.inventory[p].difference.toFixed(2)}.` });
          }
        }
      }

      // AR: GL CUSTOMER_RECEIVABLE balance vs Invoice/Payment subledger
      const arCA = getMapping(db, 'CUSTOMER_RECEIVABLE');
      if (arCA) {
        // Total outstanding from subledger
        let subledgerAR = 0;
        if (getTables(db).has('Customers')) {
          const customers = db.prepare('SELECT CustomerID FROM Customers WHERE Active=1').all();
          for (const c of customers) {
            const bal = computePartyBalance(db, 'Customer', c.CustomerID, asOfDate);
            subledgerAR += bal.balance;
          }
        }
        result.arAp.AR = { purpose: 'CUSTOMER_RECEIVABLE', subledgerBalance: subledgerAR };
      }

      db.close();
      return { success: true, data: result };
    } catch(e) { return { success: false, error: e.message }; }
  });
}

module.exports.runFlourMillMigrations   = runFlourMillMigrations;
module.exports.registerFlourMillHandlers = registerFlourMillHandlers;
module.exports.validateFiscalYear       = validateFiscalYear;
module.exports.computePartyBalance      = computePartyBalance;
module.exports.glHasInventoryBalance    = glHasInventoryBalance;
