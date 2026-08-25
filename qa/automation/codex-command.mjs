import { runCommand } from './command.mjs';

export function buildCodexEnvironment(source = process.env) {
  const environment = { ...source };
  // CODEX_HOME is process-local configuration state.  Agent hosts such as
  // OpenClaw set it to an isolated, unauthenticated directory, which must not
  // override the operator's normal ~/.codex login for scheduled automation.
  delete environment.CODEX_HOME;
  return environment;
}

export function buildCodexExecArgs({ worktree, schemaPath, resultPath, prompt, sandbox = 'workspace-write' }) {
  return [
    'exec',
    '-C',
    worktree,
    '-s',
    sandbox,
    '-c',
    'approval_policy="never"',
    '--output-schema',
    schemaPath,
    '-o',
    resultPath,
    prompt,
  ];
}

export function runCodexCommand({
  codexPath,
  worktree,
  schemaPath,
  resultPath,
  prompt,
  sandbox,
}) {
  return runCommand(
    codexPath,
    buildCodexExecArgs({ worktree, schemaPath, resultPath, prompt, sandbox }),
    {
      cwd: worktree,
      env: buildCodexEnvironment(),
      inheritEnv: false,
      sensitive: true,
      timeoutMs: 90 * 60 * 1000,
    },
  );
}
