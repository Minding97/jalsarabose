import { spawn } from 'node:child_process';

const MAX_CAPTURE_BYTES = 2 * 1024 * 1024;

function appendBounded(chunks, chunk) {
  chunks.push(chunk);
  let size = chunks.reduce((total, entry) => total + entry.byteLength, 0);
  while (size > MAX_CAPTURE_BYTES && chunks.length > 1) {
    size -= chunks.shift().byteLength;
  }
}

export async function runCommand(command, args, options = {}) {
  const output = [];
  const errors = [];

  const child = spawn(command, args, {
    cwd: options.cwd,
    detached: process.platform !== 'win32',
    env: { ...process.env, ...options.env },
    stdio: options.inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
  });
  let timedOut = false;
  const timeout = options.timeoutMs
    ? setTimeout(() => {
        timedOut = true;
        try {
          process.kill(-child.pid, 'SIGTERM');
        } catch {
          child.kill('SIGTERM');
        }
      }, options.timeoutMs)
    : null;

  if (!options.inherit) {
    child.stdout.on('data', (chunk) => appendBounded(output, chunk));
    child.stderr.on('data', (chunk) => appendBounded(errors, chunk));
  }

  const exitCode = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });
  if (timeout) {
    clearTimeout(timeout);
  }
  const stdout = Buffer.concat(output).toString('utf8');
  const stderr = Buffer.concat(errors).toString('utf8');

  if ((exitCode !== 0 || timedOut) && !options.allowFailure) {
    const detail = options.sensitive ? 'Output omitted.' : stderr || stdout;
    const invocation = options.sensitive ? command : `${command} ${args.join(' ')}`;
    throw new Error(
      `${invocation} failed (${timedOut ? 'timeout' : exitCode}).\n${detail}`.trim(),
    );
  }

  return { exitCode, stdout, stderr, timedOut };
}
