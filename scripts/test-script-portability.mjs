// Dependency-free guard for Node test entrypoints, including browser artifacts.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const directory = new URL('./', import.meta.url);
const ownName = fileURLToPath(import.meta.url).split(/[\\/]/).at(-1);
const machinePath = /\/private\/tmp(?:\/|\b)|\/Users\/[^\s'"`]+|\/home\/[^\s'"`/]+\/|\b[A-Za-z]:[\\/]/;
// Pin rejection of both macOS variants, Linux home paths and Windows drives.
for (const source of ["path: '/private/tmp/debug.png'", "'/Users/runner/debug.png'", "'/home/runner/debug.png'", "'C:\\Temp\\debug.png'"]) {
  assert(machinePath.test(source), `missed machine path: ${source}`);
}
for (const source of ["join(tmpdir(), 'debug.png')", "'/tmp/debug.png'", "'http://localhost:3101'"]) {
  assert(!machinePath.test(source), `rejected portable test source: ${source}`);
}
const files = readdirSync(directory).filter(name => /^test-.*\.(?:mjs|cjs|js)$/.test(name) && name !== ownName);
assert(files.length > 0);
for (const name of files) {
  const lines = readFileSync(new URL(name, directory), 'utf8').split('\n');
  lines.forEach((line, i) => assert(!machinePath.test(line), `${name}:${i + 1}: use the OS temporary directory instead of a machine-specific path`));
}
console.log(`PASS portable paths in ${files.length} Node test entrypoints`);
