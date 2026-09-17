import { db } from '@/lib/db'
import { ensureSeed } from '@/lib/seed'

/**
 * YOLO26 Security Platform — pipeline simulator.
 *
 * Implements the layered architecture from the spec:
 *   perception (YOLO26 detection) -> tracking (multi-frame confirmation)
 *   -> temporal verification -> person/weapon association + zone evaluation
 *   -> rule-driven event engine -> alerts + event-centric evidence.
 */

export interface SimBbox { x: number; y: number; w: number; h: number }

export interface SimTrack {
  dbId: string
  cameraId: string
  trackNum: number
  objectType: 'person' | 'firearm' | 'knife' | 'other_weapon' | 'backpack' | 'vehicle'
  confidence: number
  framesConfirmed: number
  status: 'active' | 'ended' | 'escalated'
  currentZone: string | null
  zoneType: 'public' | 'restricted' | 'flow' | null
  zoneEnteredAt: number
  bbox: SimBbox
  vx: number
  vy: number
  trail: { x: number; y: number }[]
  associatedPerson: number | null
  lifetimeTicks: number
  ageTicks: number
  firstSeen: Date
  lastSeen: Date
}

interface SimState {
  running: boolean
  timer: ReturnType<typeof setInterval> | null
  tickCount: number
  startedAt: number
  lastTickAt: number
  ticking: boolean
  tracks: Map<string, SimTrack[]> // cameraId -> active tracks
  trackCounters: Map<string, number>
  dedupe: Map<string, number> // ruleKey -> last fired ts
  injectionQueue: { cameraId: string; objectType: string; action: string; atBbox?: SimBbox }[]
  rulesCache: { loadedAt: number; rules: RuleRow[] } | null
  activeModel: string
  eventCounter: number
  cameraGlitchUntil: Map<string, string> // cameraId -> status until tick
}

type RuleRow = {
  id: string
  name: string
  enabled: boolean
  conditions: string
  action: string
  severity: string
  priority: number
}

const TICK_MS = 3000
const RULE_COOLDOWN_MS = 120_000
const ASSOC_DIST = 0.18
const DISASSOC_DIST = 0.3
const WEAPON_CONFIRM_FRAMES = 4
const PERSON_CONFIRM_FRAMES = 3

const g = globalThis as unknown as { __yolo26sim?: SimState }

function state(): SimState {
  if (!g.__yolo26sim) {
    g.__yolo26sim = {
      running: false,
      timer: null,
      tickCount: 0,
      startedAt: 0,
      lastTickAt: 0,
      ticking: false,
      tracks: new Map(),
      trackCounters: new Map(),
      dedupe: new Map(),
      injectionQueue: [],
      rulesCache: null,
      activeModel: 'weapon-yolo26-v12',
      eventCounter: 0,
      cameraGlitchUntil: new Map(),
    }
  }
  return g.__yolo26sim
}

