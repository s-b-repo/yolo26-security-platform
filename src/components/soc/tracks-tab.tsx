'use client'

import { createElement, useState } from 'react'
import { Footprints, Route } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useTrackDetail, useTracks } from '@/hooks/use-soc'
import { confidenceBand, objectMeta, timeAgo } from '@/lib/soc'
import type { Track } from '@/lib/types'
import { ConfidenceBar, EmptyState, ObjectChip, SectionLabel, SeverityBadge, StatusBadge, objectIcon } from '@/components/soc/bits'
import { TrailSvg } from '@/components/soc/overlays'

const STATUS_TABS = [
  { key: 'active', label: 'ACTIVE' },
  { key: 'ended', label: 'ENDED' },
  { key: 'all', label: 'ALL' },
] as const

function TrackCard({ track, onClick }: { track: Track; onClick: () => void }) {
  const icon = objectIcon(track.objectType)
  const band = confidenceBand(track.confidence)
  return (
    <button
      onClick={onClick}
      className="animate-in fade-in space-y-2.5 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 text-left transition-all hover:border-zinc-600 hover:bg-zinc-900 active:scale-[0.985] duration-200"
    >
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded border border-zinc-800 bg-zinc-950">
          {createElement(icon, { className: 'h-3.5 w-3.5', style: { color: objectMeta(track.objectType).hex } })}
        </span>
        <span className="font-mono text-sm font-semibold text-zinc-100">
          {track.objectType === 'person' ? 'P' : 'F'}#{track.trackNum}
        </span>
        <ObjectChip object={track.objectType} />
        <span className={`ml-auto rounded border px-1.5 py-px font-mono text-[9px] ${band.badge}`}>{band.label}</span>
      </div>
      <ConfidenceBar value={track.confidence} showLabel />
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <div className="min-w-0">
          <div className="text-[9px] uppercase tracking-[0.14em] text-zinc-600">camera</div>
          <div className="truncate font-mono text-zinc-300">{track.cameraId}</div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-[0.14em] text-zinc-600">frames</div>
          <div className="font-mono tabular-nums text-zinc-300">{track.framesConfirmed}</div>
        </div>
        <div className="min-w-0">
          <div className="text-[9px] uppercase tracking-[0.14em] text-zinc-600">zone</div>
          <div className="truncate text-zinc-300">{track.currentZone ?? '—'}</div>
        </div>
      </div>
      <div className="border-t border-zinc-800/70 pt-1.5 font-mono text-[10px] text-zinc-600">
        seen {timeAgo(track.firstSeen)} → last {timeAgo(track.lastSeen)}
      </div>
    </button>
  )
}

function TrackDetailDialog({ trackId, onClose }: { trackId: string | null; onClose: () => void }) {
  const { data, isLoading } = useTrackDetail(trackId)
  const track = data?.track
  const band = track ? confidenceBand(track.confidence) : null

  return (
    <Dialog open={!!trackId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto border-zinc-800 bg-zinc-950 soc-scroll">
        {isLoading || !track ? (
          <div className="space-y-4 p-2">
            <Skeleton className="h-7 w-48 bg-zinc-800" />
            <Skeleton className="h-36 w-full bg-zinc-800/70" />
            <Skeleton className="h-20 w-full bg-zinc-800/70" />
          </div>
        ) : (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2 font-mono text-base">
                <Footprints className="h-4 w-4 text-zinc-400" />
                <span className="text-zinc-100">
                  {track.objectType === 'person' ? 'P' : 'F'}#{track.trackNum}
                </span>
                <ObjectChip object={track.objectType} />
                {band && <span className={`rounded border px-1.5 py-px font-mono text-[10px] ${band.badge}`}>{band.label} · {Math.round(track.confidence * 100)}%</span>}
                <StatusBadge status={track.status} />
              </DialogTitle>
              <DialogDescription className="text-xs text-zinc-500">
                <span className="font-mono">{track.cameraId}</span>
                {track.currentZone ? ` · zone ${track.currentZone}` : ' · outside configured zones'} · confidence band per spec policy
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <SectionLabel>Movement trail · newest point highlighted</SectionLabel>
              <TrailSvg trail={track.trail} color={objectMeta(track.objectType).hex} heightClass="h-44" emptyHint="No trail points recorded yet" />
            </div>

            <div className="grid grid-cols-3 gap-3 rounded-md border border-zinc-800 bg-zinc-900/50 p-3 font-mono text-[11px]">
              <div>
                <div className="text-[9px] uppercase tracking-[0.14em] text-zinc-600">confidence</div>
                <div className="text-zinc-200">{(track.confidence).toFixed(3)}</div>
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-[0.14em] text-zinc-600">frames confirmed</div>
                <div className="text-zinc-200">{track.framesConfirmed}</div>
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-[0.14em] text-zinc-600">status</div>
                <div className="text-zinc-200">{track.status}</div>
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-[0.14em] text-zinc-600">first seen</div>
                <div className="text-zinc-200">{timeAgo(track.firstSeen)}</div>
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-[0.14em] text-zinc-600">last seen</div>
                <div className="text-zinc-200">{timeAgo(track.lastSeen)}</div>
              </div>
              <div className="min-w-0">
                <div className="text-[9px] uppercase tracking-[0.14em] text-zinc-600">bbox (norm)</div>
                <div className="truncate text-zinc-200">
                  {track.bbox.x.toFixed(2)}, {track.bbox.y.toFixed(2)} · {track.bbox.w.toFixed(2)}×{track.bbox.h.toFixed(2)}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <SectionLabel>Related events · same camera timeline</SectionLabel>
              {(data?.relatedEvents.length ?? 0) === 0 ? (
                <div className="rounded-md border border-dashed border-zinc-800 p-3 text-center text-xs text-zinc-600">no related events</div>
              ) : (
                data!.relatedEvents.map((e) => (
                  <div key={e.id} className="flex items-center gap-2 rounded border border-zinc-800/70 bg-zinc-950/40 px-2 py-1.5">
                    <SeverityBadge severity={e.severity} />
                    <span className="min-w-0 flex-1 truncate text-xs text-zinc-300">{e.summary}</span>
                    <span className="shrink-0 font-mono text-[10px] text-zinc-600">{timeAgo(e.timestamp)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function TracksTab() {
  const [statusTab, setStatusTab] = useState<'active' | 'ended' | 'all'>('active')
  const { data, isLoading } = useTracks(statusTab)
  const [selected, setSelected] = useState<string | null>(null)

  const items = data?.items ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-zinc-200">Object Tracking</h2>
          <p className="text-xs text-zinc-500">multi-frame confirmed tracks · never single-frame detections · live 3s polling</p>
        </div>
        <div className="ml-auto flex overflow-hidden rounded-md border border-zinc-800">
          {STATUS_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setStatusTab(t.key)}
              className={`px-3 py-1.5 font-mono text-[11px] tracking-wider transition-colors ${
                statusTab === t.key ? 'bg-emerald-500/15 text-emerald-300' : 'bg-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <span className="font-mono text-[11px] text-zinc-500">{data?.total ?? 0} track{data?.total === 1 ? '' : 's'}</span>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-lg bg-zinc-900/50" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={Route} title={`No ${statusTab === 'all' ? '' : statusTab + ' '}tracks right now`} hint="The simulator spawns tracks as detections persist across frames." />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((t) => (
            <TrackCard key={t.id} track={t} onClick={() => setSelected(t.id)} />
          ))}
        </div>
      )}

      <TrackDetailDialog trackId={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
