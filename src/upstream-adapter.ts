import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {fileURLToPath} from 'node:url';
import {join, resolve} from 'node:path';
import {spawn} from 'node:child_process';
import type {AdapterAnswer, Citation, Notebook, NotebookAdapter, Source} from './types.js';
import {log} from './log.js';
import {AutomaticAuthRecovery, AutomaticAuthRecoveryError} from './auth-recovery.js';
import {reportToolProgress} from './progress.js';
import {createTextSourceWithRemoteConfirmation} from './source-reconciliation.js';
import {TransportCircuitBreaker} from './transport-circuit-breaker.js';
import {isTransportTimeout,runWithSingleTransportRecovery,withAbsoluteDeadline} from './transport-recovery.js';
import {FrontierError} from './errors.js';

type Json=Record<string,any>;

/**
 * Production transport backed by @roomi-fields/notebooklm-mcp 3.x.
 * Frontier remains the orchestrator; the upstream MCP owns fragile Google UI/RPC/auth concerns.
 */
export class UpstreamNotebookLmAdapter implements NotebookAdapter {
  name='roomi-notebooklm-mcp-3.0.1';
  private client?:Client; private transport?:StdioClientTransport;
  private hideWatcher?:ReturnType<typeof spawn>;
  private readonly notebookUrls=new Map<string,string>();
  private readonly circuit=new TransportCircuitBreaker();
  private readonly dataDir=resolve(process.env.NLM_UPSTREAM_DATA_DIR??join(process.cwd(),'.data','upstream'));
  private readonly entry=fileURLToPath(new URL('../node_modules/@roomi-fields/notebooklm-mcp/dist/index.js',import.meta.url));
  private readonly setupEntry=fileURLToPath(new URL('../node_modules/@roomi-fields/notebooklm-mcp/dist/cli/setup-auth.js',import.meta.url));
  private readonly authRecovery=new AutomaticAuthRecovery(
    async()=>this.reauthenticateAutomatically(),
    ()=>process.env.NLM_AUTO_REAUTH!=='0',
    (event,fields)=>log(event==='failed'||event==='retry_failed'?'error':event==='required'?'warn':'info',`auth.auto_${event}`,fields),
  );

