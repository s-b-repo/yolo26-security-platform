import { db } from '@/lib/db'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import {
  PERSON_CONFIRM_FRAMES,
  RULE_COOLDOWN_MS,
  WEAPON_CONFIRM_FRAMES,
  evalCondition,
  evaluateZone,
  isAfterHours,
} from '@/lib/engine'
import type { ZonePolygon } from '@/lib/seed'
import type { EngineTrack } from '@/lib/engine'

export const observationSchema = z.strictObject({
  trackId: z.number().int().min(0).max(10_000_000),
  objectType: z.enum(['person', 'firearm', 'knife', 'backpack', 'vehicle', 'other']),
  confidence: z.number().min(0).max(1),
  bbox: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), w: z.number().min(0).max(1), h: z.number().min(0).max(1) }).strict(),
})

export const evidenceSchema = z.object({
  snapshot: z.string().max(512).nullable().optional(),
  clip: z.string().max(512).nullable().optional(),
  artifacts: z.array(z.string().max(256)).max(16).optional(),
  detections: z.array(z.object({
    object: z.string().max(40),
    confidence: z.number().min(0).max(1),
    bbox: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).strict(),
  }).strict()).max(32).optional(),
  trail: z.array(z.object({ x: z.number(), y: z.number() }).strict()).max(64).optional(),
})

const CLASS_MAP: Record<string, 'person' | 'firearm' | 'knife' | 'backpack' | 'vehicle' | 'other'> = {
  person: 'person',
  knife: 'knife',
  backpack: 'backpack',
  car: 'vehicle',
  truck: 'vehicle',
  bus: 'vehicle',
  motorcycle: 'vehicle',
  firearm: 'firearm',
  gun: 'firearm',
  handgun: 'firearm',
  pistol: 'firearm',
  rifle: 'firearm',
}

export function mapClassName(name: string): (typeof CLASS_MAP)[keyof typeof CLASS_MAP] | null {
  const key = name.toLowerCase()
  return CLASS_MAP[key] ?? null
}

export interface Observation {
  trackId: number
  objectType: 'person' | 'firearm' | 'knife' | 'backpack' | 'vehicle' | 'other'
  confidence: number
  bbox: { x: number; y: number; w: number; h: number }
}

interface InternalTrack extends EngineTrack {
  misses: number
}

export class ObservationAccumulator {
  private tracks = new Map<string, InternalTrack>()
  private trackCounters = new Map<string, number>()
  private dedupe = new Map<string, number>()
  private eventCounter: number | null = null
  private rulesCache: { at: number; rules: { id: string; name: string; enabled: boolean; conditions: string; severity: string; priority: number }[] } | null = null

  constructor(private cameraId: string, private model: string) {}

  async push(observations: Observation[]): Promise<{ activeTracks: number; eventsFired: string[] }> {
    const now = Date.now()
    const zones = await this.loadZones()
    const fired: string[] = []

    for (const obs of observations) {
      const key = String(obs.trackId)
      let track = this.tracks.get(key)
      if (!track) {
        track = await this.createTrack(obs, now)
        this.tracks.set(key, track)
      }
      track.misses = 0
      track.confidence = obs.confidence
      track.bbox = obs.bbox
      track.framesConfirmed = obs.confidence >= 0.4 && track.objectType === obs.objectType ? track.framesConfirmed + 1 : 0
      track.objectType = obs.objectType
      track.ageTicks += 1
      track.lastSeen = new Date(now)
      const cx = obs.bbox.x + obs.bbox.w / 2
      const cy = obs.bbox.y + obs.bbox.h / 2
      track.trail.push({ x: Number(cx.toFixed(3)), y: Number(cy.toFixed(3)) })
      if (track.trail.length > 24) track.trail.shift()
      const zone = evaluateZone(this.zones, cx, cy)
      if (zone.name !== track.currentZone) {
        track.currentZone = zone.name
        track.zoneType = zone.type
        track.zoneEnteredAt = now
      }
    }

    for (const [key, track] of this.tracks) {
      if (observations.some((o) => String(o.trackId) === key)) continue
      track.misses += 1
      track.framesConfirmed = 0
      track.associatedPerson = null
      if (track.misses > 8 || now - track.lastSeen.getTime() > 5000) {
        await this.endTrack(track)
        this.tracks.delete(key)
      }
    }

    await this.associate()
    await this.evaluateRules(now, fired)
    await this.persist()
    return { activeTracks: this.tracks.size, eventsFired: fired }
  }

  private zones: ZonePolygon[] = []

  private async loadZones(): Promise<ZonePolygon[]> {
    const cam = await db.camera.findUnique({ where: { id: this.cameraId }, select: { zones: true } })
    this.zones = cam ? (JSON.parse(cam.zones) as ZonePolygon[]) : []
    return this.zones
  }

