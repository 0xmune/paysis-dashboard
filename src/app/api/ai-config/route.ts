import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { message, config, columns } = await req.json()

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'GROQ_API_KEY가 없습니다.' }, { status: 500 })

  const systemPrompt = `You are a dashboard configuration assistant. Modify the config JSON based on user commands and return ONLY valid JSON with no explanation, no markdown, no code blocks.

Available columns (use EXACT names): ${JSON.stringify(columns)}

Current config: ${JSON.stringify(config)}

Rules:
- Return ONLY: {"widgets":[...],"segments":[...]}
- widget fields: id(string), type("kpi"|"bar"|"line"|"pie"|"table"), title(string), valueCol(MUST be from columns list), groupCol(MUST be from columns list or ""), period("daily"|"weekly"|"monthly"), row(number 0-10)
- New widget id: use random 6-char string
- Keep existing widgets unless user says to remove/change them
- Use EXACT column names from the list above`

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message },
        ],
        temperature: 0.1,
        max_tokens: 2048,
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      return NextResponse.json({ error: `Groq API 오류: ${res.status}`, raw: errText }, { status: 500 })
    }

    const data = await res.json()
    const text: string = data.choices?.[0]?.message?.content ?? ''
    if (!text) return NextResponse.json({ error: 'AI 응답이 비어있습니다.' }, { status: 500 })

    // JSON 추출
    let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start === -1 || end === -1) return NextResponse.json({ error: 'JSON 없음', raw: text }, { status: 500 })
    cleaned = cleaned.slice(start, end + 1)

    const newConfig = JSON.parse(cleaned)

    // 위젯 유효성 검증 및 보정
    const validTypes = ['kpi', 'bar', 'line', 'pie', 'table']
    const validPeriods = ['daily', 'weekly', 'monthly']

    if (Array.isArray(newConfig.widgets)) {
      newConfig.widgets = newConfig.widgets.map((w: Record<string, unknown>, i: number) => ({
        id: String(w.id || Math.random().toString(36).slice(2)),
        type: validTypes.includes(String(w.type)) ? w.type : 'kpi',
        title: String(w.title || '위젯'),
        valueCol: columns.includes(String(w.valueCol)) ? String(w.valueCol) : (columns[0] ?? ''),
        groupCol: columns.includes(String(w.groupCol)) ? String(w.groupCol) : '',
        period: validPeriods.includes(String(w.period)) ? w.period : 'monthly',
        row: typeof w.row === 'number' ? w.row : i,
        segmentId: w.segmentId ?? undefined,
      }))
    } else {
      newConfig.widgets = config.widgets
    }

    if (!Array.isArray(newConfig.segments)) {
      newConfig.segments = config.segments
    }

    return NextResponse.json({ config: newConfig })
  } catch (e) {
    return NextResponse.json({ error: `오류: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 })
  }
}
