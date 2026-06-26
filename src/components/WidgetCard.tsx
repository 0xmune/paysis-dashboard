'use client'

import { useState } from 'react'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
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

export default function WidgetCard({ widget, rows, segments, editMode, onUpdate, onRemove }: Props) {
  const [period, setPeriod] = useState<Period>(widget.period || 'monthly')
  const [showConfig, setShowConfig] = useState(false)

  const { numericCols, categoryCols, dateCols } = detectColumns(rows)

  // Apply segment filter
  const seg = segments.find(s => s.id === widget.segmentId)
  const filteredRows = seg ? applySegment(rows, seg) : rows

  // Build chart data
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

  const tooltipStyle = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 11, color: '#111827' }

  return (
    <div className={`bg-white border rounded-xl overflow-hidden flex flex-col shadow-sm ${editMode ? 'border-blue-400' : 'border-gray-200'}`}>
      {/* Card Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2 min-w-0">
          {seg && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: seg.color }} />}
          {editMode ? (
            <input
              value={widget.title}
              onChange={e => onUpdate({ title: e.target.value })}
              className="bg-transparent text-sm font-medium focus:outline-none border-b border-gray-300 w-full text-gray-800"
            />
          ) : (
            <span className="text-sm font-semibold truncate text-gray-800">{widget.title}</span>
          )}
          {seg && <span className="text-xs text-gray-400 flex-shrink-0">{seg.name}</span>}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Period toggle - only for chart types */}
          {['bar', 'line'].includes(widget.type) && (
            <div className="flex gap-0.5 mr-1">
              {(['daily', 'weekly', 'monthly'] as Period[]).map(p => (
                <button
                  key={p}
                  onClick={() => { setPeriod(p); onUpdate({ period: p }) }}
                  className={`text-xs px-2 py-0.5 rounded transition ${period === p ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-700'}`}
                >
                  {PERIOD_LABELS[p]}
                </button>
              ))}
            </div>
          )}

          {editMode && (
            <>
              <button onClick={() => setShowConfig(v => !v)} className="text-gray-400 hover:text-gray-700 text-xs px-2 py-1 rounded hover:bg-gray-100 transition">⚙</button>
              <button onClick={onRemove} className="text-gray-400 hover:text-red-500 text-xs px-2 py-1 rounded hover:bg-gray-100 transition">✕</button>
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
              className="w-full bg-white border border-gray-300 text-gray-700 text-xs rounded px-2 py-1.5 focus:outline-none">
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
              className="w-full bg-white border border-gray-300 text-gray-700 text-xs rounded px-2 py-1.5 focus:outline-none">
              {numericCols.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">그룹 컬럼</label>
            <select value={widget.groupCol} onChange={e => onUpdate({ groupCol: e.target.value })}
              className="w-full bg-white border border-gray-300 text-gray-700 text-xs rounded px-2 py-1.5 focus:outline-none">
              <option value="">없음</option>
              {categoryCols.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-xs text-gray-500 block mb-1">세그먼트</label>
            <select value={widget.segmentId ?? ''} onChange={e => onUpdate({ segmentId: e.target.value || undefined })}
              className="w-full bg-white border border-gray-300 text-gray-700 text-xs rounded px-2 py-1.5 focus:outline-none">
              <option value="">전체 (세그먼트 없음)</option>
              {segments.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Card Content */}
      <div className="flex-1 p-4">
        {widget.type === 'kpi' && (
          <div className="flex flex-col justify-center h-full">
            <p className="text-gray-400 text-xs mb-1">{widget.valueCol}</p>
            <p className="text-3xl font-bold text-gray-900">{fmt(totalValue)}</p>
            <p className="text-xs text-gray-400 mt-1">{filteredRows.length.toLocaleString()}건</p>
          </div>
        )}

        {(widget.type === 'bar' || widget.type === 'line') && (
          <ResponsiveContainer width="100%" height={200}>
            {widget.type === 'bar' ? (
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#9ca3af' }} />
                <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} tickFormatter={fmt} width={45} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => v.toLocaleString()} />
                <Bar dataKey="value" fill={seg?.color ?? '#3b82f6'} radius={[3, 3, 0, 0]} />
              </BarChart>
            ) : (
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#9ca3af' }} />
                <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} tickFormatter={fmt} width={45} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => v.toLocaleString()} />
                <Line type="monotone" dataKey="value" stroke={seg?.color ?? '#3b82f6'} strokeWidth={2} dot={false} />
              </LineChart>
            )}
          </ResponsiveContainer>
        )}

        {widget.type === 'pie' && (
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={chartData.slice(0, 6)} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80}>
                {chartData.slice(0, 6).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => v.toLocaleString()} />
            </PieChart>
          </ResponsiveContainer>
        )}

        {widget.type === 'table' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200">
                  {chartData[0] && Object.keys(chartData[0]).map(k => (
                    <th key={k} className="text-left py-1.5 px-2 text-gray-500 font-medium">{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {chartData.slice(0, 10).map((row, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    {Object.values(row).map((v, j) => (
                      <td key={j} className="py-1.5 px-2 text-gray-700">{typeof v === 'number' ? v.toLocaleString() : String(v)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {chartData.length === 0 && widget.type !== 'kpi' && (
          <div className="flex items-center justify-center h-32 text-gray-300 text-xs">데이터 없음</div>
        )}
      </div>
    </div>
  )
}
