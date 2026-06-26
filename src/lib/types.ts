export type Row = Record<string, string | number | null>

export type WidgetType = 'kpi' | 'bar' | 'line' | 'pie' | 'table'
export type Period = 'daily' | 'weekly' | 'monthly'

export type Widget = {
  id: string
  type: WidgetType
  title: string
  valueCol: string
  groupCol: string
  period: Period
  row: number
  segmentId?: string
}

export type ConditionOp = '=' | '!=' | '>' | '>=' | '<' | '<=' | 'contains' | 'between'

export type Condition = {
  col: string
  op: ConditionOp
  value: string
  value2?: string
}

export type Segment = {
  id: string
  name: string
  color: string
  logic: 'AND' | 'OR'
  conditions: Condition[]
}

export type DashboardConfig = {
  widgets: Widget[]
  segments: Segment[]
}
