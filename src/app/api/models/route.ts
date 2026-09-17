import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSimulator } from '@/lib/simulator'
import { serializeModel } from '@/lib/serialize'

export const dynamic = 'force-dynamic'

export async function GET() {
  await ensureSimulator()
  const models = await db.modelVersion.findMany({ orderBy: { createdAt: 'desc' } })
  return NextResponse.json({
    models: models.map(serializeModel),
    exportPipeline: ['Training: YOLO26 .pt', 'Validation', 'Export', 'TensorRT / ONNX', 'Edge inference'],
  })
}
