import {cpSync,mkdirSync} from 'node:fs';
mkdirSync('../dist',{recursive:true});
cpSync('../workbench','../dist',{recursive:true});
import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
await build({entryPoints:['main.tsx'],outfile:'../dist/ui.js',bundle:true,minify:true,format:'iife',target:'es2020',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
execFileSync(process.execPath,['node_modules/@tailwindcss/cli/dist/index.mjs','-i','ui.css','-o','../dist/ui.css','--minify'],{stdio:'inherit'});

import {copyFileSync} from 'node:fs';
for(const f of ['application-core.js','desk-client.js'])copyFileSync('../integrations/openjobtracker/v2/'+f,'../dist/'+f);
