'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Widget, DashboardConfig, Segment } from '@/lib/types'
import { detectColumns, applySegment } from '@/lib/dataUtils'
import type { Row } from '@/lib/types'
import dynamic from 'next/dynamic'

const WidgetCard = dynamic(() => import('@/components/WidgetCard'), { ssr: false })
const SegmentBuilder = dynamic(() => import('@/components/SegmentBuilder'), { ssr: false })
const AiChat = dynamic(() => import('@/components/AiChat'), { ssr: false })

const NAV_ITEMS = [
  { id: 'dashboard', label: '전체 대시보드', icon: '▦' },
  { id: 'upload', label: '데이터 업로드', icon: '↑' },
  { id: 'segments', label: '세그먼트', icon: '◈' },
  { id: 'settings', label: '프로젝트 관리', icon: '⚙' },
]


function defaultConfig(numericCols: string[], categoryCols: string[]): DashboardConfig {
  const widgets: Widget[] = []
  // Row 0: KPI 카드들 (최대 4개 균등 배치)
  numericCols.slice(0, 4).forEach((col, i) => {
    widgets.push({ id: `kpi-${i}`, type: 'kpi', title: col, valueCol: col, groupCol: categoryCols[0] ?? '', period: 'monthly', row: 0 })
  })
  // Row 1: 라인 차트
  if (numericCols[0]) {
    widgets.push({ id: 'chart-0', type: 'line', title: `${numericCols[0]} 추이`, valueCol: numericCols[0], groupCol: categoryCols[0] ?? '', period: 'monthly', row: 1 })
  }
  // Row 2: 막대 + 파이
  if (numericCols[0] && categoryCols[0]) {
    widgets.push({ id: 'chart-1', type: 'bar', title: `${categoryCols[0]}별 ${numericCols[0]}`, valueCol: numericCols[0], groupCol: categoryCols[0], period: 'monthly', row: 2 })
    widgets.push({ id: 'chart-2', type: 'pie', title: `${categoryCols[0]} 비중`, valueCol: numericCols[0], groupCol: categoryCols[0], period: 'monthly', row: 2 })
  }
  return { widgets, segments: [] }
}

