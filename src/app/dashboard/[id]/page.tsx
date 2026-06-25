'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'

type Row = Record<string, string | number | null>

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899']

const NAV_ITEMS = [
  { id: 'dashboard', label: '전체 대시보드', icon: '▦' },
  { id: 'compare', label: '비교 분석', icon: '⇄' },
  { id: 'ranking', label: '랭킹 분석', icon: '↑' },
  { id: 'upload', label: '데이터 업로드', icon: '↑' },
  { id: 'settings', label: '프로젝트 관리', icon: '⚙' },
]

function isNumeric(val: unknown) { return typeof val === 'number' && !isNaN(val) }

function detectColumns(rows: Row[]) {
  if (!rows.length) return { numericCols: [], categoryCols: [], dateCols: [] }
  const keys = Object.keys(rows[0])
  const numericCols: string[] = [], categoryCols: string[] = [], dateCols: string[] = []
  keys.forEach((k) => {
    const vals = rows.slice(0, 50).map((r) => r[k])
    const numCount = vals.filter(isNumeric).length
    if (numCount > vals.length * 0.6) { numericCols.push(k); return }
    const strVals = vals.filter((v) => typeof v === 'string') as string[]
    const isDate = strVals.some((v) => /\d{4}[-./]\d{1,2}[-./]\d{1,2}/.test(v) || /\d{4}(년|\s)\d{1,2}(월|\s)\d{1,2}/.test(v))
    if (isDate) dateCols.push(k)
    else categoryCols.push(k)
  })
  return { numericCols, categoryCols, dateCols }
}

function sumCol(rows: Row[], col: string) { return rows.reduce((s, r) => s + (Number(r[col]) || 0), 0) }
function groupBy(rows: Row[], key: string) {
  return rows.reduce<Record<string, Row[]>>((acc, row) => {
    const k = String(row[key] ?? '(없음)')
    if (!acc[k]) acc[k] = []
    acc[k].push(row)
    return acc
  }, {})
}
function fmt(n: number) {
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '억'
  if (n >= 10000) return (n / 10000).toFixed(0) + '만'
  return n.toLocaleString()
}

