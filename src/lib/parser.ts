import * as XLSX from 'xlsx'
import Papa from 'papaparse'
import crypto from 'crypto'

export type ParsedRow = Record<string, string | number | null>

export function parseFile(buffer: Buffer, filename: string): ParsedRow[] {
  const ext = filename.split('.').pop()?.toLowerCase()

  if (ext === 'csv') {
    const text = buffer.toString('utf-8')
    const result = Papa.parse<ParsedRow>(text, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
    })
    return result.data
  }

  if (ext === 'xlsx' || ext === 'xls') {
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    return XLSX.utils.sheet_to_json<ParsedRow>(sheet, { defval: null })
  }

  throw new Error('지원하지 않는 파일 형식입니다.')
}

export function hashRow(row: ParsedRow): string {
  const str = JSON.stringify(row, Object.keys(row).sort())
  return crypto.createHash('md5').update(str).digest('hex')
}

export function deduplicateRows(rows: ParsedRow[]): ParsedRow[] {
  const seen = new Set<string>()
  return rows.filter((row) => {
    const h = hashRow(row)
    if (seen.has(h)) return false
    seen.add(h)
    return true
  })
}
