import { NextResponse } from 'next/server';
import { getRun } from '@/lib/db';
import { apiError, guardLocal } from '@/lib/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    guardLocal(request);
    const run = await getRun((await context.params).id);
    return run ? NextResponse.json(run) : NextResponse.json({ error: 'Report not found.' }, { status: 404 });
  } catch (error) { return apiError(error); }
}