  private async nextEventId(): Promise<string> {
    return `EVT-${randomUUID().toUpperCase()}`
  }

  private async loadRules() {
    if (this.rulesCache && Date.now() - this.rulesCache.at < 15_000) return this.rulesCache.rules
    const rules = await db.rule.findMany({ where: { enabled: true }, orderBy: { priority: 'desc' } })
    this.rulesCache = { at: Date.now(), rules }
    return rules
  }

  private async createTrack(obs: Observation, now: number): Promise<InternalTrack> {
    const counter = (this.trackCounters.get('main') ?? Math.floor(100 + Math.random() * 300)) + 1
    this.trackCounters.set('main', counter)
    const row = await db.track.create({
      data: {
        cameraId: this.cameraId,
        trackNum: counter,
        objectType: obs.objectType,
        confidence: obs.confidence,
        framesConfirmed: 1,
        status: 'active',
        bbox: JSON.stringify(obs.bbox),
        trail: JSON.stringify([{ x: obs.bbox.x + obs.bbox.w / 2, y: obs.bbox.y + obs.bbox.h / 2 }]),
      },
    })
    return {
      dbId: row.id,
      cameraId: this.cameraId,
      trackNum: counter,
      objectType: obs.objectType,
      confidence: obs.confidence,
      framesConfirmed: 0,
      status: 'active',
      currentZone: null,
      zoneType: null,
      zoneEnteredAt: now,
      bbox: obs.bbox,
      trail: [],
      associatedPerson: null,
      ageTicks: 0,
      firstSeen: new Date(now),
      lastSeen: new Date(now),
      misses: 0,
    }
  }

  private async endTrack(track: InternalTrack) {
    await db.track.update({
      where: { id: track.dbId },
      data: { status: 'ended', confidence: track.confidence, framesConfirmed: track.framesConfirmed, lastSeen: track.lastSeen },
    }).catch(() => {})
  }

  private async associate() {
    const weapons = [...this.tracks.values()].filter((t) => t.objectType === 'firearm' || t.objectType === 'knife')
    const persons = [...this.tracks.values()].filter((t) => t.objectType === 'person' && t.misses === 0)
    for (const w of weapons) {
      const wc = { x: w.bbox.x + w.bbox.w / 2, y: w.bbox.y + w.bbox.h / 2 }
      let best: InternalTrack | null = null
      let bestDist = Infinity
      for (const p of persons) {
        const pc = { x: p.bbox.x + p.bbox.w / 2, y: p.bbox.y + p.bbox.h / 2 }
        const dist = Math.hypot(wc.x - pc.x, wc.y - pc.y)
        if (dist < bestDist) { bestDist = dist; best = p }
      }
      if (w.associatedPerson !== null) {
        const cur = persons.find((p) => p.trackNum === w.associatedPerson)
        const curDist = cur ? Math.hypot(wc.x - (cur.bbox.x + cur.bbox.w / 2), wc.y - (cur.bbox.y + cur.bbox.h / 2)) : Infinity
        if (curDist > 0.3 || !cur) w.associatedPerson = null
      } else if (best && bestDist < 0.18 && best.framesConfirmed >= PERSON_CONFIRM_FRAMES) {
        w.associatedPerson = best.trackNum
      }
    }
  }

  private async evaluateRules(now: number, fired: string[]) {
    const rules = await this.loadRules()
    const afterHours = isAfterHours(new Date())
    const tracks = [...this.tracks.values()].filter((track) => track.misses === 0)
    const weapons = tracks.filter((t) => t.objectType === 'firearm' || t.objectType === 'knife')
    const persons = tracks.filter((t) => t.objectType === 'person')

    for (const track of weapons) {
      if (track.framesConfirmed < WEAPON_CONFIRM_FRAMES || track.confidence < 0.4) continue
      for (const rule of rules) {
        if (rule.name === 'weapon_in_restricted_zone' || rule.name === 'confidence_escalation' || rule.name === 'weapon_seen_only') {
          const conds = JSON.parse(rule.conditions) as { field: string; op: string; value: unknown }[]
          const person = track.associatedPerson !== null ? persons.find((p) => p.trackNum === track.associatedPerson) ?? null : null
          const ok = conds.every((c) => {
            const zoneTypeForRule = track.zoneType ?? 'public'
            const t = c.field === 'zoneType' && zoneTypeForRule === 'public' && track.associatedPerson !== null
              ? person?.zoneType ?? 'public'
              : zoneTypeForRule
            return evalCondition({ ...track, zoneType: t, zoneName: track.currentZone }, this.dwell(track, now), afterHours, c)
          })
          if (ok && this.cooled(rule.id, track, now)) {
            const eventId = await this.fire(rule, track, person)
            if (eventId) fired.push(eventId)
            break
          }
        }
      }
    }

    for (const track of persons) {
      if (track.framesConfirmed < PERSON_CONFIRM_FRAMES) continue
      for (const rule of rules) {
        if (rule.name === 'weapon_in_restricted_zone' || rule.name === 'confidence_escalation' || rule.name === 'weapon_seen_only') continue
        const conds = JSON.parse(rule.conditions) as { field: string; op: string; value: unknown }[]
        if (conds.every((c) => evalCondition({ ...track, zoneName: track.currentZone }, this.dwell(track, now), afterHours, c)) && this.cooled(rule.id, track, now)) {
          const eventId = await this.fire(rule, null, track)
          if (eventId) fired.push(eventId)
          break
        }
      }
    }
  }

