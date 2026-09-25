// Backward-compatible Meta-only test/worker interface; all processing is shared.
import { processExternalJobs } from '../intake/worker.mjs';
export function processMetaJobs(options) { return processExternalJobs({ ...options, provider: 'meta' }); }
