import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(packageDir, '../..');
const manifest = JSON.parse(await readFile(resolve(packageDir, 'contracts.json'), 'utf8'));
const tenant = await readFile(resolve(packageDir, 'generated/tenant.ts'), 'utf8');
const core = await readFile(resolve(packageDir, 'generated/core.ts'), 'utf8');
const missing = [
  ...manifest.tenant.filter(path => !tenant.includes(`"${path}"`)),
  ...manifest.core.filter(path => !core.includes(`"${path}"`)),
];

if (missing.length > 0) {
  console.error(`Generated OpenAPI contract is missing paths:\n${missing.join('\n')}`);
  process.exit(1);
}

console.log(`OpenAPI contract smoke passed: ${manifest.tenant.length + manifest.core.length} paths`);
