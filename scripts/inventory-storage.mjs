import { runCli } from './lib/storage-inventory-local.mjs';
runCli(process.argv.slice(2), false).catch(() => { console.error('Inventory refused or failed. Check local target, arguments and schema; sensitive database errors are suppressed.'); process.exitCode = 1; });