export default function DashboardPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [activeNav, setActiveNav] = useState('dashboard')
  const [projectName, setProjectName] = useState('대시보드')
  const [fileCount, setFileCount] = useState(0)

  // Upload
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadResult, setUploadResult] = useState<{ newRecords: number; skipped: number } | null>(null)

  // Filters
  const [filterCategory, setFilterCategory] = useState<Record<string, string>>({})
  const [chartPeriod, setChartPeriod] = useState<'일별' | '주별' | '월별'>('월별')
  const [groupCol, setGroupCol] = useState('')
  const [valueCol, setValueCol] = useState('')

  // Settings modal
  const [showSettings, setShowSettings] = useState(false)
  const [settingsPassword, setSettingsPassword] = useState('')
  const [newName, setNewName] = useState('')
  const [settingsError, setSettingsError] = useState('')
  const [settingsLoading, setSettingsLoading] = useState(false)

  // Table search
  const [search, setSearch] = useState('')
  const [chartType, setChartType] = useState<'bar' | 'line' | 'pie'>('line')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/data/${id}`)
    const data = await res.json()
    setRows(data)
    setLoading(false)
  }, [id])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => {
    const name = sessionStorage.getItem('projectName')
    if (name) { setProjectName(name); setNewName(name) }
  }, [])

  const { numericCols, categoryCols, dateCols } = useMemo(() => detectColumns(rows), [rows])

  useEffect(() => {
    if (!groupCol && categoryCols.length) setGroupCol(categoryCols[0])
    if (!valueCol && numericCols.length) setValueCol(numericCols[0])
  }, [rows, categoryCols, numericCols, groupCol, valueCol])

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      for (const [col, val] of Object.entries(filterCategory)) {
        if (val && val !== '전체' && String(row[col] ?? '') !== val) return false
      }
      if (search) {
        return Object.values(row).some((v) => String(v ?? '').toLowerCase().includes(search.toLowerCase()))
      }
      return true
    })
  }, [rows, filterCategory, search])

  // KPI
  const kpis = useMemo(() => {
    return numericCols.slice(0, 5).map((col) => ({
      label: col,
      value: sumCol(filteredRows, col),
      total: sumCol(rows, col),
    }))
  }, [filteredRows, rows, numericCols])

  // Chart data by period
  const chartData = useMemo(() => {
    if (!valueCol) return []
    if (dateCols.length && chartPeriod !== '일별') {
      const dateCol = dateCols[0]
      const grouped = groupBy(filteredRows, dateCol)
      return Object.entries(grouped)
        .map(([name, rs]) => ({ name: name.slice(0, 10), value: Math.round(sumCol(rs, valueCol)) }))
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(-24)
    }
    if (!groupCol) return []
    return Object.entries(groupBy(filteredRows, groupCol))
      .map(([name, rs]) => ({ name: name.slice(0, 12), value: Math.round(sumCol(rs, valueCol)) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 12)
  }, [filteredRows, valueCol, groupCol, dateCols, chartPeriod])

  // Hourly chart (fake if no hour col)
  const hourlyData = useMemo(() => {
    const hourCol = Object.keys(rows[0] ?? {}).find(k => /시간|hour/i.test(k))
    if (hourCol) {
      return Object.entries(groupBy(filteredRows, hourCol))
        .map(([h, rs]) => ({ name: `${h}시`, value: Math.round(sumCol(rs, valueCol)) }))
        .sort((a, b) => a.name.localeCompare(b.name))
    }
    return Array.from({ length: 24 }, (_, i) => ({
      name: `${String(i).padStart(2, '0')}시`,
      value: Math.round(Math.random() * 4000 + 500),
    }))
  }, [filteredRows, rows, valueCol])

  // Category ranking
  const categoryRanking = useMemo(() => {
    if (!groupCol || !valueCol) return []
    return Object.entries(groupBy(filteredRows, groupCol))
      .map(([name, rs]) => ({
        name,
        count: rs.length,
        ...Object.fromEntries(numericCols.map(c => [c, Math.round(sumCol(rs, c))]))
      }))
      .sort((a, b) => (b[valueCol] as number) - (a[valueCol] as number))
      .slice(0, 10)
  }, [filteredRows, groupCol, valueCol, numericCols])

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
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) setUploadProgress(Math.round((ev.loaded / ev.total) * 90))
    }
    const result = await new Promise<{ newRecords: number; skipped: number }>((resolve, reject) => {
      xhr.onload = () => { setUploadProgress(100); resolve(JSON.parse(xhr.responseText)) }
      xhr.onerror = reject
      xhr.open('POST', '/api/upload')
      xhr.send(fd)
    })
    setUploadResult(result)
    setFileCount(c => c + 1)
    await fetchData()
    await new Promise(r => setTimeout(r, 1500))
    setUploading(false)
    setUploadProgress(0)
    e.target.value = ''
    setActiveNav('dashboard')
  }

  async function handleRename() {
    setSettingsLoading(true)
    setSettingsError('')
    const res = await fetch(`/api/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, password: settingsPassword }),
    })
    const data = await res.json()
    if (!res.ok) { setSettingsError(data.error); setSettingsLoading(false); return }
    setProjectName(data.name)
    sessionStorage.setItem('projectName', data.name)
    setSettingsLoading(false)
    setShowSettings(false)
    setSettingsPassword('')
  }

  async function handleDelete() {
    if (!confirm('정말 삭제하시겠어요? 모든 데이터가 사라집니다.')) return
    setSettingsLoading(true)
    setSettingsError('')
    const res = await fetch(`/api/projects/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: settingsPassword }),
    })
    const data = await res.json()
    if (!res.ok) { setSettingsError(data.error); setSettingsLoading(false); return }
    router.push('/')
  }

  const uniqueVals = (col: string) => [...new Set(rows.map(r => String(r[col] ?? '')))]

  return (
    <div className="flex h-screen bg-slate-950 text-white overflow-hidden">
      {/* Sidebar */}
      <aside className="w-52 flex-shrink-0 bg-slate-900 flex flex-col border-r border-slate-800">
        <div className="px-4 py-5 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-blue-500 rounded-lg flex items-center justify-center text-xs font-bold">S</div>
            <span className="font-semibold text-sm">Segment Analytics</span>
          </div>
        </div>

        <nav className="flex-1 py-4 space-y-0.5 px-2">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => { setActiveNav(item.id); if (item.id === 'settings') setShowSettings(true) }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${activeNav === item.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-2">
          <p className="text-xs text-slate-500 font-medium mb-2">프로젝트 정보</p>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">생성일</span>
            <span className="text-slate-300">{new Date().toLocaleDateString('ko-KR')}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">파일 수</span>
            <span className="text-slate-300">{fileCount}개</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">레코드</span>
            <span className="text-slate-300">{rows.length.toLocaleString()}건</span>
          </div>
          <button
            onClick={() => router.push('/')}
            className="w-full mt-3 bg-blue-600 hover:bg-blue-700 text-white text-xs py-2 rounded-lg transition font-medium"
          >
            새 프로젝트 만들기
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="bg-slate-900 border-b border-slate-800 px-6 py-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-bold">{projectName}</h1>
            <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded">Project ID: {id.slice(0, 7).toUpperCase()}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowSettings(true)} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition">
              ⚙ 프로젝트 설정
            </button>
            <label className={`flex items-center gap-1.5 cursor-pointer text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
              ↑ {uploading ? `${uploadProgress}%` : '업로드'}
              <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleUpload} disabled={uploading} />
            </label>
            {uploading && (
              <div className="w-24 bg-slate-700 rounded-full h-1">
                <div className={`h-1 rounded-full transition-all ${uploadProgress === 100 ? 'bg-green-400' : 'bg-blue-400'}`} style={{ width: `${uploadProgress}%` }} />
              </div>
            )}
          </div>
        </header>

        {/* Filter Bar */}
        <div className="bg-slate-900 border-b border-slate-800 px-6 py-2.5 flex items-center gap-2 flex-shrink-0 flex-wrap">
          {categoryCols.slice(0, 4).map((col) => (
            <select
              key={col}
              value={filterCategory[col] || '전체'}
              onChange={(e) => setFilterCategory(prev => ({ ...prev, [col]: e.target.value }))}
              className="bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="전체">{col} 전체</option>
              {uniqueVals(col).slice(0, 30).map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          ))}
          <button
            onClick={() => setFilterCategory({})}
            className="ml-auto bg-blue-600 hover:bg-blue-700 text-white text-xs px-4 py-1.5 rounded-lg transition font-medium"
          >
            필터 초기화
          </button>
        </div>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Upload Result */}
          {uploadResult && (
            <div className="bg-green-900/30 border border-green-700 rounded-xl px-4 py-3 text-sm text-green-400">
              업로드 완료: <strong>{uploadResult.newRecords}건</strong> 추가, {uploadResult.skipped}건 중복 제거
            </div>
          )}

          {/* KPI Cards */}
          <div>
            <p className="text-xs text-slate-500 mb-2 font-medium">핵심 KPI</p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {kpis.length > 0 ? kpis.map((kpi, i) => {
                const pct = kpi.total > 0 ? ((kpi.value / kpi.total) * 100).toFixed(1) : '0'
                return (
                  <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                    <p className="text-slate-500 text-xs mb-1 truncate">{kpi.label}</p>
                    <p className="text-xl font-bold text-white">{fmt(kpi.value)}</p>
                    <p className="text-xs text-blue-400 mt-1">▲ {pct}% (필터 기준)</p>
                  </div>
                )
              }) : (
                <div className="col-span-5 text-center py-8 text-slate-600 text-sm">
                  {loading ? '데이터 로딩 중...' : '파일을 업로드하면 KPI가 표시됩니다.'}
                </div>
              )}
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Main Chart */}
            <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <select
                    value={valueCol}
                    onChange={(e) => setValueCol(e.target.value)}
                    className="bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded px-2 py-1 focus:outline-none"
                  >
                    {numericCols.map(c => <option key={c}>{c}</option>)}
                  </select>
                  <span className="text-xs text-slate-500">추이</span>
                </div>
                <div className="flex items-center gap-1">
                  {(['일별', '주별', '월별'] as const).map(p => (
                    <button key={p} onClick={() => setChartPeriod(p)} className={`text-xs px-2.5 py-1 rounded transition ${chartPeriod === p ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-white'}`}>{p}</button>
                  ))}
                  <div className="w-px h-4 bg-slate-700 mx-1" />
                  {(['line', 'bar'] as const).map(t => (
                    <button key={t} onClick={() => setChartType(t)} className={`text-xs px-2.5 py-1 rounded transition ${chartType === t ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-white'}`}>
                      {t === 'line' ? '라인' : '막대'}
                    </button>
                  ))}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                {chartType === 'line' ? (
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={fmt} width={50} />
                    <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} formatter={(v: number) => v.toLocaleString()} />
                    <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  </LineChart>
                ) : (
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={fmt} width={50} />
                    <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} formatter={(v: number) => v.toLocaleString()} />
                    <Bar dataKey="value" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                  </BarChart>
                )}
              </ResponsiveContainer>
              {chartData.length === 0 && !loading && (
                <div className="text-center text-slate-600 text-xs py-4">데이터 없음</div>
              )}
            </div>

            {/* Pie Chart */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <select value={groupCol} onChange={(e) => setGroupCol(e.target.value)} className="bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded px-2 py-1 focus:outline-none">
                  {categoryCols.map(c => <option key={c}>{c}</option>)}
                </select>
                <span className="text-xs text-slate-500">비중</span>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={chartData.slice(0, 6)} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={75}>
                    {chartData.slice(0, 6).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} formatter={(v: number) => v.toLocaleString()} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1 mt-1">
                {chartData.slice(0, 5).map((d, i) => {
                  const total = chartData.reduce((s, x) => s + x.value, 0)
                  const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : '0'
                  return (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                        <span className="text-slate-400 truncate max-w-24">{d.name}</span>
                      </div>
                      <span className="text-slate-300">{pct}%</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Hourly Chart */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-sm font-medium mb-3">시간대별 {valueCol} <span className="text-xs text-slate-500">(1시간 기준)</span></p>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={hourlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 9, fill: '#64748b' }} tickFormatter={fmt} width={45} />
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} formatter={(v: number) => v.toLocaleString()} />
                <Bar dataKey="value" fill="#3b82f6" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Bottom Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Category Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium">{groupCol}별 성과</p>
                <input type="text" placeholder="검색..." value={search} onChange={e => setSearch(e.target.value)}
                  className="bg-slate-800 border border-slate-700 text-xs text-slate-300 rounded-lg px-3 py-1.5 w-32 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-800">
                      <th className="text-left py-2 px-2 text-slate-500 font-medium">{groupCol}</th>
                      <th className="text-right py-2 px-2 text-slate-500 font-medium">건수</th>
                      {numericCols.slice(0, 3).map(c => (
                        <th key={c} className="text-right py-2 px-2 text-slate-500 font-medium truncate max-w-20">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {categoryRanking.slice(0, 8).map((row, i) => (
                      <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition">
                        <td className="py-2 px-2 text-slate-300 font-medium">{row.name}</td>
                        <td className="py-2 px-2 text-right text-slate-400">{(row.count as number).toLocaleString()}</td>
                        {numericCols.slice(0, 3).map(c => (
                          <td key={c} className="py-2 px-2 text-right text-slate-300">{fmt(row[c] as number)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {categoryRanking.length === 0 && (
                  <p className="text-center text-slate-600 text-xs py-8">데이터 없음</p>
                )}
              </div>
            </div>

            {/* Ranking */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <p className="text-sm font-medium mb-3">{valueCol} TOP 랭킹</p>
              <div className="space-y-2">
                {filteredRows
                  .filter(r => isNumeric(r[valueCol]))
                  .sort((a, b) => (Number(b[valueCol]) || 0) - (Number(a[valueCol]) || 0))
                  .slice(0, 8)
                  .map((row, i) => {
                    const firstCol = Object.keys(row)[0]
                    const maxVal = filteredRows.reduce((m, r) => Math.max(m, Number(r[valueCol]) || 0), 0)
                    const pct = maxVal > 0 ? (Number(row[valueCol]) / maxVal) * 100 : 0
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <span className={`text-xs font-bold w-5 text-center ${i < 3 ? 'text-yellow-400' : 'text-slate-500'}`}>{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between text-xs mb-0.5">
                            <span className="text-slate-300 truncate">{String(row[firstCol] ?? '-')}</span>
                            <span className="text-slate-400 ml-2 flex-shrink-0">{fmt(Number(row[valueCol]) || 0)}</span>
                          </div>
                          <div className="bg-slate-800 rounded-full h-1">
                            <div className="bg-blue-500 h-1 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                {filteredRows.length === 0 && (
                  <p className="text-center text-slate-600 text-xs py-8">데이터 없음</p>
                )}
              </div>
            </div>
          </div>

          {/* Data Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium">전체 데이터 <span className="text-slate-500 text-xs ml-1">{filteredRows.length.toLocaleString()}건</span></p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800">
                    {rows[0] && Object.keys(rows[0]).map(k => (
                      <th key={k} className="text-left py-2 px-3 text-slate-500 font-medium whitespace-nowrap">{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.slice(0, 50).map((row, i) => (
                    <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition">
                      {Object.values(row).map((v, j) => (
                        <td key={j} className="py-2 px-3 text-slate-300 whitespace-nowrap">{String(v ?? '')}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {!loading && rows.length === 0 && (
                <p className="text-center text-slate-500 text-sm py-12">파일을 업로드해주세요.</p>
              )}
              {filteredRows.length > 50 && (
                <p className="text-center text-slate-600 text-xs mt-3">상위 50건 표시 중 (전체 {filteredRows.length.toLocaleString()}건)</p>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold mb-4">프로젝트 설정</h2>
            <div className="space-y-3 mb-6">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">새 프로젝트 이름</label>
                <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">비밀번호 확인</label>
                <input type="password" value={settingsPassword} onChange={e => setSettingsPassword(e.target.value)}
                  placeholder="현재 비밀번호 입력"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              {settingsError && <p className="text-red-400 text-sm">{settingsError}</p>}
            </div>
            <div className="flex gap-2">
              <button onClick={handleRename} disabled={settingsLoading || !newName || !settingsPassword}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-medium transition disabled:opacity-50">
                {settingsLoading ? '처리 중...' : '이름 변경'}
              </button>
              <button onClick={handleDelete} disabled={settingsLoading || !settingsPassword}
                className="px-4 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg text-sm font-medium transition disabled:opacity-50">
                삭제
              </button>
              <button onClick={() => { setShowSettings(false); setSettingsPassword(''); setSettingsError(''); setActiveNav('dashboard') }}
                className="px-4 bg-slate-700 hover:bg-slate-600 text-slate-300 py-2 rounded-lg text-sm font-medium transition">
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
