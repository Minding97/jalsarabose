import { runCommand } from './command.mjs';

export function buildCodexExecArgs({ worktree, schemaPath, resultPath, prompt }) {
  return [
    'exec',
    '-C',
    worktree,
    '-s',
    'workspace-write',
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
}) {
  return runCommand(
    codexPath,
    buildCodexExecArgs({ worktree, schemaPath, resultPath, prompt }),
    {
      cwd: worktree,
      sensitive: true,
      timeoutMs: 90 * 60 * 1000,
    },
  );
}
