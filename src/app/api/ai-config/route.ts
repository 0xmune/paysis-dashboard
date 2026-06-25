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
- widget size: "sm" | "md" | "lg"
- widget period: "daily" | "weekly" | "monthly"
- segment conditions op: "=" | "!=" | ">" | ">=" | "<" | "<=" | "contains" | "between"
- 새 widget id는 랜덤 문자열 사용
- 반드시 유효한 JSON만 반환 (설명 없이 JSON만)
- 사용자가 요청한 컬럼이 columns에 없으면 가장 유사한 컬럼 사용

사용자 명령에 따라 수정된 config JSON을 반환하세요.`

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: systemPrompt + '\n\n사용자 명령: ' + message }] }
        ],
        generationConfig: { temperature: 0.1 }
      }),
    }
  )

  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

  // JSON 추출
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return NextResponse.json({ error: 'AI 응답 파싱 실패', raw: text }, { status: 500 })

  try {
    const newConfig = JSON.parse(match[0])
    return NextResponse.json({ config: newConfig })
  } catch {
    return NextResponse.json({ error: 'JSON 파싱 실패', raw: text }, { status: 500 })
  }
}
