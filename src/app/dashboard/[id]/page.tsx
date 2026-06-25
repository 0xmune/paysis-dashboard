'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'

type Row = Record<string, string | number | null>

const COLORS = ['#1e293b', '#475569', '#94a3b8', '#cbd5e1', '#e2e8f0', '#0ea5e9', '#6366f1']

function isNumeric(val: unknown): boolean {
  return typeof val === 'number' && !isNaN(val)
}

function detectColumns(rows: Row[]) {
  if (!rows.length) return { numericCols: [], categoryCols: [], dateCols: [] }
  const keys = Object.keys(rows[0])
  const numericCols: string[] = []
  const categoryCols: string[] = []
  const dateCols: string[] = []

  keys.forEach((k) => {
    const vals = rows.slice(0, 50).map((r) => r[k])
    const numCount = vals.filter(isNumeric).length
    if (numCount > vals.length * 0.7) {
      numericCols.push(k)
    } else {
      const strVals = vals.filter((v) => typeof v === 'string') as string[]
      const isDate = strVals.some((v) => /\d{4}[-./]\d{1,2}[-./]\d{1,2}/.test(v))
      if (isDate) dateCols.push(k)
      else categoryCols.push(k)
    }
  })
  return { numericCols, categoryCols, dateCols }
}

function groupBy(rows: Row[], key: string): Record<string, Row[]> {
  return rows.reduce<Record<string, Row[]>>((acc, row) => {
    const k = String(row[key] ?? '(없음)')
    if (!acc[k]) acc[k] = []
    acc[k].push(row)
    return acc
  }, {})
}

function sumCol(rows: Row[], col: string): number {
  return rows.reduce((s, r) => s + (Number(r[col]) || 0), 0)
}

export default function DashboardPage() {
  const { id } = useParams<{ id: string }>()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadResult, setUploadResult] = useState<{ newRecords: number; skipped: number } | null>(null)
  const [chartType, setChartType] = useState<'bar' | 'line' | 'pie'>('bar')
  const [groupCol, setGroupCol] = useState('')
  const [valueCol, setValueCol] = useState('')
  const [search, setSearch] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/data/${id}`)
    const data = await res.json()
    setRows(data)
    setLoading(false)
  }, [id])

  useEffect(() => { fetchData() }, [fetchData])

  const { numericCols, categoryCols } = detectColumns(rows)

  useEffect(() => {
    if (!groupCol && categoryCols.length) setGroupCol(categoryCols[0])
    if (!valueCol && numericCols.length) setValueCol(numericCols[0])
  }, [rows, categoryCols, numericCols, groupCol, valueCol])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadProgress(0)
    setUploadResult(null)

    const xhr = new XMLHttpRequest()
    const fd = new FormData()
    fd.append('file', file)
    fd.append('projectId', id)

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        setUploadProgress(Math.round((event.loaded / event.total) * 90))
      }
    }

    const result = await new Promise<{ newRecords: number; skipped: number }>((resolve, reject) => {
      xhr.onload = () => {
        setUploadProgress(100)
        resolve(JSON.parse(xhr.responseText))
      }
      xhr.onerror = reject
      xhr.open('POST', '/api/upload')
      xhr.send(fd)
    })

    setUploadResult(result)
    setUploading(false)
    setUploadProgress(0)
    e.target.value = ''
    fetchData()
  }

  const filteredRows = search
    ? rows.filter((r) => Object.values(r).some((v) => String(v ?? '').toLowerCase().includes(search.toLowerCase())))
    : rows

  const chartData = groupCol && valueCol
    ? Object.entries(groupBy(filteredRows, groupCol))
        .map(([name, rs]) => ({ name: name.slice(0, 20), value: Math.round(sumCol(rs, valueCol)) }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 15)
    : []

  const totalRows = filteredRows.length
  const totalValue = valueCol ? Math.round(sumCol(filteredRows, valueCol)) : 0
  const uniqueGroups = groupCol ? new Set(filteredRows.map((r) => r[groupCol])).size : 0

  return (
    <div className="min-h-screen bg-slate-50">
      {/* 헤더 */}
      <header className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">Paysis Dashboard</h1>
          <p className="text-slate-400 text-xs mt-0.5">Project ID: {id}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <label className={`cursor-pointer bg-white text-slate-900 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-100 transition ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
            {uploading ? `업로드 중... ${uploadProgress}%` : '파일 업로드'}
            <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
          {uploading && (
            <div className="w-40 bg-slate-700 rounded-full h-1.5">
              <div
                className="bg-white h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          )}
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* 업로드 결과 */}
        {uploadResult && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800">
            업로드 완료: <strong>{uploadResult.newRecords}건</strong> 추가, {uploadResult.skipped}건 중복 제거됨
          </div>
        )}

        {/* KPI 카드 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-slate-500 text-xs mb-1">총 레코드 수</p>
            <p className="text-2xl font-bold text-slate-800">{totalRows.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-slate-500 text-xs mb-1">{valueCol || '수치 컬럼'} 합계</p>
            <p className="text-2xl font-bold text-slate-800">{totalValue.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-slate-500 text-xs mb-1">{groupCol || '그룹 컬럼'} 종류</p>
            <p className="text-2xl font-bold text-slate-800">{uniqueGroups.toLocaleString()}</p>
          </div>
        </div>

        {/* 차트 */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <select
              value={groupCol}
              onChange={(e) => setGroupCol(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm"
            >
              {[...categoryCols].map((c) => <option key={c}>{c}</option>)}
            </select>
            <select
              value={valueCol}
              onChange={(e) => setValueCol(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm"
            >
              {numericCols.map((c) => <option key={c}>{c}</option>)}
            </select>
            <div className="flex gap-1 ml-auto">
              {(['bar', 'line', 'pie'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setChartType(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${chartType === t ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  {t === 'bar' ? '막대' : t === 'line' ? '라인' : '파이'}
                </button>
              ))}
            </div>
          </div>

          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              {chartType === 'pie' ? (
                <PieChart>
                  <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={120} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => v.toLocaleString()} />
                </PieChart>
              ) : chartType === 'line' ? (
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v.toLocaleString()} />
                  <Tooltip formatter={(v: number) => v.toLocaleString()} />
                  <Line type="monotone" dataKey="value" stroke="#1e293b" strokeWidth={2} dot={false} />
                </LineChart>
              ) : (
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v.toLocaleString()} />
                  <Tooltip formatter={(v: number) => v.toLocaleString()} />
                  <Bar dataKey="value" fill="#1e293b" radius={[4, 4, 0, 0]} />
                </BarChart>
              )}
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
              {loading ? '데이터 로딩 중...' : '파일을 업로드하면 차트가 표시됩니다.'}
            </div>
          )}
        </div>

        {/* 테이블 */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-800">데이터 테이블</h2>
            <input
              type="text"
              placeholder="검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-100">
                  {rows[0] && Object.keys(rows[0]).map((k) => (
                    <th key={k} className="py-2 px-3 text-slate-500 font-medium whitespace-nowrap">{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.slice(0, 100).map((row, i) => (
                  <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                    {Object.values(row).map((v, j) => (
                      <td key={j} className="py-2 px-3 text-slate-700 whitespace-nowrap">{String(v ?? '')}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredRows.length > 100 && (
              <p className="text-slate-400 text-xs mt-3 text-center">상위 100건 표시 중 (전체 {filteredRows.length.toLocaleString()}건)</p>
            )}
            {!loading && rows.length === 0 && (
              <p className="text-slate-400 text-sm text-center py-12">업로드된 데이터가 없습니다.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
