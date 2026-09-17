'use client'

import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ChevronLeft, ChevronRight, Search, Siren } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useCameras, useEvents, type EventFilters } from '@/hooks/use-soc'
import { pct, timeAgo } from '@/lib/soc'
import { EmptyState, SectionLabel, SeverityBadge, StatusBadge, eventIcon } from '@/components/soc/bits'

const LIMIT = 50

export function EventsTab({
  onOpenEvent,
  presetSeverity,
}: {
  onOpenEvent: (eventId: string) => void
  presetSeverity?: { value: string; nonce: number }
}) {
  const [severity, setSeverity] = useState('all')
  const [status, setStatus] = useState('all')
  const [cameraId, setCameraId] = useState('all')
  const [qInput, setQInput] = useState('')
  const q = useDeferredValue(qInput)
  const [offset, setOffset] = useState(0)

  const filters: EventFilters = useMemo(() => ({ severity, status, cameraId, q }), [severity, status, cameraId, q])

  useEffect(() => {
    if (!presetSeverity) return
    const t = setTimeout(() => {
      setSeverity(presetSeverity.value)
      setOffset(0)
    }, 0)
    return () => clearTimeout(t)
  }, [presetSeverity])

  const { data: cams } = useCameras(60000)
  const { data, isLoading, isFetching } = useEvents(filters, LIMIT, offset)

  const total = data?.total ?? 0
  const pageStart = offset + 1
  const pageEnd = Math.min(offset + LIMIT, total)

  function resetOffset() {
    setOffset(0)
  }

  return (
    <div className="space-y-4">
      {/* Filter toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 lg:gap-3">
        <SectionLabel className="pr-1">Filters</SectionLabel>

        <Select
          value={severity}
          onValueChange={(v) => {
            setSeverity(v)
            resetOffset()
          }}
        >
          <SelectTrigger className="h-8 w-[130px] border-zinc-800 bg-zinc-950/60 font-mono text-xs">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent className="border-zinc-800 bg-zinc-950">
            <SelectItem value="all">all severities</SelectItem>
            <SelectItem value="critical">critical</SelectItem>
            <SelectItem value="high">high</SelectItem>
            <SelectItem value="suspicious">suspicious</SelectItem>
            <SelectItem value="info">info</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v)
            resetOffset()
          }}
        >
          <SelectTrigger className="h-8 w-[140px] border-zinc-800 bg-zinc-950/60 font-mono text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent className="border-zinc-800 bg-zinc-950">
            <SelectItem value="all">all statuses</SelectItem>
            <SelectItem value="actionable">actionable</SelectItem>
            <SelectItem value="open">open</SelectItem>
            <SelectItem value="acknowledged">acknowledged</SelectItem>
            <SelectItem value="escalated">escalated</SelectItem>
            <SelectItem value="dismissed">dismissed</SelectItem>
            <SelectItem value="resolved">resolved</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={cameraId}
          onValueChange={(v) => {
            setCameraId(v)
            resetOffset()
          }}
        >
          <SelectTrigger className="h-8 w-[140px] border-zinc-800 bg-zinc-950/60 font-mono text-xs">
            <SelectValue placeholder="Camera" />
          </SelectTrigger>
          <SelectContent className="border-zinc-800 bg-zinc-950">
            <SelectItem value="all">all cameras</SelectItem>
            {(cams?.cameras ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.id} · {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative min-w-44 flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
          <Input
            value={qInput}
            onChange={(e) => {
              setQInput(e.target.value)
              resetOffset()
            }}
            placeholder="Search summaries…"
            className="h-8 border-zinc-800 bg-zinc-950/60 pl-8 font-mono text-xs"
          />
        </div>

        <span className="ml-auto font-mono text-[11px] text-zinc-500">
          {isFetching && !isLoading ? '…' : ''}
          {total} result{total === 1 ? '' : 's'}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60">
        <div className="soc-scroll overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                {['ID', 'SEV', 'TYPE', 'CAMERA', 'OBJECT', 'CONF', 'PTRK', 'ZONE', 'FRM', 'TIME', 'STATUS'].map((h) => (
                  <TableHead key={h} className="h-9 whitespace-nowrap text-[9px] font-semibold tracking-[0.14em] text-zinc-500">
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading &&
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i} className="border-zinc-800/60">
                    <TableCell colSpan={11} className="py-2">
                      <Skeleton className="h-5 w-full bg-zinc-800/60" />
                    </TableCell>
                  </TableRow>
                ))}
              {!isLoading && (data?.items.length ?? 0) === 0 && (
                <TableRow className="border-zinc-800/60 hover:bg-transparent">
                  <TableCell colSpan={11} className="py-6">
                    <EmptyState icon={Siren} title="No events match the current filters" hint="Try widening severity/status or clearing the search." />
                  </TableCell>
                </TableRow>
              )}
              {!isLoading &&
                data?.items.map((e) => {
                  const Icon = eventIcon(e.type)
                  return (
                    <TableRow
                      key={e.id}
                      onClick={() => onOpenEvent(e.id)}
                      className="cursor-pointer border-zinc-800/60 hover:bg-zinc-900"
                    >
                      <TableCell className="whitespace-nowrap py-2 font-mono text-[11px] text-zinc-300">{e.id}</TableCell>
                      <TableCell className="py-2"><SeverityBadge severity={e.severity} /></TableCell>
                      <TableCell className="py-2">
                        <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-zinc-300">
                          <Icon className="h-3.5 w-3.5 text-zinc-500" />
                          <span className="font-mono text-[11px]">{e.type.replace(/_/g, ' ')}</span>
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap py-2 font-mono text-[11px] text-zinc-400">{e.cameraId}</TableCell>
                      <TableCell className="py-2 font-mono text-[11px] text-zinc-300">{e.object ?? '—'}</TableCell>
                      <TableCell className="py-2 font-mono text-[11px] tabular-nums text-zinc-300">{pct(e.confidence, 1)}</TableCell>
                      <TableCell className="py-2 font-mono text-[11px] text-emerald-500/80">{e.personTrack ? `#${e.personTrack}` : '—'}</TableCell>
                      <TableCell className="max-w-32 truncate py-2 text-xs text-zinc-400">{e.zone ?? '—'}</TableCell>
                      <TableCell className="py-2 font-mono text-[11px] tabular-nums text-zinc-400">{e.framesConfirmed}</TableCell>
                      <TableCell className="whitespace-nowrap py-2">
                        <span className="font-mono text-[10px] text-zinc-500" title={format(new Date(e.timestamp), 'MMM d HH:mm:ss')}>
                          {timeAgo(e.timestamp)}
                        </span>
                      </TableCell>
                      <TableCell className="py-2"><StatusBadge status={e.status} /></TableCell>
                    </TableRow>
                  )
                })}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-zinc-800/80 px-3 py-2">
          <span className="font-mono text-[10px] text-zinc-500">
            {total === 0 ? 'no results' : `showing ${pageStart}–${pageEnd} of ${total} · limit ${LIMIT}`}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - LIMIT))}
              className="flex items-center gap-1 rounded border border-zinc-800 px-2 py-1 font-mono text-[10px] text-zinc-400 transition-colors hover:bg-zinc-800 disabled:opacity-30"
            >
              <ChevronLeft className="h-3 w-3" /> PREV
            </button>
            <button
              disabled={pageEnd >= total}
              onClick={() => setOffset(offset + LIMIT)}
              className="flex items-center gap-1 rounded border border-zinc-800 px-2 py-1 font-mono text-[10px] text-zinc-400 transition-colors hover:bg-zinc-800 disabled:opacity-30"
            >
              NEXT <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
