// ADR-009 src/ scan (plan NRC-r2, CI guard point 2): browser and server code reads
// record conflicts only through src/lib/conflictErrors.mjs, so no file under src/
// names the legacy retryable code. Exempt: that module (legacy accepted on read
// only) and the two admin routes that map an engine-raised code to HTTP 409.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ALLOWED = new Set(['src/lib/conflictErrors.mjs', 'src/app/api/admin/update-role/route.js', 'src/app/api/admin/invite/route.js']);
const LEGACY = /(?<![0-9A-Za-z_])40001(?![0-9A-Za-z_])/;

export function offenders(files) {
  return files.filter(([path, text]) => !ALLOWED.has(path) && LEGACY.test(text)).map(([path]) => path);
}

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.(m?js|jsx|ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

// Self-regression on fixtures before the real scan.
assert.deepEqual(offenders([['src/lib/x.mjs', "if (error.code === '40001') retry();"]]), ['src/lib/x.mjs']);
assert.deepEqual(offenders([['src/components/y.jsx', 'throw { code: "40001" };']]), ['src/components/y.jsx']);
assert.deepEqual(offenders([['src/lib/z.mjs', "const id = '140001'; const code = 'PT409';"]]), []);
assert.deepEqual(offenders([['src/lib/conflictErrors.mjs', "const LEGACY_CONFLICT_CODE = '40001';"]]), []);

const files = sourceFiles('src').map(path => [relative('.', path).split(sep).join('/'), readFileSync(path, 'utf8')]);
assert(files.length > 100, 'src/ tree not found');
const found = offenders(files);
assert.deepEqual(found, [], `use isRecordConflict / CONFLICT_CODE from src/lib/conflictErrors.mjs instead of the legacy code (ADR-009): ${found.join(', ')}`);
for (const path of ALLOWED) assert(files.some(([file]) => file === path), `allowed file moved: ${path}`);
console.log(`PASS src/ scan: ${files.length} files, legacy conflict code only in the conflict helper and the two admin routes`);
