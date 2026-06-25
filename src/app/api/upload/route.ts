import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { parseFile, deduplicateRows, hashRow } from '@/lib/parser'

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File
  const projectId = formData.get('projectId') as string

  if (!file || !projectId) {
    return NextResponse.json({ error: '파일과 프로젝트 ID가 필요합니다.' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const rows = parseFile(buffer, file.name)
  const deduped = deduplicateRows(rows)

  const existingHashes = await prisma.record.findMany({
    where: { projectId },
    select: { hash: true },
  })
  const existingSet = new Set(existingHashes.map((r) => r.hash))

  const newRows = deduped.filter((row) => !existingSet.has(hashRow(row)))

  if (newRows.length > 0) {
    await prisma.record.createMany({
      data: newRows.map((row) => ({
        projectId,
        data: row as object,
        hash: hashRow(row),
      })),
      skipDuplicates: true,
    })
  }

  return NextResponse.json({
    total: rows.length,
    dedupedInFile: deduped.length,
    newRecords: newRows.length,
    skipped: rows.length - newRows.length,
  })
}
