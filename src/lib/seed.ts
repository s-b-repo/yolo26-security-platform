import { db } from '@/lib/db'

/**
 * Idempotent seeding of the YOLO26 Security Platform demo data:
 * cameras, event-engine rules, model registry, historical events and system logs.
 */

export interface ZonePolygon {
  id: string
  name: string
  type: 'public' | 'restricted' | 'flow'
  color: string
  polygon: [number, number][] // normalized 0..1 coordinates
}

interface CamDef {
  id: string
  name: string
  location: string
  resolution: string
  fps: number
  orientation: string
  modelTier: string
  edgeDevice: string
  snapshot: string
  zones: ZonePolygon[]
}

const z = (
  id: string,
  name: string,
  type: ZonePolygon['type'],
  polygon: [number, number][],
): ZonePolygon => ({
  id,
  name,
  type,
  color: type === 'restricted' ? '#ef4444' : type === 'flow' ? '#f59e0b' : '#22c55e',
  polygon,
})

export const CAMERA_DEFS: CamDef[] = [
  {
    id: 'CAM-001', name: 'Main Entrance', location: 'HQ · Lobby / Reception',
    resolution: '1920x1080', fps: 25, orientation: 'fisheye', modelTier: 'yolo26s-server',
    edgeDevice: 'edge-gpu-01', snapshot: '/snapshots/cam-001.png',
    zones: [
      z('general', 'General Area', 'public', [[0, 0], [1, 0], [1, 1], [0, 1]]),
      z('staff-door', 'Staff-Only Door', 'restricted', [[0.72, 0.08], [0.98, 0.08], [0.98, 0.52], [0.72, 0.52]]),
      z('entry-flow', 'Entry Flow →', 'flow', [[0.1, 0.55], [0.5, 0.55], [0.5, 0.95], [0.1, 0.95]]),
    ],
  },
  {
    id: 'CAM-002', name: 'Parking Garage B1', location: 'Underground · Level B1',
    resolution: '1920x1080', fps: 20, orientation: 'fixed-bullet', modelTier: 'yolo26n-edge',
    edgeDevice: 'edge-npu-02', snapshot: '/snapshots/cam-002.png',
    zones: [
      z('general', 'Parking Area', 'public', [[0, 0], [1, 0], [1, 1], [0, 1]]),
      z('emg-exit', 'Emergency Exit', 'restricted', [[0.02, 0.05], [0.3, 0.05], [0.3, 0.45], [0.02, 0.45]]),
      z('entry-lane', 'Entry Lane →', 'flow', [[0.35, 0.7], [0.95, 0.7], [0.95, 0.98], [0.35, 0.98]]),
    ],
  },
  {
    id: 'CAM-003', name: 'Warehouse Aisle 3', location: 'Logistics Center · Aisle 3',
    resolution: '2560x1440', fps: 25, orientation: 'fixed-dome', modelTier: 'yolo26s-server',
    edgeDevice: 'edge-gpu-01', snapshot: '/snapshots/cam-003.png',
    zones: [
      z('general', 'Aisle', 'public', [[0, 0], [1, 0], [1, 1], [0, 1]]),
      z('armory', 'Armory Door', 'restricted', [[0.4, 0.02], [0.72, 0.02], [0.72, 0.38], [0.4, 0.38]]),
    ],
  },
  {
    id: 'CAM-004', name: 'North Corridor', location: 'Office · Floor 2 North',
    resolution: '1920x1080', fps: 25, orientation: 'fixed-dome', modelTier: 'yolo26n-edge',
    edgeDevice: 'edge-npu-02', snapshot: '/snapshots/cam-004.png',
    zones: [
      z('general', 'Corridor', 'public', [[0, 0], [1, 0], [1, 1], [0, 1]]),
      z('server-room', 'Server Room', 'restricted', [[0.05, 0.1], [0.35, 0.1], [0.35, 0.6], [0.05, 0.6]]),
    ],
  },
  {
    id: 'CAM-005', name: 'Perimeter North', location: 'Outdoor · North Fence Line',
    resolution: '1920x1080', fps: 15, orientation: 'fixed-bullet', modelTier: 'yolo26n-edge',
    edgeDevice: 'edge-npu-03', snapshot: '/snapshots/cam-005.png',
    zones: [
      z('general', 'Perimeter Grounds', 'public', [[0, 0], [1, 0], [1, 1], [0, 1]]),
      z('fence-line', 'Fence Line', 'restricted', [[0, 0.02], [1, 0.02], [1, 0.28], [0, 0.28]]),
    ],
  },
  {
    id: 'CAM-006', name: 'Loading Dock', location: 'Logistics Yard · Dock 1-3',
    resolution: '2560x1440', fps: 25, orientation: 'fixed-bullet', modelTier: 'yolo26s-server',
    edgeDevice: 'edge-gpu-01', snapshot: '/snapshots/cam-006.png',
    zones: [
      z('general', 'Dock Area', 'public', [[0, 0], [1, 0], [1, 1], [0, 1]]),
      z('cargo-cage', 'Cargo Cage', 'restricted', [[0.55, 0.45], [0.97, 0.45], [0.97, 0.92], [0.55, 0.92]]),
    ],
  },
  {
    id: 'CAM-007', name: 'Executive Floor', location: 'HQ · Floor 5 Executive Wing',
    resolution: '2560x1440', fps: 30, orientation: 'ptz', modelTier: 'yolo26l-central',
    edgeDevice: 'central-gpu-01', snapshot: '/snapshots/cam-001.png',
    zones: [
      z('general', 'Open Area', 'public', [[0, 0], [1, 0], [1, 1], [0, 1]]),
      z('exec-wing', 'Executive Wing', 'restricted', [[0.3, 0.05], [0.75, 0.05], [0.75, 0.5], [0.3, 0.5]]),
    ],
  },
  {
    id: 'CAM-008', name: 'Data Center Entry', location: 'Basement · Data Hall Vestibule',
    resolution: '2560x1440', fps: 30, orientation: 'fisheye', modelTier: 'yolo26l-central',
    edgeDevice: 'central-gpu-01', snapshot: '/snapshots/cam-004.png',
    zones: [
      z('general', 'Entry Vestibule', 'public', [[0, 0], [1, 0], [1, 1], [0, 1]]),
      z('data-hall', 'Data Hall', 'restricted', [[0.6, 0.15], [0.98, 0.15], [0.98, 0.85], [0.6, 0.85]]),
    ],
  },
]

