import { runCli } from './lib/storage-inventory-local.mjs';
runCli(process.argv.slice(2), true).catch(() => { console.error('Backfill refused or failed. No cloud fallback. Re-inventory before retrying; sensitive database errors are suppressed.'); process.exitCode = 1; });
