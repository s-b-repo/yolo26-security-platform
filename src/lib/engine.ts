import { db } from '@/lib/db'

export interface EngineBbox {
  x: number
  y: number
  w: number
  h: number
}

export interface EngineTrack {
  dbId: string
  cameraId: string
  trackNum: number
  objectType: string
  confidence: number
  framesConfirmed: number
  status: 'active' | 'ended' | 'escalated'
  currentZone: string | null
  zoneType: 'public' | 'restricted' | 'flow' | null
  zoneEnteredAt: number
  bbox: EngineBbox
  trail: { x: number; y: number }[]
  associatedPerson: number | null
  ageTicks: number
  firstSeen: Date
  lastSeen: Date
}

export interface ZonePolyLike {
  name: string
  type: string
  polygon: [number, number][]
}

export interface RuleRowLike {
  id: string
  name: string
  enabled: boolean
  conditions: string
  action: string
  severity: string
  priority: number
  hits: number
  lastTriggered: Date | null
}

export const WEAPON_CONFIRM_FRAMES = 4
export const PERSON_CONFIRM_FRAMES = 3
export const RULE_COOLDOWN_MS = 120_000

export function pointInPolygon(px: number, py: number, polygon: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export function evaluateZone(
  zones: ZonePolyLike[],
  cx: number,
  cy: number,
): { name: string | null; type: 'public' | 'restricted' | 'flow' | null } {
  let name: string | null = null
  let type: 'public' | 'restricted' | 'flow' | null = null
  for (const zone of zones) {
    if (!pointInPolygon(cx, cy, zone.polygon)) continue
    if (zone.type === 'restricted') {
      name = zone.name
      type = 'restricted'
      break
    }
    if (!type || type === 'public') {
      name = zone.name
      type = zone.type as 'flow' | 'public'
    }
  }
  return { name, type }
}

export function evalCondition(
  subject: {
    objectType: string
    confidence: number
    framesConfirmed: number
    associatedPerson: number | null
    zoneType: string | null
    zoneName: string | null
  },
  zoneDwellSeconds: number,
  afterHours: boolean,
  cond: { field: string; op: string; value: unknown },
): boolean {
  const fieldValue: unknown =
    cond.field === 'objectType' ? subject.objectType
    : cond.field === 'confidence' ? subject.confidence
    : cond.field === 'framesConfirmed' ? subject.framesConfirmed
    : cond.field === 'associatedPerson' ? subject.associatedPerson
    : cond.field === 'zoneType' ? subject.zoneType
    : cond.field === 'zoneName' ? subject.zoneName
    : cond.field === 'zoneDwellSeconds' ? zoneDwellSeconds
    : cond.field === 'afterHours' ? afterHours
    : undefined

  switch (cond.op) {
    case '==': return fieldValue === cond.value
    case '!=': return fieldValue !== cond.value
    case '>': return typeof fieldValue === 'number' && fieldValue > Number(cond.value)
    case '>=': return typeof fieldValue === 'number' && fieldValue >= Number(cond.value)
    case '<': return typeof fieldValue === 'number' && fieldValue < Number(cond.value)
    case 'in': return Array.isArray(cond.value) && (cond.value as unknown[]).includes(String(fieldValue))
    case 'exists': return fieldValue !== null && fieldValue !== undefined
    case 'missing': return fieldValue === null || fieldValue === undefined
    default: return false
  }
}

export function isAfterHours(date: Date, fromHour = 6, toHour = 22): boolean {
  const hour = date.getHours()
  return hour < fromHour || hour >= toHour
}
