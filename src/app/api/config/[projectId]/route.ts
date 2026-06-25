import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const config = await prisma.dashboardConfig.findUnique({ where: { projectId } })
  return NextResponse.json(config?.config ?? null)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const config = await req.json()
  const result = await prisma.dashboardConfig.upsert({
    where: { projectId },
    update: { config },
    create: { projectId, config },
  })
  return NextResponse.json(result.config)
}
