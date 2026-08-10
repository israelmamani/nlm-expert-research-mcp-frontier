import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {z} from 'zod';
import {Store} from './storage.js';
import {MockNotebookAdapter} from './adapter.js';
import {NotebookLmBrowserAdapter} from './browser-adapter.js';
import {UpstreamNotebookLmAdapter} from './upstream-adapter.js';
import {NotebookRegistry} from './registry.js';
import {ResearchEngine} from './research.js';
import {log} from './log.js';
import {withToolProgress} from './progress.js';

export function createApp(){
  const root=process.env.NLM_DATA_DIR??'.data'; const store=new Store(`${root}/registry.json`);
  const adapter=process.env.NLM_ADAPTER==='mock'?new MockNotebookAdapter():process.env.NLM_ADAPTER==='browser'?new NotebookLmBrowserAdapter():new UpstreamNotebookLmAdapter();
  const registry=new NotebookRegistry(store,adapter,Number(process.env.NLM_SYNC_TTL_MS??60000)); const research=new ResearchEngine(registry,adapter,store);
  const server=new McpServer({name:'nlm-expert-research-mcp-frontier',version:'1.0.0'});
  server.registerTool('research',{description:'Research a question against exactly one NotebookLM notebook. Returns a compact source-locked evidence capsule with claims, citations, conflicts, gaps and quality status. Use this for substantive notebook questions.',inputSchema:{query:z.string(),notebook:z.string(),mode:z.enum(['AUTO','INSTANT','STANDARD','DEEP','VERIFY','ULTRA','FORENSIC']).optional(),internet_policy:z.enum(['LOCKED','AUTO','VERIFY','AUGMENT','ULTRA']).optional(),freshness:z.enum(['auto','force']).optional()}},async(args,extra)=>withToolProgress(extra,async()=>({content:[{type:'text' as const,text:JSON.stringify(await research.run({query:args.query,notebook:args.notebook,mode:args.mode,internetPolicy:args.internet_policy,freshness:args.freshness}),null,2)}]})));
  server.registerTool('list_notebooks',{description:'List the authenticated account’s live NotebookLM notebooks. Use this when the user asks what expert notebooks are available; the result includes an explicit count and cached results are marked catalog_stale when live discovery is unavailable.',inputSchema:{freshness:z.enum(['auto','force']).optional()}},async a=>{const notebooks=await registry.list(a.freshness??'auto');return {content:[{type:'text' as const,text:JSON.stringify({count:notebooks.length,catalog_stale:notebooks.some(notebook=>notebook.catalog_stale===true),notebooks},null,2)}]};});
  server.registerTool('list_sources',{description:'List authoritative remote source IDs and titles for one NotebookLM notebook using the RPC-only metadata path. Use before discussing corpus scope or freshness.',inputSchema:{notebook:z.string()}},async a=>{const notebook=await registry.resolve(a.notebook);await registry.refresh(notebook.id);return {content:[{type:'text' as const,text:JSON.stringify(await registry.sources(notebook.id),null,2)}]};});
  server.registerTool('health',{description:'Check Frontier, persistent NotebookLM authentication, and upstream transport readiness without exposing credentials.',inputSchema:{}},async()=>({content:[{type:'text' as const,text:JSON.stringify(await adapter.health(),null,2)}]}));
  server.registerTool('notebook_resolve',{description:'Resolve a notebook by title, alias, ID or URL. Cache misses trigger a live refresh; cache is never authoritative.',inputSchema:{notebook:z.string(),freshness:z.enum(['auto','force']).optional()}},async(a,extra)=>withToolProgress(extra,async()=>({content:[{type:'text' as const,text:JSON.stringify(await registry.resolve(a.notebook,a.freshness??'auto'))}]})));
  server.registerTool('notebook_refresh',{description:'Force refresh of live notebooks and sources, detecting created, renamed, deleted and newly added items.',inputSchema:{notebook_id:z.string().optional()}},async(a,extra)=>withToolProgress(extra,async()=>{await registry.refresh(a.notebook_id);return {content:[{type:'text' as const,text:'Refresh complete. Live NotebookLM is authoritative.'}]};}));
  server.registerTool('get_evidence',{description:'Retrieve one evidence item by evidence ID from a previous research session.',inputSchema:{evidence_id:z.string()}},async a=>({content:[{type:'text',text:JSON.stringify(await research.evidence(a.evidence_id))}]}));
  server.registerTool('compare_notebooks',{description:'Explicitly compare two notebooks while preserving provenance by notebook. Never invoked implicitly.',inputSchema:{query:z.string(),notebook_a:z.string(),notebook_b:z.string()}},async(a,extra)=>withToolProgress(extra,async()=>{const [x,y]=await Promise.all([research.run({query:a.query,notebook:a.notebook_a,mode:'DEEP',internetPolicy:'LOCKED'}),research.run({query:a.query,notebook:a.notebook_b,mode:'DEEP',internetPolicy:'LOCKED'})]);return {content:[{type:'text' as const,text:JSON.stringify({notebook_a:x,notebook_b:y},null,2)}]};}));
  server.registerTool('setup_auth',{description:'Open a visible Chrome window for secure Google login. Set force=true when cookies look valid locally but Google redirects to sign-in.',inputSchema:{force:z.boolean().optional()}},async(a,extra)=>withToolProgress(extra,async()=>{const prior=process.env.NLM_FORCE_REAUTH;if(a.force)process.env.NLM_FORCE_REAUTH='1';try{return {content:[{type:'text' as const,text:JSON.stringify(await adapter.authenticate(true),null,2)}]};}finally{if(prior===undefined)delete process.env.NLM_FORCE_REAUTH;else process.env.NLM_FORCE_REAUTH=prior;}}));
  server.registerTool('doctor',{description:'Run local diagnostics for runtime, adapter, registry and stdio-safe MCP operation.',inputSchema:{}},async()=>({content:[{type:'text',text:JSON.stringify(await doctor(adapter,store),null,2)}]}));
  return {server,adapter,store};
}
export async function doctor(adapter:any,store:Store){const h=await adapter.health();const d=await store.load();return {runtime:{node:process.version,stdio:'diagnostics use stderr'},adapter:h,registry:{notebooks:d.notebooks.length,sources:d.sources.length,sessions:d.sessions.length},storage:store.file,security:{passwordsStored:false,logsRedacted:true},liveE2E:'NOT_RUN'};}
export async function runServer(){
  const {server,adapter}=createApp();const transport=new StdioServerTransport();
  const launcherPid=process.ppid;let parentWatch:NodeJS.Timeout|undefined;let stopping:Promise<void>|undefined;
  const stop=()=>stopping??=(async()=>{if(parentWatch)clearInterval(parentWatch);await adapter.shutdown().catch(()=>undefined);await server.close().catch(()=>undefined);})();
  const requestStop=()=>{void stop();};
  process.once('SIGINT',requestStop);process.once('SIGTERM',requestStop);process.stdin.once('end',requestStop);process.stdin.once('close',requestStop);transport.onclose=requestStop;
  if(process.platform==='win32'&&launcherPid>0&&process.env.NLM_PARENT_WATCHDOG!=='0'){
    parentWatch=setInterval(()=>{try{process.kill(launcherPid,0);}catch{log('warn','server.launcher_lost',{launcherPid});requestStop();}},500);parentWatch.unref();
  }
  log('info','server.start',{transport:'stdio',adapter:adapter.name});await server.connect(transport);
}