export default function DashboardPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [projectName, setProjectName] = useState('대시보드')
  const [activeNav, setActiveNav] = useState('dashboard')

  const [config, setConfig] = useState<DashboardConfig>({ widgets: [], segments: [] })
  const [editMode, setEditMode] = useState(false)
  const [showSegmentBuilder, setShowSegmentBuilder] = useState(false)
  const [showAiChat, setShowAiChat] = useState(false)
  const [saving, setSaving] = useState(false)
  const [filterCategory, setFilterCategory] = useState<Record<string, string>>({})
  const [activeSegmentId, setActiveSegmentId] = useState<string>('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // Settings modal
  const [showSettings, setShowSettings] = useState(false)
  const [settingsPassword, setSettingsPassword] = useState('')
  const [newName, setNewName] = useState('')
  const [settingsError, setSettingsError] = useState('')
  const [settingsLoading, setSettingsLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/data/${id}`)
    const data = await res.json()
    setRows(data)
    setLoading(false)
  }, [id])

  const fetchConfig = useCallback(async () => {
    const res = await fetch(`/api/config/${id}`)
    const data = await res.json()
    if (data) setConfig(data)
  }, [id])

  useEffect(() => {
    fetchData()
    fetchConfig()
    const name = sessionStorage.getItem('projectName')
    if (name) { setProjectName(name); setNewName(name) }
  }, [fetchData, fetchConfig])

  const { numericCols, categoryCols, dateCols } = useMemo(() => detectColumns(rows), [rows])

  useEffect(() => {
    if (!loading && rows.length > 0 && config.widgets.length === 0) {
      setConfig(defaultConfig(numericCols, categoryCols))
    }
  }, [loading, rows, numericCols, categoryCols, config.widgets.length])

  async function saveConfig(cfg: DashboardConfig) {
    setSaving(true)
    await fetch(`/api/config/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg),
    })
    setSaving(false)
  }

  function updateWidget(widgetId: string, patch: Partial<Widget>) {
    setConfig(prev => ({
      ...prev,
      widgets: prev.widgets.map(w => w.id === widgetId ? { ...w, ...patch } : w),
    }))
  }

  function removeWidget(widgetId: string) {
    setConfig(prev => ({ ...prev, widgets: prev.widgets.filter(w => w.id !== widgetId) }))
  }

  function addWidget(row?: number) {
    const maxRow = config.widgets.reduce((m, w) => Math.max(m, w.row), 0)
    const newWidget: Widget = {
      id: Math.random().toString(36).slice(2),
      type: 'bar',
      title: '새 위젯',
      valueCol: numericCols[0] ?? '',
      groupCol: categoryCols[0] ?? '',
      period: 'monthly',
      row: row ?? maxRow + 1,
    }
    setConfig(prev => ({ ...prev, widgets: [...prev.widgets, newWidget] }))
  }

  // 같은 row 위젯끼리 묶기
  const widgetRows = useMemo(() => {
    const map: Record<number, Widget[]> = {}
    config.widgets.forEach(w => {
      if (!map[w.row]) map[w.row] = []
      map[w.row].push(w)
    })
    return Object.entries(map)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([row, widgets]) => ({ row: Number(row), widgets }))
  }, [config.widgets])

  async function handleSave() {
    await saveConfig(config)
    setEditMode(false)
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
    if (!confirm('정말 삭제하시겠어요?')) return
    setSettingsLoading(true)
    const res = await fetch(`/api/projects/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: settingsPassword }),
    })
    const data = await res.json()
    if (!res.ok) { setSettingsError(data.error); setSettingsLoading(false); return }
    router.push('/')
  }

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-52 flex-shrink-0 bg-slate-900 flex flex-col border-r border-slate-800">
        <div className="px-4 py-5 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-blue-500 rounded-lg flex items-center justify-center text-xs font-bold text-white">S</div>
            <span className="font-semibold text-sm text-white">Segment Analytics</span>
          </div>
        </div>

        <nav className="flex-1 py-4 space-y-0.5 px-2">
          {NAV_ITEMS.map((item) => (
            <button key={item.id}
              onClick={() => {
                if (item.id === 'upload') { router.push(`/dashboard/${id}/upload`); return }
                if (item.id === 'segments') { setShowSegmentBuilder(true); setActiveNav('segments'); return }
                if (item.id === 'settings') { setShowSettings(true); setActiveNav('settings'); return }
                setActiveNav(item.id)
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${activeNav === item.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            >
              <span>{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-1.5">
          <p className="text-xs text-slate-500 font-medium mb-2">프로젝트 정보</p>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">레코드</span>
            <span className="text-slate-300">{rows.length.toLocaleString()}건</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">세그먼트</span>
            <span className="text-slate-300">{config.segments.length}개</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">위젯</span>
            <span className="text-slate-300">{config.widgets.length}개</span>
          </div>
          <button onClick={() => router.push('/')}
            className="w-full mt-3 bg-blue-600 hover:bg-blue-700 text-white text-xs py-2 rounded-lg transition font-medium">
            새 프로젝트
          </button>
        </div>
      </aside>

      {/* Main + AI Panel */}
      <div className="flex-1 flex overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between flex-shrink-0 shadow-sm">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-bold text-gray-900">{projectName}</h1>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
              {id.slice(0, 7).toUpperCase()}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {editMode ? (
              <>
                <button onClick={() => addWidget()}
                  className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-lg transition">
                  + 위젯 추가
                </button>
                <button onClick={() => setShowSegmentBuilder(true)}
                  className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-lg transition">
                  ◈ 세그먼트
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg transition font-medium disabled:opacity-50">
                  {saving ? '저장 중...' : '저장'}
                </button>
                <button onClick={() => { setEditMode(false); fetchConfig() }}
                  className="text-xs text-gray-400 hover:text-gray-700 px-3 py-1.5 rounded-lg transition">
                  취소
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setShowAiChat(v => !v)}
                  className={`text-xs px-3 py-1.5 rounded-lg transition font-medium border ${showAiChat ? 'bg-purple-600 text-white border-purple-600' : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200'}`}>
                  ✦ AI 편집
                </button>
                <button onClick={() => setEditMode(true)}
                  className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-lg transition border border-gray-200">
                  ✏ 수동 편집
                </button>
                <button onClick={() => router.push(`/dashboard/${id}/upload`)}
                  className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-lg transition border border-gray-200">
                  ↑ 업로드
                </button>
              </>
            )}
          </div>
        </header>

        {/* Filter Bar */}
        <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-2 flex-wrap flex-shrink-0">
          {/* 기간 필터 (항상 표시) */}
          <span className="text-xs text-gray-400 font-medium">기간</span>
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="bg-white border border-gray-300 text-gray-700 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <span className="text-xs text-gray-400">~</span>
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="bg-white border border-gray-300 text-gray-700 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {rows.length > 0 && (
            <>
              <div className="w-px h-4 bg-gray-200 mx-1" />
              {categoryCols.slice(0, 3).map(col => (
                <select key={col} value={filterCategory[col] || ''}
                  onChange={e => setFilterCategory(prev => ({ ...prev, [col]: e.target.value }))}
                  className="bg-white border border-gray-300 text-gray-700 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500">
                  <option value="">{col} 전체</option>
                  {[...new Set(rows.map(r => String(r[col] ?? '')))].slice(0, 50).map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              ))}
              {config.segments.length > 0 && (
                <select value={activeSegmentId}
                  onChange={e => setActiveSegmentId(e.target.value)}
                  className="bg-white border border-gray-300 text-gray-700 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-500">
                  <option value="">세그먼트 전체</option>
                  {config.segments.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              )}
            </>
          )}
          {(startDate || endDate || Object.values(filterCategory).some(Boolean) || activeSegmentId) && (
            <button onClick={() => { setFilterCategory({}); setActiveSegmentId(''); setStartDate(''); setEndDate('') }}
              className="text-xs text-gray-400 hover:text-red-500 transition ml-auto">
              ✕ 초기화
            </button>
          )}
        </div>

        {/* Edit Mode Banner */}
        {editMode && (
          <div className="bg-blue-50 border-b border-blue-200 px-6 py-2 flex items-center gap-2">
            <span className="text-blue-600 text-xs font-medium">✏ 편집 모드</span>
            <span className="text-gray-500 text-xs">위젯 제목/타입/컬럼을 수정하고 저장하세요.</span>
          </div>
        )}

        {/* Dashboard Grid */}
        <main className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center h-64 text-gray-400 text-sm">데이터 로딩 중...</div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <p className="text-gray-400 text-sm">업로드된 데이터가 없어요.</p>
              <button onClick={() => router.push(`/dashboard/${id}/upload`)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition">
                데이터 업로드하기
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {widgetRows.map(({ row, widgets: rowWidgets }) => {
                const globalFilteredRows = rows.filter(r => {
                  // 날짜 범위 필터
                  if ((startDate || endDate) && dateCols.length > 0) {
                    const rawDate = String(r[dateCols[0]] ?? '')
                    const normalized = rawDate.replace(/\./g, '-').replace(/년\s*/g, '-').replace(/월\s*/g, '-').replace(/일/g, '').trim()
                    const d = new Date(normalized)
                    if (!isNaN(d.getTime())) {
                      const dateStr = d.toISOString().slice(0, 10)
                      if (startDate && dateStr < startDate) return false
                      if (endDate && dateStr > endDate) return false
                    }
                  }
                  // 카테고리 필터
                  for (const [col, val] of Object.entries(filterCategory)) {
                    if (val && String(r[col] ?? '') !== val) return false
                  }
                  // 세그먼트 필터
                  if (activeSegmentId) {
                    const seg = config.segments.find(s => s.id === activeSegmentId)
                    if (seg) return applySegment([r], seg).length > 0
                  }
                  return true
                })
                return (
                  <div key={row} className="flex gap-4">
                    {rowWidgets.map(widget => (
                      <div key={widget.id} className="flex-1 min-w-0">
                        <WidgetCard
                          widget={widget}
                          rows={globalFilteredRows}
                          segments={config.segments}
                          editMode={editMode}
                          onUpdate={(patch) => updateWidget(widget.id, patch)}
                          onRemove={() => removeWidget(widget.id)}
                        />
                      </div>
                    ))}
                    {editMode && (
                      <button onClick={() => addWidget(row)}
                        className="w-12 flex-shrink-0 border-2 border-dashed border-gray-300 hover:border-blue-500 rounded-xl text-gray-400 hover:text-blue-500 transition flex items-center justify-center text-lg">
                        +
                      </button>
                    )}
                  </div>
                )
              })}

              {editMode && (
                <button onClick={() => addWidget()}
                  className="w-full h-16 border-2 border-dashed border-gray-300 hover:border-blue-500 rounded-xl text-gray-400 hover:text-blue-500 transition flex items-center justify-center gap-2 text-sm">
                  <span>+</span> 새 줄에 위젯 추가
                </button>
              )}
            </div>
          )}
        </main>
      </div>

      {/* AI Chat Panel */}
      {showAiChat && (
        <div className="w-80 flex-shrink-0 bg-white border-l border-gray-200 flex flex-col shadow-lg">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-purple-50">
            <div className="flex items-center gap-2">
              <span className="text-purple-500">✦</span>
              <span className="text-sm font-semibold text-purple-800">AI 대시보드 편집</span>
            </div>
            <button onClick={() => setShowAiChat(false)} className="text-gray-400 hover:text-gray-700 transition">✕</button>
          </div>
          <div className="flex-1 overflow-hidden">
            <AiChat
              config={config}
              columns={[...Object.keys(rows[0] ?? {})]}
              onConfigChange={(newConfig) => {
                setConfig(newConfig)
                saveConfig(newConfig)
              }}
            />
          </div>
        </div>
      )}
      </div>

      {/* Segment Builder Modal */}
      {showSegmentBuilder && (
        <SegmentBuilder
          segments={config.segments}
          columns={[...Object.keys(rows[0] ?? {})]}
          onChange={(segments) => setConfig(prev => ({ ...prev, segments }))}
          onClose={() => { setShowSegmentBuilder(false); saveConfig(config) }}
        />
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold mb-4 text-gray-900">프로젝트 설정</h2>
            <div className="space-y-3 mb-6">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">새 프로젝트 이름</label>
                <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">비밀번호 확인</label>
                <input type="password" value={settingsPassword} onChange={e => setSettingsPassword(e.target.value)}
                  placeholder="현재 비밀번호"
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900" />
              </div>
              {settingsError && <p className="text-red-500 text-sm">{settingsError}</p>}
            </div>
            <div className="flex gap-2">
              <button onClick={handleRename} disabled={settingsLoading || !newName || !settingsPassword}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-medium transition disabled:opacity-50">
                {settingsLoading ? '처리 중...' : '이름 변경'}
              </button>
              <button onClick={handleDelete} disabled={settingsLoading || !settingsPassword}
                className="px-4 bg-red-500 hover:bg-red-600 text-white py-2 rounded-lg text-sm font-medium transition disabled:opacity-50">
                삭제
              </button>
              <button onClick={() => { setShowSettings(false); setSettingsPassword(''); setSettingsError(''); setActiveNav('dashboard') }}
                className="px-4 bg-gray-100 hover:bg-gray-200 text-gray-600 py-2 rounded-lg text-sm font-medium transition">
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
