import { Row, Condition, Segment, Period } from './types'

export function isNumeric(val: unknown): boolean {
  return typeof val === 'number' && !isNaN(val)
}

export function detectColumns(rows: Row[]) {
  if (!rows.length) return { numericCols: [], categoryCols: [], dateCols: [] }
  const keys = Object.keys(rows[0])
  const numericCols: string[] = [], categoryCols: string[] = [], dateCols: string[] = []
  keys.forEach((k) => {
    const vals = rows.slice(0, 50).map((r) => r[k])
    const numCount = vals.filter(isNumeric).length
    if (numCount > vals.length * 0.6) { numericCols.push(k); return }
    const strVals = vals.filter((v) => typeof v === 'string') as string[]
    const isDate = strVals.some((v) => /\d{4}[-./]\d{1,2}[-./]\d{1,2}/.test(v))
    if (isDate) dateCols.push(k)
    else categoryCols.push(k)
  })
  return { numericCols, categoryCols, dateCols }
}

export function sumCol(rows: Row[], col: string): number {
  return rows.reduce((s, r) => s + (Number(r[col]) || 0), 0)
}

export function groupBy(rows: Row[], key: string): Record<string, Row[]> {
  return rows.reduce<Record<string, Row[]>>((acc, row) => {
    const k = String(row[key] ?? '(없음)')
    if (!acc[k]) acc[k] = []
    acc[k].push(row)
    return acc
  }, {})
}

export function fmt(n: number): string {
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '억'
  if (n >= 10000) return (n / 10000).toFixed(0) + '만'
  return n.toLocaleString()
}

function getPeriodKey(dateStr: string, period: Period): string {
  const d = new Date(dateStr.replace(/\./g, '-').replace(/년\s*/g, '-').replace(/월\s*/g, '-').replace(/일/g, ''))
  if (isNaN(d.getTime())) return dateStr
  if (period === 'daily') return d.toISOString().slice(0, 10)
  if (period === 'weekly') {
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    const mon = new Date(d.setDate(diff))
    return mon.toISOString().slice(0, 10) + '주'
  }
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function aggregateByPeriod(rows: Row[], dateCol: string, valueCol: string, period: Period) {
  const grouped: Record<string, number> = {}
  rows.forEach((row) => {
    const key = getPeriodKey(String(row[dateCol] ?? ''), period)
    grouped[key] = (grouped[key] || 0) + (Number(row[valueCol]) || 0)
  })
  return Object.entries(grouped)
    .map(([name, value]) => ({ name, value: Math.round(value) }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(-30)
}

export function applyCondition(row: Row, cond: Condition): boolean {
  const val = row[cond.col]
  const num = Number(val)
  const condNum = Number(cond.value)
  const strVal = String(val ?? '').toLowerCase()
  const strCond = cond.value.toLowerCase()

  switch (cond.op) {
    case '=': return String(val) === cond.value
    case '!=': return String(val) !== cond.value
    case '>': return num > condNum
    case '>=': return num >= condNum
    case '<': return num < condNum
    case '<=': return num <= condNum
    case 'contains': return strVal.includes(strCond)
    case 'between': return num >= condNum && num <= Number(cond.value2 ?? 0)
    default: return true
  }
}

export function applySegment(rows: Row[], segment: Segment): Row[] {
  if (!segment.conditions.length) return rows
  return rows.filter((row) => {
    if (segment.logic === 'AND') return segment.conditions.every(c => applyCondition(row, c))
    return segment.conditions.some(c => applyCondition(row, c))
  })
}
