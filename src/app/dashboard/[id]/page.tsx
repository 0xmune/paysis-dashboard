'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Widget, DashboardConfig } from '@/lib/types'
import { detectColumns, applySegment } from '@/lib/dataUtils'
import type { Row } from '@/lib/types'
import dynamic from 'next/dynamic'

const WidgetCard = dynamic(() => import('@/components/WidgetCard'), { ssr: false })
const SegmentBuilder = dynamic(() => import('@/components/SegmentBuilder'), { ssr: false })
const AiChat = dynamic(() => import('@/components/AiChat'), { ssr: false })

const NAV_ITEMS = [
  { id: 'dashboard', label: '전체 대시보드', icon: '▦' },
  { id: 'upload', label: '데이터 업로드', icon: '↑' },
  { id: 'segments', label: '세그먼트 빌더', icon: '◈' },
  { id: 'settings', label: '프로젝트 관리', icon: '⚙' },
]

function defaultConfig(numericCols: string[], categoryCols: string[]): DashboardConfig {
  const widgets: Widget[] = []
  numericCols.slice(0, 4).forEach((col, i) => {
    widgets.push({ id: `kpi-${i}`, type: 'kpi', title: col, valueCol: col, groupCol: categoryCols[0] ?? '', period: 'monthly', row: 0 })
  })
  if (numericCols[0]) {
    widgets.push({ id: 'chart-0', type: 'line', title: `${numericCols[0]} 추이`, valueCol: numericCols[0], groupCol: categoryCols[0] ?? '', period: 'monthly', row: 1 })
  }
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

  // Filters
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [pendingStart, setPendingStart] = useState('')
  const [pendingEnd, setPendingEnd] = useState('')
  const [filterCategory, setFilterCategory] = useState<Record<string, string>>({})
  const [pendingCategory, setPendingCategory] = useState<Record<string, string>>({})
  const [activeSegmentId, setActiveSegmentId] = useState<string>('')

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
    setConfig(prev => ({ ...prev, widgets: prev.widgets.map(w => w.id === widgetId ? { ...w, ...patch } : w) }))
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

  function applyFilters() {
    setStartDate(pendingStart)
    setEndDate(pendingEnd)
    setFilterCategory(pendingCategory)
  }

  function resetFilters() {
    setStartDate(''); setEndDate('')
    setPendingStart(''); setPendingEnd('')
    setFilterCategory({}); setPendingCategory({})
    setActiveSegmentId('')
  }

  const filteredRows = useMemo(() => {
    return rows.filter(r => {
      if ((startDate || endDate) && dateCols.length > 0) {
        const rawDate = String(r[dateCols[0]] ?? '')
        const normalized = rawDate.replace(/\./g, '-').replace(/년\s*/g, '-').replace(/월\s*/g, '-').replace(/일/g, '').trim()
        const d = new Date(normalized)
        if (!isNaN(d.getTime())) {
          const ds = d.toISOString().slice(0, 10)
          if (startDate && ds < startDate) return false
          if (endDate && ds > endDate) return false
        }
      }
      for (const [col, val] of Object.entries(filterCategory)) {
        if (val && String(r[col] ?? '') !== val) return false
      }
      if (activeSegmentId) {
        const seg = config.segments.find(s => s.id === activeSegmentId)
        if (seg) return applySegment([r], seg).length > 0
      }
      return true
    })
  }, [rows, startDate, endDate, dateCols, filterCategory, activeSegmentId, config.segments])

  async function handleRename() {
    setSettingsLoading(true); setSettingsError('')
    const res = await fetch(`/api/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, password: settingsPassword }),
    })
    const data = await res.json()
    if (!res.ok) { setSettingsError(data.error); setSettingsLoading(false); return }
    setProjectName(data.name)
    sessionStorage.setItem('projectName', data.name)
    setSettingsLoading(false); setShowSettings(false); setSettingsPassword('')
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

  const hasActiveFilter = startDate || endDate || Object.values(filterCategory).some(Boolean) || activeSegmentId

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-slate-900 flex flex-col">
        <div className="px-5 py-6 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-500 rounded-xl flex items-center justify-center text-sm font-bold text-white shadow-lg">S</div>
            <span className="font-bold text-sm text-white">Segment Analytics</span>
          </div>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <button key={item.id}
              onClick={() => {
                if (item.id === 'upload') { router.push(`/dashboard/${id}/upload`); return }
                if (item.id === 'segments') { setShowSegmentBuilder(true); setActiveNav('segments'); return }
                if (item.id === 'settings') { setShowSettings(true); setActiveNav('settings'); return }
                setActiveNav(item.id)
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
                activeNav === item.id
                  ? 'bg-blue-600 text-white shadow-sm font-medium'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="mx-3 mb-4 p-4 bg-slate-800 rounded-xl space-y-2">
          <p className="text-xs text-slate-400 font-semibold mb-3">프로젝트 정보</p>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">레코드</span>
            <span className="text-slate-200 font-medium">{rows.length.toLocaleString()}건</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">필터 결과</span>
            <span className="text-slate-200 font-medium">{filteredRows.length.toLocaleString()}건</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">세그먼트</span>
            <span className="text-slate-200 font-medium">{config.segments.length}개</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">위젯</span>
            <span className="text-slate-200 font-medium">{config.widgets.length}개</span>
          </div>
        </div>

        <div className="px-3 pb-4">
          <button onClick={() => router.push('/')}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm py-2.5 rounded-xl transition font-medium shadow-sm">
            새 프로젝트 만들기
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-lg font-bold text-gray-900">{projectName}</h1>
              <p className="text-xs text-gray-400 mt-0.5">Project ID : {id.slice(0, 7).toUpperCase()}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {editMode ? (
              <>
                <button onClick={() => addWidget()}
                  className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-600 px-4 py-2 rounded-xl transition font-medium">
                  + 위젯 추가
                </button>
                <button onClick={() => setShowSegmentBuilder(true)}
                  className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-600 px-4 py-2 rounded-xl transition font-medium">
                  ◈ 세그먼트
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl transition font-semibold disabled:opacity-50 shadow-sm">
                  {saving ? '저장 중...' : '저장'}
                </button>
                <button onClick={() => { setEditMode(false); fetchConfig() }}
                  className="text-sm text-gray-400 hover:text-gray-700 px-4 py-2 rounded-xl transition">
                  취소
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setShowSettings(true)}
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 bg-white hover:bg-gray-50 border border-gray-200 px-3.5 py-2 rounded-xl transition">
                  ⚙ 프로젝트 설정
                </button>
                <button onClick={() => setShowAiChat(v => !v)}
                  className={`flex items-center gap-1.5 text-sm px-4 py-2 rounded-xl transition font-semibold border ${
                    showAiChat
                      ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                      : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200'
                  }`}>
                  ✦ AI 편집
                </button>
                <button onClick={() => setEditMode(true)}
                  className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 bg-white hover:bg-gray-50 border border-gray-200 px-4 py-2 rounded-xl transition font-medium">
                  ✏ 대시보드 편집
                </button>
                <button onClick={() => router.push(`/dashboard/${id}/upload`)}
                  className="flex items-center gap-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl transition font-semibold shadow-sm">
                  ↑ 업로드
                </button>
              </>
            )}
          </div>
        </header>

        {/* Filter Bar */}
        <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3 flex-shrink-0 flex-wrap">
          {/* 기간 */}
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
            <span className="text-gray-400 text-sm">📅</span>
            <input
              type="date"
              value={pendingStart}
              onChange={e => setPendingStart(e.target.value)}
              className="bg-transparent text-sm text-gray-700 focus:outline-none w-32"
            />
            <span className="text-gray-300">~</span>
            <input
              type="date"
              value={pendingEnd}
              onChange={e => setPendingEnd(e.target.value)}
              className="bg-transparent text-sm text-gray-700 focus:outline-none w-32"
            />
          </div>

          {/* 카테고리 필터 */}
          {categoryCols.slice(0, 3).map(col => (
            <select key={col}
              value={pendingCategory[col] || ''}
              onChange={e => setPendingCategory(prev => ({ ...prev, [col]: e.target.value }))}
              className="bg-gray-50 border border-gray-200 text-gray-700 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer">
              <option value="">{col} 전체</option>
              {[...new Set(rows.map(r => String(r[col] ?? '')))].filter(Boolean).slice(0, 50).map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          ))}

          {/* 세그먼트 */}
          {config.segments.length > 0 && (
            <select value={activeSegmentId}
              onChange={e => setActiveSegmentId(e.target.value)}
              className="bg-gray-50 border border-gray-200 text-gray-700 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer">
              <option value="">세그먼트 전체</option>
              {config.segments.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}

          <button onClick={applyFilters}
            className="bg-slate-800 hover:bg-slate-700 text-white text-sm px-5 py-2 rounded-xl transition font-semibold shadow-sm">
            적용
          </button>

          {hasActiveFilter && (
            <button onClick={resetFilters}
              className="text-sm text-gray-400 hover:text-red-500 transition">
              ✕ 초기화
            </button>
          )}

          {hasActiveFilter && (
            <span className="ml-auto text-xs text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full font-medium">
              {filteredRows.length.toLocaleString()}건 필터됨
            </span>
          )}
        </div>

        {/* Edit Mode Banner */}
        {editMode && (
          <div className="bg-blue-50 border-b border-blue-200 px-6 py-2 flex items-center gap-2 flex-shrink-0">
            <span className="text-blue-600 text-xs font-semibold">✏ 편집 모드</span>
            <span className="text-gray-500 text-xs">위젯 클릭 후 ⚙ 아이콘으로 설정 변경, 저장 버튼으로 완료</span>
          </div>
        )}

        {/* Dashboard Content */}
        <main className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-gray-400 text-sm">데이터 로딩 중...</p>
              </div>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center text-2xl">📊</div>
              <p className="text-gray-500 text-sm font-medium">업로드된 데이터가 없어요</p>
              <button onClick={() => router.push(`/dashboard/${id}/upload`)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition shadow-sm">
                데이터 업로드하기
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {widgetRows.map(({ row, widgets: rowWidgets }, rowIdx) => {
                const isKpiRow = rowWidgets.every(w => w.type === 'kpi')
                return (
                  <div key={row}>
                    {rowIdx === 0 && isKpiRow && (
                      <div className="flex items-center justify-between mb-3">
                        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                          핵심 KPI
                          {hasActiveFilter && <span className="ml-2 text-blue-500 normal-case font-normal">(필터 적용됨)</span>}
                        </h2>
                      </div>
                    )}
                    <div className="flex gap-4">
                      {rowWidgets.map(widget => (
                        <div key={widget.id} className="flex-1 min-w-0">
                          <WidgetCard
                            widget={widget}
                            rows={filteredRows}
                            segments={config.segments}
                            editMode={editMode}
                            onUpdate={(patch) => updateWidget(widget.id, patch)}
                            onRemove={() => removeWidget(widget.id)}
                          />
                        </div>
                      ))}
                      {editMode && (
                        <button onClick={() => addWidget(row)}
                          className="w-14 flex-shrink-0 border-2 border-dashed border-gray-200 hover:border-blue-400 rounded-xl text-gray-300 hover:text-blue-400 transition flex items-center justify-center text-2xl">
                          +
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}

              {editMode && (
                <button onClick={() => addWidget()}
                  className="w-full h-16 border-2 border-dashed border-gray-200 hover:border-blue-400 rounded-xl text-gray-400 hover:text-blue-500 transition flex items-center justify-center gap-2 text-sm font-medium">
                  <span className="text-xl">+</span> 새 줄에 위젯 추가
                </button>
              )}
            </div>
          )}
        </main>
      </div>

      {/* AI Chat Panel */}
      {showAiChat && (
        <div className="w-80 flex-shrink-0 bg-white border-l border-gray-200 flex flex-col shadow-xl">
          <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100 bg-gradient-to-r from-purple-50 to-blue-50">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-purple-600 rounded-lg flex items-center justify-center text-white text-sm">✦</div>
              <div>
                <p className="text-sm font-semibold text-gray-800">AI 대시보드 편집</p>
                <p className="text-xs text-gray-400">자연어로 대시보드를 수정하세요</p>
              </div>
            </div>
            <button onClick={() => setShowAiChat(false)} className="text-gray-400 hover:text-gray-600 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition">✕</button>
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center text-lg">⚙</div>
              <div>
                <h2 className="text-base font-bold text-gray-900">프로젝트 설정</h2>
                <p className="text-xs text-gray-400">이름 변경 및 프로젝트 삭제</p>
              </div>
            </div>
            <div className="space-y-4 mb-6">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1.5 block">새 프로젝트 이름</label>
                <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1.5 block">비밀번호 확인</label>
                <input type="password" value={settingsPassword} onChange={e => setSettingsPassword(e.target.value)}
                  placeholder="현재 비밀번호"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900" />
              </div>
              {settingsError && <p className="text-red-500 text-sm bg-red-50 rounded-xl px-3 py-2">{settingsError}</p>}
            </div>
            <div className="flex gap-2">
              <button onClick={handleRename} disabled={settingsLoading || !newName || !settingsPassword}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-sm font-semibold transition disabled:opacity-50">
                {settingsLoading ? '처리 중...' : '이름 변경'}
              </button>
              <button onClick={handleDelete} disabled={settingsLoading || !settingsPassword}
                className="px-4 bg-red-500 hover:bg-red-600 text-white py-2.5 rounded-xl text-sm font-semibold transition disabled:opacity-50">
                삭제
              </button>
              <button onClick={() => { setShowSettings(false); setSettingsPassword(''); setSettingsError(''); setActiveNav('dashboard') }}
                className="px-4 bg-gray-100 hover:bg-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium transition">
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
