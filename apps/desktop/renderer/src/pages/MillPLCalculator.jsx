/**
 * MillPLCalculator.jsx
 *
 * Flour Mill P&L calculator based on the supplied Numbers P&L sheet.
 *
 * Numbers sheet model:
 *   PRODUCT | QTY | PACKING | RATE | WEIGHT | AMOUNT
 *
 * Product:
 *   weightKg = qty × packingKg
 *   amount   = qty × rate
 *
 * Rate is the selling price for one packed unit/bag, matching the
 * QTY × RATE structure in the supplied Numbers sheet.
 *
 * Wheat:
 *   wheatCost = wheatMaan × wheatRatePerMaan
 *
 * Mill expense:
 *   millExpense = wheatMaan × millExpensePerMaan
 *
 * Packing:
 *   packingExpense = qty × bagRate
 *
 * P&L:
 *   P&L = totalSales - wheatCost - millExpense - packingExpense - otherExpenses
 *
 * Gain:
 *   gainAmount = wheatCost × gainPercent / 100
 *
 * Final:
 *   finalProfitLoss = P&L + gainAmount
 *
 * UI intentionally stays in the existing Flouris ERP visual language.
 */

import React, { useMemo, useState } from 'react';
import {
  Calculator,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Printer,
} from 'lucide-react';
import { useLang } from '../context/LanguageContext';
import { printMillPL } from '../utils/printPDF';

const MAAN_KG = 40;

const DEFAULT_PRODUCTS = [
  {
    id: 'atta',
    nameEn: 'Atta',
    nameUr: 'آٹا',
    qty: 0,
    packingKg: 20,
    saleRateMaan: 0,
    bagRate: 25,
    enabled: true,
  },
  {
    id: 'maida',
    nameEn: 'Maida',
    nameUr: 'میدہ',
    qty: 0,
    packingKg: 84,
    saleRateMaan: 0,
    bagRate: 50,
    enabled: true,
  },
  {
    id: 'bran',
    nameEn: 'Bran / Chokar',
    nameUr: 'چوکر',
    qty: 0,
    packingKg: 34,
    saleRateMaan: 0,
    bagRate: 35,
    enabled: true,
  },
  {
    id: 'suji',
    nameEn: 'Suji',
    nameUr: 'سوجی',
    qty: 0,
    packingKg: 50,
    saleRateMaan: 0,
    bagRate: 0,
    enabled: true,
  },
];

const DEFAULT_EXPENSES = [
  {
    id: 'millExpense',
    nameEn: 'Mill Expense / Maan',
    nameUr: 'مل اخراجات فی ماں',
    amount: 0,
  },
  {
    id: 'electricity',
    nameEn: 'Electricity',
    nameUr: 'بجلی',
    amount: 0,
  },
  {
    id: 'labour',
    nameEn: 'Labour / Mazdoori',
    nameUr: 'مزدوری',
    amount: 0,
  },
  {
    id: 'transport',
    nameEn: 'Transport',
    nameUr: 'ٹرانسپورٹ',
    amount: 0,
  },
  {
    id: 'other',
    nameEn: 'Other Expenses',
    nameUr: 'دیگر اخراجات',
    amount: 0,
  },
];