  private dwell(track: EngineTrack, now: number): number {
    return Math.round((now - track.zoneEnteredAt) / 1000)
  }

  private cooled(ruleId: string, track: EngineTrack, now: number): boolean {
    const key = `${ruleId}:${track.trackNum}`
    const last = this.dedupe.get(key)
    if (last && now - last < RULE_COOLDOWN_MS) return false
    return true
  }

  private async fire(rule: { id: string; name: string; severity: string }, weapon: InternalTrack | null, person: InternalTrack | null): Promise<string | null> {
    const primary = weapon ?? person
    if (!primary) return null
    const key = `${rule.id}:${primary.trackNum}`
    const now = Date.now()
    const id = await this.nextEventId()
    const model = this.model
    const zone = primary.currentZone ?? 'General Area'
    const confidence = weapon && person ? Math.min(weapon.confidence, person.confidence) + 0.02 : primary.confidence

    let type = weapon ? 'weapon_detection' : 'person_detection'
    let summary = ''
    if (rule.name === 'weapon_in_restricted_zone') {
      type = 'weapon_person_association'
      summary = `Possible ${weapon?.objectType ?? 'weapon'} detected and associated with tracked person #${person?.trackNum} in restricted zone "${zone}" on ${this.cameraId} (${primary.framesConfirmed} frames confirmed).`
    } else if (rule.name === 'confidence_escalation') {
      type = 'weapon_detection'
      summary = `High-confidence ${weapon?.objectType ?? 'weapon'} detection (${primary.framesConfirmed} frames) associated with ${person ? `person #${person.trackNum}` : 'unidentified track'} on ${this.cameraId}.`
    } else if (rule.name === 'person_restricted_zone') {
      type = 'zone_intrusion'
      summary = `Tracked person #${primary.trackNum} entered restricted zone "${zone}" on ${this.cameraId}.`
    } else if (rule.name === 'loitering_detection') {
      type = 'loitering'
      summary = `Person #${primary.trackNum} loitering in zone "${zone}" on ${this.cameraId} for ${this.dwell(primary, now)}s.`
    } else if (rule.name === 'perimeter_after_hours') {
      type = 'perimeter_breach'
      summary = `Person #${primary.trackNum} detected inside "${zone}" on ${this.cameraId} outside business hours.`
    } else if (rule.name === 'weapon_seen_only') {
      type = 'weapon_detection'
      summary = `Weapon-like object temporally confirmed but not yet associated with a person near "${zone}" on ${this.cameraId}.`
    } else {
      summary = `${weapon ? weapon.objectType : 'person'} detection in zone "${zone}" on ${this.cameraId}.`
    }

    await db.securityEvent.create({
      data: {
        id,
        cameraId: this.cameraId,
        type,
        severity: rule.severity,
        object: weapon ? weapon.objectType : 'person',
        personTrack: person?.trackNum ?? null,
        confidence: Number(Math.min(0.98, confidence).toFixed(2)),
        zone,
        model,
        framesConfirmed: primary.framesConfirmed,
        summary,
        evidence: JSON.stringify({
          snapshot: null,
          clip: null,
          artifacts: [],
          detections: [{ object: primary.objectType, confidence: Number(primary.confidence.toFixed(2)), bbox: primary.bbox }],
          trail: primary.trail.slice(-12),
        }),
        status: 'open',
        ruleId: rule.id,
      },
    })

    this.dedupe.set(key, now)
    await db.rule.update({ where: { id: rule.id }, data: { hits: { increment: 1 }, lastTriggered: new Date() } })
    return id
  }

  private async persist() {
    for (const track of this.tracks.values()) {
      await db.track.update({
        where: { id: track.dbId },
        data: {
          confidence: track.confidence,
          framesConfirmed: track.framesConfirmed,
          bbox: JSON.stringify(track.bbox),
          trail: JSON.stringify(track.trail.slice(-24)),
          currentZone: track.currentZone,
          status: track.status === 'escalated' ? 'escalated' : 'active',
          lastSeen: track.lastSeen,
        },
      }).catch(() => {})
    }
  }
}
