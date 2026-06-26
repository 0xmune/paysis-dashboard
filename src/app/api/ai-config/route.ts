import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { message, config, columns } = await req.json()

  const apiKey = process.env.GOOGLE_AI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'API 키가 없습니다.' }, { status: 500 })

  const prompt = `당신은 데이터 대시보드 설정 전문가입니다.
사용자 명령에 따라 현재 config를 수정하여 순수 JSON만 반환하세요.
마크다운, 설명, 코드블록 없이 JSON 객체만 반환하세요.

사용 가능한 컬럼: ${JSON.stringify(columns)}

현재 config: ${JSON.stringify(config)}

widget 필드: id(string), type("kpi"|"bar"|"line"|"pie"|"table"), title(string), valueCol(string), groupCol(string), period("daily"|"weekly"|"monthly"), row(number)
segment 필드: id(string), name(string), color(string), logic("AND"|"OR"), conditions([{col,op,value,value2?}])
op: "="|"!="|">"|">="|"<"|"<="|"contains"|"between"

반환 형식 (이 형식만, 다른 텍스트 없이):
{"widgets":[...],"segments":[...]}

사용자 명령: ${message}`

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
        }),
      }
    )

    if (!res.ok) {
      const errText = await res.text()
      return NextResponse.json({ error: `Gemini API 오류: ${res.status}`, raw: errText }, { status: 500 })
    }

    const data = await res.json()
    const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

    if (!text) {
      return NextResponse.json({ error: 'AI 응답이 비어있습니다.', raw: JSON.stringify(data) }, { status: 500 })
    }

    // 마크다운 코드블록 제거
    let cleaned = text
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/gi, '')
      .trim()

    // JSON 객체 추출 (중첩 지원)
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start === -1 || end === -1) {
      return NextResponse.json({ error: 'JSON을 찾을 수 없습니다.', raw: text }, { status: 500 })
    }
    cleaned = cleaned.slice(start, end + 1)

    const newConfig = JSON.parse(cleaned)
    return NextResponse.json({ config: newConfig })
  } catch (e) {
    return NextResponse.json({ error: `파싱 오류: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 })
  }
}
