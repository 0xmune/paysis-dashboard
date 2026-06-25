import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { hashRow } from '@/lib/parser'

export async function POST(req: NextRequest) {
  const { projectId, rows } = await req.json()
  if (!projectId || !Array.isArray(rows)) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  }

  const existingHashes = await prisma.record.findMany({
    where: { projectId },
    select: { hash: true },
  })
  const existingSet = new Set(existingHashes.map((r) => r.hash))

  const seen = new Set<string>()
  const newRows = rows.filter((row) => {
    const h = hashRow(row)
    if (existingSet.has(h) || seen.has(h)) return false
    seen.add(h)
    return true
  })

  if (newRows.length > 0) {
    await prisma.record.createMany({
      data: newRows.map((row) => ({
        projectId,
        data: row,
        hash: hashRow(row),
      })),
      skipDuplicates: true,
    })
  }

  return NextResponse.json({
    newRecords: newRows.length,
    skipped: rows.length - newRows.length,
  })
}
