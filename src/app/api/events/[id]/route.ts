import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSimulator } from '@/lib/simulator'
import { serializeEvent } from '@/lib/serialize'
import { notFound, parseBody, trustedActor, withRoute } from '@/lib/api'
import { eventPatchSchema } from '@/lib/validation'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withRoute(async () => {
    await ensureSimulator()
    const { id } = await params
    const evt = await db.securityEvent.findUnique({ where: { id: id.toUpperCase() } })
    if (!evt) return notFound('event not found')

    const [camera, related] = await Promise.all([
      db.camera.findUnique({ where: { id: evt.cameraId } }),
      db.securityEvent.findMany({
        where: { cameraId: evt.cameraId, id: { not: evt.id } },
        orderBy: { timestamp: 'desc' },
        take: 6,
      }),
    ])

    return NextResponse.json({
      event: serializeEvent(evt),
      camera: camera ? { id: camera.id, name: camera.name, location: camera.location, snapshot: camera.snapshot, zones: camera.zones } : null,
      related: related.map(serializeEvent),
    })
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withRoute(async () => {
    await ensureSimulator()
    const { id } = await params
    const evtId = id.toUpperCase()
    const parsed = await parseBody(req, eventPatchSchema)
    if (!parsed.ok) return parsed.response

    const evt = await db.securityEvent.findUnique({ where: { id: evtId } })
    if (!evt) return notFound('event not found')

    const { status, notes } = parsed.data
    const data: { status?: string; notes?: string | null; acknowledgedAt?: Date; acknowledgedBy?: string } = { status }
    if (notes !== undefined) data.notes = notes
    if (status === 'acknowledged' || status === 'resolved') {
      data.acknowledgedAt = new Date()
      data.acknowledgedBy = trustedActor(req)
    }

    const updated = await db.securityEvent.update({ where: { id: evtId }, data })
    return NextResponse.json({ event: serializeEvent(updated) })
  })
}
