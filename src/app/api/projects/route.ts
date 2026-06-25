import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'

export async function POST(req: NextRequest) {
  const { name, password } = await req.json()
  if (!name || !password) {
    return NextResponse.json({ error: '이름과 비밀번호를 입력해주세요.' }, { status: 400 })
  }
  const hashed = await bcrypt.hash(password, 10)
  const project = await prisma.project.create({ data: { name, password: hashed } })
  return NextResponse.json({ id: project.id, name: project.name })
}
