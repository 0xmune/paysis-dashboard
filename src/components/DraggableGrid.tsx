'use client'

import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useSensor, useSensors, closestCenter,
} from '@dnd-kit/core'
import {
  SortableContext, arrayMove, rectSortingStrategy, useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useState } from 'react'
import { Widget, DashboardConfig } from '@/lib/types'

type Props = {
  config: DashboardConfig
  onReorder: (widgets: Widget[]) => void
  children: (widget: Widget, isDragging: boolean) => React.ReactNode
  editMode: boolean
  onAddInRow: (row: number) => void
  onAddNewRow: () => void
}

function SortableWidget({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 }}
      className="flex-1 min-w-0"
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  )
}

export default function DraggableGrid({ config, onReorder, children, editMode, onAddInRow, onAddNewRow }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const widgetIds = config.widgets.map(w => w.id)

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id))
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null)
    const { active, over } = e
    if (!over || active.id === over.id) return

    const oldIndex = config.widgets.findIndex(w => w.id === active.id)
    const newIndex = config.widgets.findIndex(w => w.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(config.widgets, oldIndex, newIndex)
    // row 번호 재정렬: 순서대로 row 0, 0, 0, 1, 1, 2 ... 등 유지
    // 새 순서 기준으로 row 번호 재계산
    const newWidgets = reordered.map((w, i) => ({ ...w, row: Math.floor(i / 4) }))
    onReorder(newWidgets)
  }

  // row별로 그룹핑
  const rowMap: Record<number, Widget[]> = {}
  config.widgets.forEach(w => {
    if (!rowMap[w.row]) rowMap[w.row] = []
    rowMap[w.row].push(w)
  })
  const rows = Object.entries(rowMap)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([row, widgets]) => ({ row: Number(row), widgets }))

  const activeWidget = activeId ? config.widgets.find(w => w.id === activeId) : null

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <SortableContext items={widgetIds} strategy={rectSortingStrategy}>
        <div className="space-y-6">
          {rows.map(({ row, widgets: rowWidgets }, rowIdx) => {
            const isKpiRow = rowWidgets.every(w => w.type === 'kpi')
            return (
              <section key={row}>
                {isKpiRow && (
                  <div className="flex items-center gap-3 mb-3">
                    <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                      {rowIdx === 0 ? '핵심 KPI' : `KPI 그룹 ${rowIdx + 1}`}
                    </h2>
                    <div className="flex-1 h-px bg-gray-100" />
                  </div>
                )}
                <div className="flex gap-4">
                  {rowWidgets.map(widget => (
                    <SortableWidget key={widget.id} id={widget.id}>
                      {children(widget, widget.id === activeId)}
                    </SortableWidget>
                  ))}
                  {editMode && (
                    <button onClick={() => onAddInRow(row)}
                      className="w-14 flex-shrink-0 border-2 border-dashed border-gray-200 hover:border-blue-300 rounded-2xl text-gray-300 hover:text-blue-400 transition flex items-center justify-center text-2xl font-light">
                      +
                    </button>
                  )}
                </div>
              </section>
            )
          })}
          {editMode && (
            <button onClick={onAddNewRow}
              className="w-full h-16 border-2 border-dashed border-gray-200 hover:border-blue-300 rounded-2xl text-gray-300 hover:text-blue-400 transition flex items-center justify-center gap-2 text-sm font-medium">
              + 새 줄에 위젯 추가
            </button>
          )}
        </div>
      </SortableContext>

      <DragOverlay>
        {activeWidget && (
          <div className="opacity-90 shadow-2xl rounded-2xl overflow-hidden rotate-2 scale-105 bg-white border border-blue-200">
            <div className="p-4">
              <p className="text-sm font-semibold text-gray-600">{activeWidget.title}</p>
              <p className="text-xs text-gray-400 mt-1">{activeWidget.type} · {activeWidget.valueCol}</p>
            </div>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
