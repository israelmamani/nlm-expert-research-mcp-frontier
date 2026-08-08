import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';

const packageJson=JSON.parse(await readFile('package.json','utf8'));
const lock=JSON.parse(await readFile('package-lock.json','utf8'));
const manifest=JSON.parse(await readFile('manifest.json','utf8'));
const compatibility=JSON.parse(await readFile('scripts/upstream-compatibility.json','utf8'));
if(packageJson.dependencies['@roomi-fields/notebooklm-mcp']!=='3.0.1')throw new Error('Upstream dependency must remain pinned to 3.0.1');
if(lock.packages[''].dependencies['@roomi-fields/notebooklm-mcp']!=='3.0.1')throw new Error('package-lock root does not pin upstream 3.0.1');
if(compatibility.version!=='3.0.1'||compatibility.lock_integrity!==lock.packages['node_modules/@roomi-fields/notebooklm-mcp'].integrity)throw new Error('Upstream compatibility record does not match package-lock');
if(manifest.name!==packageJson.name||manifest.version!==packageJson.version)throw new Error('manifest/package identity mismatch');
const targets={
  tools:'node_modules/@roomi-fields/notebooklm-mcp/dist/tools/index.js',
  runtime:'node_modules/@roomi-fields/notebooklm-mcp/dist/session/shared-context-manager.js',
  auth:'node_modules/@roomi-fields/notebooklm-mcp/dist/session/browser-session.js',
};
for(const [name,path] of Object.entries(targets))if(!existsSync(path))throw new Error(`Missing upstream patch target: ${name}`);
const [tools,runtime,auth]=await Promise.all(Object.values(targets).map(path=>readFile(path,'utf8')));
if(!tools.includes('notebook(?:lm)?\\.google\\.com'))throw new Error('Upstream host compatibility patch is absent');
if(!runtime.includes("'--start-minimized'"))throw new Error('Upstream minimized-browser patch is absent');
if(!auth.includes('FRONTIER_EXTERNAL_AUTH_RECOVERY'))throw new Error('Upstream external-auth patch is absent');
console.log('Release integrity checks passed.');
