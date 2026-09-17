import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { notFound, withRoute } from '@/lib/api'
import { zodId } from '@/lib/validation'
import { authorizeIngest } from '@/lib/ingest-auth'

export const dynamic = 'force-dynamic'

const registerSchema = z.strictObject({
  cameraId: zodId,
  name: z.string().trim().min(1).max(120),
  location: z.string().trim().max(120).optional(),
  streamUrl: z.string().max(2048).refine((value) => {
    try { const url = new URL(value); return ['rtsp:', 'rtsps:'].includes(url.protocol) && !!url.hostname } catch { return false }
  }),
  resolution: z.string().regex(/^[1-9]\d{1,4}x[1-9]\d{1,4}$/).optional(),
  fps: z.number().int().min(1).max(120).optional(),
  modelTier: z.enum(['yolo26n-edge', 'yolo26s-server', 'yolo26l-central']).optional(),
})

export async function POST(req: NextRequest) {
  const denied = authorizeIngest(req)
  if (denied) return denied
  return withRoute(async () => {
    const parsed = registerSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
    const body = parsed.data
    const id = body.cameraId.toUpperCase()
    const cam = await db.camera.upsert({
      where: { id },
      update: { streamUrl: body.streamUrl, status: 'offline' },
      create: {
        id,
        name: body.name,
        location: body.location ?? 'Unassigned',
        streamUrl: body.streamUrl,
        resolution: body.resolution ?? '1920x1080',
        fps: body.fps ?? 25,
        orientation: 'fixed-bullet',
        status: 'offline',
        modelTier: body.modelTier ?? 'yolo26n-edge',
        zones: '[]',
        calibration: '{}',
        lastHeartbeat: null,
      },
    })
    return NextResponse.json({ cameraId: cam.id }, { status: 201 })
  })
}

export async function GET(req: NextRequest) {
  const denied = authorizeIngest(req)
  if (denied) return denied
  return withRoute(async () => {
    const cameras = await db.camera.findMany({ orderBy: { id: 'asc' }, select: { id: true, name: true, streamUrl: true, zones: true, modelTier: true, status: true } })
    if (cameras.length === 0) return notFound('no cameras registered')
    return NextResponse.json({
      cameras: cameras.map((c) => ({
        cameraId: c.id,
        name: c.name,
        streamUrl: c.streamUrl,
        modelTier: c.modelTier,
        status: c.status,
        zones: JSON.parse(c.zones) as unknown[],
      })),
    })
  })
}
