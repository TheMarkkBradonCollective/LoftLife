/**
 * Runs the API/realtime server and the Vite dev server together.
 *   npm run dev:full
 * Both processes share stdout; Ctrl-C stops both.
 */
import { spawn } from 'node:child_process';

const children = [];
const run = (command, args, name) => {
  const child = spawn(command, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[dev] ${name} exited with code ${code}`);
    }
  });
  children.push(child);
  return child;
};

const api = run(process.execPath, ['server/index.mjs'], 'api');
run(process.execPath, ['node_modules/vite/bin/vite.js', '--port=3000', '--host=0.0.0.0'], 'vite');

const shutdown = () => {
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
api.on('exit', (code) => {
  if (code && code !== 0) console.error('[dev] API server stopped unexpectedly');
});
