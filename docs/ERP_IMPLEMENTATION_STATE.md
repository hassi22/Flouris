# Flouris ERP - Implementation State Tracker

## Phase 1: Inspect & Document
- [x] Debug Packaging Sizes UI Bug (`Active=1` ambiguous column fixed in `erpHandlers.js`)
- [x] Fix `dlopen error better sqlite` (`better-sqlite3` native module rebuilt via `electron-rebuild` with bypassed sandbox restrictions)
- [x] Map Current Schema (Identified SQLite tables, accounting tables `T`/`Inv`, and ERP tables)
- [x] Document Architecture (`docs/ERP_ARCHITECTURE.md`)
- [x] Document Proposed Changes & Migrations

## Phase 2: Schema & Core Engine
- [x] Implement `Configurable Account Mapping` rules engine.
- [x] Refactor `postVoucher` to explicitly use `DrAmount`, `CrAmount`, `DrAccountCA`, `CrAccountCA`.
- [x] Validate `SUM(DEBIT) = SUM(CREDIT)` strictly.
- [x] Test migration logic.

## Phase 3: Party Master & Inventory Ledger
- [x] Implement bi-directional sync for Customer/Supplier account creation based on Roles ('sales' / 'purchase').
- [x] Implement Weighted-Average Costing in `Stock_Movements`. (Already in `getWeightedAvgCost`, used in `postSalesInvoice`)
- [x] Inventory deduction on post: `postSalesInvoice` inserts `OUT` rows in `Stock_Movements` + updates `Inventory_Balances` cache.
- [x] Fixed `getStockMovements` summary to treat `OPENING` type as IN (balance was undercounting opening stock)

## Phase 4: Production & Cost Allocation
- [ ] Update Recipe/BOM handling.
- [ ] Implement joint product costing allocation dynamically.

## Phase 5: Reconciliations & Final Polish
- [x] Confirmed UI for sales invoices properly deducts inventory via Post button (`handlePost` → `postSalesInvoice`).
- [ ] Clean up redundant code and legacy voucher styles.
- [ ] Final manual tests.
