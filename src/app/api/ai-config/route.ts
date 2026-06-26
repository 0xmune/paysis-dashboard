import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { message, config, columns } = await req.json()

  const apiKey = process.env.GOOGLE_AI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'API 키가 없습니다.' }, { status: 500 })

  const systemPrompt = `당신은 데이터 대시보드 설정 전문가입니다.
사용자의 명령을 받아 현재 대시보드 설정(config)을 수정하여 반환합니다.

현재 사용 가능한 컬럼:
${JSON.stringify(columns, null, 2)}

현재 대시보드 설정:
${JSON.stringify(config, null, 2)}

규칙:
- widgets 배열과 segments 배열만 수정 가능
- widget type: "kpi" | "bar" | "line" | "pie" | "table"
- widget row: 숫자 (같은 row의 위젯은 같은 줄에 배치됨)
- widget period: "daily" | "weekly" | "monthly"
- segment conditions op: "=" | "!=" | ">" | ">=" | "<" | "<=" | "contains" | "between"
- 새 widget id는 랜덤 문자열 사용
- 반드시 유효한 JSON만 반환 (마크다운 코드블록 없이 순수 JSON만)
- 사용자가 요청한 컬럼이 columns에 없으면 가장 유사한 컬럼 사용
- widgets 배열의 각 항목 필드: id, type, title, valueCol, groupCol, period, row

아래 JSON 형식으로만 응답하세요 (설명 없이):
{"widgets": [...], "segments": [...]}`

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: systemPrompt + '\n\n사용자 명령: ' + message }] }
        ],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
      }),
    }
  )

  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

  // 마크다운 코드블록 제거 후 JSON 추출
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
  const match = cleaned.match(/\{[\s\S]*\}/)
  if (!match) return NextResponse.json({ error: 'AI 응답 파싱 실패', raw: text }, { status: 500 })

  try {
    const newConfig = JSON.parse(match[0])
    return NextResponse.json({ config: newConfig })
  } catch {
    return NextResponse.json({ error: 'JSON 파싱 실패', raw: text }, { status: 500 })
  }
}
