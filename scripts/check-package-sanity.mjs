import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';

const pkg=JSON.parse(await readFile('package.json','utf8'));
const manifest=JSON.parse(await readFile('manifest.json','utf8'));
if(pkg.name!==manifest.name||pkg.version!==manifest.version)throw new Error('package.json and manifest.json identity/version differ');
if(manifest.server?.type!=='node'||manifest.server?.entry_point!=='dist/index.js')throw new Error('MCPB server entry point is invalid');
for(const file of ['dist/index.js','scripts/patch-upstream.mjs','scripts/upstream-compatibility.json','LICENSE','THIRD_PARTY_NOTICES.md'])if(!existsSync(file))throw new Error(`Required package input is missing: ${file}`);
const names=(manifest.tools??[]).map(tool=>tool.name);
if(new Set(names).size!==names.length)throw new Error('Manifest contains duplicate tool names');
for(const required of ['research','list_notebooks','list_sources','health','notebook_resolve','notebook_refresh','get_evidence','setup_auth'])if(!names.includes(required))throw new Error(`Manifest is missing required product tool: ${required}`);
const serialized=JSON.stringify(manifest);
if(manifest.server?.mcp_config?.command!=='${__dirname}/launch-frontier.cmd'||manifest.server?.mcp_config?.args?.length!==0)throw new Error('Manifest must launch through launch-frontier.cmd so Claude Desktop uses the system Node runtime');
if(!existsSync('launch-frontier.cmd'))throw new Error('System Node launcher is missing');
for(const forbidden of ['.data/upstream','chrome_profile','registry.json','storage_state.json'])if(serialized.includes(forbidden))throw new Error(`Manifest must not embed runtime/private state: ${forbidden}`);
console.log(`Package sanity passed for ${manifest.name}@${manifest.version} with ${names.length} public tools.`);
