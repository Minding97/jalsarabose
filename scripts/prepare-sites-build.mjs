import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const projectRoot = process.cwd();
const source = resolve(projectRoot, 'sites/worker.js');
const serverDirectory = resolve(projectRoot, 'dist/server');
const destination = resolve(serverDirectory, 'index.js');

mkdirSync(serverDirectory, { recursive: true });
copyFileSync(source, destination);

console.log('Sites worker entrypoint prepared.');
