// Dependency-free guard for the reception guide served at /helpdesk: internal anchors, contents list,
// screenshots, privacy/CSP hygiene and the route policy. Content is static, so these are file-level checks.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';

const dir = new URL('../src/app/(admin)/helpdesk/', import.meta.url);
const read = name => readFileSync(new URL(name, dir), 'utf8');
const guide = read('GuideContent.jsx');
const nav = read('HelpdeskNav.jsx');
const page = read('page.jsx');
const publicDir = new URL('../public/helpdesk/', import.meta.url);

// 1. Every in-page link and every contents entry points at an existing id; ids are unique.
const ids = [...guide.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
assert.equal(new Set(ids).size, ids.length, 'duplicate ids in GuideContent.jsx');
for (const [, target] of guide.matchAll(/href="#([^"]+)"/g)) assert(ids.includes(target), `broken in-page link #${target}`);
const tocIds = [...nav.matchAll(/\{ id: '([^']+)'/g)].map(m => m[1]);
assert(tocIds.length >= 15, 'contents list looks incomplete');
for (const id of tocIds) assert(ids.includes(id), `contents entry without a section: ${id}`);
for (let n = 1; n <= 12; n++) assert(tocIds.includes(`s${n}`), `scenario ${n} missing from the contents list`);

// 2. Screenshots: every referenced file exists, has alt text and dimensions, and none is orphaned or oversized.
const refs = [...guide.matchAll(/<Image\b[^>]*\/>/g)].map(m => m[0]);
assert(refs.length >= 15, 'screenshots missing');
assert(!/<img\b/.test(guide), 'use next/image for screenshots');
const used = new Set();
for (const tag of refs) {
  const src = tag.match(/src="\/helpdesk\/([^"]+)"/)?.[1];
  assert(src, `image outside /helpdesk: ${tag.slice(0, 80)}`);
  used.add(src);
  assert(/alt="[^"]{8,}"/.test(tag), `image without a descriptive alt: ${src}`);
  assert(/width=\{\d+\}/.test(tag) && /height=\{\d+\}/.test(tag), `image without dimensions: ${src}`);
  assert(/\bunoptimized\b/.test(tag) && /tabIndex=\{0\}/.test(tag), `screenshot must be unoptimised and keyboard-focusable: ${src}`);
  assert(statSync(new URL(src, publicDir)).size < 400_000, `screenshot too heavy: ${src}`);
}
for (const file of readdirSync(publicDir)) assert(used.has(file), `orphan screenshot: ${file}`);

// 3. Static, self-contained page: no raw HTML injection, no external resources, no machine-specific or demo-account data.
for (const [name, source] of [['GuideContent.jsx', guide], ['HelpdeskNav.jsx', nav], ['page.jsx', page], ['ImageZoom.jsx', read('ImageZoom.jsx')]]) {
  assert(!/dangerouslySetInnerHTML/.test(source), `${name}: no raw HTML injection`);
  assert(!/https?:\/\//.test(source), `${name}: external URL`);
}
assert(!/example\.invalid|service_role|password\s*[:=]/i.test(guide), 'guide must not contain demo credentials or accounts');
assert(!/@import|fonts\.googleapis/.test(read('helpdesk.css')), 'platform CSP only allows its own fonts');

// 4. The page stays read-only and loads no data.
assert(!/supabase|fetch\(|useQuery|rpc\(/i.test(page + guide + nav + read('ImageZoom.jsx')), 'help page must not load data');

// 5. Route policy: reception and management reach it; family and teacher roles never do.
const { receptionistCanAccess, hasCapability } = await import('../src/lib/roleAccess.mjs');
assert.equal(receptionistCanAccess('/helpdesk'), true);
assert.equal(receptionistCanAccess('/helpdesk/anything'), false);
for (const role of ['director', 'admin', 'receptionist']) assert.equal(hasCapability(role, 'canViewHelp'), true);
for (const role of ['teacher', 'parent', 'student', 'pending', null]) assert.equal(hasCapability(role, 'canViewHelp'), false);

console.log(`PASS helpdesk guide: ${ids.length} anchors, ${tocIds.length} contents entries, ${used.size} screenshots, read-only route policy`);
