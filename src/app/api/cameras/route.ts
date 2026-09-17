import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSimulator } from '@/lib/simulator'
import { serializeCamera } from '@/lib/serialize'
import { apiError, parseBody, withRoute } from '@/lib/api'
import { cameraCreateSchema } from '@/lib/validation'

export const dynamic = 'force-dynamic'

export async function GET() {
  return withRoute(async () => {
    await ensureSimulator()
    const cameras = await db.camera.findMany({ orderBy: { id: 'asc' } })
    return NextResponse.json({ cameras: cameras.map(serializeCamera) })
  })
}

export async function POST(req: NextRequest) {
  return withRoute(async () => {
    const parsed = await parseBody(req, cameraCreateSchema)
    if (!parsed.ok) return parsed.response
    await ensureSimulator()
    const body = parsed.data
    const id = body.id.toUpperCase()
    const cam = await db.$transaction(async (tx) => {
      const exists = await tx.camera.findUnique({ where: { id } })
      if (exists) return undefined
      const historical = await tx.securityEvent.count({ where: { cameraId: id } })
      const tracks = await tx.track.count({ where: { cameraId: id } })
      if (historical || tracks) return null
      return tx.camera.create({
        data: {
          id,
          name: body.name,
          location: body.location ?? 'Unassigned',
          streamUrl: body.streamUrl ?? `rtsp://vms.local:8554/${id.toLowerCase()}_main`,
          resolution: body.resolution ?? '1920x1080',
          fps: body.fps ?? 25,
          orientation: body.orientation ?? 'fixed-dome',
          status: 'online',
          modelTier: body.modelTier ?? 'yolo26n-edge',
          zones: JSON.stringify(body.zones ?? []),
          calibration: JSON.stringify(body.calibration ?? {}),
          edgeDevice: body.edgeDevice ?? null,
          snapshot: body.snapshot ?? null,
          lastHeartbeat: new Date(),
        },
      })
    })
    if (cam === undefined) return apiError(409, 'camera id already exists')
    if (!cam) return apiError(409, 'camera id is reserved by historical evidence')
    return NextResponse.json({ camera: serializeCamera(cam) }, { status: 201 })
  })
}
