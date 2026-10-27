import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guardLocal, apiError, readJson } from '@/lib/http';
import { getSettings, publicSettings, saveSettings } from '@/lib/settings';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try { guardLocal(request); return NextResponse.json(publicSettings()); } catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try {
    guardLocal(request);
    const value = z.object({ key: z.string().trim().max(500).optional(), model: z.string().trim().regex(/^(nvidia|google)\/[a-zA-Z0-9._-]+$/, 'Use a NVIDIA or Google model ID from the NVIDIA API catalog.') }).parse(await readJson(request));
    const key = value.key || getSettings().key;
    if (!key) throw new Error('Enter your NVIDIA API key.');
    saveSettings(key, value.model);
    return NextResponse.json(publicSettings());
  } catch (error) { return apiError(error); }
}
