import { z } from 'zod'

const pageInteger = (min: number, max: number) => z.string().regex(/^\d{1,6}$/).transform(Number).pipe(z.number().int().min(min).max(max))

export const paginationSchema = z.strictObject({
  limit: pageInteger(1, 200).default(60),
  offset: pageInteger(0, 100_000).default(0),
})

const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/

export const zodId = z.string().trim().min(1).max(64).regex(idPattern, 'invalid id format')

export const severityEnum = z.enum(['info', 'suspicious', 'high', 'critical'])
export const eventStatusEnum = z.enum(['open', 'acknowledged', 'dismissed', 'escalated', 'resolved'])
export const cameraStatusEnum = z.enum(['online', 'degraded', 'offline'])
export const modelTierEnum = z.enum(['yolo26n-edge', 'yolo26s-server', 'yolo26l-central'])
export const modelStatusEnum = z.enum(['active', 'shadow', 'archived', 'training'])
export const orientationEnum = z.enum(['fixed-dome', 'fixed-bullet', 'ptz', 'fisheye'])
export const ruleFieldEnum = z.enum(['objectType', 'confidence', 'framesConfirmed', 'associatedPerson', 'zoneType', 'zoneName', 'zoneDwellSeconds', 'afterHours'])
export const ruleOpEnum = z.enum(['==', '!=', '>', '>=', '<', 'in', 'exists', 'missing'])
export const ruleActionEnum = z.enum(['raise_alert', 'notify_security', 'escalate_immediately', 'lockdown_zone'])

export const bboxSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
})

export const zonePolygonSchema = z.strictObject({
  id: zodId,
  name: z.string().trim().min(1).max(80),
  type: z.enum(['public', 'restricted', 'flow']),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  polygon: z.array(z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)])).min(3).max(256),
})

const zonesSchema = z.array(zonePolygonSchema).max(64).refine((zones) => new Set(zones.map((zone) => zone.id)).size === zones.length)
const resolutionSchema = z.string().regex(/^[1-9]\d{1,4}x[1-9]\d{1,4}$/)
const streamSchema = z.string().max(2048).refine((value) => {
  try {
    const url = new URL(value)
    return ['rtsp:', 'rtsps:', 'http:', 'https:'].includes(url.protocol) && !!url.hostname
  } catch {
    return false
  }
})
const snapshotSchema = z.string().max(512).refine((value) => /^\/(?!\/)[^\s\\]*$/.test(value) || z.url({ protocol: /^https?$/ }).safeParse(value).success)
export const calibrationSchema = z.record(z.string().min(1).max(64), z.json()).refine((value) => JSON.stringify(value).length <= 8192)

export const cameraCreateSchema = z
  .object({
    id: zodId,
    name: z.string().trim().min(1).max(120),
    location: z.string().trim().min(1).max(120).optional(),
    streamUrl: streamSchema.optional(),
    resolution: resolutionSchema.optional(),
    fps: z.number().int().min(1).max(120).optional(),
    orientation: orientationEnum.optional(),
    modelTier: modelTierEnum.optional(),
    zones: zonesSchema.optional(),
    calibration: calibrationSchema.optional(),
    edgeDevice: z.string().trim().max(80).nullable().optional(),
    snapshot: snapshotSchema.nullable().optional(),
  })
  .strict()

export const cameraPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    location: z.string().trim().min(1).max(120).optional(),
    status: cameraStatusEnum.optional(),
    modelTier: modelTierEnum.optional(),
    zones: zonesSchema.optional(),
    fps: z.number().int().min(1).max(120).optional(),
    resolution: resolutionSchema.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'at least one field is required')

export const eventPatchSchema = z
  .object({
    status: eventStatusEnum.optional(),
    notes: z.string().max(4000).nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'at least one field is required')

export const ruleConditionSchema = z
  .object({
    field: ruleFieldEnum,
    op: ruleOpEnum,
    value: z.union([z.string().trim().min(1).max(200), z.number(), z.boolean(), z.array(z.string().trim().min(1).max(200)).min(1).max(50), z.null()]),
  })
  .strict()
  .refine(({ field, op, value }) => {
    if (op === 'exists' || op === 'missing') return value === null || typeof value === 'boolean'
    if (op === 'in') return Array.isArray(value)
    const numeric = ['confidence', 'framesConfirmed', 'associatedPerson', 'zoneDwellSeconds'].includes(field)
    if (['>', '>=', '<'].includes(op) && !numeric) return false
    if (numeric) {
      if (typeof value !== 'number' || value < 0) return false
      if (field === 'confidence') return value <= 1
      return Number.isSafeInteger(value) && value <= 2_147_483_647
    }
    if (field === 'afterHours') return typeof value === 'boolean'
    if (field === 'zoneType') return ['public', 'restricted', 'flow'].includes(String(value))
    return typeof value === 'string'
  }, 'invalid condition value')

export const ruleCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().max(1000).optional(),
    enabled: z.boolean().optional(),
    conditions: z.array(ruleConditionSchema).min(1).max(32),
    action: ruleActionEnum.optional(),
    severity: severityEnum.optional(),
    priority: z.number().int().min(1).max(3).optional(),
  })
  .strict()

export const rulePatchSchema = z
  .object({
    enabled: z.boolean().optional(),
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().max(1000).optional(),
    severity: severityEnum.optional(),
    action: ruleActionEnum.optional(),
    priority: z.number().int().min(1).max(3).optional(),
    conditions: z.array(ruleConditionSchema).min(1).max(32).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'at least one field is required')

export const modelPatchSchema = z
  .object({
    status: modelStatusEnum,
  })
  .strict()

export type CameraCreateInput = z.infer<typeof cameraCreateSchema>
export type CameraPatchInput = z.infer<typeof cameraPatchSchema>
export type EventPatchInput = z.infer<typeof eventPatchSchema>
export type RuleCreateInput = z.infer<typeof ruleCreateSchema>
export type RulePatchInput = z.infer<typeof rulePatchSchema>
export type ModelPatchInput = z.infer<typeof modelPatchSchema>
export type RuleCondition = z.infer<typeof ruleConditionSchema>