const RULE_DEFS = [
  {
    name: 'weapon_in_restricted_zone',
    description:
      'Person detected, weapon detected, weapon associated with the person, detection persists > N frames, and the person enters a restricted zone → create CRITICAL security event.',
    conditions: JSON.stringify([
      { field: 'objectType', op: 'in', value: ['firearm', 'knife', 'other_weapon'] },
      { field: 'framesConfirmed', op: '>=', value: 4 },
      { field: 'associatedPerson', op: 'exists', value: true },
      { field: 'zoneType', op: '==', value: 'restricted' },
    ]),
    action: 'escalate_immediately',
    severity: 'critical',
    priority: 3,
  },
  {
    name: 'confidence_escalation',
    description:
      'Weapon confidence is high (> 0.85), the weapon remains visible for >= 8 confirmed frames and the person tracking confidence is high → escalate event.',
    conditions: JSON.stringify([
      { field: 'objectType', op: 'in', value: ['firearm', 'knife', 'other_weapon'] },
      { field: 'confidence', op: '>', value: 0.85 },
      { field: 'framesConfirmed', op: '>=', value: 8 },
      { field: 'associatedPerson', op: 'exists', value: true },
    ]),
    action: 'raise_alert',
    severity: 'high',
    priority: 2,
  },
  {
    name: 'person_restricted_zone',
    description: 'A tracked person enters a restricted zone polygon → raise HIGH alert for operator review.',
    conditions: JSON.stringify([
      { field: 'objectType', op: '==', value: 'person' },
      { field: 'zoneType', op: '==', value: 'restricted' },
      { field: 'framesConfirmed', op: '>=', value: 3 },
    ]),
    action: 'notify_security',
    severity: 'high',
    priority: 2,
  },
  {
    name: 'loitering_detection',
    description: 'A person remains within the same zone for an extended period (>= 90s, i.e. 30+ confirmed frames) → SUSPICIOUS event.',
    conditions: JSON.stringify([
      { field: 'objectType', op: '==', value: 'person' },
      { field: 'zoneDwellSeconds', op: '>', value: 90 },
    ]),
    action: 'raise_alert',
    severity: 'suspicious',
    priority: 1,
  },
  {
    name: 'perimeter_after_hours',
    description: 'Person detected inside the perimeter fence line zone outside business hours → SUSPICIOUS event.',
    conditions: JSON.stringify([
      { field: 'zoneName', op: '==', value: 'Fence Line' },
      { field: 'objectType', op: '==', value: 'person' },
      { field: 'framesConfirmed', op: '>=', value: 3 },
    ]),
    action: 'notify_security',
    severity: 'suspicious',
    priority: 1,
  },
  {
    name: 'weapon_seen_only',
    description:
      'Weapon-like object detected and temporally confirmed but not yet associated with a person → SUSPICIOUS event (observe).',
    conditions: JSON.stringify([
      { field: 'objectType', op: 'in', value: ['firearm', 'knife', 'other_weapon'] },
      { field: 'framesConfirmed', op: '>=', value: 4 },
      { field: 'associatedPerson', op: 'missing', value: true },
    ]),
    action: 'raise_alert',
    severity: 'suspicious',
    priority: 1,
  },
]

