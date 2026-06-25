import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { name, password } = await req.json()
  if (!name) return NextResponse.json({ error: '이름을 입력해주세요.' }, { status: 400 })
  const project = await prisma.project.findUnique({ where: { id } })
  if (!project) return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 })
  const ok = await bcrypt.compare(password, project.password)
  if (!ok) return NextResponse.json({ error: '비밀번호가 틀렸습니다.' }, { status: 401 })
  const updated = await prisma.project.update({ where: { id }, data: { name } })
  return NextResponse.json({ id: updated.id, name: updated.name })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { password } = await req.json()
  const project = await prisma.project.findUnique({ where: { id } })
  if (!project) return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 })
  const ok = await bcrypt.compare(password, project.password)
  if (!ok) return NextResponse.json({ error: '비밀번호가 틀렸습니다.' }, { status: 401 })
  await prisma.project.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
