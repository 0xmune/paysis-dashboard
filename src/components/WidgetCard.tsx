'use client'

import { useState } from 'react'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import { Widget, Period, Row } from '@/lib/types'
import { sumCol, groupBy, aggregateByPeriod, detectColumns, fmt, applySegment } from '@/lib/dataUtils'
import type { Segment } from '@/lib/types'

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4']

type Props = {
  widget: Widget
  rows: Row[]
  segments: Segment[]
  editMode: boolean
  onUpdate: (patch: Partial<Widget>) => void
  onRemove: () => void
}

const PERIOD_LABELS: Record<Period, string> = { daily: '일별', weekly: '주별', monthly: '월별' }

function calcChange(rows: Row[], valueCol: string, dateCols: string[]): number | null {
  if (!dateCols.length || rows.length < 2) return null
  const dateCol = dateCols[0]
  const sorted = [...rows].sort((a, b) =>
    String(a[dateCol] ?? '').localeCompare(String(b[dateCol] ?? ''))
  )
  const mid = Math.floor(sorted.length / 2)
  const prev = sumCol(sorted.slice(0, mid), valueCol)
  const curr = sumCol(sorted.slice(mid), valueCol)
  if (prev === 0) return null
  return ((curr - prev) / prev) * 100
}

export default function WidgetCard({ widget, rows, segments, editMode, onUpdate, onRemove }: Props) {
  const [period, setPeriod] = useState<Period>(widget.period || 'monthly')
  const [showConfig, setShowConfig] = useState(false)

  const { numericCols, categoryCols, dateCols } = detectColumns(rows)

  const seg = segments.find(s => s.id === widget.segmentId)
  const filteredRows = seg ? applySegment(rows, seg) : rows

  const chartData = (() => {
    if (!widget.valueCol) return []
    if (dateCols.length > 0) {
      return aggregateByPeriod(filteredRows, dateCols[0], widget.valueCol, period)
    }
    if (!widget.groupCol) return []
    return Object.entries(groupBy(filteredRows, widget.groupCol))
      .map(([name, rs]) => ({ name: name.slice(0, 14), value: Math.round(sumCol(rs, widget.valueCol)) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 12)
  })()

  const totalValue = Math.round(sumCol(filteredRows, widget.valueCol))
  const change = widget.type === 'kpi' ? calcChange(filteredRows, widget.valueCol, dateCols) : null

  const tooltipStyle = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 11, color: '#111827', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }

  return (
    <div className={`bg-white rounded-xl overflow-hidden flex flex-col ${editMode ? 'ring-2 ring-blue-400' : 'border border-gray-200 shadow-sm hover:shadow-md transition-shadow'}`}>
      {/* Card Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2 min-w-0">
          {seg && <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: seg.color }} />}
          {editMode ? (
            <input
              value={widget.title}
              onChange={e => onUpdate({ title: e.target.value })}
              className="bg-transparent text-sm font-semibold focus:outline-none border-b border-gray-300 w-full text-gray-800"
            />
          ) : (
            <span className="text-sm font-semibold truncate text-gray-700">{widget.title}</span>
          )}
          {seg && <span className="text-xs text-gray-400 flex-shrink-0 bg-gray-100 px-1.5 py-0.5 rounded">{seg.name}</span>}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {['bar', 'line'].includes(widget.type) && (
            <div className="flex bg-gray-100 rounded-lg p-0.5 mr-1">
              {(['daily', 'weekly', 'monthly'] as Period[]).map(p => (
                <button
                  key={p}
                  onClick={() => { setPeriod(p); onUpdate({ period: p }) }}
                  className={`text-xs px-2.5 py-1 rounded-md transition font-medium ${period === p ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  {PERIOD_LABELS[p]}
                </button>
              ))}
            </div>
          )}
          {editMode && (
            <>
              <button onClick={() => setShowConfig(v => !v)} className="text-gray-400 hover:text-gray-600 text-xs px-2 py-1 rounded-lg hover:bg-gray-100 transition">⚙</button>
              <button onClick={onRemove} className="text-gray-400 hover:text-red-500 text-xs px-2 py-1 rounded-lg hover:bg-gray-100 transition">✕</button>
            </>
          )}
        </div>
      </div>

      {/* Config panel */}
      {showConfig && editMode && (
        <div className="bg-gray-50 border-b border-gray-200 p-3 grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-gray-500 block mb-1">차트 타입</label>
            <select value={widget.type} onChange={e => onUpdate({ type: e.target.value as Widget['type'] })}
              className="w-full bg-white border border-gray-300 text-gray-700 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500">
              <option value="kpi">KPI 카드</option>
              <option value="bar">막대 차트</option>
              <option value="line">라인 차트</option>
              <option value="pie">파이 차트</option>
              <option value="table">테이블</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">수치 컬럼</label>
            <select value={widget.valueCol} onChange={e => onUpdate({ valueCol: e.target.value })}
              className="w-full bg-white border border-gray-300 text-gray-700 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500">
              {numericCols.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">그룹 컬럼</label>
            <select value={widget.groupCol} onChange={e => onUpdate({ groupCol: e.target.value })}
              className="w-full bg-white border border-gray-300 text-gray-700 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500">
              <option value="">없음</option>
              {categoryCols.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-xs text-gray-500 block mb-1">세그먼트</label>
            <select value={widget.segmentId ?? ''} onChange={e => onUpdate({ segmentId: e.target.value || undefined })}
              className="w-full bg-white border border-gray-300 text-gray-700 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500">
              <option value="">전체 (세그먼트 없음)</option>
              {segments.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Card Content */}
      <div className="flex-1 p-5">
        {widget.type === 'kpi' && (
          <div className="flex flex-col justify-between h-full min-h-[80px]">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-2">{widget.valueCol}</p>
            <p className="text-3xl font-bold text-gray-900 tracking-tight">{fmt(totalValue)}</p>
            <div className="flex items-center gap-2 mt-3">
              <span className="text-xs text-gray-400">{filteredRows.length.toLocaleString()}건</span>
              {change !== null && (
                <span className={`text-xs font-semibold flex items-center gap-0.5 ${change >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                  {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(1)}%
                </span>
              )}
            </div>
          </div>
        )}

        {(widget.type === 'bar' || widget.type === 'line') && (
          <ResponsiveContainer width="100%" height={220}>
            {widget.type === 'bar' ? (
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={fmt} width={42} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v.toLocaleString(), widget.valueCol]} />
                <Bar dataKey="value" fill={seg?.color ?? '#3b82f6'} radius={[4, 4, 0, 0]} maxBarSize={48} />
              </BarChart>
            ) : (
              <LineChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={fmt} width={42} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v.toLocaleString(), widget.valueCol]} />
                <Line type="monotone" dataKey="value" stroke={seg?.color ?? '#3b82f6'} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            )}
          </ResponsiveContainer>
        )}

        {widget.type === 'pie' && (
          <div className="flex items-center gap-4">
            <ResponsiveContainer width={180} height={180}>
              <PieChart>
                <Pie data={chartData.slice(0, 6)} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={80} paddingAngle={2}>
                  {chartData.slice(0, 6).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => v.toLocaleString()} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2">
              {chartData.slice(0, 6).map((d, i) => {
                const total = chartData.reduce((s, x) => s + x.value, 0)
                const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : '0'
                return (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="text-gray-600 truncate max-w-[80px]">{d.name}</span>
                    </div>
                    <span className="text-gray-500 font-medium">{pct}%</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {widget.type === 'table' && (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100">
                  {chartData[0] && Object.keys(chartData[0]).map(k => (
                    <th key={k} className="text-left py-2 px-2 text-gray-400 font-semibold uppercase tracking-wide text-[10px]">{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {chartData.slice(0, 10).map((row, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition">
                    {Object.values(row).map((v, j) => (
                      <td key={j} className="py-2 px-2 text-gray-700">{typeof v === 'number' ? v.toLocaleString() : String(v)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {chartData.length === 0 && widget.type !== 'kpi' && (
          <div className="flex items-center justify-center h-32 text-gray-300 text-sm">데이터 없음</div>
        )}
      </div>
    </div>
  )
}