const MODEL_DEFS = [
  { v: 1, variant: 'yolo26n', tier: 'edge', mAP: 0.68, p: 0.64, r: 0.61, lat: 7.2, size: 1200, monthsAgo: 12, formats: ['pytorch'], notes: 'Initial baseline trained on public datasets only.' },
  { v: 2, variant: 'yolo26n', tier: 'edge', mAP: 0.71, p: 0.68, r: 0.64, lat: 7.1, size: 2100, monthsAgo: 11, formats: ['pytorch'], notes: 'First hard-example batch from parking garage footage.' },
  { v: 3, variant: 'yolo26n', tier: 'edge', mAP: 0.74, p: 0.7, r: 0.69, lat: 7.0, size: 3400, monthsAgo: 10, formats: ['pytorch'], notes: 'Added occluded backpack-as-weapon false positives.' },
  { v: 4, variant: 'yolo26s', tier: 'server', mAP: 0.75, p: 0.72, r: 0.71, lat: 12.4, size: 4800, monthsAgo: 9, formats: ['pytorch'], notes: 'Moved to YOLO26s for server-tier cameras.' },
  { v: 5, variant: 'yolo26s', tier: 'server', mAP: 0.78, p: 0.75, r: 0.74, lat: 12.1, size: 6100, monthsAgo: 8, formats: ['pytorch', 'onnx'], notes: 'Night footage batch; big recall gain at night.' },
  { v: 6, variant: 'yolo26s', tier: 'server', mAP: 0.8, p: 0.77, r: 0.77, lat: 11.8, size: 8400, monthsAgo: 7, formats: ['pytorch', 'onnx'], notes: 'Umbrella / tripod confusion resolved.' },
  { v: 7, variant: 'yolo26s', tier: 'server', mAP: 0.82, p: 0.8, r: 0.79, lat: 11.6, size: 10200, monthsAgo: 6, formats: ['pytorch', 'onnx'], notes: 'Fisheye distortion augmentation added.' },
  { v: 8, variant: 'yolo26s', tier: 'server', mAP: 0.84, p: 0.82, r: 0.81, lat: 11.4, size: 13100, monthsAgo: 5, formats: ['pytorch', 'onnx'], notes: 'Operator-reviewed false positives folded back in.' },
  { v: 9, variant: 'yolo26l', tier: 'central', mAP: 0.85, p: 0.84, r: 0.83, lat: 28.6, size: 15800, monthsAgo: 4, formats: ['pytorch', 'onnx'], notes: 'YOLO26l for high-risk zones (executive, data center).' },
  { v: 10, variant: 'yolo26n', tier: 'edge', mAP: 0.87, p: 0.85, r: 0.85, lat: 6.8, size: 18400, monthsAgo: 3, formats: ['pytorch', 'onnx', 'tensorrt'], notes: 'TensorRT export for edge NPU fleet.' },
  { v: 11, variant: 'yolo26s', tier: 'server', mAP: 0.89, p: 0.87, r: 0.88, lat: 11.2, size: 21300, monthsAgo: 2, formats: ['pytorch', 'onnx', 'tensorrt'], notes: 'Canary deployment on 25% of cameras.' },
  { v: 12, variant: 'yolo26s', tier: 'server', mAP: 0.91, p: 0.9, r: 0.9, lat: 11.0, size: 24800, monthsAgo: 1, formats: ['pytorch', 'onnx', 'tensorrt'], notes: 'Current production model. Best night recall to date.' },
]

