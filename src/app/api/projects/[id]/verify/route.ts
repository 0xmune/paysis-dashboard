import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { password } = await req.json()
  const project = await prisma.project.findUnique({ where: { id } })
  if (!project) return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 })
  const ok = await bcrypt.compare(password, project.password)
  if (!ok) return NextResponse.json({ error: '비밀번호가 틀렸습니다.' }, { status: 401 })
  return NextResponse.json({ id: project.id, name: project.name })
}
