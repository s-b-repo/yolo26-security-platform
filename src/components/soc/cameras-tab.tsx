'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Cctv, MapPin, Plus, Radar, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { useCameraDetail, useCameraPatch, useCameras, useSimulatorAction } from '@/hooks/use-soc'
import { ZONE_META, timeAgo } from '@/lib/soc'
import type { Camera, ZonePolygon } from '@/lib/types'
import { EventDetailDialog } from '@/components/soc/event-detail-dialog'
import { CameraStatusBadge, EmptyState, SectionLabel, SeverityBadge, TierChip, ZoneTypeChip } from '@/components/soc/bits'
import { TrackBBoxOverlay, ZonePolyOverlay } from '@/components/soc/overlays'

// ─── Camera grid card ─────────────────────────────────────────────

function CameraCard({ camera, onClick }: { camera: Camera; onClick: () => void }) {
  return (
    <Card
      onClick={onClick}
      className="group cursor-pointer overflow-hidden border-zinc-800 bg-zinc-900/60 p-0 transition-colors hover:border-zinc-600"
    >
      <div className="scanlines relative aspect-video overflow-hidden bg-black">
        {camera.snapshot ? (
          <img
            src={camera.snapshot}
            alt={camera.name}
            className="h-full w-full object-cover opacity-85 transition-opacity group-hover:opacity-100"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-zinc-700">NO SIGNAL</div>
        )}
        {camera.status === 'offline' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <span className="font-mono text-xs tracking-[0.3em] text-red-400">OFFLINE</span>
          </div>
        )}
        <div className="absolute left-2 top-2">
          <CameraStatusBadge status={camera.status} />
        </div>
        <div className="absolute right-2 top-2">
          <TierChip tier={camera.modelTier} />
        </div>
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/90 to-transparent px-2.5 pb-1.5 pt-6">
          <span className="font-mono text-[10px] text-zinc-300">{camera.id}</span>
          <span className="font-mono text-[9px] text-zinc-500">{camera.fps} fps</span>
        </div>
      </div>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-medium text-zinc-100">{camera.name}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">{camera.location}</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {camera.zones.slice(0, 3).map((z) => (
            <span key={z.id} className={`rounded border px-1.5 py-px text-[10px] ${ZONE_META[z.type]?.badge ?? 'border-zinc-700 text-zinc-400'}`}>
              {z.name}
            </span>
          ))}
          {camera.zones.length > 3 && <span className="font-mono text-[10px] text-zinc-600">+{camera.zones.length - 3}</span>}
        </div>
        <div className="flex items-center justify-between border-t border-zinc-800/70 pt-2 font-mono text-[10px] text-zinc-500">
          <span>
            {camera.resolution} · {camera.orientation}
          </span>
          <span>hb {timeAgo(camera.lastHeartbeat)}</span>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Camera detail dialog ─────────────────────────────────────────

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

function CameraDetailDialog({ cameraId, onClose, onOpenEvent }: { cameraId: string | null; onClose: () => void; onOpenEvent: (id: string) => void }) {
  const { data, isLoading } = useCameraDetail(cameraId)
  const patch = useCameraPatch()
  const sim = useSimulatorAction()

  const [zoneName, setZoneName] = useState('New Restricted Zone')
  const [zx, setZx] = useState('0.35')
  const [zy, setZy] = useState('0.30')
  const [zw, setZw] = useState('0.30')
  const [zh, setZh] = useState('0.35')
  const [zonePendingDelete, setZonePendingDelete] = useState<ZonePolygon | null>(null)

  const camera = data?.camera

  function patchBody(body: Record<string, unknown>, msg: string) {
    if (!camera) return
    patch.mutate(
      { id: camera.id, body },
      {
        onSuccess: () => toast.success(msg),
        onError: (err) => toast.error('Update failed', { description: err.message }),
      }
    )
  }

  function addZone() {
    if (!camera) return
    const x = clamp01(Number(zx) || 0)
    const y = clamp01(Number(zy) || 0)
    const w = clamp01(Number(zw) || 0.2)
    const h = clamp01(Number(zh) || 0.3)
    if (w <= 0 || h <= 0) {
      toast.error('Zone width/height must be > 0')
      return
    }
    const zone: ZonePolygon = {
      id: `zone-${Date.now()}`,
      name: zoneName.trim() || 'Restricted Zone',
      type: 'restricted',
      color: '#ef4444',
      polygon: [
        [x, y],
        [clamp01(x + w), y],
        [clamp01(x + w), clamp01(y + h)],
        [x, clamp01(y + h)],
      ],
    }
    patchBody({ zones: [...camera.zones, zone] }, `Zone “${zone.name}” added`)
  }

  function deleteZone(zone: ZonePolygon) {
    if (!camera) return
    patchBody({ zones: camera.zones.filter((z) => z.id !== zone.id) }, `Zone “${zone.name}” deleted`)
    setZonePendingDelete(null)
  }

  return (
    <Dialog open={!!cameraId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto border-zinc-800 bg-zinc-950 soc-scroll">
        {isLoading || !camera ? (
          <div className="space-y-4 p-2">
            <Skeleton className="h-7 w-56 bg-zinc-800" />
            <Skeleton className="aspect-video w-full bg-zinc-800/70" />
            <Skeleton className="h-32 w-full bg-zinc-800/70" />
          </div>
        ) : (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2 font-mono text-base">
                <Cctv className="h-4 w-4 text-zinc-400" />
                <span className="text-zinc-100">{camera.name}</span>
                <span className="text-xs text-zinc-500">{camera.id}</span>
                <CameraStatusBadge status={camera.status} />
                <TierChip tier={camera.modelTier} />
              </DialogTitle>
              <DialogDescription className="flex items-center gap-1.5 text-xs text-zinc-500">
                <MapPin className="h-3 w-3" /> {camera.location} · heartbeat {timeAgo(camera.lastHeartbeat)}
              </DialogDescription>
            </DialogHeader>

            {/* Snapshot + zone polygons + live bboxes */}
            <div className="space-y-2">
              <SectionLabel>Live view · zones & active tracks</SectionLabel>
              <div className="scanlines relative aspect-video overflow-hidden rounded-md border border-zinc-800 bg-black">
                {camera.snapshot ? (
                  <img src={camera.snapshot} alt={camera.name} className="h-full w-full object-cover opacity-90" />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-zinc-600">no snapshot available</div>
                )}
                <ZonePolyOverlay zones={camera.zones} />
                <TrackBBoxOverlay tracks={data.activeTracks} />
                <span className="absolute right-1.5 top-1.5 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[9px] text-emerald-400">
                  <span className="animate-soc-dot h-1.5 w-1.5 rounded-full bg-emerald-500" /> LIVE
                </span>
              </div>
              {/* Zone legend */}
              <div className="flex flex-wrap gap-1.5">
                {camera.zones.map((z) => (
                  <span key={z.id} className={`inline-flex items-center gap-1 rounded border px-1.5 py-px text-[10px] ${ZONE_META[z.type]?.badge ?? 'border-zinc-700 text-zinc-400'}`}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: z.color }} />
                    {z.name} · {z.type}
                  </span>
                ))}
                {camera.zones.length === 0 && <span className="font-mono text-[10px] text-zinc-600">no zones configured</span>}
              </div>
            </div>

            {/* Controls */}
            <div className="flex flex-wrap items-center gap-3 rounded-md border border-zinc-800 bg-zinc-900/50 p-3">
              <div className="space-y-1">
                <Label className="text-[9px] uppercase tracking-[0.16em] text-zinc-500">Status</Label>
                <Select value={camera.status} onValueChange={(v) => patchBody({ status: v }, `Camera set to ${v}`)}>
                  <SelectTrigger className="h-8 w-32 border-zinc-800 bg-zinc-950/60 font-mono text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-zinc-800 bg-zinc-950">
                    <SelectItem value="online">online</SelectItem>
                    <SelectItem value="degraded">degraded</SelectItem>
                    <SelectItem value="offline">offline</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[9px] uppercase tracking-[0.16em] text-zinc-500">Model tier</Label>
                <Select value={camera.modelTier} onValueChange={(v) => patchBody({ modelTier: v }, `Model tier → ${v}`)}>
                  <SelectTrigger className="h-8 w-40 border-zinc-800 bg-zinc-950/60 font-mono text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-zinc-800 bg-zinc-950">
                    <SelectItem value="yolo26n-edge">yolo26n-edge</SelectItem>
                    <SelectItem value="yolo26s-server">yolo26s-server</SelectItem>
                    <SelectItem value="yolo26l-central">yolo26l-central</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="ml-auto">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="outline" className="h-9 border-red-500/50 font-mono text-[11px] tracking-wider text-red-400 hover:bg-red-500/15 hover:text-red-300">
                      <Radar className="mr-1.5 h-3.5 w-3.5" /> SIMULATE ARMED THREAT
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="border-zinc-800 bg-zinc-950">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="font-mono">Inject firearm scenario on {camera.id}?</AlertDialogTitle>
                      <AlertDialogDescription className="text-zinc-400">
                        The pipeline simulator will spawn a firearm + person on this camera. Expect a verified CRITICAL
                        <span className="font-mono"> weapon_person_association </span> event within ~15 seconds.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="border-zinc-800 bg-transparent text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200">Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-red-500/15 text-red-300 hover:bg-red-500/25"
                        onClick={() =>
                          sim.mutate(
                            { action: 'inject_weapon', cameraId: camera.id },
                            {
                              onSuccess: () => toast.success(`Firearm injection queued on ${camera.id}`, { description: 'Watch the dashboard for the resulting CRITICAL event.' }),
                              onError: (err) => toast.error('Injection failed', { description: err.message }),
                            }
                          )
                        }
                      >
                        Inject threat
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>

            {/* Zone editor */}
            <div className="space-y-2 rounded-md border border-zinc-800 bg-zinc-900/50 p-3">
              <div className="flex items-center justify-between">
                <SectionLabel>Zone editor</SectionLabel>
                <span className="font-mono text-[10px] text-zinc-600">{camera.zones.length} zone(s)</span>
              </div>
              <div className="space-y-1">
                {camera.zones.map((z) => (
                  <div key={z.id} className="flex items-center gap-2 rounded border border-zinc-800/70 bg-zinc-950/50 px-2 py-1">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: z.color }} />
                    <span className="min-w-0 flex-1 truncate text-xs text-zinc-200">{z.name}</span>
                    <ZoneTypeChip type={z.type} />
                    <span className="hidden font-mono text-[9px] text-zinc-600 sm:inline">{z.polygon.length} pts</span>
                    <AlertDialog open={zonePendingDelete?.id === z.id} onOpenChange={(o) => setZonePendingDelete(o ? z : null)}>
                      <AlertDialogTrigger asChild>
                        <button className="rounded p-0.5 text-zinc-600 transition-colors hover:bg-red-500/10 hover:text-red-400" title={`Delete ${z.name}`}>
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="border-zinc-800 bg-zinc-950">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="font-mono">Delete zone “{z.name}”?</AlertDialogTitle>
                          <AlertDialogDescription className="text-zinc-400">
                            Rules referencing this zone will stop matching. This takes effect immediately.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="border-zinc-800 bg-transparent text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200">Cancel</AlertDialogCancel>
                          <AlertDialogAction className="bg-red-500/15 text-red-300 hover:bg-red-500/25" onClick={() => deleteZone(z)}>
                            Delete zone
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                ))}
              </div>

              {/* Add rectangular restricted zone */}
              <Separator className="bg-zinc-800" />
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-36 flex-1 space-y-1">
                  <Label className="text-[9px] uppercase tracking-[0.16em] text-zinc-500">Zone name</Label>
                  <Input value={zoneName} onChange={(e) => setZoneName(e.target.value)} className="h-8 border-zinc-800 bg-zinc-950/60 text-xs" />
                </div>
                {(
                  [
                    ['x', zx, setZx],
                    ['y', zy, setZy],
                    ['w', zw, setZw],
                    ['h', zh, setZh],
                  ] as const
                ).map(([label, val, set]) => (
                  <div key={label} className="w-16 space-y-1">
                    <Label className="text-[9px] uppercase tracking-[0.16em] text-zinc-500">{label}</Label>
                    <Input
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      value={val}
                      onChange={(e) => set(e.target.value)}
                      className="h-8 border-zinc-800 bg-zinc-950/60 px-2 font-mono text-xs"
                    />
                  </div>
                ))}
                <Button size="sm" onClick={addZone} disabled={patch.isPending} className="h-8 bg-emerald-500/15 font-mono text-[11px] tracking-wider text-emerald-300 hover:bg-emerald-500/25">
                  <Plus className="mr-1 h-3.5 w-3.5" /> ADD
                </Button>
              </div>
              <p className="text-[10px] leading-relaxed text-zinc-600">
                Rectangular restricted zone from normalized coords (0–1). Polygon corners: (x,y) → (x+w,y) → (x+w,y+h) → (x,y+h).
              </p>
            </div>

            {/* Metadata table */}
            <div className="rounded-md border border-zinc-800 bg-zinc-900/50 p-3">
              <SectionLabel className="mb-2">Metadata</SectionLabel>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 font-mono text-[11px] sm:grid-cols-3">
                {[
                  ['streamUrl', camera.streamUrl],
                  ['resolution', camera.resolution],
                  ['fps', String(camera.fps)],
                  ['orientation', camera.orientation],
                  ['edgeDevice', camera.edgeDevice ?? '—'],
                  ['calibration', JSON.stringify(camera.calibration)],
                ].map(([k, v]) => (
                  <div key={k} className="min-w-0">
                    <span className="block text-[9px] uppercase tracking-[0.14em] text-zinc-600">{k}</span>
                    <span className="block truncate text-zinc-300" title={v}>
                      {v}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent events */}
            <div className="space-y-1.5">
              <SectionLabel>Recent events · {camera.id}</SectionLabel>
              {data.recentEvents.length === 0 ? (
                <div className="rounded-md border border-dashed border-zinc-800 p-3 text-center text-xs text-zinc-600">no events for this camera</div>
              ) : (
                data.recentEvents.slice(0, 5).map((e) => (
                  <button
                    key={e.id}
                    onClick={() => onOpenEvent(e.id)}
                    className="flex w-full items-center gap-2 rounded border border-zinc-800/70 bg-zinc-950/40 px-2 py-1.5 text-left transition-colors hover:border-zinc-700 hover:bg-zinc-900/60"
                  >
                    <SeverityBadge severity={e.severity} />
                    <span className="min-w-0 flex-1 truncate text-xs text-zinc-300">{e.summary}</span>
                    <span className="shrink-0 font-mono text-[10px] text-zinc-600">{timeAgo(e.timestamp)}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Tab root ─────────────────────────────────────────────────────

export function CamerasTab({
  focusCameraId,
  onClearFocus,
}: {
  focusCameraId: string | null
  onClearFocus: () => void
}) {
  const { data, isLoading } = useCameras(8000)
  const [selected, setSelected] = useState<string | null>(null)
  const [eventId, setEventId] = useState<string | null>(null)

  useEffect(() => {
    if (!focusCameraId) return
    const t = setTimeout(() => {
      setSelected(focusCameraId)
      onClearFocus()
    }, 0)
    return () => clearTimeout(t)
  }, [focusCameraId, onClearFocus])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-zinc-200">Camera Layer</h2>
          <p className="text-xs text-zinc-500">
            {data?.cameras.length ?? 0} feeds · RTSP / ONVIF ingestion · tiered YOLO26 inference at the edge
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-64 animate-pulse rounded-lg border border-zinc-800 bg-zinc-900/50" />
          ))}
        </div>
      ) : (data?.cameras.length ?? 0) === 0 ? (
        <EmptyState icon={Cctv} title="No cameras registered" />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {(data?.cameras ?? []).map((c) => (
            <CameraCard key={c.id} camera={c} onClick={() => setSelected(c.id)} />
          ))}
        </div>
      )}

      <CameraDetailDialog cameraId={selected} onClose={() => setSelected(null)} onOpenEvent={(id) => setEventId(id)} />
      <EventDetailDialog eventId={eventId} onClose={() => setEventId(null)} />
    </div>
  )
}
