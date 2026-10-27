import { NextResponse } from 'next/server';
import { getRun, listRuns, updateRun } from '@/lib/db';
import { launchWorker } from '@/lib/jobs';
import { getSettings } from '@/lib/settings';
import { guardLocal, apiError } from '@/lib/http';
export const runtime = 'nodejs';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    guardLocal(request);
    const run = await getRun((await context.params).id);
    if (!run) return NextResponse.json({ error: 'Report not found.' }, { status: 404 });
    const stale = ['running', 'queued'].includes(run.status) && Date.now() - Date.parse(run.updatedAt) > 15 * 60_000;
    if (run.status !== 'failed' && !stale) throw new Error('Only failed or interrupted runs can be retried.');
    const active = (await listRuns()).some(r => r.id !== run.id && ['queued', 'running'].includes(r.status) && Date.now() - Date.parse(r.updatedAt) < 15 * 60_000);
    if (active) throw new Error('Another research run is in progress.');
    const { key, model } = getSettings();
    if (!key) throw new Error('Connect your NVIDIA key in Settings first.');
    await updateRun(run.id, { status: 'queued', stage: 'Restarting research', progress: 0, sources: [], warnings: [], error: null });
    await launchWorker(run.id, key, model);
    return NextResponse.json({ id: run.id }, { status: 202 });
  } catch (error) { return apiError(error); }
}
