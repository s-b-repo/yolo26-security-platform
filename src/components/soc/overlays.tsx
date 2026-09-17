'use client'

import { FileVideo, FileJson, Image } from 'lucide-react'
import { cn } from '@/lib/utils'
import { pct, objectMeta } from '@/lib/soc'
import type { Detection, TrailPoint, ZonePolygon } from '@/lib/types'

// ─── Detection bbox overlay (normalized 0..1 → %) ────────────────

export function DetectionOverlay({ detections }: { detections: Detection[] }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        {detections.map((d, i) => (
          <rect
            key={i}
            x={d.bbox.x * 100}
            y={d.bbox.y * 100}
            width={d.bbox.w * 100}
            height={d.bbox.h * 100}
            fill="none"
            stroke={objectMeta(d.object).hex}
            strokeWidth={1.5}
            strokeDasharray="4 2"
            vectorEffect="non-scaling-stroke"
            rx={1}
          />
        ))}
      </svg>
      {detections.map((d, i) => {
        const topPct = Math.max(0.5, d.bbox.y * 100 - 3.2)
        const leftPct = Math.min(78, Math.max(0.5, d.bbox.x * 100))
        return (
          <div
            key={`l-${i}`}
            className="absolute whitespace-nowrap rounded-sm border bg-black/80 px-1 font-mono text-[9px] leading-4"
            style={{ left: `${leftPct}%`, top: `${topPct}%`, color: objectMeta(d.object).hex, borderColor: `${objectMeta(d.object).hex}66` }}
          >
            {d.object} · {pct(d.confidence)}
          </div>
        )
      })}
    </div>
  )
}

// ─── Zone polygon overlay (viewBox 0 0 100 100) ───────────────────

export function ZonePolyOverlay({ zones }: { zones: ZonePolygon[] }) {
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
      {zones.map((z) => (
        <polygon
          key={z.id}
          points={z.polygon.map((p) => `${p[0] * 100},${p[1] * 100}`).join(' ')}
          fill={z.type === 'restricted' ? 'rgba(239,68,68,0.08)' : 'transparent'}
          stroke={z.color || '#10b981'}
          strokeWidth={1.5}
          strokeDasharray={z.type === 'flow' ? '5 3' : undefined}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  )
}

// ─── Live track bbox overlay (per-camera view) ────────────────────

export function TrackBBoxOverlay({ tracks }: { tracks: { trackNum: number; objectType: string; confidence: number; bbox: { x: number; y: number; w: number; h: number } }[] }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        {tracks.map((t) => (
          <rect
            key={t.trackNum}
            x={t.bbox.x * 100}
            y={t.bbox.y * 100}
            width={t.bbox.w * 100}
            height={t.bbox.h * 100}
            fill="none"
            stroke={objectMeta(t.objectType).hex}
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            rx={1}
          />
        ))}
      </svg>
      {tracks.map((t) => {
        const topPct = Math.max(0.5, t.bbox.y * 100 - 3.4)
        const leftPct = Math.min(72, Math.max(0.5, t.bbox.x * 100))
        const prefix = t.objectType === 'person' ? 'P' : 'F'
        return (
          <div
            key={`l-${t.trackNum}`}
            className="absolute whitespace-nowrap rounded-sm border bg-black/80 px-1 font-mono text-[9px] leading-4 text-zinc-200"
            style={{ left: `${leftPct}%`, top: `${topPct}%`, borderColor: `${objectMeta(t.objectType).hex}66` }}
          >
            {prefix}#{t.trackNum} · {pct(t.confidence)}
          </div>
        )
      })}
    </div>
  )
}

// ─── Trail visualization (normalized 0..1 space) ──────────────────

export function TrailSvg({
  trail,
  className,
  heightClass = 'h-36',
  color = '#10b981',
  emptyHint = 'No movement trail recorded',
}: {
  trail: TrailPoint[]
  className?: string
  heightClass?: string
  color?: string
  emptyHint?: string
}) {
  if (!trail || trail.length === 0) {
    return (
      <div className={cn('flex items-center justify-center rounded-md border border-zinc-800 bg-zinc-900/40 text-xs text-zinc-600', heightClass, className)}>
        {emptyHint}
      </div>
    )
  }
  const pts = trail.slice(-60)
  const polyline = pts.map((p) => `${(p.x * 100).toFixed(2)},${(p.y * 100).toFixed(2)}`).join(' ')
  const last = pts[pts.length - 1]
  return (
    <div className={cn('relative overflow-hidden rounded-md border border-zinc-800 bg-zinc-900/40 soc-grid-bg', heightClass, className)}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        <polyline points={polyline} fill="none" stroke={color} strokeWidth={1.5} strokeOpacity={0.7} vectorEffect="non-scaling-stroke" />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x * 100} cy={p.y * 100} r={1.1} fill={color} fillOpacity={0.35 + (0.6 * i) / pts.length} />
        ))}
      </svg>
      {/* newest point marker (HTML so the pulse stays circular) */}
      <div className="absolute" style={{ left: `${last.x * 100}%`, top: `${last.y * 100}%`, transform: 'translate(-50%,-50%)' }}>
        <span
          className="absolute left-1/2 top-1/2 inline-flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full opacity-40"
          style={{ backgroundColor: color }}
        />
        <span className="relative inline-block h-2 w-2 rounded-full ring-2 ring-black/60" style={{ backgroundColor: color }} />
      </div>
      <div className="absolute bottom-1 right-1.5 font-mono text-[9px] text-zinc-600">trail · {pts.length} pts</div>
    </div>
  )
}

// ─── Artifact chip ────────────────────────────────────────────────

export function ArtifactChip({ name }: { name: string }) {
  const lower = name.toLowerCase()
  const Icon = lower.endsWith('.mp4') || lower.endsWith('.webm') ? FileVideo : lower.endsWith('.json') ? FileJson : Image
  return (
    <span className="inline-flex items-center gap-1 rounded border border-zinc-700/70 bg-zinc-800/60 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">
      <Icon className="h-3 w-3 text-zinc-500" />
      {name}
    </span>
  )
}

// ─── Snapshot frame w/ overlays ───────────────────────────────────

export function EvidenceSnapshot({
  snapshot,
  detections,
  zones,
  children,
  className,
}: {
  snapshot: string | null
  detections?: Detection[]
  zones?: ZonePolygon[]
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('scanlines relative aspect-video w-full overflow-hidden rounded-md border border-zinc-800 bg-black', className)}>
      {snapshot ? (
        <img src={snapshot} alt="evidence snapshot" className="h-full w-full object-cover opacity-90" />
      ) : (
        <div className="flex h-full items-center justify-center text-xs text-zinc-600">no snapshot available</div>
      )}
      {zones && zones.length > 0 && <ZonePolyOverlay zones={zones} />}
      {detections && detections.length > 0 && <DetectionOverlay detections={detections} />}
      {children}
    </div>
  )
}
