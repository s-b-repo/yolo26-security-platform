import { afterAll, expect, test } from 'bun:test'
import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { db } from '../src/lib/db'
import { POST } from '../src/app/api/ingest/route'
import { mapClassName } from '../src/lib/ingest'

const integration = process.env.DATABASE_URL === 'file:/tmp/opencode/soc-ingest-verification.db' ? test : test.skip
const token = 'integration-only-token-not-a-real-secret-123456'

function request(cameraId: string, sessionId: string, frameId: number, observations: unknown[], capturedAt: string) {
  return new NextRequest('http://localhost/api/ingest', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'observations', cameraId, sessionId, frameId, capturedAt, model: `sha256:${'a'.repeat(64)}`, observations }),
  })
}

test('does not relabel scissors as a knife', () => {
  expect(mapClassName('scissors')).toBeNull()
  expect(mapClassName('knife')).toBe('knife')
})

test('ingest rejects absent credentials', async () => {
  const original = process.env.INGEST_TOKEN
  process.env.INGEST_TOKEN = token
  try {
    const response = await POST(new NextRequest('http://localhost/api/ingest', { method: 'POST' }))
    expect(response.status).toBe(401)
  } finally {
    if (original === undefined) delete process.env.INGEST_TOKEN
    else process.env.INGEST_TOKEN = original
  }
})

integration('four distinct consecutive frames, misses, retries, and camera isolation', async () => {
  const original = process.env.INGEST_TOKEN
  process.env.INGEST_TOKEN = token
  const suffix = randomUUID().slice(0, 8).toUpperCase()
  const cameraIds = [`TEST-A-${suffix}`, `TEST-B-${suffix}`]
  const sessionId = randomUUID()
  const rule = await db.rule.create({ data: {
    name: 'weapon_seen_only', description: 'Integration fixture', action: 'raise_alert', severity: 'suspicious',
    conditions: JSON.stringify([{ field: 'objectType', op: '==', value: 'knife' }]),
  } })
  const observation = { trackId: 1, objectType: 'knife', confidence: 0.91, bbox: { x: 0.4, y: 0.4, w: 0.1, h: 0.1 } }
  let clock = Date.now() - 1000
  const send = async (camera: string, frame: number, items: unknown[] = [observation]) => {
    clock += 10
    const response = await POST(request(camera, sessionId, frame, items, new Date(clock).toISOString()))
    return { status: response.status, body: await response.json() }
  }
  try {
    for (const id of cameraIds) await db.camera.create({ data: { id, name: id, location: 'Test', streamUrl: 'rtsp://localhost/test', resolution: '640x480', orientation: 'fixed-bullet' } })
    for (let frame = 0; frame < 3; frame++) {
      const result = await send(cameraIds[0], frame)
      expect(result.status).toBe(200)
      expect(result.body.eventsFired).toEqual([])
    }
    expect((await send(cameraIds[0], 2)).status).toBe(409)
    expect((await send(cameraIds[1], 0)).body.eventsFired).toEqual([])
    const fourth = await send(cameraIds[0], 3)
    expect(fourth.body.eventsFired).toHaveLength(1)
    const event = await db.securityEvent.findUniqueOrThrow({ where: { id: fourth.body.eventsFired[0] } })
    expect(event.framesConfirmed).toBe(4)
    expect(event.model).toBe(`sha256:${'a'.repeat(64)}`)
    expect((await send(cameraIds[0], 4)).body.eventsFired).toEqual([])
    await send(cameraIds[1], 1, [])
    for (let frame = 2; frame < 5; frame++) expect((await send(cameraIds[1], frame)).body.eventsFired).toEqual([])
    const second = await send(cameraIds[1], 5)
    expect(second.body.eventsFired).toHaveLength(1)
    expect(second.body.eventsFired[0]).not.toBe(fourth.body.eventsFired[0])
  } finally {
    await db.securityEvent.deleteMany({ where: { cameraId: { in: cameraIds } } })
    await db.track.deleteMany({ where: { cameraId: { in: cameraIds } } })
    await db.camera.deleteMany({ where: { id: { in: cameraIds } } })
    await db.rule.delete({ where: { id: rule.id } })
    if (original === undefined) delete process.env.INGEST_TOKEN
    else process.env.INGEST_TOKEN = original
  }
})

afterAll(async () => { await db.$disconnect() })
