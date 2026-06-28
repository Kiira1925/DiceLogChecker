import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const builtIndex = resolve('dist/index.html');
const rootIndex = resolve('..', 'index.html');

if (!existsSync(builtIndex)) {
  throw new Error(`Build output not found: ${builtIndex}`);
}

copyFileSync(builtIndex, rootIndex);
console.log(`Copied ${builtIndex} to ${rootIndex}`);
