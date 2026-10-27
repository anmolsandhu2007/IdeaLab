import { NextResponse } from 'next/server';
import { inputSchema } from '@/lib/schema';
import { createRun, listRuns } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { launchWorker } from '@/lib/jobs';
import { guardLocal, apiError, readJson } from '@/lib/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try { guardLocal(request); return NextResponse.json(await listRuns()); } catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try {
    guardLocal(request);
    const input = inputSchema.parse(await readJson(request));
    const { key, model } = getSettings();
    if (!key) return NextResponse.json({ error: 'Connect your NVIDIA API key in Settings before starting live research.' }, { status: 409 });
    const active = (await listRuns()).some(r => ['queued', 'running'].includes(r.status) && Date.now() - Date.parse(r.updatedAt) < 15 * 60_000);
    if (active) return NextResponse.json({ error: 'A research run is already in progress. Wait for it to finish.' }, { status: 409 });
    const run = await createRun(input);
    await launchWorker(run.id, key, model);
    return NextResponse.json(run, { status: 202 });
  } catch (error) { return apiError(error); }
}
