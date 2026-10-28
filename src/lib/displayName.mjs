// E-mail display names are server-set and never carry control characters,
// angle brackets or quotes, so no caller can forge a sender or header (plan PRF-r2 D7).
export function sanitizeDisplayName(value) {
  return String(value || '').replace(/[\u0000-\u001f\u007f<>"]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
}
