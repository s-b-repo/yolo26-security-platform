'use client'

import { createElement, useEffect, useState } from 'react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { useEventAction, useEventDetail } from '@/hooks/use-soc'
import { pct, timeAgo } from '@/lib/soc'
import type { SecurityEvent } from '@/lib/types'
import { ArtifactChip, EvidenceSnapshot, TrailSvg } from '@/components/soc/overlays'
import { ObjectChip, SectionLabel, SeverityBadge, StatusBadge, eventIcon } from '@/components/soc/bits'

const OPERATOR_ACTIONS: { status: string; label: string; tone: string }[] = [
  { status: 'acknowledged', label: 'ACKNOWLEDGE', tone: 'border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/15 hover:text-emerald-300' },
  { status: 'escalated', label: 'ESCALATE', tone: 'border-orange-500/50 text-orange-400 hover:bg-orange-500/15 hover:text-orange-300' },
  { status: 'dismissed', label: 'DISMISS', tone: 'border-zinc-600 text-zinc-400 hover:bg-zinc-700/40 hover:text-zinc-200' },
  { status: 'resolved', label: 'RESOLVE', tone: 'border-teal-500/50 text-teal-400 hover:bg-teal-500/15 hover:text-teal-300' },
]

export function EventDetailDialog({ eventId, onClose }: { eventId: string | null; onClose: () => void }) {
  const [activeId, setActiveId] = useState<string | null>(eventId)
  const [notes, setNotes] = useState('')

  useEffect(() => {
    setActiveId(eventId)
  }, [eventId])

  const { data, isLoading } = useEventDetail(activeId)
  const action = useEventAction()

  const event = data?.event

  useEffect(() => {
    setNotes(event?.notes ?? '')
  }, [event?.id])

  function runAction(nextStatus: string) {
    if (!event) return
    action.mutate(
      { id: event.id, status: nextStatus, notes: notes.trim() || undefined },
      {
        onSuccess: () => toast.success(`${event.id} → ${nextStatus}`, { description: 'Operator action recorded and broadcast to the pipeline.' }),
        onError: (err) => toast.error('Action failed', { description: err.message }),
      }
    )
  }

  return (
    <Dialog open={!!eventId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto border-zinc-800 bg-zinc-950 soc-scroll">
        {isLoading || !event ? (
          <div className="space-y-4 p-2">
            <DialogHeader className="sr-only">
              <DialogTitle>Loading event</DialogTitle>
              <DialogDescription>Fetching event details.</DialogDescription>
            </DialogHeader>
            <Skeleton className="h-8 w-64 bg-zinc-800" />
            <Skeleton className="aspect-video w-full bg-zinc-800/70" />
            <Skeleton className="h-24 w-full bg-zinc-800/70" />
          </div>
        ) : (
          <EventDetailBody event={event} cameraName={data?.camera?.name} cameraLocation={data?.camera?.location} notes={notes} setNotes={setNotes} runAction={runAction} pending={action.isPending} onOpenEvent={setActiveId} related={data?.related ?? []} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function EventDetailBody({
  event,
  cameraName,
  cameraLocation,
  notes,
  setNotes,
  runAction,
  pending,
  onOpenEvent,
  related,
}: {
  event: SecurityEvent
  cameraName?: string
  cameraLocation?: string
  notes: string
  setNotes: (v: string) => void
  runAction: (status: string) => void
  pending: boolean
  onOpenEvent: (id: string) => void
  related: SecurityEvent[]
}) {
  const icon = eventIcon(event.type)
  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle className="flex flex-wrap items-center gap-2 font-mono text-base">
          {createElement(icon, { className: 'h-4 w-4 text-zinc-400' })}
          <span className="tracking-wide text-zinc-100">{event.id}</span>
          <SeverityBadge severity={event.severity} />
          <StatusBadge status={event.status} />
        </DialogTitle>
        <DialogDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
          <span className="font-mono">{format(new Date(event.timestamp), 'MMM d · HH:mm:ss')}</span>
          <span>{timeAgo(event.timestamp)}</span>
          <span className="text-zinc-400">
            {event.cameraId}
            {cameraName ? ` — ${cameraName}` : ''}
            {cameraLocation ? ` · ${cameraLocation}` : ''}
          </span>
          <span className="uppercase tracking-wider text-zinc-500">{event.type.replace(/_/g, ' ')}</span>
        </DialogDescription>
      </DialogHeader>

      {/* Evidence */}
      <div className="space-y-2">
        <SectionLabel>Evidence snapshot · detections</SectionLabel>
        <EvidenceSnapshot snapshot={event.evidence.snapshot} detections={event.evidence.detections} />
        {event.evidence.artifacts.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {event.evidence.artifacts.map((a) => (
              <ArtifactChip key={a} name={a} />
            ))}
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="rounded-md border border-zinc-800 bg-zinc-900/50 p-3 text-sm leading-relaxed text-zinc-200">
        {event.summary}
      </div>

      {/* Metadata grid */}
      <div className="grid grid-cols-3 gap-3 rounded-md border border-zinc-800 bg-zinc-900/50 p-3 sm:grid-cols-6">
        <MetaCell label="Model" value={event.model} />
        <MetaCell label="Rule" value={event.ruleId ?? 'manual'} />
        <MetaCell label="Zone" value={event.zone ?? '—'} />
        <MetaCell label="Frames" value={`${event.framesConfirmed} confirmed`} />
        <MetaCell label="Person trk" value={event.personTrack ? `#${event.personTrack}` : '—'} />
        <MetaCell label="Confidence" value={pct(event.confidence, 1)} />
        <MetaCell label="Object" value={<ObjectChip object={event.object} />} mono={false} />
        <div className="col-span-2">
          <MetaCell label="Evidence clip" value={event.evidence.clip ?? '—'} />
        </div>
      </div>

      {/* Trail */}
      <div className="space-y-2">
        <SectionLabel>Movement trail · normalized frame space</SectionLabel>
        <TrailSvg trail={event.evidence.trail} color={event.severity === 'critical' ? '#ef4444' : event.severity === 'high' ? '#f59e0b' : '#10b981'} heightClass="h-32" />
      </div>

      {/* Acknowledgement info */}
      {(event.status === 'acknowledged' || event.status === 'resolved') && event.acknowledgedBy && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-300">
          Acknowledged by <span className="font-mono">{event.acknowledgedBy}</span>
          {event.acknowledgedAt ? ` · ${format(new Date(event.acknowledgedAt), 'MMM d HH:mm:ss')}` : ''}
        </div>
      )}

      <Separator className="bg-zinc-800" />

      {/* Operator actions */}
      <div className="space-y-3">
        <SectionLabel>Operator actions</SectionLabel>
        <Textarea
          placeholder="Operator notes — context, disposition, follow-up… (saved with next action)"
          className="min-h-16 resize-none border-zinc-800 bg-zinc-900/70 font-mono text-xs text-zinc-200 placeholder:text-zinc-600"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          {OPERATOR_ACTIONS.map((a) => (
            <Button
              key={a.status}
              size="sm"
              variant="outline"
              disabled={pending || event.status === a.status}
              onClick={() => runAction(a.status)}
              className={`h-8 border font-mono text-[11px] tracking-wider ${a.tone} disabled:opacity-35`}
              title={event.status === a.status ? `Already ${a.status}` : undefined}
            >
              {a.label}
            </Button>
          ))}
          {event.notes && (
            <span className="ml-auto self-center font-mono text-[10px] text-zinc-600">notes saved: “{event.notes.slice(0, 60)}{event.notes.length > 60 ? '…' : ''}”</span>
          )}
        </div>
      </div>

      {/* Related events on the same camera */}
      {related.length > 0 && (
        <div className="space-y-2">
          <SectionLabel>Related events · same camera</SectionLabel>
          <div className="space-y-1">
            {related.slice(0, 4).map((r) => (
              <button
                key={r.id}
                onClick={() => onOpenEvent(r.id)}
                className="flex w-full items-center gap-2 rounded border border-zinc-800/80 bg-zinc-900/40 px-2 py-1.5 text-left transition-colors hover:border-zinc-700 hover:bg-zinc-800/50"
              >
                <span className={`h-4 w-0.5 rounded-full ${r.severity === 'critical' ? 'bg-red-500' : r.severity === 'high' ? 'bg-amber-500' : r.severity === 'suspicious' ? 'bg-yellow-400' : 'bg-zinc-500'}`} />
                <span className="font-mono text-[10px] text-zinc-500">{r.id}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-zinc-300">{r.summary}</span>
                <span className="shrink-0 font-mono text-[10px] text-zinc-600">{timeAgo(r.timestamp)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function MetaCell({ label, value, mono = true }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-zinc-600">{label}</div>
      <div className={`truncate text-xs text-zinc-200 ${mono ? 'font-mono' : ''}`}>{value ?? '—'}</div>
    </div>
  )
}
