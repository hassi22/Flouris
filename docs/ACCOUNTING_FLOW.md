# Flouris ERP — Accounting Flow

## 1. CORE PRINCIPLE

Voucher Type does NOT determine debit/credit. Actual voucher lines do.

Every posted transaction must satisfy:
```
SUM(DEBIT) = SUM(CREDIT)
```

## 2. PURCHASE INVOICE → GL

```
Save (Draft)
  Purchase_Invoice_Headers (Status=Draft)
  Purchase_Invoice_Lines

Post (postPurchaseInvoice)
  1. validateFiscalYear(InvoiceDate) → error if period closed
  2. computeNetWeight: NetWeight = GrossWeight - TareWeight
  3. For each line:
     - insertStockMovement(IN, qty=line.Quantity, rate=line.UnitCost)
     - Update Inventory_Balances cache
  4. GL Voucher (VType 302: Purchase on Account):
     - PaymentType='Cash':    Dr Inventory / Cr Cash
     - PaymentType='Credit':  Dr Inventory / Cr Supplier Payable
     - PaymentType='Cheque':  Dr Inventory / Cr Bank + create Cheque record
     - PaymentType='Mixed':   Dr Inventory / Cr Cash + Cr Bank + Cr Supplier (proportional)
  5. Compute DueDate = InvoiceDate + supplier.CreditDays
  6. Mark Status='Posted', store VoucherRef
```

Account mapping used:
- RAW_MATERIAL_INVENTORY or item.InventoryAccountCA → Debit
- CASH or BANK or SUPPLIER_PAYABLE → Credit (based on PaymentType)

## 3. SALES INVOICE → GL

```
Post (postSalesInvoice)
  1. validateFiscalYear(InvoiceDate)
  2. Credit limit check (if customer.CreditLimit > 0)
  3. For each line:
     - checkNegativeStock → warn or block based on AllowNegativeStock setting
     - avgCost = getWeightedAvgCost(itemId, warehouseId, invoiceDate)
     - lineCOGS = avgCost × qty
     - insertStockMovement(OUT, rate=avgCost)
     - Update Inventory_Balances cache
     - Store COGS per line
  4. Revenue voucher (VType 402):
     - Dr Customer Receivable / Cr Sales
  5. COGS voucher (VType 201):
     - Dr COGS / Cr Finished Goods Inventory
  6. Compute DueDate = InvoiceDate + customer.CreditDays
  7. Mark Status='Posted'
```

## 4. CUSTOMER RECEIPT / SUPPLIER PAYMENT → GL

```
savePartyPayment
  Customer Receipt (VType 101): Dr Cash/Bank / Cr Customer Receivable
  Supplier Payment (VType 102): Dr Supplier Payable / Cr Cash/Bank
  → Inserted into T + Inv tables (two Inv legs: one debit, one credit)
  → Stored in Party_Payments with VoucherRef
```

## 5. PRODUCTION → GL

```
postProductionBatch
  1. validateFiscalYear(BatchDate)
  2. Collect inputs; checkNegativeStock for each
  3. Compute totalInputCost = Σ(qty × WAC)
  4. For each input:
     - insertStockMovement(OUT, rate=WAC)
     - Update Inventory_Balances
  5. Cost allocation to outputs:
     - weight: allocCost = (lineQty / totalOutputQty) × totalInputCost
     - pct:    allocCost = (CostAllocPct / 100) × totalInputCost
  6. For each output:
     - insertStockMovement(IN, rate=costPerUnit)
  7. Loss lines: insertStockMovement(IN, rate=0)
  8. GL voucher 1: Dr PRODUCTION_WIP / Cr RAW_MATERIAL_INVENTORY (input consumed)
     GL voucher 2: Dr FINISHED_GOODS_INVENTORY / Cr PRODUCTION_WIP (output produced)
```

## 6. OPENING BALANCES → GL

```
postOpeningBalance
  Account: Insert T/Inv row with VType=100 (Opening Balance)
           Amount sign = positive → Debit (asset/expense)
                        negative → Credit (liability/equity)
  Inventory: insertStockMovement(OPENING, qty, rate=UnitCost)
```

## 7. REPORTS ← GL

All financial reports derive from T + Inv tables:

```
invRows(db, startDate, endDate)
  ↓
loadVtRules(db)  [reads VT/5VT]
  ↓
postingsForRow(row, vtRules)
  ↓
applyPostings(rows, vtRules) → {debits, credits, balances} per account
  ↓
Trial Balance / Balance Sheet / P&L / Account Statement
```

**Balance Sheet double-count prevention:**
If `Account_Mappings.RAW_MATERIAL_INVENTORY` has GL postings,
the computed Stock_Movements inventory value is NOT added to balance sheet assets.
This prevents the ERP path (which posts to both GL and Stock_Movements) from double-counting.

## 8. VOUCHER VALIDATION

Before any posting:
- Fiscal year must be open (if Fiscal_Years table has entries)
- VType 100 (Opening Balance): amount sign determines Dr/Cr
- All other: vtRules from 5VT table (or VT.LDr/LCr fallback)
- postVoucher validates: |totalDebit - totalCredit| < 0.01

## 9. ACCOUNT MAPPING PURPOSES

| Purpose | Transaction |
|---|---|
| RAW_MATERIAL_INVENTORY | Dr on purchase receipt |
| FINISHED_GOODS_INVENTORY | Dr on production output, Cr on COGS |
| PRODUCTION_WIP | Dr on raw material consumed, Cr when FG produced |
| SALES | Cr on sales invoice |
| COGS | Dr on COGS entry when goods are sold |
| SUPPLIER_PAYABLE | Cr on credit purchase, Dr on supplier payment |
| CUSTOMER_RECEIVABLE | Dr on credit sale, Cr on customer receipt |
| CASH | Dr/Cr on cash transactions |
| BANK | Dr/Cr on bank/cheque transactions |
| STOCK_GAIN | Cr on positive stock adjustment |
| STOCK_LOSS | Dr on negative stock adjustment |
| TAX_PAYABLE | Cr on collected tax |
