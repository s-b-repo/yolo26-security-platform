import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSimulator } from '@/lib/simulator'
import { serializeEvent, serializeTrack } from '@/lib/serialize'

export const dynamic = 'force-dynamic'

export async function GET() {
  await ensureSimulator()
  const now = Date.now()
  const dayAgo = new Date(now - 24 * 3600 * 1000)

  const [cameras, activeTracks, events24h, openBySeverity, recentEvents, openHigh, logs, activeModel] = await Promise.all([
    db.camera.findMany(),
    db.track.findMany({ where: { status: 'active' }, orderBy: { lastSeen: 'desc' }, take: 30 }),
    db.securityEvent.findMany({ where: { timestamp: { gte: dayAgo } }, orderBy: { timestamp: 'asc' } }),
    db.securityEvent.groupBy({ by: ['severity'], where: { status: 'open' }, _count: { _all: true } }),
    db.securityEvent.findMany({ orderBy: { timestamp: 'desc' }, take: 14 }),
    db.securityEvent.findMany({ where: { status: 'open', severity: { in: ['high', 'critical'] } }, orderBy: [{ severity: 'asc' }, { timestamp: 'desc' }], take: 5 }),
    db.systemLog.findMany({ orderBy: { ts: 'desc' }, take: 18 }),
    db.modelVersion.findFirst({ where: { status: 'active' } }),
  ])

  // hourly histogram last 24h
  const hourly: { hour: string; count: number; critical: number; high: number; suspicious: number; info: number }[] = []
  for (let i = 23; i >= 0; i--) {
    const slotStart = new Date(now - i * 3600 * 1000)
    slotStart.setMinutes(0, 0, 0)
    const slotEnd = new Date(slotStart.getTime() + 3600 * 1000)
    const inSlot = events24h.filter((e) => e.timestamp >= slotStart && e.timestamp < slotEnd)
    hourly.push({
      hour: slotStart.toISOString(),
      count: inSlot.length,
      critical: inSlot.filter((e) => e.severity === 'critical').length,
      high: inSlot.filter((e) => e.severity === 'high').length,
      suspicious: inSlot.filter((e) => e.severity === 'suspicious').length,
      info: inSlot.filter((e) => e.severity === 'info').length,
    })
  }

  const sev24h = {
    critical: events24h.filter((e) => e.severity === 'critical').length,
    high: events24h.filter((e) => e.severity === 'high').length,
    suspicious: events24h.filter((e) => e.severity === 'suspicious').length,
    info: events24h.filter((e) => e.severity === 'info').length,
  }

  const recentConfidence = recentEvents.slice(0, 30)
  const avgConfidence = recentConfidence.length
    ? recentConfidence.reduce((a, e) => a + e.confidence, 0) / recentConfidence.length
    : 0

  const statusMap: Record<string, number> = { open: 0, acknowledged: 0, dismissed: 0, escalated: 0, resolved: 0 }
  for (const e of events24h) {
    if (e.status in statusMap) statusMap[e.status]++
  }

  return NextResponse.json({
    cameras: {
      total: cameras.length,
      online: cameras.filter((c) => c.status === 'online').length,
      degraded: cameras.filter((c) => c.status === 'degraded').length,
      offline: cameras.filter((c) => c.status === 'offline').length,
      list: cameras.map((c) => ({ id: c.id, name: c.name, location: c.location, status: c.status, modelTier: c.modelTier, snapshot: c.snapshot, lastHeartbeat: c.lastHeartbeat?.toISOString() ?? null })),
    },
    tracks: {
      active: activeTracks.length,
      list: activeTracks.map(serializeTrack),
    },
    events: {
      last24h: events24h.length,
      today: events24h.filter((e) => e.timestamp.getTime() >= new Date(new Date().setHours(0, 0, 0, 0)).getTime()).length,
      openBySeverity: Object.fromEntries(openBySeverity.map((s) => [s.severity, s._count._all])),
      severity24h: sev24h,
      statusBreakdown: statusMap,
      avgConfidence: Number(avgConfidence.toFixed(3)),
      hourly,
      recent: recentEvents.map(serializeEvent),
      openHighPriority: openHigh.map(serializeEvent),
    },
    systemLogs: logs.map((l) => ({ ...l, ts: l.ts.toISOString() })),
    activeModel: activeModel ? { id: activeModel.id, variant: activeModel.variant, tier: activeModel.tier } : null,
    serverTime: new Date().toISOString(),
  })
}
