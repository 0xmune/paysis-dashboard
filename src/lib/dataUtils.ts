import { Row, Condition, Segment, Period } from './types'

export function isNumeric(val: unknown): boolean {
  return typeof val === 'number' && !isNaN(val)
}

export function detectColumns(rows: Row[]) {
  if (!rows.length) return { numericCols: [], categoryCols: [], dateCols: [] }
  const keys = Object.keys(rows[0])
  const numericCols: string[] = [], categoryCols: string[] = [], dateCols: string[] = []
  keys.forEach((k) => {
    const vals = rows.slice(0, 100).map((r) => r[k])
    const numCount = vals.filter(isNumeric).length
    if (numCount > vals.length * 0.6) { numericCols.push(k); return }
    const strVals = vals.filter((v) => typeof v === 'string' && v.trim() !== '' && v !== 'null') as string[]
    const isDate = strVals.length > 0 && strVals.filter(v => /\d{4}[-./]\d{1,2}[-./]\d{1,2}/.test(v)).length > strVals.length * 0.5
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

function normalizeDate(dateStr: string): Date | null {
  if (!dateStr || dateStr === 'null' || dateStr === 'undefined') return null
  const cleaned = dateStr
    .replace(/년\s*/g, '-').replace(/월\s*/g, '-').replace(/일/g, '')
    .replace(/\./g, '-').replace(/\s+/g, '').trim()
  const d = new Date(cleaned)
  if (isNaN(d.getTime())) return null
  // 너무 이상한 날짜 제외 (1900년 이전 or 2100년 이후)
  if (d.getFullYear() < 1900 || d.getFullYear() > 2100) return null
  return d
}

function getPeriodKey(dateStr: string, period: Period): string | null {
  const d = normalizeDate(dateStr)
  if (!d) return null
  if (period === 'daily') return d.toISOString().slice(0, 10)
  if (period === 'weekly') {
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    const mon = new Date(d)
    mon.setDate(diff)
    return mon.toISOString().slice(0, 10) + '주'
  }
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function aggregateByPeriod(rows: Row[], dateCol: string, valueCol: string, period: Period) {
  const grouped: Record<string, number> = {}
  rows.forEach((row) => {
    const key = getPeriodKey(String(row[dateCol] ?? ''), period)
    if (!key) return // null 날짜 제외
    grouped[key] = (grouped[key] || 0) + (Number(row[valueCol]) || 0)
  })
  return Object.entries(grouped)
    .map(([name, value]) => ({ name, value: Math.round(value) }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(-30)
}

// 전월/전반기 대비 변화율 계산
export function calcPeriodChange(rows: Row[], valueCol: string, dateCols: string[]): number | null {
  if (!dateCols.length || rows.length < 4) return null
  const dateCol = dateCols[0]

  const dated = rows
    .map(r => ({ row: r, d: normalizeDate(String(r[dateCol] ?? '')) }))
    .filter(x => x.d !== null)
    .sort((a, b) => a.d!.getTime() - b.d!.getTime())

  if (dated.length < 4) return null

  const mid = Math.floor(dated.length / 2)
  const prev = dated.slice(0, mid).reduce((s, x) => s + (Number(x.row[valueCol]) || 0), 0)
  const curr = dated.slice(mid).reduce((s, x) => s + (Number(x.row[valueCol]) || 0), 0)
  if (prev === 0) return null
  return ((curr - prev) / Math.abs(prev)) * 100
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
