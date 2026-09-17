import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSimulator } from '@/lib/simulator'
import { serializeTrack } from '@/lib/serialize'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await ensureSimulator()
  const { id } = await params
  const track = await db.track.findUnique({ where: { id } })
  if (!track) return NextResponse.json({ error: 'track not found' }, { status: 404 })

  // events involving the same camera around the track lifetime
  const events = await db.securityEvent.findMany({
    where: {
      cameraId: track.cameraId,
      timestamp: { gte: new Date(track.firstSeen.getTime() - 60_000) },
    },
    orderBy: { timestamp: 'desc' },
    take: 8,
  })

  return NextResponse.json({ track: serializeTrack(track), relatedEvents: events.map((e) => ({ id: e.id, type: e.type, severity: e.severity, timestamp: e.timestamp.toISOString(), summary: e.summary })) })
}
