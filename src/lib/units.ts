/** Years (unit "Jahr" or 1000–2100) are never formatted with thousands separators. */
export function fmtNum(v: number, unit?: string) {
  const isYear = /^jahr/i.test(unit ?? "") || (Number.isInteger(v) && v >= 1000 && v <= 2100);
  return isYear ? String(v) : v.toLocaleString("de-DE");
}

/** Scale/thumb label: years and unit-less values show only the number. */
export function fmtValue(v: number, unit?: string) {
  const n = fmtNum(v, unit);
  return !unit || /^jahr/i.test(unit) ? n : `${n} ${unit}`;
}

/** "Du lagst um X daneben." with singular/plural unit. */
export function deviationText(diff: number, unit?: string, unitPlural?: string) {
  const n = fmtNum(diff, unit);
  if (!unit) return `Du lagst um ${n} daneben.`;
  return `Du lagst um ${n} ${diff === 1 ? unit : unitPlural || unit} daneben.`;
}
