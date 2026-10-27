import { spawn } from 'node:child_process';
import path from 'node:path';
import { updateRun } from './db';

export async function launchWorker(id: string, key: string, model: string) {
  try {
    const child = spawn(process.execPath, [path.join(process.cwd(), '.local', 'runtime', 'scripts', 'worker.js'), id], {
      cwd: process.cwd(), detached: true, windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'],
      // The key is sent through stdin, never command-line arguments or worker logs.
      env: { ...process.env, NVIDIA_API_KEY: '', NVIDIA_MODEL: '' },
    });
    await new Promise<void>((resolve, reject) => {
      child.once('error', reject);
      child.once('spawn', () => resolve());
    });
    child.stdin?.on('error', () => {});
    child.stdin?.end(JSON.stringify({ key, model }));
    child.once('exit', async code => {
      if (!code) return;
      try {
        const { getRun } = await import('./db');
        const run = await getRun(id);
        if (run && ['queued', 'running'].includes(run.status)) await updateRun(id, { status: 'failed', stage: 'Worker stopped unexpectedly', error: 'The local research worker exited early. Retry the report.' });
      } catch { /* A stopped app will recover the stale run through retry. */ }
    });
    child.unref();
  } catch {
    await updateRun(id, { status: 'failed', stage: 'Worker could not start', error: 'The local worker failed to launch. Check the Node.js installation, then retry.' });
  }
}