const n = value => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const fmt = (value, decimals = 2) => {
  if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) {
    return '—';
  }

  return Number(value).toLocaleString('en-PK', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

const blankIfZero = value => (Number(value) === 0 ? '' : value);

export default function MillPLCalculator() {
  const { isUrdu } = useLang();
  const dir = isUrdu ? 'rtl' : 'ltr';

  const [wheatQtyMaan, setWheatQtyMaan] = useState('');
  const [wheatRateMaan, setWheatRateMaan] = useState('');
  const [gainPct, setGainPct] = useState('');
  const [batchName, setBatchName] = useState('');

  const [products, setProducts] = useState(
    DEFAULT_PRODUCTS.map(product => ({ ...product }))
  );

  const [expenses, setExpenses] = useState(
    DEFAULT_EXPENSES.map(expense => ({ ...expense }))
  );

  const updateProduct = (id, field, value) => {
    setProducts(current =>
      current.map(product =>
        product.id === id
          ? { ...product, [field]: value }
          : product
      )
    );
  };

  const updateExpense = (id, value) => {
    setExpenses(current =>
      current.map(expense =>
        expense.id === id
          ? { ...expense, amount: value }
          : expense
      )
    );
  };

  const result = useMemo(() => {
    const wheatMaan = n(wheatQtyMaan);
    const wheatRate = n(wheatRateMaan);
    const wheatKg = wheatMaan * MAAN_KG;
    const wheatCost = wheatMaan * wheatRate;

    const productLines = products
      .filter(product => product.enabled)
      .map(product => {
        const qty = n(product.qty);
        const packingKg = n(product.packingKg);
        const rate = n(product.saleRateMaan);
        const bagRate = n(product.bagRate);

        // Numbers sheet:
        // WEIGHT = QTY × PACKING
        const weightKg = qty * packingKg;

        // AMOUNT = QTY × RATE
        const amount = qty * rate;

        // Packing/bag expense = QTY × bag rate
        const packingExpense = qty * bagRate;

        // Output as Maan
        const weightMaan = weightKg / MAAN_KG;

        return {
          ...product,
          qty,
          packingKg,
          rate,
          bagRate,
          weightKg,
          weightMaan,
          amount,
          packingExpense,
          productionPct:
            wheatKg > 0
              ? (weightKg / wheatKg) * 100
              : 0,
        };
      });

    const totalWeightKg = productLines.reduce(
      (sum, line) => sum + line.weightKg,
      0
    );

    const totalWeightMaan = totalWeightKg / MAAN_KG;

    const totalSales = productLines.reduce(
      (sum, line) => sum + line.amount,
      0
    );

    const totalPackingExpense = productLines.reduce(
      (sum, line) => sum + line.packingExpense,
      0
    );

    const millExpenseRate =
      n(
        expenses.find(
          expense => expense.id === 'millExpense'
        )?.amount
      );

    const millExpense =
      wheatMaan * millExpenseRate;

    const otherExpenses = expenses
      .filter(expense => expense.id !== 'millExpense')
      .reduce(
        (sum, expense) => sum + n(expense.amount),
        0
      );

    const totalExpense =
      wheatCost +
      millExpense +
      totalPackingExpense +
      otherExpenses;

    const pnl = totalSales - totalExpense;

    const gainRate = n(gainPct);
    const gainAmount =
      wheatCost * (gainRate / 100);

    const finalProfitLoss = pnl + gainAmount;

    const profitPerMaan =
      wheatMaan > 0
        ? finalProfitLoss / wheatMaan
        : 0;

    const profitPerKg =
      wheatKg > 0
        ? finalProfitLoss / wheatKg
        : 0;

    const costPerMaan =
      wheatMaan > 0
        ? totalExpense / wheatMaan
        : 0;

    const productionPct =
      wheatKg > 0
        ? (totalWeightKg / wheatKg) * 100
        : 0;

    const unaccountedKg =
      wheatKg - totalWeightKg;

    return {
      wheatMaan,
      wheatRate,
      wheatKg,
      wheatCost,

      productLines,
      totalWeightKg,
      totalWeightMaan,
      totalSales,
      totalPackingExpense,

      millExpenseRate,
      millExpense,
      otherExpenses,
      totalExpense,

      pnl,
      gainRate,
      gainAmount,
      finalProfitLoss,

      profitPerMaan,
      profitPerKg,
      costPerMaan,

      productionPct,
      unaccountedKg,
    };
  }, [
    wheatQtyMaan,
    wheatRateMaan,
    gainPct,
    products,
    expenses,
  ]);

  const isProfit = result.finalProfitLoss >= 0;

  const resetAll = () => {
    setWheatQtyMaan('');
    setWheatRateMaan('');
    setGainPct('');
    setBatchName('');

    setProducts(
      DEFAULT_PRODUCTS.map(product => ({
        ...product,
      }))
    );

    setExpenses(
      DEFAULT_EXPENSES.map(expense => ({
        ...expense,
      }))
    );
  };

  const printReport = async () => {
    try {
      const prefs =
        await window.electronAPI?.getPrefs?.().catch?.(() => ({})) ||
        {};

      await printMillPL({
        ...result,
        products: result.productLines,
        expenses,
        batchName,
        companyName:
          prefs.companyName ||
          prefs.businessName ||
          'Flouris ERP',
        logoData: prefs.logoData || null,
        isUrdu,
        title: isUrdu
          ? 'آٹا چکی نفع و نقصان'
          : 'Flour Mill Profit & Loss',
        subtitle: batchName || '',
        generatedAt: new Date().toLocaleString(
          isUrdu ? 'ur-PK' : 'en-PK'
        ),
        defaultFileName:
          batchName
            ? `Mill-P&L-${batchName}.pdf`
            : 'Mill-Profit-Loss.pdf',
      });
    } catch (error) {
      console.error(
        'Mill P&L PDF failed:',
        error
      );

      // Keep the old browser/Electron print behaviour
      // as a fallback if PDF helper is unavailable.
      window.print();
    }
  };

  const inputStyle = {
    width: '100%',
    minWidth: 0,
    padding: '7px 8px',
    border: '1px solid var(--border)',
    borderRadius: 6,
    fontSize: 12,
    background: '#fff',
  };

  const sectionHeader = background => ({
    background,
    padding: '11px 17px',
    color: '#fff',
    fontWeight: 700,
    fontSize: 13,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  });

  return (
    <div
      className="page"
      dir={dir}
      style={{
        width: '100%',
        maxWidth: 1180,
        margin: '0 auto',
      }}
    >
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Calculator
              size={22}
              style={{
                display: 'inline',
                marginInlineEnd: 8,
                verticalAlign: 'middle',
              }}
            />
            {isUrdu
              ? 'آٹا چکی نفع و نقصان کیلکولیٹر'
              : 'Flour Mill P&L Calculator'}
          </h1>

          <p className="page-subtitle">
            {isUrdu
              ? 'گندم، پیداوار، پیکنگ اور اخراجات درج کر کے نفع نقصان حساب کریں'
              : 'Calculate mill profit/loss from wheat, packed-product sales, packing and expenses'}
          </p>
        </div>

        <div className="header-actions">
          <button
            className="btn btn-ghost"
            onClick={printReport}
          >
            <Printer size={13} />
            {isUrdu ? 'PDF پرنٹ' : 'Print PDF'}
          </button>

          <button
            className="btn btn-ghost"
            onClick={resetAll}
          >
            <RefreshCw size={13} />
            {isUrdu ? 'ری سیٹ' : 'Reset'}
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <input
          type="text"
          className="input-field"
          style={{
            width: 320,
            maxWidth: '100%',
            fontSize: 13,
          }}
          placeholder={
            isUrdu
              ? 'بیچ / تاریخ کا نام (اختیاری)…'
              : 'Batch name / date (optional)…'
          }
          value={batchName}
          onChange={e =>
            setBatchName(e.target.value)
          }
        />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'minmax(0, 1fr) minmax(0, 1fr)',
          gap: 20,
          alignItems: 'start',
        }}
      >
        {/* LEFT: Wheat + Expenses */}
        <div
          style={{
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
          }}
        >
          {/* Wheat */}
          <div
            style={{
              background: '#fff',
              border: '1px solid var(--border)',
              borderRadius: 10,
              overflow: 'hidden',
              width: '100%',
            }}
          >
            <div
              style={sectionHeader(
                'linear-gradient(90deg,#7c3aed,#a855f7)'
              )}
            >
              🌾
              {isUrdu
                ? 'گندم خرید'
                : 'Wheat Purchase'}
            </div>

            <div
              style={{
                padding: 16,
                display: 'grid',
                gridTemplateColumns:
                  'minmax(0, 1fr) minmax(0, 1fr)',
                gap: 12,
              }}
            >
              <div className="field-group">
                <label style={{ fontSize: 12 }}>
                  {isUrdu
                    ? 'مقدار (ماں)'
                    : 'Quantity (Maan)'}
                </label>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="input-field"
                  style={{
                    width: '100%',
                    fontWeight: 700,
                    fontSize: 16,
                  }}
                  placeholder="201"
                  value={wheatQtyMaan}
                  onChange={e =>
                    setWheatQtyMaan(e.target.value)
                  }
                />

                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--text-muted)',
                  }}
                >
                  {fmt(result.wheatKg, 2)} KG
                </span>
              </div>

              <div className="field-group">
                <label style={{ fontSize: 12 }}>
                  {isUrdu
                    ? 'شرح فی یونٹ (روپے)'
                    : 'Rate / Unit (Rs.)'}
                </label>

                <input
                  type="number"
                  min="0"
                  step="1"
                  className="input-field"
                  style={{
                    width: '100%',
                    fontWeight: 700,
                    fontSize: 16,
                  }}
                  placeholder="4000"
                  value={wheatRateMaan}
                  onChange={e =>
                    setWheatRateMaan(e.target.value)
                  }
                />
              </div>

              <div
                style={{
                  gridColumn: '1 / -1',
                  display: 'grid',
                  gridTemplateColumns:
                    'minmax(0, 1fr) minmax(0, 1fr)',
                  gap: 12,
                }}
              >
                <div className="field-group">
                  <label style={{ fontSize: 12 }}>
                    {isUrdu
                      ? 'گین فیصد (%)'
                      : 'Gain (%)'}
                  </label>

                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="input-field"
                    style={{
                      width: '100%',
                    }}
                    placeholder="3.5"
                    value={gainPct}
                    onChange={e =>
                      setGainPct(e.target.value)
                    }
                  />

                  <span
                    style={{
                      fontSize: 10,
                      color: 'var(--text-muted)',
                    }}
                  >
                    {isUrdu
                      ? 'گندم کی کل لاگت پر'
                      : 'Applied to total wheat cost'}
                  </span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 13px',
                    background: '#faf5ff',
                    borderRadius: 8,
                    fontWeight: 700,
                    color: '#7c3aed',
                    fontSize: 13,
                    minWidth: 0,
                  }}
                >
                  <span>
                    {isUrdu
                      ? 'گندم کی لاگت'
                      : 'Wheat Cost'}
                  </span>
                  <span style={{ whiteSpace: 'nowrap' }}>
                    Rs. {fmt(result.wheatCost)}
                  </span>
                </div>
              </div>

              {result.gainAmount > 0 && (
                <div
                  style={{
                    gridColumn: '1 / -1',
                    padding: '8px 12px',
                    background: '#eff6ff',
                    borderRadius: 8,
                    fontWeight: 700,
                    color: '#2563eb',
                    fontSize: 12,
                  }}
                >
                  {isUrdu ? 'گین:' : 'Gain:'}{' '}
                  {fmt(result.gainRate, 2)}% × Rs.{' '}
                  {fmt(result.wheatCost)} = Rs.{' '}
                  {fmt(result.gainAmount)}
                </div>
              )}
            </div>
          </div>

          {/* Expenses */}
          <div
            style={{
              background: '#fff',
              border: '1px solid var(--border)',
              borderRadius: 10,
              overflow: 'hidden',
              width: '100%',
            }}
          >
            <div
              style={sectionHeader(
                'linear-gradient(90deg,#dc2626,#ef4444)'
              )}
            >
              ⚡
              {isUrdu
                ? 'اخراجات / اوور ہیڈ'
                : 'Expenses / Overheads'}
            </div>

            <div
              style={{
                padding: '13px 17px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              {expenses.map(expense => (
                <div
                  key={expense.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      'minmax(130px, 1fr) minmax(120px, 1.4fr) auto',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <label style={{ fontSize: 12 }}>
                    {isUrdu
                      ? expense.nameUr
                      : expense.nameEn}
                  </label>

                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="input-field"
                    style={{
                      width: '100%',
                      textAlign: 'right',
                    }}
                    placeholder="0"
                    value={blankIfZero(expense.amount)}
                    onChange={e =>
                      updateExpense(
                        expense.id,
                        e.target.value
                      )
                    }
                  />

                  <span
                    style={{
                      fontSize: 11,
                      color: 'var(--text-muted)',
                    }}
                  >
                    Rs.
                  </span>
                </div>
              ))}

              <div
                style={{
                  marginTop: 3,
                  display: 'grid',
                  gridTemplateColumns:
                    '1fr 1fr',
                  gap: 10,
                }}
              >
                <div
                  style={{
                    padding: '9px 12px',
                    background: '#fef2f2',
                    borderRadius: 8,
                    fontWeight: 700,
                    color: 'var(--rose)',
                    fontSize: 12,
                  }}
                >
                  {isUrdu
                    ? 'مل خرچ فی ماں'
                    : 'Mill Expense / Maan'}
                  <div style={{ marginTop: 2 }}>
                    Rs. {fmt(result.millExpenseRate)}
                  </div>
                </div>

                <div
                  style={{
                    padding: '9px 12px',
                    background: '#fef2f2',
                    borderRadius: 8,
                    fontWeight: 700,
                    color: 'var(--rose)',
                    fontSize: 12,
                  }}
                >
                  {isUrdu
                    ? 'کل مل خرچ'
                    : 'Total Mill Expense'}
                  <div style={{ marginTop: 2 }}>
                    Rs. {fmt(result.millExpense)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: Production */}
        <div
          style={{
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
          }}
        >
          <div
            style={{
              background: '#fff',
              border: '1px solid var(--border)',
              borderRadius: 10,
              overflow: 'hidden',
              width: '100%',
            }}
          >
            <div
              style={sectionHeader(
                'linear-gradient(90deg,#059669,#10b981)'
              )}
            >
              🏭
              {isUrdu
                ? 'پیداوار / فروخت'
                : 'Production / Sales'}

              <span
                style={{
                  fontWeight: 400,
                  fontSize: 11,
                  marginInlineStart: 8,
                  opacity: 0.85,
                }}
              >
                {isUrdu
                  ? `کل وزن: ${fmt(result.totalWeightKg, 0)} کلو`
                  : `Total weight: ${fmt(result.totalWeightKg, 0)} KG`}
              </span>
            </div>

            <div
              style={{
                padding: 0,
                overflowX: 'auto',
              }}
            >
              <table
                style={{
                  width: '100%',
                  minWidth: 650,
                  borderCollapse: 'collapse',
                  tableLayout: 'fixed',
                  fontSize: 12,
                }}
              >
                <thead>
                  <tr style={{ background: '#f1f5f9' }}>
                    <th
                      style={{
                        padding: '9px 8px',
                        width: '23%',
                        textAlign:
                          isUrdu ? 'right' : 'left',
                        fontSize: 11,
                      }}
                    >
                      {isUrdu ? 'پراڈکٹ' : 'Product'}
                    </th>
                    <th
                      style={{
                        padding: '9px 5px',
                        width: '15%',
                        textAlign: 'center',
                        fontSize: 11,
                      }}
                    >
                      {isUrdu ? 'تعداد' : 'Qty'}
                    </th>
                    <th
                      style={{
                        padding: '9px 5px',
                        width: '17%',
                        textAlign: 'center',
                        fontSize: 11,
                      }}
                    >
                      {isUrdu
                        ? 'پیکنگ (کلو)'
                        : 'Packing (KG)'}
                    </th>
                    <th
                      style={{
                        padding: '9px 5px',
                        width: '17%',
                        textAlign: 'right',
                        fontSize: 11,
                      }}
                    >
                      {isUrdu
                        ? 'شرح / ماں'
                        : 'Rate / Unit'}
                    </th>
                    <th
                      style={{
                        padding: '9px 7px',
                        width: '14%',
                        textAlign: 'right',
                        fontSize: 11,
                      }}
                    >
                      {isUrdu ? 'وزن' : 'Weight'}
                    </th>
                    <th
                      style={{
                        padding: '9px 7px',
                        width: '14%',
                        textAlign: 'right',
                        fontSize: 11,
                      }}
                    >
                      {isUrdu ? 'رقم' : 'Amount'}
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {products.map(product => {
                    const line =
                      result.productLines.find(
                        item =>
                          item.id === product.id
                      );

                    return (
                      <tr
                        key={product.id}
                        style={{
                          borderBottom:
                            '1px solid var(--border)',
                          opacity: product.enabled
                            ? 1
                            : 0.45,
                        }}
                      >
                        <td
                          style={{
                            padding: '8px',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={
                                product.enabled
                              }
                              onChange={e =>
                                updateProduct(
                                  product.id,
                                  'enabled',
                                  e.target.checked
                                )
                              }
                              style={{
                                width: 14,
                                height: 14,
                              }}
                            />
                            <span
                              style={{
                                fontWeight: 600,
                              }}
                            >
                              {isUrdu
                                ? product.nameUr
                                : product.nameEn}
                            </span>
                          </div>
                        </td>

                        <td
                          style={{
                            padding: '7px 4px',
                          }}
                        >
                          <input
                            type="number"
                            min="0"
                            step="1"
                            style={{
                              ...inputStyle,
                              textAlign: 'center',
                              fontWeight: 600,
                            }}
                            value={blankIfZero(product.qty)}
                            disabled={
                              !product.enabled
                            }
                            onChange={e =>
                              updateProduct(
                                product.id,
                                'qty',
                                e.target.value
                              )
                            }
                          />
                        </td>

                        <td
                          style={{
                            padding: '7px 4px',
                          }}
                        >
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            style={{
                              ...inputStyle,
                              textAlign: 'center',
                            }}
                            value={blankIfZero(
                              product.packingKg
                            )}
                            disabled={
                              !product.enabled
                            }
                            onChange={e =>
                              updateProduct(
                                product.id,
                                'packingKg',
                                e.target.value
                              )
                            }
                          />
                        </td>

                        <td
                          style={{
                            padding: '7px 4px',
                          }}
                        >
                          <input
                            type="number"
                            min="0"
                            step="1"
                            style={{
                              ...inputStyle,
                              textAlign: 'right',
                              fontWeight: 600,
                              color:
                                'var(--emerald)',
                            }}
                            value={blankIfZero(
                              product.saleRateMaan
                            )}
                            disabled={
                              !product.enabled
                            }
                            onChange={e =>
                              updateProduct(
                                product.id,
                                'saleRateMaan',
                                e.target.value
                              )
                            }
                          />
                        </td>

                        <td
                          style={{
                            padding: '8px 7px',
                            textAlign: 'right',
                            fontWeight: 600,
                          }}
                        >
                          {fmt(
                            line?.weightKg,
                            0
                          )}
                        </td>

                        <td
                          style={{
                            padding: '8px 7px',
                            textAlign: 'right',
                            fontWeight: 700,
                            color:
                              'var(--emerald)',
                          }}
                        >
                          Rs.{' '}
                          {fmt(
                            line?.amount
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

                <tfoot>
                  <tr
                    style={{
                      background: '#f0fdf4',
                      borderTop:
                        '2px solid #10b981',
                    }}
                  >
                    <td
                      colSpan={4}
                      style={{
                        padding: '10px 8px',
                        fontWeight: 800,
                      }}
                    >
                      {isUrdu
                        ? 'کل پیداوار / فروخت'
                        : 'Total Production / Sales'}
                    </td>
                    <td
                      style={{
                        padding: '10px 7px',
                        textAlign: 'right',
                        fontWeight: 800,
                      }}
                    >
                      {fmt(
                        result.totalWeightKg,
                        0
                      )}{' '}
                      KG
                    </td>
                    <td
                      style={{
                        padding: '10px 7px',
                        textAlign: 'right',
                        fontWeight: 800,
                        color:
                          'var(--emerald)',
                      }}
                    >
                      Rs.{' '}
                      {fmt(
                        result.totalSales
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div
              style={{
                padding: '12px 16px',
                borderTop:
                  '1px solid var(--border)',
                display: 'grid',
                gridTemplateColumns:
                  'repeat(3, minmax(0, 1fr))',
                gap: 10,
                background: '#fafafa',
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 10,
                    color: 'var(--text-muted)',
                  }}
                >
                  {isUrdu
                    ? 'کل پیداوار (ماں)'
                    : 'Total Output (Maan)'}
                </div>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 800,
                  }}
                >
                  {fmt(
                    result.totalWeightMaan,
                    2
                  )}
                </div>
              </div>

              <div>
                <div
                  style={{
                    fontSize: 10,
                    color: 'var(--text-muted)',
                  }}
                >
                  {isUrdu
                    ? 'پیداوار فیصد'
                    : 'Production %'}
                </div>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 800,
                  }}
                >
                  {fmt(
                    result.productionPct,
                    2
                  )}%
                </div>
              </div>

              <div>
                <div
                  style={{
                    fontSize: 10,
                    color: 'var(--text-muted)',
                  }}
                >
                  {isUrdu
                    ? 'باقی وزن'
                    : 'Unaccounted Weight'}
                </div>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 800,
                    color:
                      result.unaccountedKg >= 0
                        ? 'var(--text-primary)'
                        : 'var(--rose)',
                  }}
                >
                  {fmt(
                    result.unaccountedKg,
                    2
                  )}{' '}
                  KG
                </div>
              </div>
            </div>
          </div>

          {/* Packing */}
          <div
            style={{
              background: '#fff',
              border: '1px solid var(--border)',
              borderRadius: 10,
              overflow: 'hidden',
              width: '100%',
            }}
          >
            <div
              style={sectionHeader(
                'linear-gradient(90deg,#0f766e,#14b8a6)'
              )}
            >
              🧺
              {isUrdu
                ? 'پیکنگ / بیگ خرچ'
                : 'Packing / Bag Cost'}
            </div>

            <div
              style={{
                padding: '12px 16px',
                display: 'grid',
                gridTemplateColumns:
                  'repeat(2, minmax(0, 1fr))',
                gap: 10,
              }}
            >
              {products.map(product => {
                const line =
                  result.productLines.find(
                    item =>
                      item.id === product.id
                  );

                return (
                  <div
                    key={product.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns:
                        'minmax(90px, 1fr) minmax(80px, 1fr) auto',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <label
                      style={{
                        fontSize: 11,
                      }}
                    >
                      {isUrdu
                        ? product.nameUr
                        : product.nameEn}
                    </label>

                    <input
                      type="number"
                      min="0"
                      step="1"
                      className="input-field"
                      style={{
                        width: '100%',
                        textAlign: 'right',
                      }}
                      placeholder="Rs./bag"
                      value={blankIfZero(
                        product.bagRate
                      )}
                      disabled={!product.enabled}
                      onChange={e =>
                        updateProduct(
                          product.id,
                          'bagRate',
                          e.target.value
                        )
                      }
                    />

                    <span
                      style={{
                        fontSize: 10,
                        color:
                          'var(--text-muted)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {fmt(
                        line?.qty,
                        0
                      )}{' '}
                      {isUrdu
                        ? 'بیگ'
                        : 'bags'}
                    </span>
                  </div>
                );
              })}
            </div>

            <div
              style={{
                padding: '9px 16px',
                borderTop:
                  '1px solid var(--border)',
                background: '#f0fdf4',
                fontWeight: 800,
                color: 'var(--emerald)',
                fontSize: 13,
                textAlign: 'right',
              }}
            >
              {isUrdu
                ? 'کل پیکنگ خرچ:'
                : 'Total Packing Cost:'}{' '}
              Rs.{' '}
              {fmt(
                result.totalPackingExpense
              )}
            </div>
          </div>
        </div>
      </div>

      {/* P&L */}
      {result.wheatMaan > 0 && (
        <div
          style={{
            marginTop: 24,
            background: '#fff',
            border: `2px solid ${
              isProfit
                ? 'var(--emerald)'
                : 'var(--rose)'
            }`,
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              background: isProfit
                ? 'linear-gradient(90deg,#059669,#10b981)'
                : 'linear-gradient(90deg,#dc2626,#ef4444)',
              padding: '14px 20px',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                minWidth: 0,
              }}
            >
              {isProfit ? (
                <TrendingUp size={22} />
              ) : (
                <TrendingDown size={22} />
              )}

              <div>
                <div
                  style={{
                    fontWeight: 800,
                    fontSize: 16,
                  }}
                >
                  {isUrdu
                    ? 'نفع و نقصان بیان'
                    : 'Profit & Loss Statement'}

                  {batchName && (
                    <span
                      style={{
                        fontWeight: 400,
                        fontSize: 12,
                        marginInlineStart: 10,
                        opacity: 0.85,
                      }}
                    >
                      — {batchName}
                    </span>
                  )}
                </div>

                <div
                  style={{
                    fontSize: 12,
                    opacity: 0.85,
                  }}
                >
                  {isUrdu
                    ? `گندم: ${fmt(result.wheatMaan, 2)} ماں (${fmt(result.wheatKg, 0)} کلو)`
                    : `Wheat: ${fmt(result.wheatMaan, 2)} Maan (${fmt(result.wheatKg, 0)} KG)`}
                </div>
              </div>
            </div>

            <div
              style={{
                textAlign: 'right',
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  opacity: 0.85,
                }}
              >
                {isProfit
                  ? isUrdu
                    ? 'خالص نفع'
                    : 'Net Profit'
                  : isUrdu
                    ? 'خالص نقصان'
                    : 'Net Loss'}
              </div>

              <div
                style={{
                  fontWeight: 900,
                  fontSize: 24,
                }}
              >
                Rs.{' '}
                {fmt(
                  Math.abs(
                    result.finalProfitLoss
                  )
                )}
              </div>
            </div>
          </div>

          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 13,
            }}
          >
            <tbody>
              <tr style={{ background: '#f0fdf4' }}>
                <td
                  colSpan={2}
                  style={{
                    padding: '10px 20px',
                    fontWeight: 700,
                    color: 'var(--emerald)',
                  }}
                >
                  {isUrdu
                    ? '+ فروخت / آمدنی'
                    : '+ Sales / Revenue'}
                </td>
                <td
                  style={{
                    padding: '10px 20px',
                    textAlign: 'right',
                    fontWeight: 700,
                    color: 'var(--emerald)',
                    fontSize: 15,
                  }}
                >
                  Rs. {fmt(result.totalSales)}
                </td>
              </tr>

              {result.productLines.map(product => (
                <tr
                  key={product.id}
                  style={{
                    borderBottom:
                      '1px solid var(--border)',
                  }}
                >
                  <td
                    style={{
                      padding: '7px 20px',
                      paddingInlineStart: 36,
                      color: 'var(--text-muted)',
                      fontSize: 12,
                    }}
                  >
                    {isUrdu
                      ? product.nameUr
                      : product.nameEn}
                  </td>
                  <td
                    style={{
                      padding: '7px 8px',
                      color: 'var(--text-muted)',
                      fontSize: 11,
                      textAlign: 'center',
                    }}
                  >
                    {fmt(product.qty, 0)} ×{' '}
                    {fmt(product.packingKg, 2)} KG ×{' '}
                    Rs.{fmt(product.rate, 0)}/Maan
                  </td>
                  <td
                    style={{
                      padding: '7px 20px',
                      textAlign: 'right',
                      color: 'var(--emerald)',
                      fontWeight: 600,
                    }}
                  >
                    Rs. {fmt(product.amount)}
                  </td>
                </tr>
              ))}

              <tr
                style={{
                  background: '#faf5ff',
                  borderTop:
                    '1px solid var(--border)',
                }}
              >
                <td
                  colSpan={2}
                  style={{
                    padding: '10px 20px',
                    fontWeight: 700,
                    color: '#7c3aed',
                  }}
                >
                  {isUrdu
                    ? '− گندم کی لاگت'
                    : '− Wheat Cost'}
                </td>
                <td
                  style={{
                    padding: '10px 20px',
                    textAlign: 'right',
                    fontWeight: 700,
                    color: '#7c3aed',
                  }}
                >
                  (Rs. {fmt(result.wheatCost)})
                </td>
              </tr>

              <tr>
                <td
                  colSpan={2}
                  style={{
                    padding: '8px 20px',
                    paddingInlineStart: 36,
                    color: 'var(--text-muted)',
                    fontSize: 12,
                  }}
                >
                  {isUrdu
                    ? 'مل اخراجات'
                    : 'Mill Expense'}
                </td>
                <td
                  style={{
                    padding: '8px 20px',
                    textAlign: 'right',
                    color: 'var(--rose)',
                  }}
                >
                  (Rs. {fmt(result.millExpense)})
                </td>
              </tr>

              <tr>
                <td
                  colSpan={2}
                  style={{
                    padding: '8px 20px',
                    paddingInlineStart: 36,
                    color: 'var(--text-muted)',
                    fontSize: 12,
                  }}
                >
                  {isUrdu
                    ? 'پیکنگ / بیگ خرچ'
                    : 'Packing / Bag Expense'}
                </td>
                <td
                  style={{
                    padding: '8px 20px',
                    textAlign: 'right',
                    color: 'var(--rose)',
                  }}
                >
                  (Rs.{' '}
                  {fmt(
                    result.totalPackingExpense
                  )}
                  )
                </td>
              </tr>

              {result.otherExpenses > 0 && (
                <tr>
                  <td
                    colSpan={2}
                    style={{
                      padding: '8px 20px',
                      paddingInlineStart: 36,
                      color: 'var(--text-muted)',
                      fontSize: 12,
                    }}
                  >
                    {isUrdu
                      ? 'دیگر اخراجات'
                      : 'Other Expenses'}
                  </td>
                  <td
                    style={{
                      padding: '8px 20px',
                      textAlign: 'right',
                      color: 'var(--rose)',
                    }}
                  >
                    (Rs.{' '}
                    {fmt(
                      result.otherExpenses
                    )}
                    )
                  </td>
                </tr>
              )}

              <tr
                style={{
                  background: '#f8fafc',
                  borderTop:
                    '2px solid var(--border)',
                }}
              >
                <td
                  colSpan={2}
                  style={{
                    padding: '10px 20px',
                    fontWeight: 700,
                  }}
                >
                  P&L
                </td>
                <td
                  style={{
                    padding: '10px 20px',
                    textAlign: 'right',
                    fontWeight: 800,
                    fontSize: 15,
                    color:
                      result.pnl >= 0
                        ? 'var(--emerald)'
                        : 'var(--rose)',
                  }}
                >
                  Rs.{' '}
                  {fmt(
                    Math.abs(result.pnl)
                  )}
                  {result.pnl < 0 &&
                    (isUrdu
                      ? ' (نقصان)'
                      : ' (Loss)')}
                </td>
              </tr>

              <tr
                style={{
                  background: '#eff6ff',
                }}
              >
                <td
                  colSpan={2}
                  style={{
                    padding: '10px 20px',
                    fontWeight: 700,
                    color: '#2563eb',
                  }}
                >
                  {isUrdu ? '+ گین' : '+ Gain'}{' '}
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 400,
                    }}
                  >
                    ({fmt(result.gainRate, 2)}%)
                  </span>
                </td>
                <td
                  style={{
                    padding: '10px 20px',
                    textAlign: 'right',
                    fontWeight: 700,
                    color: '#2563eb',
                  }}
                >
                  Rs. {fmt(result.gainAmount)}
                </td>
              </tr>

              <tr
                style={{
                  background: isProfit
                    ? 'rgba(16,185,129,0.08)'
                    : 'rgba(220,38,38,0.08)',
                  borderTop:
                    '3px solid var(--border)',
                }}
              >
                <td
                  colSpan={2}
                  style={{
                    padding: '14px 20px',
                    fontWeight: 800,
                    fontSize: 15,
                  }}
                >
                  {isProfit
                    ? isUrdu
                      ? '🟢 حتمی خالص نفع'
                      : '🟢 Final Net Profit'
                    : isUrdu
                      ? '🔴 حتمی خالص نقصان'
                      : '🔴 Final Net Loss'}
                </td>
                <td
                  style={{
                    padding: '14px 20px',
                    textAlign: 'right',
                    fontWeight: 900,
                    fontSize: 20,
                    color: isProfit
                      ? 'var(--emerald)'
                      : 'var(--rose)',
                  }}
                >
                  Rs.{' '}
                  {fmt(
                    Math.abs(
                      result.finalProfitLoss
                    )
                  )}
                </td>
              </tr>
            </tbody>
          </table>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(3, minmax(0, 1fr))',
              borderTop:
                '1px solid var(--border)',
            }}
          >
            {[
              [
                isUrdu
                  ? 'فی ماں نفع'
                  : 'Profit / Maan',
                `Rs. ${fmt(
                  Math.abs(
                    result.profitPerMaan
                  )
                )}`,
                isProfit
                  ? 'var(--emerald)'
                  : 'var(--rose)',
                `${fmt(
                  result.wheatMaan,
                  2
                )} Maan`,
              ],
              [
                isUrdu
                  ? 'فی کلو نفع'
                  : 'Profit / KG',
                `Rs. ${fmt(
                  Math.abs(
                    result.profitPerKg
                  )
                )}`,
                isProfit
                  ? 'var(--emerald)'
                  : 'var(--rose)',
                `${fmt(
                  result.wheatKg,
                  0
                )} KG`,
              ],
              [
                isUrdu
                  ? 'کل لاگت فی ماں'
                  : 'Total Cost / Maan',
                `Rs. ${fmt(
                  result.costPerMaan
                )}`,
                'var(--text-primary)',
                isUrdu
                  ? 'گندم + مل + پیکنگ'
                  : 'Wheat + Mill + Packing',
              ],
            ].map(
              ([label, value, color, sub], index) => (
                <div
                  key={label}
                  style={{
                    padding: '12px 16px',
                    textAlign: 'center',
                    borderRight:
                      index < 2
                        ? '1px solid var(--border)'
                        : 'none',
                    background: '#fafafa',
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      color: 'var(--text-muted)',
                    }}
                  >
                    {label}
                  </div>
                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: 16,
                      color,
                      marginTop: 3,
                    }}
                  >
                    {value}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: 'var(--text-muted)',
                      marginTop: 2,
                    }}
                  >
                    {sub}
                  </div>
                </div>
              )
            )}
          </div>

          <div
            style={{
              padding: '10px 16px',
              background: '#fafafa',
              borderTop:
                '1px solid var(--border)',
              fontSize: 10,
              color: 'var(--text-muted)',
              lineHeight: 1.6,
            }}
          >
            <strong>
              {isUrdu ? 'حساب:' : 'Calculation:'}
            </strong>{' '}
            {isUrdu
              ? 'رقم = تعداد × شرح؛ کل P&L = فروخت − گندم − مل خرچ − پیکنگ − دیگر اخراجات؛ حتمی نتیجہ = P&L + گین'
              : 'Amount = Qty × Rate; Weight = Qty × Packing KG; P&L = Sales − Wheat Cost − Mill Expense − Packing − Other Expenses; Final = P&L + Gain'}
          </div>
        </div>
      )}
    </div>
  );
}