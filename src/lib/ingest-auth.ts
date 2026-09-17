import { createHash, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'

export function authorizeIngest(req: Request): NextResponse | null {
  const token = process.env.INGEST_TOKEN
  if (!token || token.length < 32) return NextResponse.json({ error: 'ingest is not configured' }, { status: 503 })
  const actual = req.headers.get('authorization') ?? ''
  if (actual.length > 4096 || !timingSafeEqual(createHash('sha256').update(actual).digest(), createHash('sha256').update(`Bearer ${token}`).digest())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (req.headers.has('origin')) return NextResponse.json({ error: 'machine endpoint only' }, { status: 403 })
  return null
}
