import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const records = await prisma.record.findMany({
    where: { projectId },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json(records.map((r) => r.data))
}
