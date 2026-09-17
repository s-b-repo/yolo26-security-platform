import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSimulator } from '@/lib/simulator'
import { serializeCamera, serializeEvent, serializeTrack } from '@/lib/serialize'
import { notFound, parseBody, withRoute } from '@/lib/api'
import { cameraPatchSchema, zodId } from '@/lib/validation'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Context) {
  return withRoute(async () => {
    const id = zodId.parse((await params).id).toUpperCase()
    await ensureSimulator()
    const cam = await db.camera.findUnique({ where: { id } })
    if (!cam) return notFound('camera not found')
    const [tracks, events] = await Promise.all([
      db.track.findMany({ where: { cameraId: id, status: 'active' }, orderBy: { lastSeen: 'desc' }, take: 200 }),
      db.securityEvent.findMany({ where: { cameraId: id }, orderBy: { timestamp: 'desc' }, take: 10 }),
    ])
    return NextResponse.json({ camera: serializeCamera(cam), activeTracks: tracks.map(serializeTrack), recentEvents: events.map(serializeEvent) })
  })
}

export async function PATCH(req: NextRequest, { params }: Context) {
  return withRoute(async () => {
    const id = zodId.parse((await params).id).toUpperCase()
    const parsed = await parseBody(req, cameraPatchSchema)
    if (!parsed.ok) return parsed.response
    await ensureSimulator()
    const { zones, ...data } = parsed.data
    const cam = await db.camera.update({ where: { id }, data: { ...data, ...(zones === undefined ? {} : { zones: JSON.stringify(zones) }) } })
    return NextResponse.json({ camera: serializeCamera(cam) })
  })
}

export async function DELETE(_req: NextRequest, { params }: Context) {
  return withRoute(async () => {
    const id = zodId.parse((await params).id).toUpperCase()
    await ensureSimulator()
    await db.$transaction(async (tx) => {
      await tx.camera.delete({ where: { id } })
      await tx.track.updateMany({ where: { cameraId: id, status: { in: ['active', 'escalated'] } }, data: { status: 'ended' } })
    })
    return NextResponse.json({ ok: true })
  })
}
