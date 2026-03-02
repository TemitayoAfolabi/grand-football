import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import process from 'node:process';

const projectRoot = process.cwd();
const nextDir = join(projectRoot, '.next');
const pidFile = join(nextDir, 'dev-server.pid');

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function cleanupPidFile() {
  try {
    rmSync(pidFile, { force: true });
  } catch {
    // noop
  }
}

if (existsSync(pidFile)) {
  const existingPidRaw = readFileSync(pidFile, 'utf8').trim();
  const existingPid = Number.parseInt(existingPidRaw, 10);

  if (Number.isInteger(existingPid) && isProcessAlive(existingPid)) {
    console.error(`Another Next.js dev server is already running for this workspace (pid ${existingPid}).`);
    console.error('Stop it first to avoid .next chunk/runtime corruption (e.g. missing ./<id>.js modules).');
    process.exit(1);
  }

  cleanupPidFile();
}

if (!existsSync(nextDir)) {
  mkdirSync(nextDir, { recursive: true });
}

writeFileSync(pidFile, String(process.pid), 'utf8');

const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['next', 'dev'], {
  cwd: projectRoot,
  stdio: 'inherit',
});

const exitHandler = () => {
  cleanupPidFile();
};

process.on('exit', exitHandler);
process.on('SIGINT', () => {
  child.kill('SIGINT');
});
process.on('SIGTERM', () => {
  child.kill('SIGTERM');
});

child.on('exit', (code, signal) => {
  cleanupPidFile();

  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
