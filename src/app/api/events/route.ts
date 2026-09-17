import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSimulator } from '@/lib/simulator'
import { serializeEvent } from '@/lib/serialize'
import { paginationFrom, withRoute } from '@/lib/api'
import { eventStatusEnum, severityEnum, zodId } from '@/lib/validation'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  return withRoute(async () => {
    const sp = req.nextUrl.searchParams
    const { limit, offset } = paginationFrom(sp, { limit: 60 })
    await ensureSimulator()
    const severity = severityEnum.safeParse(sp.get('severity'))
    const statusParam = sp.get('status')
    const status =
      statusParam === 'actionable'
        ? ('actionable' as const)
        : eventStatusEnum.safeParse(statusParam)
    const cameraId = zodId.safeParse(sp.get('cameraId'))
    const type = zodId.safeParse(sp.get('type'))
    const q = sp.get('q')

    const where: Record<string, unknown> = {}
    if (severity.success) where.severity = severity.data
    if (status === 'actionable') where.status = { in: ['open', 'escalated'] }
    else if (status.success) where.status = status.data
    if (cameraId.success) where.cameraId = cameraId.data.toUpperCase()
    if (type.success) where.type = type.data
    if (q) where.summary = { contains: q.slice(0, 200) }

    const [total, items, statusCounts] = await Promise.all([
      db.securityEvent.count({ where }),
      db.securityEvent.findMany({ where, orderBy: { timestamp: 'desc' }, take: limit, skip: offset }),
      db.securityEvent.groupBy({ by: ['status'], _count: { _all: true } }),
    ])

    return NextResponse.json({
      total,
      limit,
      offset,
      statusCounts: Object.fromEntries(statusCounts.map((s) => [s.status, s._count._all])),
      items: items.map(serializeEvent),
    })
  })
}
