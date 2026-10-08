// RCC-B1 pure presentation helpers: bands, stage chips, history summary, Escape guard
// decision/stack (E5 unit level) and board scroll restoration. No I/O.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BAND_QUERIES, BOARD_STAGES, MEANINGFUL_EVENTS, EVENTS, createGuardedEntry, createLayerStack, historySummary, nestedEscapeAction, resolveBand, resolvePresentation, restoredScroll, stageChips, phoneLinks } from '../src/lib/crm/presentation.mjs';

// One breakpoint definition: exactly the Tailwind sm/lg defaults, no screens override.
assert.deepEqual(BAND_QUERIES, { sm: '(min-width: 640px)', lg: '(min-width: 1024px)' });
assert.doesNotMatch(readFileSync('tailwind.config.js', 'utf8'), /screens\s*:/, 'Tailwind keeps its default screens');
assert.equal(resolveBand({ sm: false, lg: false }), 'phone');
assert.equal(resolveBand({ sm: true, lg: false }), 'tablet');
assert.equal(resolveBand({ sm: true, lg: true }), 'desktop');
assert.equal(resolvePresentation({ band: 'desktop', layout: 'board' }), 'board');
assert.equal(resolvePresentation({ band: 'desktop', layout: 'list' }), 'list');
assert.equal(resolvePresentation({ band: 'tablet', layout: 'list' }), 'stage-list');
assert.equal(resolvePresentation({ band: 'phone', layout: 'list' }), 'stage-list');
assert.equal(resolvePresentation({ band: 'phone', layout: 'board' }), 'board', 'the Tableau toggle keeps working below lg');
// No other width threshold decides Opportunities layout.
for (const file of ['CrmWorkspace.jsx', 'OpportunityFilters.jsx', 'OpportunitiesBoard.jsx', 'OpportunitiesList.jsx', 'OpportunityCard.jsx', 'LeadDetailSheet.jsx', 'useResponsiveBand.js']) {
  const source = readFileSync(`src/components/crm/${file}`, 'utf8');
  assert.doesNotMatch(source, /max-width:\s*767px|min-width:\s*768px|\bmd:/, `${file} uses only the shared sm/lg band`);
  assert.doesNotMatch(source, /matchMedia\(\s*['"`]\(m(in|ax)-width/, `${file} has no private width query`);
}

// Stage chips per view: closed shows only the closed stages; a Statut-chosen closed stage is added.
assert.deepEqual(stageChips('all', ''), BOARD_STAGES);
assert.deepEqual(stageChips('mine', 'NEW'), BOARD_STAGES);
assert.deepEqual(stageChips('all', 'LOST'), [...BOARD_STAGES, 'LOST']);
assert.deepEqual(stageChips('attention', 'NOT_QUALIFIED'), [...BOARD_STAGES, 'NOT_QUALIFIED']);
assert.deepEqual(stageChips('closed', ''), ['LOST', 'NOT_QUALIFIED']);
assert.deepEqual(stageChips('closed', 'LOST'), ['LOST', 'NOT_QUALIFIED']);
assert.deepEqual(stageChips('all', 'invalid'), BOARD_STAGES, 'unknown stage values add no chip');

// Collapsed history: three latest meaningful entries, else the latest of any type.
for (const key of MEANINGFUL_EVENTS) assert.ok(EVENTS[key], `${key} is a known event`);
for (const key of ['lead_created', 'submission_received', 'task_created', 'task_completed', 'task_rescheduled', 'task_cancelled', 'lead_reassigned', 'task_reassigned']) assert.ok(!MEANINGFUL_EVENTS.has(key), `${key} is bookkeeping`);
const row = (id, event_type) => ({ id, event_type });
assert.deepEqual(historySummary([row(1,'task_created'), row(2,'call_no_answer'), row(3,'task_completed'), row(4,'note_added'), row(5,'whatsapp_sent'), row(6,'lead_qualified')]).map(r => r.id), [2, 4, 5]);
assert.deepEqual(historySummary([row(1,'task_created'), row(2,'lead_created'), row(3,'submission_received'), row(4,'task_completed')]).map(r => r.id), [1, 2, 3]);
assert.deepEqual(historySummary([row(1,'conversation_recorded')]).map(r => r.id), [1]);
assert.deepEqual(historySummary(undefined), []);

// E5 unit level: the decision is independent of which document listener ran first.
for (const nestedDetected of [true, false]) for (const openCount of [0, 1, 2])
  assert.equal(nestedEscapeAction({ defaultPrevented: true, nestedDetected, openCount }), 'none', 'an already consumed Escape is final');
assert.equal(nestedEscapeAction({ defaultPrevented: false, nestedDetected: false, openCount: 1 }), 'close-top');
assert.equal(nestedEscapeAction({ defaultPrevented: false, nestedDetected: true, openCount: 0 }), 'close-top', 'an unregistered popup still blocks the sheet');
assert.equal(nestedEscapeAction({ defaultPrevented: false, nestedDetected: false, openCount: 0 }), 'allow-sheet');

// Stack fixture: closeTop closes exactly one entry; close() is idempotent and never falls through.
const closed = [];
const entry = name => { const e = createGuardedEntry(() => closed.push(name)); e.opened(); return e; };
const stack = createLayerStack(), menu = entry('menu'), options = entry('options');
stack.push(menu); stack.push(options); stack.push(options);
assert.equal(stack.size(), 2, 'an entry registers once');
assert.equal(stack.closeTop(), true); assert.deepEqual(closed, ['options'], 'only the topmost popup closes');
assert.equal(options.close(), false); assert.deepEqual(closed, ['options'], 'a second close() is a no-op');
assert.equal(stack.size(), 1); assert.equal(menu.open, true, 'the other popup stays open');
menu.closed(); stack.remove(menu); // the popup's own dismissal (onOpenChange(false))
assert.equal(menu.close(), false); assert.deepEqual(closed, ['options'], 'close() after the popup closed itself does nothing');
assert.equal(stack.closeTop(), false); assert.equal(stack.size(), 0);
stack.remove(menu); assert.equal(stack.size(), 0, 'removal is idempotent');

// Board scroll restoration: same filter scope only, clamped, never negative.
const dims = { scrollWidth: 1200, clientWidth: 700, scrollHeight: 900, clientHeight: 600 };
assert.deepEqual(restoredScroll({ filterKey: 'k', left: 320, top: 40 }, 'k', dims), { left: 320, top: 40 });
assert.deepEqual(restoredScroll({ filterKey: 'k', left: 900, top: 999 }, 'k', dims), { left: 500, top: 300 }, 'clamped to the new maximum');
assert.deepEqual(restoredScroll({ filterKey: 'k', left: 300, top: 10 }, 'k', { scrollWidth: 700, clientWidth: 700, scrollHeight: 600, clientHeight: 600 }), { left: 0, top: 0 }, 'no overflow stays at 0');
assert.deepEqual(restoredScroll({ filterKey: 'k', left: -5, top: -5 }, 'k', dims), { left: 0, top: 0 });
assert.equal(restoredScroll({ filterKey: 'old', left: 300, top: 0 }, 'new', dims), null, 'a filter/view/layout change discards the position');
assert.equal(restoredScroll(null, 'k', dims), null);

// D2 C: phoneLinks is unchanged; only presentation gates the tel: launcher.
assert.deepEqual(phoneLinks({ phone_e164: '+212612345678', whatsapp_e164: '+33612345678' }), { tel: 'tel:+212612345678', whatsapp: 'https://wa.me/33612345678' });
const dialogSource = readFileSync('src/components/crm/CrmActionDialog.jsx', 'utf8');
assert.match(dialogSource, /className="hidden [^"]*max-sm:\[@media\(pointer:coarse\)\]:inline-flex" href=\{links\.tel\}/, 'tel: shows only below sm with a coarse pointer');

// Structural invariants (I1/I2/I5): one sheet tree; the primitive's single close; guarded popups.
const sheet = readFileSync('src/components/crm/LeadDetailSheet.jsx', 'utf8');
assert.equal((sheet.match(/<SheetContent\b/g) || []).length, 1, 'one SheetContent for every band');
assert.doesNotMatch(sheet, /SheetClose|aria-label="Fermer"|>Fermer</, 'no second close control');
assert.doesNotMatch(sheet, /Tooltip|title="Autres actions"/, 'no tooltip on Autres actions (R1)');
assert.equal((sheet.match(/<DropdownMenu open=\{/g) || []).length, 2, 'both drawer menus are controlled');
assert.doesNotMatch(sheet, /<(Select|Popover|HoverCard|ContextMenu)\b/, 'B1 adds no Radix Select/Popover/HoverCard/ContextMenu');
const tail = sheet.slice(sheet.lastIndexOf('</ReadState>'));
for (const dialog of ['<CrmActionDialog', '<PlacementTestModal', '<CrmEnrollmentDialog']) assert.ok(tail.includes(dialog), `${dialog} stays a direct child of SheetContent, outside ReadState`);
assert.doesNotMatch(readFileSync('src/components/ui/sheet.jsx', 'utf8'), /onEscapeKeyDown|useNestedLayerEscapeGuard/, 'the Sheet primitive is not edited for the guard');
// Owner decision 2026-10-08 (I2): the root scrollbar workaround is Opportunities-only.
const bandHook = readFileSync('src/components/crm/useResponsiveBand.js', 'utf8');
assert.match(bandHook, /export default function useResponsiveBand\(\{ stableScrollbar = false \} = \{\}\)/, 'the workaround is opt-in');
assert.match(bandHook, /if \(!stableScrollbar\) return undefined;/, 'nothing is applied unless enabled');
assert.match(bandHook, /previous = root\.style\.overflowY;[\s\S]*return \(\) => \{ root\.style\.overflowY = previous; \};/, 'the exact previous inline value is restored');
assert.match(readFileSync('src/components/crm/CrmWorkspace.jsx', 'utf8'), /useResponsiveBand\(\{ stableScrollbar: mode === 'leads' \}\)/, 'only Opportunities enables it; Tâches never does');
// I1: the overflow trigger stays in flow beside the whole identity block.
const card = readFileSync('src/components/crm/OpportunityCard.jsx', 'utf8');
assert.match(card, /<div className="flex items-start gap-1">\s*\{\/\*[\s\S]*?\*\/\}\s*<button onClick=\{\(\) => onOpen\(lead\.id\)\}[\s\S]*?<\/button>\s*<OpportunityActions /, 'identity button and trigger share one flex row');
assert.doesNotMatch(card, /absolute right-0 top-0/, 'the trigger is not positioned over the identity');
console.log('PASS RCC-B1 pure helpers: bands, chips, history summary, Escape decision/stack, scroll restoration, telephone gating and drawer structure');
