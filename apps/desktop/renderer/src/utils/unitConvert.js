/**
 * unitConvert.js — Flour-mill unit conversion helpers.
 *
 * CANONICAL INTERNAL UNIT: KG
 *
 * All stock quantities are stored in KG internally.
 * UI may display in Maund, Ton, Bag, Bora — conversion happens on entry/display only.
 *
 * Standard conversions:
 *   1 Maund (Mann) = 40 KG
 *   1 Ton          = 1000 KG
 *   1 Bag / Bora   = as configured per item packaging unit (default 50 KG)
 */

export const UNIT_FACTORS = {
  KG:    1,
  MAUND: 40,    // 1 Maund = 40 KG
  MANN:  40,    // alias
  MAAN:  40,    // alias
  TON:   1000,
  BAG:   50,    // default — overridden by Item_Packaging_Units.WeightKg
  BORA:  50,    // alias for BAG
  PIECE: 1,
  G:     0.001,
};

export const DISPLAY_UNITS = [
  { value: 'KG',    label: 'KG',           labelUr: 'کلوگرام' },
  { value: 'MAUND', label: 'Maund (40 KG)',labelUr: 'مَن (40 کلو)' },
  { value: 'TON',   label: 'Ton (1000 KG)',labelUr: 'ٹن (1000 کلو)' },
  { value: 'BAG',   label: 'Bag (50 KG)',  labelUr: 'بوری (50 کلو)' },
  { value: 'PIECE', label: 'Piece',        labelUr: 'عدد' },
];

/**
 * Convert a quantity from displayUnit to KG.
 * @param {number} qty        — quantity in the display unit
 * @param {string} unit       — unit code (KG/MAUND/TON/BAG/…)
 * @param {number} bagWeightKg — KG per bag (for BAG/BORA, from Item_Packaging_Units)
 * @returns {number} quantity in KG
 */
export function toKg(qty, unit, bagWeightKg = 50) {
  if (!qty) return 0;
  const u = (unit || 'KG').toUpperCase();
  if (u === 'BAG' || u === 'BORA') return qty * bagWeightKg;
  return qty * (UNIT_FACTORS[u] || 1);
}

/**
 * Convert a quantity from KG to displayUnit.
 * @param {number} kg         — quantity in KG
 * @param {string} unit       — target display unit
 * @param {number} bagWeightKg — KG per bag
 * @returns {number}
 */
export function fromKg(kg, unit, bagWeightKg = 50) {
  if (!kg) return 0;
  const u = (unit || 'KG').toUpperCase();
  if (u === 'BAG' || u === 'BORA') return kg / bagWeightKg;
  return kg / (UNIT_FACTORS[u] || 1);
}

/**
 * Format a KG quantity for display in the given unit.
 * @param {number} kg
 * @param {string} unit
 * @param {number} bagWeightKg
 * @param {number} decimals
 * @returns {string}  e.g. "250.000 KG" or "6.250 Maund"
 */
export function fmtUnit(kg, unit, bagWeightKg = 50, decimals = 3) {
  const val = fromKg(kg, unit, bagWeightKg);
  return `${val.toFixed(decimals)} ${unit || 'KG'}`;
}

/**
 * Price per KG → price per display unit.
 * @param {number} pricePerKg
 * @param {string} unit
 * @param {number} bagWeightKg
 */
export function pricePerUnit(pricePerKg, unit, bagWeightKg = 50) {
  const u = (unit || 'KG').toUpperCase();
  if (u === 'BAG' || u === 'BORA') return pricePerKg * bagWeightKg;
  return pricePerKg * (UNIT_FACTORS[u] || 1);
}

/**
 * Price per display unit → price per KG.
 */
export function priceToKg(pricePerUnit, unit, bagWeightKg = 50) {
  const u = (unit || 'KG').toUpperCase();
  if (u === 'BAG' || u === 'BORA') return pricePerUnit / bagWeightKg;
  return pricePerUnit / (UNIT_FACTORS[u] || 1);
}
