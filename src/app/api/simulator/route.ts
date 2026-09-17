import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSimulator, getSimulatorStatus, startSimulator, stopSimulator, queueInjection, injectThreat } from '@/lib/simulator'
import { parseJson } from '@/lib/serialize'
import type { ZonePolygon } from '@/lib/seed'
import { demoEnabled } from '@/lib/simulator'
import { parseBody, withRoute } from '@/lib/api'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

export async function GET() {
  await ensureSimulator()
  const status = getSimulatorStatus()
  const [cameraCount, ruleCount, activeModel] = await Promise.all([
    db.camera.count(),
    db.rule.count({ where: { enabled: true } }),
    db.modelVersion.findFirst({ where: { status: 'active' } }),
  ])
  return NextResponse.json({
    ...status,
    pipeline: [
      { stage: 'perception', detail: 'YOLO26 detection (model tiers: n/s/l by camera)' },
      { stage: 'tracking', detail: 'multi-frame confirmation — never single-frame alarms' },
      { stage: 'temporal_verification', detail: 'persistence + bbox consistency check' },
      { stage: 'association_zones', detail: 'person↔weapon association + zone polygons' },
      { stage: 'event_engine', detail: `${ruleCount} active rules` },
      { stage: 'alerting', detail: 'INFO → SUSPICIOUS → HIGH → CRITICAL' },
    ],
    cameraCount,
    activeModel: activeModel?.id ?? null,
  })
}

function bboxInsidePolygon(polygon: [number, number][]): { x: number; y: number; w: number; h: number } {
  const xs = polygon.map((p) => p[0])
  const ys = polygon.map((p) => p[1])
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2
  return { x: Math.max(0.02, cx - 0.06), y: Math.max(0.02, cy - 0.08), w: 0.1, h: 0.22 }
}

export async function POST(req: NextRequest) {
  if (!demoEnabled()) return NextResponse.json({ error: 'simulator disabled' }, { status: 403 })
  return withRoute(async () => {
    const parsed = await parseBody(req, z.strictObject({
      action: z.enum(['start', 'stop', 'inject_weapon', 'inject_knife', 'inject_intruder']),
      cameraId: z.string().regex(/^[A-Za-z0-9-]{1,64}$/).optional(),
    }))
    if (!parsed.ok) return parsed.response
    await ensureSimulator()
    const body = parsed.data
    const action = body.action

    switch (action) {
      case 'start':
        startSimulator()
        return NextResponse.json({ ok: true, status: getSimulatorStatus() })
      case 'stop':
        stopSimulator()
        return NextResponse.json({ ok: true, status: getSimulatorStatus() })
      case 'inject_weapon':
      case 'inject_knife': {
        let cameraId = body.cameraId ? String(body.cameraId).toUpperCase() : null
        const cameras = await db.camera.findMany()
        const online = cameras.filter((c) => c.status === 'online')
        if (!cameraId || !online.some((c) => c.id === cameraId)) {
          if (online.length === 0) return NextResponse.json({ error: 'no online cameras' }, { status: 409 })
          cameraId = online[Math.floor(Math.random() * online.length)].id
        }
        const result = await injectThreat(cameraId, action === 'inject_weapon' ? 'firearm' : 'knife')
        if ('error' in result) return NextResponse.json({ error: result.error }, { status: 409 })
        return NextResponse.json({ ok: true, cameraId: result.cameraId, status: getSimulatorStatus() })
      }
      case 'inject_intruder': {
        let cameraId = body.cameraId ? String(body.cameraId).toUpperCase() : null
        const cameras = await db.camera.findMany()
        const online = cameras.filter((c) => c.status === 'online')
        if (!cameraId || !online.some((c) => c.id === cameraId)) {
          if (online.length === 0) return NextResponse.json({ error: 'no online cameras' }, { status: 409 })
          cameraId = online[Math.floor(Math.random() * online.length)].id
        }
        const cam = online.find((c) => c.id === cameraId)!
        const zones = parseJson<ZonePolygon[]>(cam.zones, [])

        if (action === 'inject_intruder') {
          const restricted = zones.find((zz) => zz.type === 'restricted')
          if (restricted) {
            queueInjection(cam.id, action, 'person', bboxInsidePolygon(restricted.polygon))
          } else {
            queueInjection(cam.id, action, 'person')
          }
        } else {
          // weapon appears near a plausible person position (association will happen via proximity)
          queueInjection(cam.id, action, action === 'inject_weapon' ? 'firearm' : 'knife')
        }
        return NextResponse.json({ ok: true, cameraId: cam.id, status: getSimulatorStatus() })
      }
      default:
        return NextResponse.json({ error: 'unknown action' }, { status: 400 })
    }
  })
}
