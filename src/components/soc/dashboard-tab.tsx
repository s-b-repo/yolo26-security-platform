'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { PersonStanding, Siren, ShieldCheck, Activity } from 'lucide-react'
import { useDashboard, useEventAction } from '@/hooks/use-soc'
import { SEVERITY_META, hourLabel, pct, timeAgo, isEventFresh } from '@/lib/soc'
import type { Severity } from '@/lib/types'
import { CameraStatusBadge, ConfidenceBar, EmptyState, KpiCard, LiveDot, ObjectChip, SectionLabel, SeverityBadge, StatusBadge, TierChip, eventIcon } from '@/components/soc/bits'

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(1, ...values)
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * 100},${28 - (v / max) * 26}`).join(' ')
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="mt-2 h-8 w-full">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <polyline points={`0,28 ${pts} 100,28`} fill={color} fillOpacity={0.12} stroke="none" />
    </svg>
  )
}

// ─── Hand-rolled SVG charts (lightweight — keeps dev-compile memory low) ───

type HourBucket = { hour: string; count: number; critical: number; high: number; suspicious: number; info: number; label?: string }

function StackedHourlyBars({ data }: { data: (HourBucket & { label: string })[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(4, ...data.map((d) => d.count))
  const SEV: Severity[] = ['info', 'suspicious', 'high', 'critical']
  return (
    <div className="flex h-56 flex-col">
      <div className="relative flex-1">
        {/* horizontal gridlines */}
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <div key={f} className="absolute inset-x-0 border-t border-dashed border-zinc-800/70" style={{ bottom: `${f * 100}%` }}>
            <span className="absolute -top-2 right-0 font-mono text-[8px] text-zinc-700">{Math.round(max * f)}</span>
          </div>
        ))}
        <div className="absolute inset-0 flex items-end gap-[2px] sm:gap-1">
          {data.map((h, i) => {
            const hovered = hover === i
            return (
              <div
                key={h.hour}
                className="relative flex h-full flex-1 cursor-default flex-col justify-end"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                <div
                  className={`flex w-full flex-col-reverse gap-px transition-opacity ${hovered ? 'opacity-100' : 'opacity-90'}`}
                  style={{ height: `${Math.max(2, (h.count / max) * 100)}%` }}
                >
                  {SEV.map((s) => {
                    const v = h[s] ?? 0
                    if (v <= 0) return null
                    return (
                      <div
                        key={s}
                        className="w-full first:rounded-b-[2px] last:rounded-t-[2px]"
                        style={{ height: `${(v / Math.max(1, h.count)) * 100}%`, backgroundColor: SEVERITY_META[s].hex, opacity: hovered ? 1 : 0.82 }}
                      />
                    )
                  })}
                </div>
                {hover === i && (
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 w-36 -translate-x-1/2 rounded-md border border-zinc-700 bg-zinc-950 p-2 font-mono text-[9px] shadow-xl">
                    <div className="mb-1 font-semibold text-zinc-200">{h.label}</div>
                    {(['critical', 'high', 'suspicious', 'info'] as Severity[]).map((s) => (
                      <div key={s} className="flex items-center gap-1.5 text-zinc-400">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: SEVERITY_META[s].hex }} />
                        {s}
                        <span className="ml-auto text-zinc-200">{h[s] ?? 0}</span>
                      </div>
                    ))}
                    <div className="mt-1 border-t border-zinc-800 pt-1 text-zinc-300">total {h.count}</div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
      <div className="mt-1.5 flex gap-[2px] sm:gap-1">
        {data.map((h, i) => (
          <span key={h.hour} className="flex-1 text-center font-mono text-[8px] text-zinc-600">
            {i % 4 === 0 ? h.label : ''}
          </span>
        ))}
      </div>
    </div>
  )
}

function Donut({ data, total }: { data: { name: string; value: number; fill: string }[]; total: number }) {
  const R = 40
  const C = 2 * Math.PI * R
  let acc = 0
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
      <circle cx="50" cy="50" r={R} fill="none" stroke="#27272a" strokeWidth="14" strokeOpacity={0.5} />
      {total > 0 &&
        data.map((d) => {
          const frac = d.value / total
          const dash = `${Math.max(0.5, frac * C - 1.5)} ${C}`
          const el = (
            <circle
              key={d.name}
              cx="50"
              cy="50"
              r={R}
              fill="none"
              stroke={d.fill}
              strokeWidth="14"
              strokeDasharray={dash}
              strokeDashoffset={-acc * C}
              strokeLinecap="butt"
            />
          )
          acc += frac
          return el
        })}
    </svg>
  )
}

function CriticalBanner({ events }: { events: import('@/lib/types').SecurityEvent[] }) {
  const action = useEventAction()
  const cameraNames = new Map<string, { name: string; location: string }>()
  const { data } = useDashboard()
  data?.cameras.list.forEach((c) => cameraNames.set(c.id, { name: c.name, location: c.location }))

  function act(id: string, status: string) {
    action.mutate(
      { id, status },
      {
        onSuccess: () => toast.success(`${id} → ${status}`),
        onError: (err) => toast.error('Action failed', { description: err.message }),
      }
    )
  }

  return (
    <div className="animate-critical-pulse space-y-2 rounded-lg border border-red-500/50 bg-red-500/10 p-4 lg:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Siren className="h-4 w-4 animate-soc-dot text-red-400" />
        <span className="font-mono text-xs font-bold tracking-[0.22em] text-red-400">CRITICAL EVENT</span>
        <span className="font-mono text-[10px] text-red-400/70">requires immediate operator action</span>
      </div>
      {events.slice(0, 2).map((e) => {
        const cam = cameraNames.get(e.cameraId)
        return (
          <div key={e.id} className="rounded-md border border-red-500/30 bg-zinc-950/60 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-red-300">{e.id}</span>
                  <SeverityBadge severity={e.severity} />
                  <span className="text-xs uppercase tracking-wider text-zinc-400">{e.type.replace(/_/g, ' ')}</span>
                </div>
                <div className="mt-1 text-sm text-zinc-200">{e.summary}</div>
                <div className="mt-2 flex flex-wrap gap-1.5 font-mono text-[10px]">
                  <span className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-zinc-300">{e.cameraId}{cam ? ` · ${cam.location}` : ''}</span>
                  {e.object && <span className="rounded border border-red-500/50 bg-red-500/10 px-1.5 py-0.5 text-red-300">{e.object}</span>}
                  <span className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-zinc-300">conf {pct(e.confidence, 1)}</span>
                  {e.personTrack && <span className="rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-emerald-300">person #{e.personTrack}</span>}
                  <span className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-zinc-300">{e.framesConfirmed} frames</span>
                  <span className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-zinc-400">{e.model}</span>
                  <span className="text-zinc-500">{timeAgo(e.timestamp)}</span>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  disabled={action.isPending || e.status !== 'open'}
                  onClick={() => act(e.id, 'acknowledged')}
                  className="rounded-md border border-emerald-500/60 bg-emerald-500/15 px-3 py-1.5 font-mono text-[11px] font-semibold tracking-wider text-emerald-300 transition-colors hover:bg-emerald-500/25 disabled:opacity-40"
                >
                  ACKNOWLEDGE
                </button>
                <button
                  disabled={action.isPending || e.status !== 'open'}
                  onClick={() => act(e.id, 'escalated')}
                  className="rounded-md border border-red-500/60 bg-red-500/15 px-3 py-1.5 font-mono text-[11px] font-semibold tracking-wider text-red-300 transition-colors hover:bg-red-500/25 disabled:opacity-40"
                >
                  ESCALATE
                </button>
              </div>
            </div>
          </div>
        )
      })}
      {events.length > 2 && (
        <div className="font-mono text-[10px] text-red-400/70">+{events.length - 2} more open critical events in queue</div>
      )}
    </div>
  )
}

export function DashboardTab({
  onOpenEvent,
  onOpenCamera,
}: {
  onOpenEvent: (eventId: string) => void
  onOpenCamera: (cameraId: string) => void
}) {
  const { data, isLoading } = useDashboard()

  const criticals = useMemo(() => (data?.events.openHighPriority ?? []).filter((e) => e.severity === 'critical'), [data])
  const highs = useMemo(() => (data?.events.openHighPriority ?? []).filter((e) => e.severity === 'high'), [data])
  const hourly = useMemo(
    () => (data?.events.hourly ?? []).map((h) => ({ ...h, label: hourLabel(h.hour) })),
    [data]
  )
  const donut = useMemo(() => {
    const s = data?.events.severity24h
    if (!s) return []
    return (['critical', 'high', 'suspicious', 'info'] as Severity[])
      .map((k) => ({ name: SEVERITY_META[k].label, value: s[k] ?? 0, fill: SEVERITY_META[k].hex }))
      .filter((d) => d.value > 0)
  }, [data])

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-lg border border-zinc-800 bg-zinc-900/50" />
          ))}
        </div>
        <div className="h-40 animate-pulse rounded-lg border border-zinc-800 bg-zinc-900/50" />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="h-64 animate-pulse rounded-lg border border-zinc-800 bg-zinc-900/50 lg:col-span-2" />
          <div className="h-64 animate-pulse rounded-lg border border-zinc-800 bg-zinc-900/50" />
        </div>
      </div>
    )
  }

  const openCritical = data.events.openBySeverity?.critical ?? 0
  const openHigh = data.events.openBySeverity?.high ?? 0
  const hourlyTotal = hourly.map((h) => h.count)

  return (
    <div className="space-y-4 lg:space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard label="Cameras Online" accentClass="bg-emerald-500">
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-3xl font-bold tabular-nums text-zinc-100">{data.cameras.online}</span>
            <span className="font-mono text-lg text-zinc-600">/{data.cameras.total}</span>
            <ShieldCheck className="ml-auto h-5 w-5 text-emerald-500/70" />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-px font-mono text-[10px] text-amber-400">{data.cameras.degraded} degraded</span>
            <span className="rounded border border-red-500/40 bg-red-500/10 px-1.5 py-px font-mono text-[10px] text-red-400">{data.cameras.offline} offline</span>
          </div>
        </KpiCard>

        <KpiCard label="Active Tracks" accentClass="bg-teal-500">
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-3xl font-bold tabular-nums text-zinc-100">{data.tracks.active}</span>
            <PersonStanding className="ml-auto h-5 w-5 text-teal-400/70" />
          </div>
          <div className="mt-2 text-[11px] text-zinc-500">multi-frame confirmed objects under tracking</div>
        </KpiCard>

        <KpiCard label="Open Critical" accentClass="bg-red-500" className={openCritical > 0 ? 'border-red-500/40' : undefined}>
          <div className="flex items-baseline gap-1.5">
            <span className={`font-mono text-3xl font-bold tabular-nums ${openCritical > 0 ? 'animate-pulse text-red-400' : 'text-zinc-100'}`}>{openCritical}</span>
            <Siren className={`ml-auto h-5 w-5 ${openCritical > 0 ? 'text-red-400' : 'text-zinc-700'}`} />
          </div>
          <div className="mt-2 text-[11px] text-zinc-500">{openCritical > 0 ? 'immediate action required' : 'no critical alerts open'}</div>
        </KpiCard>

        <KpiCard label="Open High" accentClass="bg-amber-500">
          <div className="flex items-baseline gap-1.5">
            <span className={`font-mono text-3xl font-bold tabular-nums ${openHigh > 0 ? 'text-amber-400' : 'text-zinc-100'}`}>{openHigh}</span>
            <Activity className="ml-auto h-5 w-5 text-amber-400/70" />
          </div>
          <div className="mt-2 text-[11px] text-zinc-500">high-severity events awaiting triage</div>
        </KpiCard>

        <KpiCard label="Events · 24h" accentClass="bg-zinc-500" className="col-span-2 md:col-span-1">
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-3xl font-bold tabular-nums text-zinc-100">{data.events.last24h}</span>
            <span className="font-mono text-xs text-zinc-500">today {data.events.today}</span>
          </div>
          <Sparkline values={hourlyTotal} color="#a1a1aa" />
          <div className="mt-1 font-mono text-[10px] text-zinc-500">avg conf {pct(data.events.avgConfidence, 1)}</div>
        </KpiCard>
      </div>

      {/* Critical banner + high rows */}
      {criticals.length > 0 && <CriticalBanner events={criticals} />}
      {highs.length > 0 && (
        <div className="space-y-1.5 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
          <div className="flex items-center gap-2 px-1">
            <span className="font-mono text-[10px] font-bold tracking-[0.2em] text-amber-400">HIGH PRIORITY · OPEN</span>
          </div>
          {highs.map((e) => {
            const Icon = eventIcon(e.type)
            return (
              <button
                key={e.id}
                onClick={() => onOpenEvent(e.id)}
                className="flex w-full items-center gap-2.5 rounded border border-zinc-800 bg-zinc-950/50 px-2.5 py-1.5 text-left transition-colors hover:border-amber-500/40 hover:bg-zinc-900/60"
              >
                <Icon className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                <span className="font-mono text-[10px] text-zinc-500">{e.id}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-zinc-200">{e.summary}</span>
                <span className="hidden font-mono text-[10px] text-zinc-500 sm:inline">{e.cameraId}</span>
                <span className="font-mono text-[10px] text-zinc-600">{timeAgo(e.timestamp)}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 lg:col-span-2 lg:p-6">
          <div className="mb-3 flex items-center justify-between">
            <SectionLabel>Events per hour · last 24h · stacked by severity</SectionLabel>
            <div className="flex gap-3 font-mono text-[9px] uppercase tracking-wider">
              {(['critical', 'high', 'suspicious', 'info'] as Severity[]).map((s) => (
                <span key={s} className="flex items-center gap-1 text-zinc-500">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: SEVERITY_META[s].hex }} />
                  {s}
                </span>
              ))}
            </div>
          </div>
          <div className="h-56 pt-3">
            <StackedHourlyBars data={hourly} />
          </div>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 lg:p-6">
          <SectionLabel>Severity distribution · 24h</SectionLabel>
          <div className="relative h-44">
            <Donut data={donut} total={data.events.last24h} />
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-mono text-2xl font-bold text-zinc-100">{data.events.last24h}</span>
              <span className="text-[9px] uppercase tracking-[0.2em] text-zinc-500">events</span>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {(['critical', 'high', 'suspicious', 'info'] as Severity[]).map((s) => (
              <div key={s} className="flex items-center gap-1.5 font-mono text-[10px] text-zinc-400">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: SEVERITY_META[s].hex }} />
                {s} <span className="ml-auto text-zinc-200">{data.events.severity24h[s] ?? 0}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Lower area */}
      <div className="grid gap-4 xl:grid-cols-3">
        {/* Live feed */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 xl:col-span-2">
          <div className="flex items-center gap-2 border-b border-zinc-800/80 px-4 py-3">
            <LiveDot />
            <SectionLabel>Live event feed</SectionLabel>
            <span className="ml-auto font-mono text-[10px] text-zinc-500">{data.events.recent.length} recent · auto-refresh 3s</span>
          </div>
          <div className="soc-scroll max-h-[560px] overflow-y-auto p-2">
            {data.events.recent.length === 0 ? (
              <EmptyState icon={Siren} title="No events yet" hint="The simulator will produce events as the pipeline runs." />
            ) : (
              <div className="space-y-1">
                {data.events.recent.map((e, idx) => {
                  const Icon = eventIcon(e.type)
                  const fresh = idx === 0 && isEventFresh(e.timestamp, 25)
                  return (
                    <button
                      key={e.id}
                      onClick={() => onOpenEvent(e.id)}
                      className={`group flex w-full animate-in fade-in slide-in-from-top-1 items-center gap-3 rounded-md border border-zinc-800/60 border-l-2 bg-zinc-950/40 px-3 py-2.5 text-left transition-colors duration-300 hover:bg-zinc-900/70 ${SEVERITY_META[e.severity].border}`}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-zinc-400" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-[13px] text-zinc-200 group-hover:text-zinc-100">{e.summary}</span>
                          {fresh && <span className="animate-soc-blink rounded bg-red-500/20 px-1 font-mono text-[8px] font-bold tracking-widest text-red-400">LIVE</span>}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 font-mono text-[10px] text-zinc-500">
                          <span>{e.cameraId}</span>
                          <span>·</span>
                          <span>{e.zone ?? 'no zone'}</span>
                          {e.personTrack && (
                            <>
                              <span>·</span>
                              <span className="text-emerald-500/80">P#{e.personTrack}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <SeverityBadge severity={e.severity} className="hidden sm:inline-flex" />
                      <div className="flex w-16 shrink-0 flex-col items-end gap-1">
                        <span className="font-mono text-[10px] text-zinc-500">{timeAgo(e.timestamp)}</span>
                        <StatusBadge status={e.status} />
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right panel stack */}
        <div className="space-y-4">
          {/* Camera mini-grid */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
            <div className="mb-2.5 flex items-center justify-between">
              <SectionLabel>Cameras</SectionLabel>
              <span className="font-mono text-[10px] text-zinc-500">{data.cameras.online}/{data.cameras.total} online</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {data.cameras.list.map((c) => (
                <button
                  key={c.id}
                  onClick={() => onOpenCamera(c.id)}
                  className="scanlines group relative aspect-video overflow-hidden rounded border border-zinc-800 bg-black transition-colors hover:border-emerald-500/40"
                >
                  {c.snapshot ? (
                    <img src={c.snapshot} alt={c.name} className="h-full w-full object-cover opacity-80 transition-opacity group-hover:opacity-100" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[9px] text-zinc-700">NO SIGNAL</div>
                  )}
                  <span className={`absolute left-1 top-1 h-1.5 w-1.5 rounded-full ${c.status === 'online' ? 'animate-soc-dot bg-emerald-500' : c.status === 'degraded' ? 'bg-amber-500' : 'bg-red-500'}`} />
                  <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/90 to-transparent px-1.5 pb-0.5 pt-3 font-mono text-[9px] text-zinc-300">
                    {c.id}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Active tracks */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
            <div className="mb-2.5 flex items-center justify-between">
              <SectionLabel>Active tracks</SectionLabel>
              <span className="font-mono text-[10px] text-zinc-500">{data.tracks.active} live</span>
            </div>
            {data.tracks.list.length === 0 ? (
              <div className="py-4 text-center text-xs text-zinc-600">no active tracks</div>
            ) : (
              <div className="space-y-2">
                {data.tracks.list.slice(0, 6).map((t) => (
                  <div key={t.id} className="flex items-center gap-2.5">
                    <span className="w-12 shrink-0 font-mono text-[11px] text-zinc-300">{t.objectType === 'person' ? 'P' : 'F'}#{t.trackNum}</span>
                    <ObjectChip object={t.objectType} className="hidden w-fit sm:inline-flex" />
                    <ConfidenceBar value={t.confidence} className="flex-1" />
                    <span className="hidden w-20 shrink-0 truncate text-right font-mono text-[10px] text-zinc-500 md:inline">{t.currentZone ?? '—'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* System log stream */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
            <div className="mb-2 flex items-center justify-between">
              <SectionLabel>System log stream</SectionLabel>
              <span className="font-mono text-[10px] text-zinc-600">bounded ring buffer</span>
            </div>
            <div className="soc-scroll max-h-40 space-y-0.5 overflow-y-auto font-mono text-[10px] leading-relaxed">
              {data.systemLogs.map((l) => (
                <div key={l.id} className="flex gap-2">
                  <span className="shrink-0 text-zinc-600">{new Date(l.ts).toISOString().slice(11, 19)}</span>
                  <span
                    className={`w-9 shrink-0 font-semibold ${
                      l.level === 'error' ? 'text-red-400' : l.level === 'warn' ? 'text-amber-400' : 'text-zinc-500'
                    }`}
                  >
                    {l.level.toUpperCase()}
                  </span>
                  <span className="shrink-0 text-zinc-600">{l.component}</span>
                  <span className="min-w-0 flex-1 text-zinc-400">{l.message}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
