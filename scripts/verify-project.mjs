import { spawnSync } from 'node:child_process';

const requiredSmokeEnv = ['SMOKE_TEST_EMAIL', 'SMOKE_TEST_PASSWORD'];

const checks = [
  ['verify:env', ['npm', ['run', 'verify:env']]],
  ['qa:test', ['npm', ['run', 'qa:test']]],
  ['test:unit', ['npm', ['run', 'test:unit']]],
  ['typecheck', ['npm', ['run', 'typecheck']]],
  ['lint', ['npm', ['run', 'lint']]],
  ['export:web', ['npm', ['run', 'export:web']]],
];

const hasSmokeEnv = requiredSmokeEnv.every((key) => Boolean(process.env[key]));

if (hasSmokeEnv) {
  checks.push(['smoke:firebase', ['npm', ['run', 'smoke:firebase']]]);
} else {
  console.log('Skipping smoke:firebase because SMOKE_TEST_EMAIL and SMOKE_TEST_PASSWORD are not set.');
}

for (const [label, [command, args]] of checks) {
  console.log(`\n> ${label}`);

  const result = spawnSync(command, args, {
    env: process.env,
    shell: false,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    console.error(`\nProject verification failed at ${label}.`);
    process.exit(result.status ?? 1);
  }
}

console.log('\nProject verification passed.');
