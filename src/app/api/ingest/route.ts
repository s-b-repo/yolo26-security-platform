import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { withRoute } from '@/lib/api'
import { zodId } from '@/lib/validation'
import { ObservationAccumulator, observationSchema } from '@/lib/ingest'
import { authorizeIngest } from '@/lib/ingest-auth'

export const dynamic = 'force-dynamic'

const payloadSchema = z.strictObject({
  kind: z.literal('observations'),
  cameraId: zodId,
  sessionId: z.uuid(),
  frameId: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  capturedAt: z.iso.datetime(),
  model: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  observations: z.array(observationSchema).max(64).refine((items) => new Set(items.map((item) => item.trackId)).size === items.length),
})

const accumulators = new Map<string, { session: string; model: string; lastFrame: number; lastCapture: number; acc: ObservationAccumulator }>()
const busy = new Set<string>()

export async function POST(req: NextRequest) {
  const denied = authorizeIngest(req)
  if (denied) return denied
  return withRoute(async () => {
    const raw = await req.text()
    if (Buffer.byteLength(raw) > 65536) return NextResponse.json({ error: 'payload too large' }, { status: 413 })
    let json: unknown
    try { json = JSON.parse(raw) } catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }) }
    const parsed = payloadSchema.safeParse(json)
    if (!parsed.success) return NextResponse.json({ error: 'invalid ingest payload' }, { status: 400 })
    const body = parsed.data
    const cameraId = body.cameraId.toUpperCase()
    const captured = Date.parse(body.capturedAt)
    if (Math.abs(Date.now() - captured) > 15000) return NextResponse.json({ error: 'stale frame' }, { status: 409 })
    if (busy.has(cameraId)) return NextResponse.json({ error: 'camera ingest busy' }, { status: 409 })
    busy.add(cameraId)
    try {
      const cam = await db.camera.findUnique({ where: { id: cameraId } })
      if (!cam) return NextResponse.json({ error: 'camera not registered' }, { status: 404 })
      let state = accumulators.get(cameraId)
      if (state && captured <= state.lastCapture) return NextResponse.json({ error: 'out of order frame' }, { status: 409 })
      if (state && state.session === body.sessionId && body.frameId <= state.lastFrame) return NextResponse.json({ error: 'duplicate frame' }, { status: 409 })
      if (!state || state.session !== body.sessionId || state.model !== body.model || body.frameId !== state.lastFrame + 1 || captured - state.lastCapture > 5000) {
        await db.track.updateMany({ where: { cameraId, status: { in: ['active', 'escalated'] } }, data: { status: 'ended' } })
        state = { session: body.sessionId, model: body.model, lastFrame: -1, lastCapture: 0, acc: new ObservationAccumulator(cameraId, body.model) }
        accumulators.set(cameraId, state)
      }
      try {
        const accepted = await state.acc.push(body.observations)
        state.lastFrame = body.frameId
        state.lastCapture = captured
        await db.camera.update({ where: { id: cameraId }, data: { lastHeartbeat: new Date(captured), status: 'online' } })
        return NextResponse.json({ ok: true, ...accepted })
      } catch (error) {
        accumulators.delete(cameraId)
        throw error
      }
    } finally {
      busy.delete(cameraId)
    }
  })
}
