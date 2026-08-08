import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

const packageJson=JSON.parse(await readFile('package.json','utf8'));
const lock=JSON.parse(await readFile('package-lock.json','utf8'));
const manifest=JSON.parse(await readFile('manifest.json','utf8'));
const compatibility=JSON.parse(await readFile('scripts/upstream-compatibility.json','utf8'));
const certification=JSON.parse(await readFile('docs/certification.json','utf8'));
if(packageJson.dependencies['@roomi-fields/notebooklm-mcp']!=='3.0.1')throw new Error('Upstream dependency must remain pinned to 3.0.1');
if(lock.packages[''].dependencies['@roomi-fields/notebooklm-mcp']!=='3.0.1')throw new Error('package-lock root does not pin upstream 3.0.1');
if(compatibility.version!=='3.0.1'||compatibility.lock_integrity!==lock.packages['node_modules/@roomi-fields/notebooklm-mcp'].integrity)throw new Error('Upstream compatibility record does not match package-lock');
if(manifest.name!==packageJson.name||manifest.version!==packageJson.version)throw new Error('manifest/package identity mismatch');
if(!/^[0-9a-f]{40}$/.test(certification.certified_code_sha))throw new Error('Certification ledger has no valid certified_code_sha');
if(!/^[0-9a-f]{40}$/.test(certification.attestation_commit_sha))throw new Error('Certification ledger has no valid attestation_commit_sha');
if(certification.verdict==='RELEASE_CERTIFIED'&&certification.blocking_gates?.length)throw new Error('Certified ledger cannot retain blocking gates');
const allowedAttestationPaths=new Set(['docs/certification.json','docs/LIVE_CERTIFICATION.md']);
const attestationFiles=execFileSync('git',['diff','--name-only',`${certification.certified_code_sha}..${certification.attestation_commit_sha}`],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
if(attestationFiles.some(path=>!allowedAttestationPaths.has(path)))throw new Error(`Attestation range contains non-certification changes: ${attestationFiles.join(', ')}`);
const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const postAttestationFiles=execFileSync('git',['diff','--name-only',`${certification.attestation_commit_sha}..${head}`],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
if(postAttestationFiles.some(path=>!allowedAttestationPaths.has(path)))throw new Error(`Post-attestation range contains non-certification changes: ${postAttestationFiles.join(', ')}`);
const targets={
  tools:'node_modules/@roomi-fields/notebooklm-mcp/dist/tools/index.js',
  runtime:'node_modules/@roomi-fields/notebooklm-mcp/dist/session/shared-context-manager.js',
  auth:'node_modules/@roomi-fields/notebooklm-mcp/dist/session/browser-session.js',
  content:'node_modules/@roomi-fields/notebooklm-mcp/dist/content/content-manager.js',
};
for(const [name,path] of Object.entries(targets))if(!existsSync(path))throw new Error(`Missing upstream patch target: ${name}`);
const [tools,runtime,auth,content]=await Promise.all(Object.values(targets).map(path=>readFile(path,'utf8')));
if(!tools.includes('notebook(?:lm)?\\.google\\.com'))throw new Error('Upstream host compatibility patch is absent');
if(!runtime.includes("'--start-minimized'"))throw new Error('Upstream minimized-browser patch is absent');
if(!auth.includes('FRONTIER_EXTERNAL_AUTH_RECOVERY'))throw new Error('Upstream external-auth patch is absent');
if(!content.includes('FRONTIER_TEXT_UPLOAD_DIALOG_SETTLE'))throw new Error('Upstream text-upload race patch is absent');
console.log('Release integrity checks passed.');
