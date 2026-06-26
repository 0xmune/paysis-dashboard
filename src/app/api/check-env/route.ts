import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    GROQ_API_KEY: process.env.GROQ_API_KEY ? '✅ 있음 (' + process.env.GROQ_API_KEY.slice(0, 8) + '...)' : '❌ 없음',
    GOOGLE_AI_API_KEY: process.env.GOOGLE_AI_API_KEY ? '✅ 있음' : '❌ 없음',
    DATABASE_URL: process.env.DATABASE_URL ? '✅ 있음' : '❌ 없음',
  })
}
