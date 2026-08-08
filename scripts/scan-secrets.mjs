import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';

const files=execFileSync('git',['ls-files'],{encoding:'utf8'}).split(/\r?\n/).filter(Boolean).filter(file=>file!=='scripts/scan-secrets.mjs');
const patterns=[
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/,
  /(?:ghp_|github_pat_|xox[baprs]-|AIza[0-9A-Za-z_-]{20,}|sk-[A-Za-z0-9]{20,})/,
  /(?:password|passwd|secret|token)\s*[:=]\s*["'][^"']{12,}["']/i,
];
const hits=[];
for(const file of files){const text=await readFile(file,'utf8');for(const pattern of patterns)if(pattern.test(text))hits.push(file);}
if(hits.length){console.error(`Potential secret patterns found in: ${[...new Set(hits)].join(', ')}`);process.exit(1);}
if(files.some(file=>/(^|\/)(\.env|\.data|chrome_profile|browser-profile)(\/|$)/i.test(file)))throw new Error('Sensitive runtime artifacts are tracked');
console.log(`Secret scan passed for ${files.length} tracked files.`);
