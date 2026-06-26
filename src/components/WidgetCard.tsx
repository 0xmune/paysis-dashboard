'use client'

import { useState } from 'react'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { Widget, Period, Row } from '@/lib/types'
import { sumCol, groupBy, aggregateByPeriod, detectColumns, fmt, applySegment } from '@/lib/dataUtils'
import type { Segment } from '@/lib/types'

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#f97316']

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
  if (!dateCols.length || rows.length < 4) return null
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
    if (dateCols.length > 0 && (widget.type === 'bar' || widget.type === 'line')) {
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

  const tooltipStyle = {
    background: '#fff', border: '1px solid #f3f4f6',
    borderRadius: 10, fontSize: 12, color: '#374151',
    boxShadow: '0 4px 24px rgba(0,0,0,0.08)'
  }

  return (
    <div className={`bg-white rounded-2xl overflow-hidden flex flex-col h-full ${
      editMode ? 'ring-2 ring-blue-400 ring-offset-1' : 'border border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-200'
    }`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-5 py-4 ${widget.type !== 'kpi' ? 'border-b border-gray-50' : ''}`}>
        <div className="flex items-center gap-2 min-w-0">
          {seg && <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: seg.color }} />}
          {editMode ? (
            <input
              value={widget.title}
              onChange={e => onUpdate({ title: e.target.value })}
              className="bg-transparent text-sm font-semibold focus:outline-none border-b border-gray-300 w-full text-gray-700"
            />
          ) : (
            <span className="text-sm font-semibold text-gray-600 truncate">{widget.title}</span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {['bar', 'line'].includes(widget.type) && (
            <div className="flex bg-gray-100 rounded-lg p-0.5 mr-1">
              {(['daily', 'weekly', 'monthly'] as Period[]).map(p => (
                <button key={p}
                  onClick={() => { setPeriod(p); onUpdate({ period: p }) }}
                  className={`text-xs px-2.5 py-1 rounded-md transition font-medium ${period === p ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>
                  {PERIOD_LABELS[p]}
                </button>
              ))}
            </div>
          )}
          {editMode && (
            <>
              <button onClick={() => setShowConfig(v => !v)} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition text-xs">⚙</button>
              <button onClick={onRemove} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition text-xs">✕</button>
            </>
          )}
        </div>
      </div>

      {/* Config Panel */}
      {showConfig && editMode && (
        <div className="bg-gray-50 border-y border-gray-200 p-3 grid grid-cols-2 gap-2">
          {[
            { label: '차트 타입', key: 'type', options: [['kpi','KPI 카드'],['bar','막대'],['line','라인'],['pie','파이'],['table','테이블']] },
            { label: '수치 컬럼', key: 'valueCol', options: numericCols.map(c => [c, c]) },
            { label: '그룹 컬럼', key: 'groupCol', options: [['','없음'], ...categoryCols.map(c => [c, c])] },
          ].map(({ label, key, options }) => (
            <div key={key} className={key === 'groupCol' ? '' : ''}>
              <label className="text-xs text-gray-500 block mb-1">{label}</label>
              <select
                value={key === 'type' ? widget.type : key === 'valueCol' ? widget.valueCol : widget.groupCol}
                onChange={e => onUpdate({ [key]: e.target.value } as Partial<Widget>)}
                className="w-full bg-white border border-gray-200 text-gray-700 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500">
                {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          ))}
          <div className="col-span-2">
            <label className="text-xs text-gray-500 block mb-1">세그먼트</label>
            <select value={widget.segmentId ?? ''} onChange={e => onUpdate({ segmentId: e.target.value || undefined })}
              className="w-full bg-white border border-gray-200 text-gray-700 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500">
              <option value="">전체</option>
              {segments.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 px-5 pb-5">
        {widget.type === 'kpi' && (
          <div className="pt-1">
            <p className="text-2xl font-bold text-gray-900 tracking-tight mt-1">
              {fmt(totalValue)}
            </p>
            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-50">
              <span className="text-xs text-gray-400">{filteredRows.length.toLocaleString()}건</span>
              {change !== null && (
                <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                  change >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
                }`}>
                  {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(1)}%
                </span>
              )}
              {change !== null && <span className="text-xs text-gray-300">전반 대비</span>}
            </div>
          </div>
        )}

        {(widget.type === 'bar' || widget.type === 'line') && (
          <ResponsiveContainer width="100%" height={210}>
            {widget.type === 'bar' ? (
              <BarChart data={chartData} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="#f9fafb" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#d1d5db' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#d1d5db' }} tickFormatter={fmt} width={40} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v.toLocaleString(), widget.valueCol]} cursor={{ fill: '#f9fafb' }} />
                <Bar dataKey="value" fill={seg?.color ?? '#3b82f6'} radius={[5, 5, 0, 0]} maxBarSize={40} />
              </BarChart>
            ) : (
              <LineChart data={chartData} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="#f9fafb" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#d1d5db' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#d1d5db' }} tickFormatter={fmt} width={40} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v.toLocaleString(), widget.valueCol]} />
                <Line type="monotone" dataKey="value" stroke={seg?.color ?? '#3b82f6'} strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: seg?.color ?? '#3b82f6', strokeWidth: 0 }} />
              </LineChart>
            )}
          </ResponsiveContainer>
        )}

        {widget.type === 'pie' && (
          <div className="flex items-center gap-3 pt-2">
            <div className="flex-shrink-0">
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie data={chartData.slice(0, 7)} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2}>
                    {chartData.slice(0, 7).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => v.toLocaleString()} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-2 min-w-0">
              {chartData.slice(0, 7).map((d, i) => {
                const total = chartData.reduce((s, x) => s + x.value, 0)
                const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : '0'
                return (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="text-xs text-gray-500 truncate">{d.name}</span>
                    </div>
                    <span className="text-xs font-semibold text-gray-700 flex-shrink-0">{pct}%</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {widget.type === 'table' && (
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  {chartData[0] && Object.keys(chartData[0]).map(k => (
                    <th key={k} className="text-left py-2 px-2 text-gray-400 font-semibold text-[10px] uppercase tracking-wider border-b border-gray-100">{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {chartData.slice(0, 10).map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50 transition">
                    {Object.values(row).map((v, j) => (
                      <td key={j} className="py-2 px-2 text-gray-700 border-b border-gray-50">{typeof v === 'number' ? v.toLocaleString() : String(v)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {chartData.length === 0 && widget.type !== 'kpi' && (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <span className="text-3xl">📭</span>
            <span className="text-gray-300 text-sm">데이터 없음</span>
          </div>
        )}
      </div>
    </div>
  )
}