let seeding: Promise<void> | null = null

export function ensureSeed(): Promise<void> {
  if (process.env.DEMO_MODE !== 'true' || process.env.NODE_ENV === 'production') return Promise.resolve()
  if (!seeding) seeding = doSeed().catch((e) => { seeding = null; throw e })
  return seeding
}

async function doSeed(): Promise<void> {
  const cameraCount = await db.camera.count()
  if (cameraCount > 0) return

  // ── Cameras ──
  const now = Date.now()
  await db.camera.createMany({
    data: CAMERA_DEFS.map((c, i) => ({
      id: c.id,
      name: c.name,
      location: c.location,
      streamUrl: `rtsp://vms.local:8554/${c.id.toLowerCase()}_main`,
      resolution: c.resolution,
      fps: c.fps,
      orientation: c.orientation,
      status: 'online',
      modelTier: c.modelTier,
      zones: JSON.stringify(c.zones),
      calibration: JSON.stringify({ homography: 'auto', distortion: 'fisheye-v2' }),
      edgeDevice: c.edgeDevice,
      snapshot: c.snapshot,
      lastHeartbeat: new Date(now - i * 900),
    })),
  })

  // ── Rules ──
  await db.rule.createMany({ data: RULE_DEFS })

  // ── Model registry ──
  await db.modelVersion.createMany({
    data: MODEL_DEFS.map((m) => {
      const trainedAt = new Date(now - m.monthsAgo * 30 * 24 * 3600 * 1000)
      return {
        id: `weapon-yolo26-v${m.v}`,
        variant: m.variant,
        tier: m.tier,
        formats: JSON.stringify(m.formats),
        status: m.v === 12 ? 'active' : m.v >= 10 ? 'shadow' : 'archived',
        metrics: JSON.stringify({
          mAP50: m.mAP,
          precision: m.p,
          recall: m.r,
          latencyMs: m.lat,
          fps: Math.round(1000 / m.lat),
          falsePositiveRate: Math.max(0.004, 0.06 - m.v * 0.004),
          falseNegativeRate: Math.max(0.02, 0.14 - m.v * 0.009),
        }),
        trainedAt,
        datasetSize: m.size,
        notes: m.notes,
      }
    }),
  })

  // ── Historical events (last 24h) ──
  const events: {
    id: string
    cameraId: string
    type: string
    severity: string
    object?: string
    personTrack?: number
    confidence: number
    zone?: string
    model: string
    timestamp: Date
    framesConfirmed: number
    summary: string
    evidence: string
    status: string
    ruleId?: string
    acknowledgedBy?: string
    acknowledgedAt?: Date
  }[] = []

  let evtCounter = 100000
  const mkId = () => `EVT-${String(++evtCounter).padStart(6, '0')}`

  const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]
  const rand = (a: number, b: number) => a + Math.random() * (b - a)

  const histTypes: { type: string; severity: string; object?: string; summary: (cam: string, zone: string) => string }[] = [
    { type: 'person_detection', severity: 'info', object: 'person', summary: (c) => `Person moving through general area on ${c}.` },
    { type: 'crowd_convergence', severity: 'info', object: 'person', summary: (c, z) => `Multiple people converging in zone "${z}" on ${c}.` },
    { type: 'loitering', severity: 'suspicious', object: 'person', summary: (c, z) => `Person loitering in zone "${z}" on ${c} for an extended period.` },
    { type: 'zone_intrusion', severity: 'suspicious', object: 'person', summary: (c, z) => `Tracked person entered zone "${z}" on ${c}.` },
    { type: 'perimeter_breach', severity: 'high', object: 'person', summary: (c, z) => `Person detected inside restricted "${z}" on ${c} after hours.` },
    { type: 'weapon_detection', severity: 'suspicious', object: 'knife', summary: (c, z) => `Knife-like object temporally confirmed (multi-frame) near "${z}" on ${c}; person association pending.` },
    { type: 'weapon_detection', severity: 'high', object: 'firearm', summary: (c, z) => `Firearm repeatedly confirmed across frames near "${z}" on ${c}; person association pending.` },
    { type: 'zone_intrusion', severity: 'high', object: 'person', summary: (c, z) => `Tracked person entered restricted zone "${z}" on ${c}.` },
    { type: 'weapon_person_association', severity: 'critical', object: 'firearm', summary: (c, z) => `Firearm detected and associated with tracked person in restricted zone "${z}" on ${c}.` },
  ]

  for (let i = 0; i < 64; i++) {
    const cam = pick(CAMERA_DEFS)
    const roll = Math.random()
    const tier = roll < 0.58 ? 0 : roll < 0.83 ? 1 : roll < 0.95 ? 2 : 3
    const candidates = histTypes.filter((h) =>
      tier === 0 ? h.severity === 'info' : tier === 1 ? h.severity === 'suspicious' : tier === 2 ? h.severity === 'high' : h.severity === 'critical',
    )
    const t = pick(candidates)
    const zone = pick(cam.zones.filter((zz) => zz.type !== 'public'))
    const ageMs = rand(0.2, 24) * 3600 * 1000
    const ts = new Date(now - ageMs)
    const conf = t.severity === 'critical' ? rand(0.88, 0.97) : t.severity === 'high' ? rand(0.78, 0.94) : rand(0.55, 0.85)
    const personTrack = t.type === 'weapon_person_association' ? Math.floor(rand(100, 900)) : undefined
    const statusRoll = Math.random()
    const status =
      ageMs > 4 * 3600 * 1000
        ? statusRoll < 0.72 ? 'resolved' : statusRoll < 0.88 ? 'acknowledged' : 'dismissed'
        : statusRoll < 0.3 ? 'open' : statusRoll < 0.6 ? 'acknowledged' : statusRoll < 0.92 ? 'resolved' : 'escalated'

    const detections = [
      { object: t.object ?? 'person', confidence: Number(conf.toFixed(2)), bbox: { x: rand(0.15, 0.6), y: rand(0.2, 0.5), w: rand(0.08, 0.16), h: rand(0.15, 0.3) } },
    ]
    if (t.type === 'weapon_person_association') {
      detections.push({ object: 'person', confidence: Number(rand(0.8, 0.95).toFixed(2)), bbox: { x: rand(0.1, 0.5), y: rand(0.2, 0.45), w: rand(0.1, 0.18), h: rand(0.25, 0.4) } })
    }

    events.push({
      id: mkId(),
      cameraId: cam.id,
      type: t.type,
      severity: t.severity,
      object: t.object,
      personTrack,
      confidence: Number(conf.toFixed(2)),
      zone: zone?.name,
      model: Math.random() < 0.5 ? 'weapon-yolo26-v12' : 'weapon-yolo26-v11',
      timestamp: ts,
      framesConfirmed: Math.floor(rand(5, 40)),
      summary: t.summary(cam.id, zone?.name ?? 'General Area'),
      evidence: JSON.stringify({
        snapshot: cam.snapshot,
        clip: `/events/${ts.getFullYear()}/${String(ts.getMonth() + 1).padStart(2, '0')}/${String(ts.getDate()).padStart(2, '0')}/${mkId()}/event.mp4`,
        artifacts: ['pre_event.mp4', 'event.mp4', 'post_event.mp4', 'detections.json', 'thumbnail.jpg'],
        detections,
        trail: [],
      }),
      status,
      acknowledgedBy: status === 'open' ? undefined : pick(['op.rivera', 'op.chen', 'op.okafor', 'op.novak']),
      acknowledgedAt: status === 'open' ? undefined : new Date(ts.getTime() + rand(20, 400) * 1000),
      ruleId: t.type === 'weapon_person_association' ? 'weapon_in_restricted_zone' : undefined,
    })
  }

  // one fresh open critical event for immediate operator context
  const c4 = CAMERA_DEFS[3]
  events.push({
    id: mkId(),
    cameraId: c4.id,
    type: 'weapon_person_association',
    severity: 'critical',
    object: 'firearm',
    personTrack: 182,
    confidence: 0.94,
    zone: 'Server Room',
    model: 'weapon-yolo26-v12',
    timestamp: new Date(now - 42 * 60 * 1000),
    framesConfirmed: 23,
    summary: 'Firearm detected and associated with tracked person #182 in restricted zone "Server Room" on CAM-004.',
    evidence: JSON.stringify({
      snapshot: c4.snapshot,
      clip: `/events/${new Date(now).getFullYear()}/09/14/EVT-000182/event.mp4`,
      artifacts: ['pre_event.mp4', 'event.mp4', 'post_event.mp4', 'detections.json', 'thumbnail.jpg'],
      detections: [
        { object: 'firearm', confidence: 0.94, bbox: { x: 0.52, y: 0.38, w: 0.09, h: 0.13 } },
        { object: 'person', confidence: 0.91, bbox: { x: 0.44, y: 0.22, w: 0.16, h: 0.44 } },
      ],
      trail: [{ x: 0.2, y: 0.7 }, { x: 0.3, y: 0.62 }, { x: 0.42, y: 0.5 }, { x: 0.52, y: 0.4 }],
    }),
    status: 'open',
    ruleId: 'weapon_in_restricted_zone',
  })

  for (const e of events) {
    await db.securityEvent.create({ data: e })
  }

  // ── System logs ──
  const logs = [
    { level: 'info', component: 'camera_layer', message: 'Normalized 8 camera sources into internal stream format (RTSP / ONVIF / NVR).' },
    { level: 'info', component: 'detection', message: 'Loaded weapon-yolo26-v12 (TensorRT, 11.0ms avg latency) on 4 edge devices.' },
    { level: 'info', component: 'tracking', message: 'Tracker pool initialized: botsort +bytetrack+norfair options available.' },
    { level: 'info', component: 'temporal_verification', message: 'Temporal verification pipeline armed between YOLO26 and alarm system.' },
    { level: 'info', component: 'event_engine', message: 'Loaded 6 active rules from rule registry.' },
    { level: 'info', component: 'storage', message: 'Event-centric evidence storage mounted at /events/{year}/{month}/{day}/{event_id}/.' },
    { level: 'warn', component: 'camera_layer', message: 'CAM-005 stream briefly degraded (IR reflection) — auto-recovered.' },
  ]
  for (let i = 0; i < logs.length; i++) {
    await db.systemLog.create({ data: { ...logs[i], ts: new Date(now - (logs.length - i) * 60000) } })
  }

  console.log('[seed] YOLO26 Security Platform data seeded:', {
    cameras: CAMERA_DEFS.length,
    rules: RULE_DEFS.length,
    models: MODEL_DEFS.length,
    events: events.length,
  })
}
