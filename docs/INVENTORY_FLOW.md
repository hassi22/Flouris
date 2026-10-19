# Flouris ERP — Inventory Flow

## 1. CANONICAL SOURCE

`Stock_Movements` table is the immutable inventory ledger.
`Inventory_Balances` is a performance cache rebuilt from Stock_Movements.

Every inventory movement must have a source document (`SourceType`, `SourceID`).

## 2. MOVEMENT TYPES

| MovementType | Created By |
|---|---|
| OPENING | postOpeningBalance (inventory type) |
| IN | Purchase invoice posting, Production output, Sales return cancel, Stock adjustment (positive) |
| OUT | Sales invoice posting, Production input consumption, Purchase return, Stock adjustment (negative) |
| OPENING | Opening balance entry |

## 3. WEIGHTED AVERAGE COST (WAC)

```
getWeightedAvgCost(db, itemId, warehouseId, asOfDate)

Scans all Stock_Movements WHERE ItemID=? [AND WarehouseID=?] [AND date<=?]
For IN/OPENING: totalQty += qty, totalVal += qty × rate
For OUT:        totalQty -= qty, totalVal -= qty × rate

WAC = totalVal / totalQty  (if totalQty > 0)
```

WAC is computed fresh on every posting. It is NOT stored in Stock_Movements directly;
the Rate column stores the cost at the time of movement.

## 4. PURCHASE RECEIPT

```
Purchase Invoice Line (ItemID, Quantity, UnitCost)
  → insertStockMovement(IN, qty=Quantity, rate=UnitCost, SourceType='PURCHASE_INVOICE')
  → Inventory_Balances updated:
     newQty = old.QtyBalance + qty
     newVal = old.ValueBalance + qty × UnitCost
     newAvg = newVal / newQty
```

## 5. SALES ISSUE

```
Sales Invoice Line (ItemID, Quantity)
  → avgCost = getWeightedAvgCost(itemId, warehouseId, invoiceDate)
  → COGS = avgCost × Quantity
  → insertStockMovement(OUT, qty=Quantity, rate=avgCost, SourceType='SALES_INVOICE')
  → Sales_Invoice_Lines.COGS updated
  → Inventory_Balances updated:
     newQty = old.QtyBalance - qty
     newVal = old.ValueBalance - COGS
```

## 6. PRODUCTION CONSUMPTION

```
Production Batch Input (ItemID, InputQty)
  → avgCost = getWeightedAvgCost(itemId, warehouseId, batchDate)
  → insertStockMovement(OUT, qty=InputQty, rate=avgCost, SourceType='PRODUCTION_BATCH')
  → totalInputCost += avgCost × InputQty
```

## 7. PRODUCTION OUTPUT

```
Production Batch Output Line (ItemID, Quantity, LineType='OUTPUT', IsLoss=0)
  → allocCost (weight-based): (lineQty / totalOutputQty) × totalInputCost
  → costPerUnit = allocCost / lineQty
  → insertStockMovement(IN, qty=lineQty, rate=costPerUnit, SourceType='PRODUCTION_BATCH')

Loss Line (IsLoss=1):
  → insertStockMovement(IN, qty=lineQty, rate=0)  -- zero-cost waste
```

## 8. STOCK TRANSFER

```
Transfer (FromWarehouseID, ToWarehouseID, lines)
  For each line:
    → avgCost = getWeightedAvgCost(itemId, FromWarehouseID)
    → insertStockMovement(OUT, warehouseId=From, rate=avgCost)
    → insertStockMovement(IN,  warehouseId=To,   rate=avgCost)
  No GL entry (inter-warehouse transfer is not revenue/expense)
```

## 9. STOCK ADJUSTMENT

```
Adjustment (ItemID, WarehouseID, PhysicalQty, Reason)
  diff = PhysicalQty - getItemStock(itemId, warehouseId)
  if diff > 0: insertStockMovement(IN,  qty=diff)  → GL: Dr Inventory / Cr Stock Gain
  if diff < 0: insertStockMovement(OUT, qty=|diff|) → GL: Dr Stock Loss / Cr Inventory
```

## 10. NEGATIVE STOCK CONTROL

```
checkNegativeStock(db, itemId, warehouseId, requiredQty, txDate)
  currentStock = sum of IN - sum of OUT up to txDate
  if currentStock - requiredQty < -0.001:
    AllowNegativeStock='allow' → proceed silently
    AllowNegativeStock='warn'  → proceed but log warning in Audit_Log
    AllowNegativeStock='block' → throw error, prevent posting
```

Configured in Company_Info.AllowNegativeStock.

## 11. INVENTORY VALUATION REPORT

```
getStockValuation(asOfDate, warehouseId)
  For each item × warehouse:
    qty = getItemStock(itemId, warehouseId, asOfDate)
    avg = getWeightedAvgCost(itemId, warehouseId, asOfDate)
    value = qty × avg
```

## 12. REBUILD UTILITY

```
rebuildInventoryValuation()
  DELETE FROM Inventory_Balances
  Replay all Stock_Movements in chronological order
  Reconstruct QtyBalance, ValueBalance, AvgCost per (ItemID, WarehouseID)
```

Run this only if manual movements were added outside the invoice workflow.

## 13. TRACEABILITY

```
Stock_Movements.SourceType + SourceID
  PURCHASE_INVOICE    → Purchase_Invoice_Headers.PIHID
  SALES_INVOICE       → Sales_Invoice_Headers.SIHID
  PRODUCTION_BATCH    → Production_Batches.BatchID
  STOCK_TRANSFER      → no document (RefNo stored)
  STOCK_ADJUSTMENT    → RefNo stored
  OPENING_BALANCE     → Opening_Balances.OBID
  PURCHASE_INVOICE_CANCEL / SALES_INVOICE_CANCEL → reversal of original
```
