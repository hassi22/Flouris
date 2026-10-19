# Flouris ERP Architecture & Schema Documentation

## 1. Current Schema Map

The ERP uses SQLite for local storage, often split between `H.sqlite` and `SH.sqlite` (or dynamic year-based databases). The core entities are linked via IPC handlers in `apps/desktop/erpHandlers.js`.

### Core Entities
*   **Customers**: `CustomerID`, `CustomerCode`, `CustomerName`, `LinkedAccountCA`, etc.
*   **Suppliers**: `SupplierID`, `SupplierCode`, `SupplierName`, `LinkedAccountCA`, etc.
*   **Mill_Items**: Extended with `PurchaseAccountCA`, `InventoryAccountCA`, `SalesAccountCA`, `COGSAccountCA`, `PackagingUnit`, `PackagingKg`.
*   **Cost_Centers**: `CCID`, `CCCode`, `CCName`.
*   **Account_Mappings**: `MappingID`, `Purpose`, `AccountCA`.

### Transactional & Accounting
*   **T / T1 (Transaction Headers)**: `TR_No`, `TR_Date`, `V_Typ`, `Remarks`, `AccountParty`, `ACParty2`, `Amont`. (Legacy schema style)
*   **Inv / Inv1 (Transaction Lines)**: `TR_No`, `SL`, `VType`, `Account_Party`, `AC_Party2`, `Amount`, `Narration`.
*   **Purchase_Invoice_Headers** / **Purchase_Invoice_Lines**: Sales and purchases, linking to `VoucherRef` (TR_No).
*   **Sales_Invoice_Headers** / **Sales_Invoice_Lines**: Sales details, extending down to `VoucherRef` and `COGSVoucherRef`.

### Inventory & Production
*   **Stock_Movements**: `MovementID`, `MovementDate`, `ItemID`, `WarehouseID`, `MovementType` ('IN', 'OUT', 'OPENING'), `Quantity`, `Rate`, `SourceType`, `SourceID`.
*   **Inventory_Balances**: `ItemID`, `WarehouseID`, `QtyBalance`, `ValueBalance`, `AvgCost`.
*   **Recipes**, **Recipe_Inputs**, **Recipe_Outputs**: Bills of Materials logic for manufacturing.
*   **Production_Batches**, **Production_Lines**: WIP production flows linking inputs/outputs and assigning costs.

---

## 2. Identified Problems

1.  **Inventory Deductions (Sales/Purchases):** As per the user issue, sales invoices aren't reducing inventory automatically. Sales invoice handler probably isn't writing `OUT` entries in `Stock_Movements`.
2.  **Customer/Supplier Account Auto-Generation:** Currently, when an account is created in the accounting section with a specific role, it is not auto-syncing to the `Customers` or `Suppliers` table, creating disjoints between GL and Party Master.
3.  **Hardcoded Vouchers:** Current double-entry logic (`postVoucher`, `postDoubleEntry`) tries to deduce the Dr/Cr from `V_Typ` and positive/negative amounts, often storing one leg in `Account_Party` and the other in `AC_Party2`. This is confusing and error-prone for dynamic voucher lines.
4.  **Costing Engine Limitations:** Weighted average cost recalculation needs robust transaction ordering and shouldn't allow negative stock if configured.

---

## 3. Proposed Changes (Phase 2 & Beyond)

*   **Party Master Sync:** Intercept account creation in `saveAccount` (if role = 'sales', create Customer; if role = 'purchase', create Supplier) or vice versa. Use triggers or handler logic.
*   **Dynamic Transaction Engine:** Replace hardcoded voucher types with a dynamic `Transaction Type -> Configurable Account Mapping -> Generated Voucher Lines` ruleset.
*   **Sales/Purchase Inventory Sync:** Update `saveSalesInvoice` and `savePurchaseInvoice` to insert rows into `Stock_Movements` (IN for purchase, OUT for sale).
*   **COGS Recognition:** Calculate Weighted Average Cost at the time of sale, record a COGS voucher (Dr. COGS, Cr. Inventory), and update `COGSVoucherRef`.
*   **Immutable Stock Ledger:** Build robust weighted-average constraints and block negative stock.

---

## 4. Required Migrations

*   No structural table drops. Data will be preserved.
*   New columns like `DrAmount`, `CrAmount`, `DrAccountCA`, `CrAccountCA` (already partly added in `main.js`) will become the standard for the `Inv`/`Inv1` tables instead of the overloaded `Account_Party` / `AC_Party2` mechanism.
*   Update old `T` / `Inv` rows dynamically if they don't have the new mapping format, or just ensure backward compatibility by leaving legacy rows alone and only using the new columns for new transactions.
