import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { ensureSimulator } from '@/lib/simulator'
import { serializeTrack } from '@/lib/serialize'
import { apiError, paginationFrom, withRoute } from '@/lib/api'
import { zodId } from '@/lib/validation'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  return withRoute(async () => {
    const sp = req.nextUrl.searchParams
    const { limit } = paginationFrom(sp, { limit: 80 })
    await ensureSimulator()
    const status = sp.get('status')
    const cameraId = zodId.safeParse(sp.get('cameraId'))
    const objectType = zodId.safeParse(sp.get('objectType'))

    const where: Record<string, unknown> = {}
    if (status && status !== 'all') {
      const parsed = z.enum(['active', 'ended', 'escalated']).safeParse(status)
      if (!parsed.success) return apiError(400, 'invalid status')
      where.status = parsed.data
    }
    if (cameraId.success) where.cameraId = cameraId.data.toUpperCase()
    if (objectType.success) where.objectType = objectType.data

    const [total, items] = await Promise.all([
      db.track.count({ where }),
      db.track.findMany({ where, orderBy: { lastSeen: 'desc' }, take: limit }),
    ])
    return NextResponse.json({ total, items: items.map(serializeTrack) })
  })
}
