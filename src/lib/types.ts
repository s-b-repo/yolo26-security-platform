// Shared API contract types (mirrors src/lib/serialize.ts + API routes)

export type Severity = 'info' | 'suspicious' | 'high' | 'critical'
export type EventStatus = 'open' | 'acknowledged' | 'dismissed' | 'escalated' | 'resolved'
export type CameraStatus = 'online' | 'degraded' | 'offline'
export type ModelTier = 'yolo26n-edge' | 'yolo26s-server' | 'yolo26l-central'
export type ZoneType = 'public' | 'restricted' | 'flow'
export type ModelStatus = 'active' | 'shadow' | 'archived' | 'training'

export interface BBox {
  x: number
  y: number
  w: number
  h: number
}

export interface ZonePolygon {
  id: string
  name: string
  type: ZoneType
  color: string
  polygon: [number, number][] // normalized 0..1
}

export interface Calibration {
  [key: string]: unknown
}

export interface Camera {
  id: string
  name: string
  location: string
  streamUrl: string
  resolution: string
  fps: number
  orientation: string
  status: string
  modelTier: string
  zones: ZonePolygon[]
  calibration: Calibration
  edgeDevice: string | null
  snapshot: string | null
  lastHeartbeat: string | null
  createdAt: string
}

// dashboard cameras.list entries are a subset
export interface CameraSummary {
  id: string
  name: string
  location: string
  status: string
  modelTier: string
  snapshot: string | null
  lastHeartbeat: string | null
}

export interface Detection {
  object: string
  confidence: number
  bbox: BBox
}

export interface TrailPoint {
  x: number
  y: number
}

export interface Evidence {
  snapshot: string | null
  clip: string | null
  artifacts: string[]
  detections: Detection[]
  trail: TrailPoint[]
}

export interface SecurityEvent {
  id: string
  cameraId: string
  type: string
  severity: Severity
  object: string | null
  personTrack: number | null
  confidence: number
  zone: string | null
  model: string
  timestamp: string
  framesConfirmed: number
  summary: string
  evidence: Evidence
  status: EventStatus
  acknowledgedBy: string | null
  acknowledgedAt: string | null
  notes: string | null
  ruleId: string | null
}

export interface Track {
  id: string
  cameraId: string
  trackNum: number
  objectType: string
  confidence: number
  framesConfirmed: number
  status: string
  currentZone: string | null
  bbox: BBox
  trail: TrailPoint[]
  firstSeen: string
  lastSeen: string
}

export interface RuleCondition {
  field: string
  op: string
  value: unknown
}

export interface Rule {
  id: string
  name: string
  description: string
  enabled: boolean
  conditions: RuleCondition[]
  action: string
  severity: Severity
  priority: number
  hits: number
  lastTriggered: string | null
  createdAt: string
}

export interface ModelVersion {
  id: string
  variant: string
  tier: string
  formats: string[]
  status: string
  metrics: Record<string, number>
  trainedAt: string | null
  datasetSize: number | null
  notes: string | null
  createdAt: string
}

export interface SystemLog {
  id: string
  ts: string
  level: string
  component: string
  message: string
}

export interface HourlyBucket {
  hour: string
  count: number
  critical: number
  high: number
  suspicious: number
  info: number
}

export interface DashboardData {
  cameras: {
    total: number
    online: number
    degraded: number
    offline: number
    list: CameraSummary[]
  }
  tracks: {
    active: number
    list: Track[]
  }
  events: {
    last24h: number
    today: number
    openBySeverity: Partial<Record<Severity, number>>
    severity24h: Record<Severity, number>
    statusBreakdown: Record<string, number>
    avgConfidence: number
    hourly: HourlyBucket[]
    recent: SecurityEvent[]
    openHighPriority: SecurityEvent[]
  }
  systemLogs: SystemLog[]
  activeModel: { id: string; variant: string; tier: string } | null
  serverTime: string
}

export interface SimulatorStatus {
  enabled: boolean
  running: boolean
  tickMs: number
  tickCount: number
  activeTracks: number
  pipeline: { stage: string; detail: string }[]
  cameraCount: number
  activeModel: string | null
}

export interface EventsResponse {
  total: number
  limit: number
  offset: number
  statusCounts: Record<string, number>
  items: SecurityEvent[]
}

export interface CameraDetailResponse {
  camera: Camera
  activeTracks: Track[]
  recentEvents: SecurityEvent[]
}

export interface EventDetailResponse {
  event: SecurityEvent
  camera: { id: string; name: string; location: string; snapshot: string | null; zones: ZonePolygon[] | string } | null
  related: SecurityEvent[]
}

export interface TracksResponse {
  total: number
  items: Track[]
}

export interface TrackDetailResponse {
  track: Track
  relatedEvents: { id: string; type: string; severity: Severity; timestamp: string; summary: string }[]
}

export interface RulesResponse {
  rules: Rule[]
}

export interface ModelsResponse {
  models: ModelVersion[]
  exportPipeline: string[]
}

// ─── Architecture spec shapes ────────────────────────────────────

export interface SpecGraphNode {
  id: string
  label: string
  kind: string
  details?: string[]
}

export interface SpecGraphEdge {
  from: string
  to: string
  label?: string
  optional?: boolean
}

export interface SpecGraph {
  title: string
  source_section?: number | string
  rationale?: string
  notes?: string
  nodes: SpecGraphNode[]
  edges: SpecGraphEdge[]
}

export interface SpecSource {
  id: string
  title: string
  url: string
  used_for: string[]
}

export interface ArchitectureSpec {
  $schema?: string
  metadata: {
    doc_id: string
    title: string
    version: string
    generated_date: string
    design_principle: string
    [key: string]: unknown
  }
  sources: SpecSource[]
  yolo26_capabilities: {
    role: string
    supported_tasks: string[]
    tracking: { available: boolean; multiple_trackers: boolean; named_options: string[]; note?: string; reid_options_available?: boolean }
    nms_free_end_to_end_detection?: { available: boolean; optional: boolean }
    export_formats: string[]
    custom_training?: boolean
    source_refs?: string[]
  }
  architecture: {
    overall_architecture: SpecGraph
    end_to_end_production: SpecGraph
    layered_model_pipeline: SpecGraph
    edge_central_pattern: {
      source_section?: number
      principle: string
      flow: string[]
      edge_behavior: string
      send_to_central_only: string[]
      benefits: string[]
    }
  }
  roadmap: {
    v1_exclusions: string[]
    build_sequence: string[]
    metrics_that_matter: string[]
    yolo26_fit: string
  }
  [key: string]: unknown
}
