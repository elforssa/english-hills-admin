// Read-only substitute for the existing tests' branch probe; never launch Git.
import cp from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';
const original=cp.execFileSync;
cp.execFileSync=function(file,args,options={}) {
 if(file==='git') {
  if(JSON.stringify(args)!==JSON.stringify(['branch','--show-current'])) throw new Error('Git execution prohibited for this task');
  const cwd=options.cwd instanceof URL?fileURLToPath(options.cwd):options.cwd||process.cwd();
  const head=readFileSync(resolve(cwd,'.git/HEAD'),'utf8').trim();
  const value=(head.startsWith('ref: refs/heads/')?head.slice(16):'')+'\n';
  return options.encoding?value:Buffer.from(value);
 }
 return original.call(this,file,args,options);
};
syncBuiltinESMExports();
