import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import './build-worker.mjs';
const files = readdirSync('.local/runtime/tests').filter(name => name.endsWith('.test.js'))
  .map(name => `.local/runtime/tests/${name}`);
const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exitCode = result.status ?? 1;
