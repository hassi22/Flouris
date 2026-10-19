# Flouris ERP — Production Flow

## 1. FLOUR MILL PRODUCTION EXAMPLE

```
INPUT:     10,000 KG Wheat         @ WAC Rs. 106.67/KG  → total cost Rs. 1,066,700
OUTPUT:
  Atta     7,200 KG (72%)          → cost Rs. 768,024  (Rs. 106.67/KG)
  Maida    2,000 KG (20%)          → cost Rs. 213,340  (Rs. 106.67/KG)
  Bran       500 KG (5%)           → cost Rs.  53,335  (Rs. 106.67/KG)
  Loss       300 KG (3%)           → cost Rs. 0        (zero — waste)
  Total output for cost: 9,700 KG  → total allocated = Rs. 1,066,700 ✓
```

## 2. PRODUCTION BATCH STRUCTURE

```
Production_Batches (header)
  BatchID, BatchDate, BatchNo, RecipeID, InputItemID, InputQty
  WarehouseID, CostingMethod, Status, TotalInputCost, Notes

Production_Lines (items)
  LineID, BatchID, ItemID, Quantity, Rate, LineType
  LineType: 'INPUT' | 'OUTPUT' | 'LOSS'
  IsLoss: 1 (for waste/bhusa), 0 (for finished goods/by-products)
  AllocatedCost, CostPerUnit (set on posting)
```

## 3. RECIPE / BOM

```
Recipes (RecipeID, RecipeName, RecipeVersion, EffectiveFrom)
Recipe_Inputs  (RecipeID, ItemID, ExpectedQtyPct, UOM)
Recipe_Outputs (RecipeID, ItemID, ExpectedPct, CostAllocPct, CostMethod, IsLoss, NRVPerUnit)
```

The recipe defines expected percentages. Actual quantities entered in Production_Lines.
Recipe version is stored on the batch — changing today's recipe never changes historical batches.

## 4. COST ALLOCATION METHODS

### weight (default)
```
allocCost = (lineQty / totalNonLossOutputQty) × totalInputCost
costPerUnit = allocCost / lineQty
```

### pct (NRV or user-defined percentage)
```
allocCost = (Recipe_Outputs.CostAllocPct / 100) × totalInputCost
```

The sum of CostAllocPct across all non-loss outputs should = 100%.

### Loss lines always get zero cost.

## 5. POSTING SEQUENCE

```
postProductionBatch(BatchID)
  1. Load batch + lines
  2. validateFiscalYear(BatchDate) → error if closed
  3. For each input:
     a. avgCost = getWeightedAvgCost(itemId, warehouseId)
     b. checkNegativeStock(itemId, warehouseId, qty) → warn/block
     c. insertStockMovement(OUT, qty, rate=avgCost)
     d. Update Inventory_Balances
  4. totalInputCost = Σ(inputQty × avgCost)
  5. For each output (IsLoss=0):
     a. allocCost from costingMethod
     b. insertStockMovement(IN, qty, rate=allocCost/qty)
     c. Update Inventory_Balances
     d. UPDATE Production_Lines SET AllocatedCost, CostPerUnit
  6. For each loss line (IsLoss=1):
     a. insertStockMovement(IN, qty, rate=0)
  7. GL entries:
     Dr PRODUCTION_WIP / Cr RAW_MATERIAL_INVENTORY (totalInputCost)
     Dr FINISHED_GOODS_INVENTORY / Cr PRODUCTION_WIP (totalInputCost)
  8. UPDATE Production_Batches SET Status='Posted', TotalInputCost, VoucherRef
```

## 6. TRACEABILITY

```
Production_Batches.VoucherRef → T.TR_No → Inv rows → GL
Production_Lines.BatchID → Production_Batches
Stock_Movements.SourceType='PRODUCTION_BATCH' + SourceID=BatchID
```

## 7. PRODUCTION REPORT METRICS

```
getProductionReport(startDate, endDate)
  For each posted batch:
    TotalOutput  = Σ(non-loss output quantities)
    Loss         = Σ(loss quantities)
    RecoveryPct  = TotalOutput / InputQty × 100
    LossPct      = Loss / InputQty × 100
    CostPerKg    = TotalInputCost / TotalOutput
```

## 8. WHEAT RECOVERY EXAMPLE

```
Wheat in:     10,000 KG
Atta out:      7,200 KG
Maida out:     2,000 KG
Bran out:        500 KG
Loss:            300 KG

Recovery%  = (7200 + 2000 + 500) / 10000 × 100 = 97%
Loss%      = 300 / 10000 × 100 = 3%

Cost at WAC Rs. 106.67:
  Atta cost/KG  = 106.67
  Maida cost/KG = 106.67
  Bran cost/KG  = 106.67
  Loss: zero cost absorbed into the wheat cost allocation
```