  async health(){try{const value=await this.call('server_health',{});const ok=value.success!==false;return {ok,state:ok?'READY':'AUTH_REQUIRED',detail:ok?`Upstream transport ready; data=${this.dataDir}`:String(value.error??'Authentication required')};}catch(e){return {ok:false,state:/auth|login/i.test(String(e))?'AUTH_REQUIRED':'TRANSPORT_UNAVAILABLE',detail:String(e)};}}
  async authenticate(interactive=false){if(!interactive)return this.health();return this.performInteractiveAuthentication(process.env.NLM_FORCE_REAUTH==='1');}
  async listNotebooks():Promise<Notebook[]>{let last:Notebook[]=[];for(let attempt=1;attempt<=3;attempt++){const value=await this.call('notebook_list',{});const rows=value.data?.notebooks??value.notebooks??[];last=rows.map((n:Json)=>{const id=String(n.id);const url=String(n.url??`https://notebook.google.com/notebook/${id}`);this.notebookUrls.set(id,url);return {id,title:String(n.name??n.title??n.id),url,aliases:[]};});if(last.length||attempt===3)return last;log('warn','upstream.empty_notebook_list_retry',{attempt});await this.shutdown();await delay(1500*attempt);}return last;}
  async listSources(notebookId:string):Promise<Source[]>{const value=await this.withUrlFallback(notebookId,url=>this.call('content_list',{notebook_url:url,frontier_sources_only:true}));const rows=value.data?.sources??value.sources??[];return rows.map((source:Json,i:number)=>{if(typeof source.id!=='string'||!source.id)throw new FrontierError('REMOTE_SOURCE_LIST_UNAVAILABLE',`RPC source row ${i+1} has no authoritative source ID`);return {id:source.id,notebookId,title:String(source.name??source.title??`Source ${i+1}`),fingerprint:undefined};});}
  async ask(notebookId:string,query:string):Promise<AdapterAnswer>{const result=await this.withUrlFallback(notebookId,url=>this.askRaw(url,query,'json'));const data=result.data??result;const citations=readCitations(result);return {text:String(data.answer??data.text??''),citations,sourceIds:citations.map(c=>c.sourceId).filter(Boolean) as string[]};}
  async refresh(){await this.listNotebooks();}
  async shutdown(){
    const pid=this.transport?.pid;
    const watcher=this.hideWatcher;
    await this.transport?.close().catch(()=>undefined);
    this.transport=undefined;this.client=undefined;this.hideWatcher=undefined;
    if(watcher&&!watcher.killed){
      if(process.platform==='win32'&&watcher.pid)await terminateProcessTree(watcher.pid);
      else watcher.kill();
    }
    if(pid&&process.platform==='win32')await terminateProcessTree(pid);
  }
  async createNotebook(name:string):Promise<Notebook>{
    const baseline=new Set((await this.listNotebooks()).map(notebook=>notebook.id));
    try{return this.notebookFromCreateResult(await this.call('notebook_create',{name,frontier_rpc_only:true}),name);}
    catch(error){
      if(!/UPSTREAM_OPERATION_TIMEOUT/.test(String(error)))throw error;
      for(const waitMs of [0,1000,2000,4000]){
        if(waitMs)await delay(waitMs);
        const matches=(await this.listNotebooks()).filter(notebook=>!baseline.has(notebook.id)&&notebook.title===name);
        if(matches.length===1){log('warn','notebook_create.remote_reconciled',{notebookIdSuffix:matches[0].id.slice(-8)});return matches[0];}
      }
      throw new Error(`NOTEBOOK_CREATION_NOT_CONFIRMED: ${name}; uncertain mutation was not repeated`,{cause:error});
    }
  }
  async addTextSource(notebookId:string,title:string,text:string){
    const confirmed=await createTextSourceWithRemoteConfirmation({
      notebookId,title,
      create:async()=>{
        const value=await this.call('source_add',{source_type:'text',title,text,notebook_url:this.urlFor(notebookId),frontier_rpc_only:true});
        const data=value.data??value;
        return {sourceId:typeof data.sourceId==='string'?data.sourceId:undefined,sourceName:typeof data.sourceName==='string'?data.sourceName:undefined};
      },
      list:async()=>await this.listSources(notebookId),
    });
    log('info','source.remote_confirmed',{notebookIdSuffix:notebookId.slice(-8),sourceIdSuffix:confirmed.source.id.slice(-8),state:confirmed.state});
    return confirmed;
  }
  async deleteNotebooks(notebookIds:string[]){
    try{const value=await this.call('notebook_delete',{notebook_ids:notebookIds,frontier_rpc_only:true});const failed=value.data?.failed??value.failed??[];if(Array.isArray(failed)&&failed.length)throw new FrontierError('DELETE_NOT_CONFIRMED',`${failed.length} notebook deletion(s) remain present remotely`);return value;}
    catch(error){
      if(!/UPSTREAM_OPERATION_TIMEOUT/.test(String(error)))throw error;
      for(const waitMs of [0,1000,2000,4000]){
        if(waitMs)await delay(waitMs);
        const remaining=new Set((await this.listNotebooks()).map(notebook=>notebook.id));
        if(notebookIds.every(id=>!remaining.has(id))){log('warn','notebook_delete.remote_reconciled',{count:notebookIds.length});return {success:true,reconciled:true};}
      }
      throw new Error(`NOTEBOOK_DELETE_NOT_CONFIRMED: ${notebookIds.length} uncertain deletion(s) were not repeated`,{cause:error});
    }
  }
  private async askRaw(url:string,question:string,sourceFormat:string){return this.call('notebook_ask',{question,notebook_url:url,source_format:sourceFormat});}
  private async ensure(){if(this.client)return;this.client=new Client({name:'frontier-upstream-client',version:'1.0.0'});const inheritStderr=process.env.NLM_UPSTREAM_DEBUG==='1';this.transport=new StdioClientTransport({command:process.execPath,args:[this.entry],cwd:process.cwd(),env:this.env({HEADLESS:'false',BROWSER_CHANNEL:'chrome'}),stderr:inheritStderr?'inherit':'pipe'});if(!inheritStderr)(this.transport.stderr as {resume?:()=>void}|null)?.resume?.();await this.client.connect(this.transport);this.startHideWatcher();log('info','upstream.connected',{name:this.name,browser:process.platform==='win32'&&process.env.NLM_HIDE_BROWSER!=='0'?'headful-hidden':'headful-visible'});}
  private async call(name:string,args:Json){
    return runWithSingleTransportRecovery({
      name,
      execute:()=>this.authRecovery.run(()=>this.callOnce(name,args),name),
      restart:()=>this.shutdown(),
      probe:async()=>{await this.authRecovery.run(()=>this.callOnce('server_health',{}),'transport_recovery_health');},
      circuit:this.circuit,
      isTransportFailure:isTransportTimeout,
      onEvent:(event,fields)=>log(
        event==='stall'||event==='retry_failed'?'error':event==='recovered'?'warn':'info',
        event==='recovered'?'upstream.recovered_after_transport_restart':`upstream.transport_recovery_${event}`,
        {...fields,budgetMs:operationBudget(name)},
      ),
    });
  }
  private async callOnce(name:string,args:Json){const result=await withAbsoluteDeadline(name,operationBudget(name),async()=>{await this.ensure();return this.client!.callTool({name,arguments:args},undefined,{...upstreamCallOptions(name),onprogress:p=>log('debug','upstream.progress',{name,progress:p.progress,total:p.total})});});const value=parseResult(result as Json);if(value.success===false)throw new Error(String(value.error??`${name} failed`));return value;}
  private async reauthenticateAutomatically(){const result=await this.performInteractiveAuthentication(true);if(!result.ok)throw new AutomaticAuthRecoveryError(result.detail??'Interactive authentication failed');}
  private async performInteractiveAuthentication(force:boolean){
    await this.shutdown();
    const args=[this.setupEntry,...(force?['--force']:[])];
    log('warn','auth.interactive_opening',{force,timeoutMinutes:11});
    reportToolProgress('Google requiere autenticación; abriendo una ventana visible.',0,660);
    const started=Date.now();
    const heartbeat=setInterval(()=>reportToolProgress('Esperando que completes el login de Google y 2FA en la ventana visible.',Math.min(659,Math.round((Date.now()-started)/1000)),660),15_000);
    heartbeat.unref();
    const code=await new Promise<number>((done,reject)=>{
      const child=spawn(process.execPath,args,{cwd:process.cwd(),env:this.env({HEADLESS:'false',BROWSER_CHANNEL:'chrome'}),stdio:['ignore','ignore','ignore'],windowsHide:true});
      let settled=false;
      const finish=(value:number)=>{if(settled)return;settled=true;clearTimeout(timer);done(value);};
      const timer=setTimeout(()=>{child.kill();finish(124);},11*60_000);
      child.once('error',error=>{if(settled)return;settled=true;clearTimeout(timer);reject(error);});
      child.once('exit',code=>finish(code??1));
    }).finally(()=>clearInterval(heartbeat));
    const ok=code===0;
    log(ok?'info':'error',ok?'auth.interactive_saved':'auth.interactive_failed',{code});
    reportToolProgress(ok?'Autenticación guardada; reintentando la operación original.':'La autenticación no pudo completarse.',660,660);
    return ok?{ok:true,state:'READY',detail:`Upstream persistent profile: ${join(this.dataDir,'chrome_profile')}`}:{ok:false,state:'AUTH_ERROR',detail:code===124?'Interactive authentication timed out after 11 minutes':`Upstream setup-auth exited with code ${code}`};
  }
  private urlFor(notebookId:string){return this.notebookUrls.get(notebookId)??`https://notebook.google.com/notebook/${notebookId}`;}
  private notebookFromCreateResult(value:Json,name:string):Notebook{const data=value.data??value;const id=String(data.notebook_id??data.id??'');if(!id)throw new Error('Upstream did not return the created notebook ID');const url=String(data.notebook_url??`https://notebook.google.com/notebook/${id}`);this.notebookUrls.set(id,url);return {id,title:String(data.actual_name??name),url,aliases:[]};}
  private async withUrlFallback<T>(notebookId:string,operation:(url:string)=>Promise<T>):Promise<T>{const preferred=this.urlFor(notebookId);try{return await operation(preferred);}catch(error){if(error instanceof AutomaticAuthRecoveryError||!/session expired|accounts\.google|not authenticated|authentication failed/i.test(String(error)))throw error;const parsed=new URL(preferred);parsed.hostname=parsed.hostname==='notebook.google.com'?'notebooklm.google.com':'notebook.google.com';const alternate=parsed.toString();log('warn','upstream.host_fallback',{notebookId,from:new URL(preferred).hostname,to:parsed.hostname});await this.shutdown();await delay(2000);const value=await operation(alternate);this.notebookUrls.set(notebookId,alternate);return value;}}
  private startHideWatcher(){if(process.platform!=='win32'||process.env.NLM_HIDE_BROWSER==='0'||this.hideWatcher)return;const parentPid=this.transport?.pid;if(!parentPid)return;const profile=join(this.dataDir,'chrome_profile').replace(/'/g,"''");const script=`Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class FrontierWindow { [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow); }'; $parentId=${parentPid}; $profile='${profile}'; while(Get-Process -Id $parentId -ErrorAction SilentlyContinue){ Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*$profile*" } | ForEach-Object { $proc=Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue; if($proc -and $proc.MainWindowHandle -ne 0){ [FrontierWindow]::ShowWindowAsync($proc.MainWindowHandle,0) | Out-Null } }; Start-Sleep -Milliseconds 350 }`;const encoded=Buffer.from(script,'utf16le').toString('base64');const watcher=spawn('powershell.exe',['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-EncodedCommand',encoded],{windowsHide:true,stdio:'ignore'});this.hideWatcher=watcher;watcher.once('exit',()=>{if(this.hideWatcher===watcher)this.hideWatcher=undefined;});}
  private env(extra:Record<string,string>={}){const base=Object.fromEntries(Object.entries(process.env).filter((x):x is [string,string]=>typeof x[1]==='string'));return {...base,DATA_DIR:this.dataDir,NOTEBOOKLM_UI_LOCALE:'en',FRONTIER_EXTERNAL_AUTH_RECOVERY:'1',...extra};}
}

function parseResult(result:Json):Json{if(result.structuredContent&&typeof result.structuredContent==='object')return result.structuredContent;const text=(result.content??[]).filter((x:Json)=>x.type==='text').map((x:Json)=>x.text).join('\n').trim();if(!text)return {};try{return JSON.parse(text);}catch{return {success:true,data:{answer:text}};}}
function readCitations(value:Json):Citation[]{const data=value.data??value;const raw=data.sources?.citations??data.citations??[];return raw.map((c:Json,i:number)=>{const sourceTitle=String(c.sourceName??c.source_name??c.title??`Citation ${i+1}`);const candidate=String(c.sourceText??c.source_text??c.excerpt??c.quote??'').trim();const excerptAvailable=Boolean(candidate)&&normalizeCitationText(candidate)!==normalizeCitationText(sourceTitle);const marker=String(c.marker??c.number??`[${i+1}]`);return {sourceId:c.sourceId??c.source_id,sourceTitle,quote:excerptAvailable?candidate:'',locator:marker,marker,excerptAvailable};});}
function normalizeCitationText(text:string){return text.toLowerCase().replace(/\s+/g,' ').trim();}
function delay(ms:number){return new Promise(resolveDelay=>setTimeout(resolveDelay,ms));}
export function operationBudget(name:string){if(name==='server_health'||name==='notebook_list')return 60_000;if(name==='content_list')return 90_000;if(name==='notebook_ask')return 180_000;if(name==='source_add'||name==='notebook_create'||name==='notebook_delete')return 240_000;return 120_000;}
export function upstreamCallOptions(name:string){return {timeout:operationBudget(name),resetTimeoutOnProgress:false as const};}
export function processTreeKillArgs(pid:number){return ['/PID',String(pid),'/T','/F'];}
async function terminateProcessTree(pid:number){await new Promise<void>(resolve=>{const child=spawn('taskkill.exe',processTreeKillArgs(pid),{windowsHide:true,stdio:'ignore'});const timer=setTimeout(resolve,5_000);child.once('exit',()=>{clearTimeout(timer);resolve();});child.once('error',()=>{clearTimeout(timer);resolve();});});}
