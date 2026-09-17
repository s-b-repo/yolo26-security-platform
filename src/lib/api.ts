import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { paginationSchema } from '@/lib/validation'

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export function apiError(status: number, error: string) {
  return NextResponse.json({ error }, { status })
}

export function notFound(message: string) {
  return apiError(404, message)
}

export async function parseBody<T>(req: Request, schema: z.ZodType<T>): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return { ok: false, response: apiError(400, 'invalid JSON body') }
  }
  const result = schema.safeParse(raw)
  if (!result.success) return { ok: false, response: apiError(400, 'invalid request body') }
  return { ok: true, data: result.data }
}

export async function withRoute(handler: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await handler()
  } catch (err) {
    if (err instanceof ApiError) return apiError(err.status, err.message)
    if (err instanceof z.ZodError) return apiError(400, 'invalid request parameters')
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') return apiError(409, 'resource already exists')
      if (err.code === 'P2025') return apiError(404, 'resource not found')
      if (err.code === 'P2003') return apiError(409, 'resource is still referenced')
      if (['P2034', 'P2028', 'P1008', 'P2024'].includes(err.code)) return apiError(503, 'service temporarily unavailable')
    }
    return apiError(500, 'internal server error')
  }
}

export function trustedActor(req: Request): string {
  const result = z.string().trim().min(1).max(128).regex(/^[^\x00-\x1f\x7f]+$/).safeParse(req.headers.get('x-soc-user'))
  return result.success ? result.data : 'op.shift-lead'
}

export function paginationFrom(sp: URLSearchParams, defaults: { limit: number } = { limit: 60 }) {
  if (sp.getAll('limit').length > 1 || sp.getAll('offset').length > 1) throw new ApiError(400, 'invalid pagination')
  return paginationSchema.parse({ limit: sp.get('limit') ?? String(defaults.limit), offset: sp.get('offset') ?? '0' })
}
