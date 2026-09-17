import type { ZonePolygon } from '@/lib/seed'

export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function serializeCamera(cam: {
  id: string
  name: string
  location: string
  streamUrl: string
  resolution: string
  fps: number
  orientation: string
  status: string
  modelTier: string
  zones: string
  calibration: string
  edgeDevice: string | null
  snapshot: string | null
  lastHeartbeat: Date | null
  createdAt: Date
}) {
  return {
    ...cam,
    streamUrl: '',
    zones: parseJson<ZonePolygon[]>(cam.zones, []),
    calibration: parseJson<Record<string, unknown>>(cam.calibration, {}),
    lastHeartbeat: cam.lastHeartbeat?.toISOString() ?? null,
    createdAt: cam.createdAt.toISOString(),
  }
}

export function serializeEvent(e: {
  id: string
  cameraId: string
  type: string
  severity: string
  object: string | null
  personTrack: number | null
  confidence: number
  zone: string | null
  model: string
  timestamp: Date
  framesConfirmed: number
  summary: string
  evidence: string
  status: string
  acknowledgedBy: string | null
  acknowledgedAt: Date | null
  notes: string | null
  ruleId: string | null
}) {
  return {
    ...e,
    timestamp: e.timestamp.toISOString(),
    acknowledgedAt: e.acknowledgedAt?.toISOString() ?? null,
    evidence: parseJson<EvidenceShape>(e.evidence, { snapshot: null, clip: null, artifacts: [], detections: [], trail: [] }),
  }
}

export interface EvidenceShape {
  snapshot: string | null
  clip: string | null
  artifacts: string[]
  detections: { object: string; confidence: number; bbox: { x: number; y: number; w: number; h: number } }[]
  trail: { x: number; y: number }[]
}

export function serializeTrack(t: {
  id: string
  cameraId: string
  trackNum: number
  objectType: string
  confidence: number
  framesConfirmed: number
  status: string
  currentZone: string | null
  bbox: string
  trail: string
  firstSeen: Date
  lastSeen: Date
}) {
  return {
    ...t,
    bbox: parseJson<{ x: number; y: number; w: number; h: number }>(t.bbox, { x: 0, y: 0, w: 0, h: 0 }),
    trail: parseJson<{ x: number; y: number }[]>(t.trail, []),
    firstSeen: t.firstSeen.toISOString(),
    lastSeen: t.lastSeen.toISOString(),
  }
}

export function serializeModel(m: {
  id: string
  variant: string
  tier: string
  formats: string
  status: string
  metrics: string
  trainedAt: Date | null
  datasetSize: number | null
  notes: string | null
  createdAt: Date
}) {
  return {
    ...m,
    formats: parseJson<string[]>(m.formats, []),
    metrics: parseJson<Record<string, number>>(m.metrics, {}),
    trainedAt: m.trainedAt?.toISOString() ?? null,
    createdAt: m.createdAt.toISOString(),
  }
}
