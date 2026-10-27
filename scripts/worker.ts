import { getRun, updateRun, db } from '../src/lib/db';
import { discover, retrieveSource } from '../src/lib/research';
import { analyze } from '../src/lib/nvidia';
import type { Source } from '../src/lib/schema';

async function main() {
  const id = process.argv[2];
  if (!id) throw new Error('Missing research run ID.');
  let credentials = '';
  for await (const chunk of process.stdin) credentials += chunk.toString();
  const { key, model } = JSON.parse(credentials);
  const run = await getRun(id);
  if (!run || run.status !== 'queued') return;
  try {
    await updateRun(id, { status: 'running', stage: 'Discovering competitors and market sources', progress: 10 });
    const warnings: string[] = [];
    const urls = await discover(run.input, warnings);
    await updateRun(id, { warnings });
    const sources: Source[] = [];
    if (!urls.length) throw new Error('No sources were discovered. Add relevant public source URLs and retry.');
    for (let i = 0; i < urls.length; i++) {
      await updateRun(id, { stage: `Reading source ${i + 1} of ${urls.length}`, progress: 20 + Math.round(i / urls.length * 40) });
      try {
        const source = await retrieveSource(urls[i], `S${sources.length + 1}`, run.input.sourceUrls.includes(urls[i]));
        if (!sources.some(s => s.url === source.url)) sources.push(source);
      } catch (error) {
        warnings.push(`${urls[i]} — ${error instanceof Error ? error.message : 'Could not retrieve this source.'}`);
      }
      await updateRun(id, { sources, warnings });
    }
    if (!sources.length) throw new Error('No readable evidence could be retrieved. Add accessible public URLs; blocked and private pages cannot be used.');
    if (sources.length < 3) warnings.push('Fewer than three sources were retrieved. Treat conclusions as preliminary.');
    await updateRun(id, { stage: `Analyzing evidence with ${model.split('/')[1]}`, progress: 72, warnings });
    const report = await analyze(run.input, sources, key, model);
    await updateRun(id, { stage: 'Report ready', progress: 100, status: 'completed', report, warnings, error: null });
  } catch (error) {
    await updateRun(id, { status: 'failed', stage: 'Research paused', error: error instanceof Error ? error.message : 'Research failed.' });
  }
}
main().catch(() => { process.exitCode = 1; }).finally(() => db.$disconnect());
