import { loadQaConfig } from '../server/config.mjs';
import { runCommand } from './command.mjs';

const config = loadQaConfig();
const repositoryPath = `repos/${config.githubRepository}`;

if (process.env.QA_APPROVE_REVIEW_GATE_MIGRATION !== 'yes') {
  throw new Error('Owner approval required: set QA_APPROVE_REVIEW_GATE_MIGRATION=yes to replace required claude-review with independent-review-gate.');
}

await runCommand('gh', ['auth', 'status']);
await runCommand('gh', [
  'api',
  repositoryPath,
  '--method',
  'PATCH',
  '-F',
  'allow_auto_merge=true',
  '-F',
  'allow_squash_merge=true',
  '-F',
  'allow_merge_commit=false',
  '-F',
  'allow_rebase_merge=false',
  '-F',
  'delete_branch_on_merge=true',
]);

const protection = {
  required_status_checks: {
    strict: true,
    contexts: ['verify', 'independent-review-gate'],
  },
  enforce_admins: false,
  required_pull_request_reviews: {
    dismiss_stale_reviews: false,
    require_code_owner_reviews: false,
    required_approving_review_count: 0,
  },
  restrictions: null,
  required_linear_history: true,
  allow_force_pushes: false,
  allow_deletions: false,
  block_creations: false,
  required_conversation_resolution: true,
  lock_branch: false,
  allow_fork_syncing: false,
};

await runCommand(
  'gh',
  [
    'api',
    `${repositoryPath}/branches/main/protection`,
    '--method',
    'PUT',
    '--input',
    '-',
  ],
  { input: JSON.stringify(protection) },
);

console.log(`Configured GitHub QA gates for ${config.githubRepository}.`);