// ── geometry helpers ─────────────────────────────────────────────
function pointInPolygon(px: number, py: number, polygon: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function clamp01(v: number): number {
  return Math.max(0.02, Math.min(0.98, v))
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]

async function log(level: string, component: string, message: string) {
  try {
    await db.systemLog.create({ data: { level, component, message } })
    // keep log table bounded
    const count = await db.systemLog.count()
    if (count > 400) {
      const oldest = await db.systemLog.findMany({ orderBy: { ts: 'asc' }, take: count - 350, select: { id: true } })
      if (oldest.length) await db.systemLog.deleteMany({ where: { id: { in: oldest.map((o) => o.id) } } })
    }
  } catch { /* non-fatal */ }
}

// ── rule condition evaluation (real rule-engine semantics) ───────
function evalCondition(track: SimTrack, zoneDwellSeconds: number, afterHours: boolean, cond: { field: string; op: string; value: unknown }): boolean {
  const fieldValue: unknown =
    cond.field === 'objectType' ? track.objectType
    : cond.field === 'confidence' ? track.confidence
    : cond.field === 'framesConfirmed' ? track.framesConfirmed
    : cond.field === 'associatedPerson' ? track.associatedPerson
    : cond.field === 'zoneType' ? track.zoneType
    : cond.field === 'zoneName' ? track.currentZone
    : cond.field === 'zoneDwellSeconds' ? zoneDwellSeconds
    : cond.field === 'afterHours' ? afterHours
    : undefined

  switch (cond.op) {
    case '==': return fieldValue === cond.value
    case '!=': return fieldValue !== cond.value
    case '>': return typeof fieldValue === 'number' && fieldValue > Number(cond.value)
    case '>=': return typeof fieldValue === 'number' && fieldValue >= Number(cond.value)
    case '<': return typeof fieldValue === 'number' && fieldValue < Number(cond.value)
    case 'in': return Array.isArray(cond.value) && (cond.value as string[]).includes(String(fieldValue))
    case 'exists': return fieldValue !== null && fieldValue !== undefined
    case 'missing': return fieldValue === null || fieldValue === undefined
    default: return false
  }
}

async function loadRules(s: SimState): Promise<RuleRow[]> {
  if (s.rulesCache && Date.now() - s.rulesCache.loadedAt < 15_000) return s.rulesCache.rules
  const rules = await db.rule.findMany()
  s.rulesCache = { loadedAt: Date.now(), rules }
  return rules
}

async function loadActiveModel(s: SimState) {
  const active = await db.modelVersion.findFirst({ where: { status: 'active' } })
  if (active) s.activeModel = active.id
}

function makeEvidence(cam: { snapshot: string | null }, tracks: SimTrack[], weapon: SimTrack | null, person: SimTrack | null) {
  const detections: { object: string; confidence: number; bbox: SimBbox }[] = []
  if (weapon) detections.push({ object: weapon.objectType, confidence: Number(weapon.confidence.toFixed(2)), bbox: weapon.bbox })
  if (person) detections.push({ object: 'person', confidence: Number(person.confidence.toFixed(2)), bbox: person.bbox })
  if (!weapon && !person) detections.push({ object: 'person', confidence: 0.7, bbox: { x: 0.4, y: 0.3, w: 0.12, h: 0.3 } })

  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return {
    snapshot: cam.snapshot ?? '/snapshots/cam-001.png',
    clip: `/events/${y}/${m}/${d}/{event_id}/event.mp4`,
    artifacts: ['pre_event.mp4', 'event.mp4', 'post_event.mp4', 'detections.json', 'thumbnail.jpg'],
    detections,
    trail: (weapon ?? person)?.trail.slice(-12) ?? [],
  }
}

interface FireContext {
  rule: RuleRow
  cam: { id: string; name: string; location: string; snapshot: string | null }
  weapon: SimTrack | null
  person: SimTrack | null
  zone: string
  zoneType: string | null
  zoneDwellSeconds: number
}

async function fireRule(s: SimState, ctx: FireContext) {
  const { rule, cam, weapon, person, zone, zoneDwellSeconds } = ctx
  const key = `${rule.id}:${cam.id}:${weapon?.trackNum ?? person?.trackNum ?? 0}`
  const last = s.dedupe.get(key)
  if (last && Date.now() - last < RULE_COOLDOWN_MS) return false

  const primary = weapon ?? person
  if (!primary) return false

  const evtNum = ++s.eventCounter
  const id = `EVT-${String(evtNum).padStart(6, '0')}`
  const model = s.activeModel
  const frames = Math.max(primary.framesConfirmed, weapon?.framesConfirmed ?? 0, person?.framesConfirmed ?? 0)
  const confidence = weapon && person ? Math.min(weapon.confidence, person.confidence) + 0.02 : primary.confidence

  const trackLabel = person ? `person #${person.trackNum}` : weapon ? `track #${weapon.trackNum}` : 'unknown track'
  const objLabel = weapon ? weapon.objectType.replace('_', ' ') : 'person'
  let type: string
  let summary: string
  switch (rule.name) {
    case 'weapon_in_restricted_zone':
      type = 'weapon_person_association'
      summary = `${weapon?.objectType.replace('_', ' ') ?? 'Weapon'} detected and associated with tracked ${trackLabel} in restricted zone "${zone}" on ${cam.id} (${frames} frames confirmed, dwell ${zoneDwellSeconds}s).`
      break
    case 'confidence_escalation':
      type = 'weapon_detection'
      summary = `High-confidence ${objLabel} detection (repeatedly confirmed, ${frames} frames) associated with ${trackLabel} on ${cam.id}.`
      break
    case 'person_restricted_zone':
      type = 'zone_intrusion'
      summary = `Tracked person #${person?.trackNum} entered restricted zone "${zone}" on ${cam.id}.`
      break
    case 'loitering_detection':
      type = 'loitering'
      summary = `Person #${person?.trackNum} loitering in zone "${zone}" on ${cam.id} for ${zoneDwellSeconds}s.`
      break
    case 'perimeter_after_hours':
      type = 'perimeter_breach'
      summary = `Person #${person?.trackNum} detected inside "${zone}" on ${cam.id} outside business hours.`
      break
    default:
      type = weapon ? 'weapon_detection' : 'person_detection'
      summary = weapon
        ? `${objLabel} temporally confirmed (multi-frame) near "${zone}" on ${cam.id}; person association pending.`
        : `Person moving through "${zone}" on ${cam.id}.`
  }

  const evidence = makeEvidence(cam, [], weapon, person)

  await db.securityEvent.create({
    data: {
      id,
      cameraId: cam.id,
      type,
      severity: rule.severity,
      object: weapon ? weapon.objectType : 'person',
      personTrack: person?.trackNum ?? null,
      confidence: Number(Math.min(0.98, confidence).toFixed(2)),
      zone,
      model,
      framesConfirmed: frames,
      summary,
      evidence: JSON.stringify(evidence),
      status: 'open',
      ruleId: rule.id,
    },
  })

  s.dedupe.set(key, Date.now())
  await db.rule.update({ where: { id: rule.id }, data: { hits: { increment: 1 }, lastTriggered: new Date() } })
  await log(rule.severity === 'critical' || rule.severity === 'high' ? 'warn' : 'info', 'event_engine',
    `[${rule.name}] ${rule.severity.toUpperCase()} event ${id} fired on ${cam.id} (${model})`)
  return true
}

async function spawnTrack(s: SimState, cam: { id: string }, objectType: SimTrack['objectType'], atBbox?: SimBbox): Promise<SimTrack> {
  const counter = (s.trackCounters.get(cam.id) ?? Math.floor(rand(100, 400))) + 1
  s.trackCounters.set(cam.id, counter)

  const bbox: SimBbox = atBbox ?? {
    x: rand(0.08, 0.78),
    y: objectType === 'person' ? rand(0.3, 0.55) : rand(0.25, 0.5),
    w: objectType === 'person' ? rand(0.08, 0.14) : rand(0.05, 0.1),
    h: objectType === 'person' ? rand(0.2, 0.34) : rand(0.08, 0.14),
  }

  const row = await db.track.create({
    data: {
      cameraId: cam.id,
      trackNum: counter,
      objectType,
      confidence: objectType === 'person' ? rand(0.42, 0.58) : rand(0.55, 0.72),
      framesConfirmed: 1,
      status: 'active',
      bbox: JSON.stringify(bbox),
      trail: JSON.stringify([{ x: bbox.x + bbox.w / 2, y: bbox.y + bbox.h / 2 }]),
    },
  })

  const track: SimTrack = {
    dbId: row.id,
    cameraId: cam.id,
    trackNum: counter,
    objectType,
    confidence: row.confidence,
    framesConfirmed: 1,
    status: 'active',
    currentZone: null,
    zoneType: null,
    zoneEnteredAt: Date.now(),
    bbox,
    vx: rand(-0.02, 0.02),
    vy: rand(-0.012, 0.012),
    trail: [{ x: bbox.x + bbox.w / 2, y: bbox.y + bbox.h / 2 }],
    associatedPerson: null,
    lifetimeTicks: objectType === 'person' ? Math.floor(rand(22, 60)) : Math.floor(rand(10, 26)),
    ageTicks: 0,
    firstSeen: new Date(),
    lastSeen: new Date(),
  }
  const list = s.tracks.get(cam.id) ?? []
  list.push(track)
  s.tracks.set(cam.id, list)
  return track
}

async function endTrack(s: SimState, track: SimTrack) {
  track.status = 'ended'
  await db.track.update({
    where: { id: track.dbId },
    data: { status: 'ended', confidence: track.confidence, framesConfirmed: track.framesConfirmed, lastSeen: new Date() },
  }).catch(() => {})
}

// ── one pipeline tick ────────────────────────────────────────────
async function tick(): Promise<void> {
  const s = state()
  s.ticking = true
  try {
    const cameras = await db.camera.findMany()
    if (cameras.length === 0) return
    await loadActiveModel(s)
    const rules = (await loadRules(s)).filter((r) => r.enabled).sort((a, b) => b.priority - a.priority)

    const hour = new Date().getHours()
    const afterHours = hour < 6 || hour >= 22

    // process queued injections (operator scenario triggers)
    while (s.injectionQueue.length > 0) {
      const inj = s.injectionQueue.shift()!
      const cam = cameras.find((c) => c.id === inj.cameraId && c.status === 'online')
      if (cam) {
        await spawnTrack(s, { id: cam.id }, inj.objectType as SimTrack['objectType'], inj.atBbox)
        await log('info', 'simulator', `Scenario injected: ${inj.action} (${inj.objectType}) on ${cam.id}`)
      }
    }

    for (const cam of cameras) {
      // camera health glitches
      const glitch = s.cameraGlitchUntil.get(cam.id)
      if (glitch && s.tickCount >= Number(glitch)) {
        s.cameraGlitchUntil.delete(cam.id)
        await db.camera.update({ where: { id: cam.id }, data: { status: 'online', lastHeartbeat: new Date() } })
        await log('info', 'camera_layer', `${cam.id} stream recovered (${cam.name}).`)
      } else if (!glitch && cam.status === 'online' && Math.random() < 0.004) {
        const untilTick = s.tickCount + Math.floor(rand(2, 5))
        const status = Math.random() < 0.75 ? 'degraded' : 'offline'
        s.cameraGlitchUntil.set(cam.id, String(untilTick))
        await db.camera.update({ where: { id: cam.id }, data: { status, lastHeartbeat: new Date() } })
        await log(status === 'offline' ? 'error' : 'warn', 'camera_layer', `${cam.id} (${cam.name}) stream ${status}.`)
        continue
      } else if (!glitch) {
        await db.camera.update({ where: { id: cam.id }, data: { lastHeartbeat: new Date() } }).catch(() => {})
      }

      if (cam.status !== 'online' && !glitch) continue

      const camZones: ZonePoly[] = JSON.parse(cam.zones)
      let tracks = s.tracks.get(cam.id) ?? []

      // 1) PERCEPTION: spawn new detections
      const activity = cam.modelTier === 'yolo26n-edge' ? 0.3 : 0.22
      if (tracks.filter((t) => t.objectType === 'person').length < 5 && Math.random() < activity) {
        await spawnTrack(s, { id: cam.id }, 'person')
      }
      const baseWeaponRate = 0.006
      if (Math.random() < baseWeaponRate && !tracks.some((t) => t.objectType !== 'person')) {
        await spawnTrack(s, { id: cam.id }, pick(['firearm', 'knife'] as const))
      }
      tracks = s.tracks.get(cam.id) ?? []

      // 2) TRACKING: move, confirm, age
      for (const t of tracks) {
        // random-walk drift with momentum
        t.vx = Math.max(-0.05, Math.min(0.05, t.vx + rand(-0.008, 0.008)))
        t.vy = Math.max(-0.03, Math.min(0.03, t.vy + rand(-0.005, 0.005)))
        t.bbox.x = clamp01(t.bbox.x + t.vx)
        t.bbox.y = clamp01(t.bbox.y + t.vy)
        t.framesConfirmed += 1
        t.ageTicks += 1
        t.confidence = Math.min(0.97, Math.max(0.35, t.confidence + (t.ageTicks < 6 ? rand(0.015, 0.045) : rand(-0.015, 0.02))))
        const cx = t.bbox.x + t.bbox.w / 2
        const cy = t.bbox.y + t.bbox.h / 2
        t.trail.push({ x: Number(cx.toFixed(3)), y: Number(cy.toFixed(3)) })
        if (t.trail.length > 24) t.trail.shift()
        t.lastSeen = new Date()

        // zone evaluation
        let newZone: string | null = null
        let newZoneType: 'public' | 'restricted' | 'flow' | null = null
        for (const zone of camZones) {
          if (pointInPolygon(cx, cy, zone.polygon)) {
            if (zone.type === 'restricted') { newZone = zone.name; newZoneType = 'restricted'; break }
            if (!newZone || zone.type === 'flow') { if (!newZoneType || newZoneType === 'public') { newZone = zone.name; newZoneType = zone.type as 'flow' | 'public' } }
          }
        }
        if (newZone !== t.currentZone) {
          t.currentZone = newZone
          t.zoneType = newZoneType ?? 'public'
          t.zoneEnteredAt = Date.now()
        }
      }

      // 3) ASSOCIATION: weapon <-> person proximity
      const weapons = tracks.filter((t) => t.objectType !== 'person')
      const persons = tracks.filter((t) => t.objectType === 'person')
      for (const w of weapons) {
        const wc = { x: w.bbox.x + w.bbox.w / 2, y: w.bbox.y + w.bbox.h / 2 }
        let best: SimTrack | null = null
        let bestDist = Infinity
        for (const p of persons) {
          const pc = { x: p.bbox.x + p.bbox.w / 2, y: p.bbox.y + p.bbox.h / 2 }
          const dist = Math.hypot(wc.x - pc.x, wc.y - pc.y)
          if (dist < bestDist) { bestDist = dist; best = p }
        }
        if (w.associatedPerson !== null) {
          const cur = persons.find((p) => p.trackNum === w.associatedPerson)
          const curDist = cur ? Math.hypot(wc.x - (cur.bbox.x + cur.bbox.w / 2), wc.y - (cur.bbox.y + cur.bbox.h / 2)) : Infinity
          if (curDist > DISASSOC_DIST || !cur) w.associatedPerson = null
        } else if (best && bestDist < ASSOC_DIST && best.framesConfirmed >= PERSON_CONFIRM_FRAMES) {
          w.associatedPerson = best.trackNum
          await log('info', 'tracking', `Weapon track #${w.trackNum} associated with person #${best.trackNum} on ${cam.id}.`)
        }
      }

      // 4) TEMPORAL VERIFICATION + 5) EVENT ENGINE: rules on confirmed tracks
      for (const weapon of weapons) {
        if (weapon.framesConfirmed < WEAPON_CONFIRM_FRAMES || weapon.confidence < 0.4) continue
        const person = weapon.associatedPerson !== null ? persons.find((p) => p.trackNum === weapon.associatedPerson) ?? null : null
        const zone = weapon.currentZone ?? 'General Area'
        const dwell = Math.round((Date.now() - weapon.zoneEnteredAt) / 1000)
        for (const rule of rules) {
          const conds = JSON.parse(rule.conditions) as { field: string; op: string; value: unknown }[]
          const zoneTypeForRule = weapon.zoneType ?? 'public'
          const ok = conds.every((c) => {
            // rule conditions evaluate against weapon, with person context injected via associatedPerson
            const t = c.field === 'zoneType' && zoneTypeForRule === 'public' && weapon.associatedPerson !== null
              ? person?.zoneType ?? 'public'
              : zoneTypeForRule
            return evalCondition({ ...weapon, zoneType: t as SimTrack['zoneType'] }, dwell, afterHours, c)
          })
          if (ok) {
            const fired = await fireRule(s, { rule, cam, weapon, person, zone, zoneType: weapon.zoneType, zoneDwellSeconds: dwell })
            if (fired && rule.priority >= 3) {
              weapon.status = 'escalated'
              await db.track.update({ where: { id: weapon.dbId }, data: { status: 'escalated' } }).catch(() => {})
            }
            if (fired) break // highest-priority matching rule wins
          }
        }
      }

      for (const person of persons) {
        if (person.framesConfirmed < PERSON_CONFIRM_FRAMES) continue
        const zone = person.currentZone ?? 'General Area'
        const dwell = Math.round((Date.now() - person.zoneEnteredAt) / 1000)
        for (const rule of rules) {
          if (rule.name === 'weapon_in_restricted_zone' || rule.name === 'confidence_escalation' || rule.name === 'weapon_seen_only') continue
          const conds = JSON.parse(rule.conditions) as { field: string; op: string; value: unknown }[]
          if (conds.every((c) => evalCondition(person, dwell, afterHours, c))) {
            const fired = await fireRule(s, { rule, cam, weapon: null, person, zone, zoneType: person.zoneType, zoneDwellSeconds: dwell })
            if (fired) break
          }
        }
      }

      // 6) persist track updates + retire old tracks
      const remaining: SimTrack[] = []
      for (const t of tracks) {
        if (t.ageTicks >= t.lifetimeTicks || (t.status as string) === 'escalated' && t.ageTicks > t.lifetimeTicks) {
          await endTrack(s, t)
          continue
        }
        remaining.push(t)
        await db.track.update({
          where: { id: t.dbId },
          data: {
            confidence: t.confidence,
            framesConfirmed: t.framesConfirmed,
            bbox: JSON.stringify(t.bbox),
            trail: JSON.stringify(t.trail.slice(-24)),
            currentZone: t.currentZone,
            status: 'active',
            lastSeen: new Date(),
          },
        }).catch(() => {})
      }
      s.tracks.set(cam.id, remaining)
    }
  } catch (err) {
    console.error('[simulator] tick error:', err)
  } finally {
    s.tickCount += 1
    s.lastTickAt = Date.now()
    s.ticking = false
  }
}

interface ZonePoly { id: string; name: string; type: string; color: string; polygon: [number, number][] }

// ── lifecycle ────────────────────────────────────────────────────
export function startSimulator(): void {
  if (!demoEnabled()) return
  const s = state()
  if (s.running) return
  s.running = true
  s.startedAt = Date.now()
  s.timer = setInterval(() => { if (!s.ticking) void tick() }, TICK_MS)
  // fire an immediate first tick
  if (!s.ticking) void tick()
  console.log('[simulator] started (tick %dms)', TICK_MS)
}

export function stopSimulator(): void {
  const s = state()
  if (s.timer) clearInterval(s.timer)
  s.timer = null
  s.running = false
  // retire in-memory tracks
  for (const [camId, tracks] of s.tracks) {
    for (const t of tracks) void endTrack(s, t)
    s.tracks.set(camId, [])
  }
  console.log('[simulator] stopped')
}

export function demoEnabled(): boolean {
  return process.env.DEMO_MODE === 'true' && process.env.NODE_ENV !== 'production'
}

export async function ensureSimulator(): Promise<void> {
  if (!demoEnabled()) return
  await ensureSeed()
}

export function getSimulatorStatus() {
  const s = state()
  const activeTracks = [...s.tracks.values()].flat().length
  return {
    enabled: demoEnabled(),
    running: s.running,
    tickMs: TICK_MS,
    tickCount: s.tickCount,
    uptimeMs: s.running ? Date.now() - s.startedAt : 0,
    activeTracks,
    lastTickAt: s.lastTickAt ? new Date(s.lastTickAt).toISOString() : null,
    activeModel: s.activeModel,
    queuedInjections: s.injectionQueue.length,
  }
}

export function queueInjection(cameraId: string, action: string, objectType: string, atBbox?: SimBbox): boolean {
  const s = state()
  s.injectionQueue.push({ cameraId, action, objectType, atBbox })
  return true
}

/**
 * Deterministic threat scenario: spawns a person + weapon pair directly inside
 * the camera's restricted zone so the full CRITICAL path exercises within ~15s
 * (4 frames multi-frame confirmation → association → weapon_in_restricted_zone).
 */
export async function injectThreat(cameraId: string, objectType: 'firearm' | 'knife'): Promise<{ cameraId: string } | { error: string }> {
  const s = state()
  const cam = await db.camera.findUnique({ where: { id: cameraId.toUpperCase() } })
  if (!cam) return { error: 'camera not found' }
  if (cam.status !== 'online') return { error: 'camera is not online' }

  const zones: ZonePoly[] = JSON.parse(cam.zones)
  const restricted = zones.find((zz) => zz.type === 'restricted')

  if (restricted) {
    const xs = restricted.polygon.map((p) => p[0])
    const ys = restricted.polygon.map((p) => p[1])
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2
    const personBbox: SimBbox = { x: Math.max(0.03, cx - 0.1), y: Math.max(0.05, cy - 0.14), w: 0.11, h: 0.28 }
    const weaponBbox: SimBbox = { x: Math.min(0.95, personBbox.x + 0.13), y: personBbox.y + 0.04, w: 0.07, h: 0.11 }
    await spawnTrack(s, { id: cam.id }, 'person', personBbox)
    await spawnTrack(s, { id: cam.id }, objectType, weaponBbox)
    await log('info', 'simulator', `Threat scenario injected on ${cam.id} (${cam.name}): ${objectType} + person inside "${restricted.name}".`)
  } else {
    await spawnTrack(s, { id: cam.id }, objectType)
    await log('info', 'simulator', `Threat scenario injected on ${cam.id} (${cam.name}): ${objectType} (no restricted zone on this camera).`)
  }
  return { cameraId: cam.id }
}
