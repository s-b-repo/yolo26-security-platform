'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ArchitectureSpec,
  CameraDetailResponse,
  DashboardData,
  EventDetailResponse,
  EventsResponse,
  ModelVersion,
  ModelsResponse,
  Rule,
  RulesResponse,
  SecurityEvent,
  SimulatorStatus,
  TrackDetailResponse,
  TracksResponse,
} from '@/lib/types'

export const POLL_MS = 3000

export async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`)
  return (await res.json()) as T
}

export async function sendJson<T>(url: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `${method} ${url} → ${res.status}`)
  return data
}

// ─── Queries ──────────────────────────────────────────────────────

export interface EventFilters {
  severity: string
  status: string
  cameraId: string
  q: string
}

export function eventsQueryString(f: EventFilters, limit: number, offset: number): string {
  const sp = new URLSearchParams()
  if (f.severity && f.severity !== 'all') sp.set('severity', f.severity)
  if (f.status && f.status !== 'all') sp.set('status', f.status)
  if (f.cameraId && f.cameraId !== 'all') sp.set('cameraId', f.cameraId)
  if (f.q.trim()) sp.set('q', f.q.trim())
  sp.set('limit', String(limit))
  sp.set('offset', String(offset))
  return sp.toString()
}

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: () => getJson<DashboardData>('/api/dashboard'),
    refetchInterval: POLL_MS,
  })
}

export function useSimulator() {
  return useQuery({
    queryKey: ['simulator'],
    queryFn: () => getJson<SimulatorStatus>('/api/simulator'),
    refetchInterval: POLL_MS,
  })
}

export function useCameras(intervalMs = 10000) {
  return useQuery({
    queryKey: ['cameras'],
    queryFn: () => getJson<{ cameras: import('@/lib/types').Camera[] }>('/api/cameras'),
    refetchInterval: intervalMs,
  })
}

export function useCameraDetail(id: string | null) {
  return useQuery({
    queryKey: ['camera', id],
    queryFn: () => getJson<CameraDetailResponse>(`/api/cameras/${id}`),
    enabled: !!id,
    refetchInterval: POLL_MS,
  })
}

export function useEvents(filters: EventFilters, limit: number, offset: number) {
  return useQuery({
    queryKey: ['events', filters, limit, offset],
    queryFn: () => getJson<EventsResponse>(`/api/events?${eventsQueryString(filters, limit, offset)}`),
    refetchInterval: POLL_MS,
    placeholderData: (prev) => prev,
  })
}

export function useEventDetail(id: string | null) {
  return useQuery({
    queryKey: ['event', id],
    queryFn: () => getJson<EventDetailResponse>(`/api/events/${id}`),
    enabled: !!id,
    refetchInterval: POLL_MS,
  })
}

export function useTracks(status: string) {
  return useQuery({
    queryKey: ['tracks', status],
    queryFn: () => getJson<TracksResponse>(`/api/tracks?status=${encodeURIComponent(status)}&limit=120`),
    refetchInterval: POLL_MS,
    placeholderData: (prev) => prev,
  })
}

export function useTrackDetail(id: string | null) {
  return useQuery({
    queryKey: ['track', id],
    queryFn: () => getJson<TrackDetailResponse>(`/api/tracks/${id}`),
    enabled: !!id,
    refetchInterval: POLL_MS,
  })
}

export function useRules() {
  return useQuery({
    queryKey: ['rules'],
    queryFn: () => getJson<RulesResponse>('/api/rules'),
    refetchInterval: 15000,
  })
}

export function useModels() {
  return useQuery({
    queryKey: ['models'],
    queryFn: () => getJson<ModelsResponse>('/api/models'),
    refetchInterval: 15000,
  })
}

export function useArchitecture() {
  return useQuery({
    queryKey: ['architecture'],
    queryFn: () => getJson<ArchitectureSpec>('/api/architecture'),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })
}

// ─── Mutations ────────────────────────────────────────────────────

function useInvalidateAll() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries()
}

export function useEventAction() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: (vars: { id: string; status: string; notes?: string; acknowledgedBy?: string }) =>
      sendJson<{ event: SecurityEvent }>(`/api/events/${vars.id}`, 'PATCH', {
        status: vars.status,
        notes: vars.notes,
      }),
    onSuccess: () => invalidate(),
  })
}

export function useCameraPatch() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: (vars: { id: string; body: Record<string, unknown> }) =>
      sendJson<{ camera: import('@/lib/types').Camera }>(`/api/cameras/${vars.id}`, 'PATCH', vars.body),
    onSuccess: () => invalidate(),
  })
}

export function useSimulatorAction() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: (vars: { action: string; cameraId?: string }) =>
      sendJson<{ ok?: boolean; cameraId?: string; error?: string }>('/api/simulator', 'POST', vars),
    onSuccess: () => invalidate(),
  })
}

export function useRuleCreate() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => sendJson<{ rule: Rule }>('/api/rules', 'POST', body),
    onSuccess: () => invalidate(),
  })
}

export function useRulePatch() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: (vars: { id: string; body: Record<string, unknown> }) =>
      sendJson<{ rule: Rule }>(`/api/rules/${vars.id}`, 'PATCH', vars.body),
    onSuccess: () => invalidate(),
  })
}

export function useRuleDelete() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: (id: string) => sendJson<{ ok: boolean }>(`/api/rules/${id}`, 'DELETE'),
    onSuccess: () => invalidate(),
  })
}

export function useModelStatusPatch() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: (vars: { id: string; status: string }) =>
      sendJson<{ model: ModelVersion }>(`/api/models/${vars.id}`, 'PATCH', { status: vars.status }),
    onSuccess: () => invalidate(),
  })
}
