import { NextResponse } from 'next/server'
import spec from '@/data/yolo26-spec.json'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(spec)
}
