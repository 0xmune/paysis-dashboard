'use client'

import { Segment, Condition, ConditionOp } from '@/lib/types'

const OPS: { value: ConditionOp; label: string }[] = [
  { value: '=', label: '같음 (=)' },
  { value: '!=', label: '다름 (≠)' },
  { value: '>', label: '초과 (>)' },
  { value: '>=', label: '이상 (≥)' },
  { value: '<', label: '미만 (<)' },
  { value: '<=', label: '이하 (≤)' },
  { value: 'contains', label: '포함' },
  { value: 'between', label: '사이 (between)' },
]

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899']

type Props = {
  segments: Segment[]
  columns: string[]
  onChange: (segments: Segment[]) => void
  onClose: () => void
}

function newSegment(): Segment {
  return {
    id: Math.random().toString(36).slice(2),
    name: '새 세그먼트',
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    logic: 'AND',
    conditions: [],
  }
}

function newCondition(col: string): Condition {
  return { col, op: '=', value: '' }
}

export default function SegmentBuilder({ segments, columns, onChange, onClose }: Props) {
  const [selected, setSelected] = [
    segments[0]?.id ?? null,
    (id: string | null) => {
      // handled below via local state pattern
      void id
    }
  ]
  void selected

  function addSegment() {
    onChange([...segments, newSegment()])
  }

  function removeSegment(id: string) {
    onChange(segments.filter(s => s.id !== id))
  }

  function updateSegment(id: string, patch: Partial<Segment>) {
    onChange(segments.map(s => s.id === id ? { ...s, ...patch } : s))
  }

  function addCondition(segId: string) {
    const seg = segments.find(s => s.id === segId)
    if (!seg || !columns.length) return
    updateSegment(segId, { conditions: [...seg.conditions, newCondition(columns[0])] })
  }

  function updateCondition(segId: string, idx: number, patch: Partial<Condition>) {
    const seg = segments.find(s => s.id === segId)
    if (!seg) return
    const conditions = seg.conditions.map((c, i) => i === idx ? { ...c, ...patch } : c)
    updateSegment(segId, { conditions })
  }

  function removeCondition(segId: string, idx: number) {
    const seg = segments.find(s => s.id === segId)
    if (!seg) return
    updateSegment(segId, { conditions: seg.conditions.filter((_, i) => i !== idx) })
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-end p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-xl mt-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h2 className="font-bold text-base">세그먼트 빌더</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition text-lg">✕</button>
        </div>

        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {segments.length === 0 && (
            <p className="text-slate-600 text-sm text-center py-4">세그먼트가 없어요. 아래에서 추가하세요.</p>
          )}

          {segments.map((seg) => (
            <div key={seg.id} className="bg-slate-800 rounded-xl p-4 space-y-3">
              {/* 세그먼트 헤더 */}
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={seg.color}
                  onChange={e => updateSegment(seg.id, { color: e.target.value })}
                  className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent"
                />
                <input
                  type="text"
                  value={seg.name}
                  onChange={e => updateSegment(seg.id, { name: e.target.value })}
                  className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <select
                  value={seg.logic}
                  onChange={e => updateSegment(seg.id, { logic: e.target.value as 'AND' | 'OR' })}
                  className="bg-slate-700 border border-slate-600 text-xs rounded-lg px-2 py-1.5 focus:outline-none"
                >
                  <option value="AND">AND</option>
                  <option value="OR">OR</option>
                </select>
                <button onClick={() => removeSegment(seg.id)} className="text-slate-500 hover:text-red-400 transition text-sm">✕</button>
              </div>

              {/* 조건 목록 */}
              <div className="space-y-2">
                {seg.conditions.map((cond, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 flex-wrap">
                    {idx > 0 && (
                      <span className="text-xs text-slate-500 w-8 text-center">{seg.logic}</span>
                    )}
                    {idx === 0 && <span className="w-8" />}

                    {/* 컬럼 */}
                    <select
                      value={cond.col}
                      onChange={e => updateCondition(seg.id, idx, { col: e.target.value })}
                      className="bg-slate-700 border border-slate-600 text-xs rounded-lg px-2 py-1.5 focus:outline-none max-w-36"
                    >
                      {columns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>

                    {/* 연산자 */}
                    <select
                      value={cond.op}
                      onChange={e => updateCondition(seg.id, idx, { op: e.target.value as ConditionOp })}
                      className="bg-slate-700 border border-slate-600 text-xs rounded-lg px-2 py-1.5 focus:outline-none"
                    >
                      {OPS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>

                    {/* 값 */}
                    <input
                      type="text"
                      value={cond.value}
                      onChange={e => updateCondition(seg.id, idx, { value: e.target.value })}
                      placeholder="값"
                      className="bg-slate-700 border border-slate-600 text-xs rounded-lg px-2 py-1.5 focus:outline-none w-24"
                    />

                    {/* between 두번째 값 */}
                    {cond.op === 'between' && (
                      <>
                        <span className="text-slate-500 text-xs">~</span>
                        <input
                          type="text"
                          value={cond.value2 ?? ''}
                          onChange={e => updateCondition(seg.id, idx, { value2: e.target.value })}
                          placeholder="값2"
                          className="bg-slate-700 border border-slate-600 text-xs rounded-lg px-2 py-1.5 focus:outline-none w-20"
                        />
                      </>
                    )}

                    <button onClick={() => removeCondition(seg.id, idx)} className="text-slate-600 hover:text-red-400 transition text-xs">✕</button>
                  </div>
                ))}
              </div>

              <button
                onClick={() => addCondition(seg.id)}
                className="text-xs text-blue-400 hover:text-blue-300 transition"
              >
                + 조건 추가
              </button>

              {/* 미리보기 힌트 */}
              <p className="text-xs text-slate-600">
                {seg.conditions.length === 0
                  ? '조건 없음 → 전체 데이터'
                  : `${seg.conditions.length}개 조건 (${seg.logic})`}
              </p>
            </div>
          ))}

          <button
            onClick={addSegment}
            className="w-full border border-dashed border-slate-700 hover:border-blue-500 text-slate-500 hover:text-blue-400 rounded-xl py-3 text-sm transition"
          >
            + 세그먼트 추가
          </button>
        </div>

        <div className="px-5 py-4 border-t border-slate-800 flex justify-end">
          <button onClick={onClose} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition">
            저장
          </button>
        </div>
      </div>
    </div>
  )
}
