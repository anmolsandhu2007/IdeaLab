import { spawnSync } from 'node:child_process';
import './build-worker.mjs';
const result = spawnSync(process.execPath, ['--test', '.local/runtime/tests/research.test.js'], { stdio: 'inherit' });
process.exitCode = result.status ?? 1;
