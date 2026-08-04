import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';

async function isPortAvailable(port) {
  return new Promise((resolvePromise) => {
    const server = createServer();
    server.once('error', () => resolvePromise(false));
    server.once('listening', () => {
      server.close(() => resolvePromise(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

async function findAvailablePort(startPort) {
  for (let port = startPort; port < startPort + 20; port += 1) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No replay port is available between ${startPort} and ${startPort + 19}.`);
}

async function waitForUrl(url, child, getLogs, getSpawnError) {
  const deadline = Date.now() + 120_000;

  while (Date.now() < deadline) {
    if (getSpawnError()) {
      throw new Error(`Expo could not start.\n${getSpawnError().message}`);
    }
    if (child.exitCode !== null) {
      throw new Error(`Expo exited before it was ready.\n${getLogs()}`);
    }

    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // The dev server is still starting.
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000));
  }

  throw new Error(`Expo did not become ready within 120 seconds.\n${getLogs()}`);
}

async function stopProcessGroup(child) {
  if (child.exitCode !== null || !child.pid) {
    return;
  }

  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }

  await Promise.race([
    new Promise((resolvePromise) => child.once('close', resolvePromise)),
    new Promise((resolvePromise) => setTimeout(resolvePromise, 5000)),
  ]);

  if (child.exitCode === null) {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
  }
}

export async function withExpoWebServer(
  { worktree, port, env = {}, inheritEnv = true },
  operation,
) {
  const expoPath = resolve(worktree, 'node_modules/.bin/expo');
  if (!existsSync(expoPath)) {
    throw new Error(`Expo executable not found: ${expoPath}`);
  }

  const availablePort = await findAvailablePort(port);
  const chunks = [];
  const child = spawn(expoPath, ['start', '--web', '--port', String(availablePort)], {
    cwd: worktree,
    detached: true,
    env: {
      ...(inheritEnv ? process.env : {}),
      ...env,
      BROWSER: 'none',
      CI: '1',
      EXPO_PUBLIC_QA_MODE: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const collect = (chunk) => {
    chunks.push(chunk);
    while (Buffer.concat(chunks).byteLength > 64 * 1024) {
      chunks.shift();
    }
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  const getLogs = () => Buffer.concat(chunks).toString('utf8');
  let spawnError;
  child.once('error', (error) => {
    spawnError = error;
  });
  const url = `http://127.0.0.1:${availablePort}`;

  try {
    await waitForUrl(url, child, getLogs, () => spawnError);
    return await operation(url);
  } finally {
    await stopProcessGroup(child);
  }
}
