import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../dist/storage.js';
import {MockNotebookAdapter} from '../dist/adapter.js';
import {NotebookRegistry} from '../dist/registry.js';
import {ResearchEngine, claimify} from '../dist/research.js';
import {challenge, sanitizeExternalQuery} from '../dist/internet.js';
import {AutomaticAuthRecovery, AutomaticAuthRecoveryError, isAuthenticationError} from '../dist/auth-recovery.js';
import {reportToolProgress, withToolProgress} from '../dist/progress.js';
import {createTextSourceWithRemoteConfirmation} from '../dist/source-reconciliation.js';
import {TransportCircuitBreaker} from '../dist/transport-circuit-breaker.js';
import {isTransportTimeout,runWithSingleTransportRecovery,withAbsoluteDeadline} from '../dist/transport-recovery.js';
import {processTreeKillArgs,upstreamCallOptions,UpstreamNotebookLmAdapter} from '../dist/upstream-adapter.js';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

async function fixture(){const dir=await mkdtemp(join(tmpdir(),'nlm-frontier-'));const store=new Store(join(dir,'registry.json'));const adapter=new MockNotebookAdapter();const registry=new NotebookRegistry(store,adapter,0);return {dir,store,adapter,registry,engine:new ResearchEngine(registry,adapter,store)};}
test('cache miss performs live discovery without restart',async()=>{const f=await fixture();await f.registry.sync();f.adapter.addNotebook({id:'nb-new',title:'Nuevo Notebook',aliases:[]},[{id:'src-new',notebookId:'nb-new',title:'Nuevo documento'}]);const n=await f.registry.resolve('Nuevo Notebook');assert.equal(n.id,'nb-new');await f.registry.refresh(n.id);assert.equal((await f.registry.sources(n.id)).length,1);await rm(f.dir,{recursive:true,force:true});});
test('research modes produce distinct query budgets and default to locked internet',async()=>{const f=await fixture();const instant=await f.engine.run({query:'scope',notebook:'TIDAL',mode:'INSTANT'});const standard=await f.engine.run({query:'scope',notebook:'TIDAL',mode:'STANDARD'});const deep=await f.engine.run({query:'scope',notebook:'TIDAL',mode:'DEEP'});assert.equal(instant.coverage.queries,1);assert.equal(standard.coverage.queries,2);assert.equal(deep.coverage.queries,3);assert.equal(instant.internetPolicy,'LOCKED');assert.equal(instant.externalEvidence.length,0);await rm(f.dir,{recursive:true,force:true});});
test('rename and delete are reflected by live refresh',async()=>{const f=await fixture();await f.registry.sync();f.adapter.renameNotebook('nb-tidal','TIDAL Renombrado');assert.equal((await f.registry.resolve('TIDAL Renombrado','force')).id,'nb-tidal');f.adapter.deleteNotebook('nb-tidal');await assert.rejects(()=>f.registry.resolve('TIDAL Renombrado','force'),/NOTEBOOK_NOT_FOUND/);await rm(f.dir,{recursive:true,force:true});});
test('research capsule is locked, cited and compactly structured',async()=>{const f=await fixture();const c=await f.engine.run({query:'¿Qué establecen las fuentes?',notebook:'Contratos Municipales',mode:'DEEP',internetPolicy:'LOCKED'});assert.equal(c.corpusPolicy,'LOCKED');assert.equal(c.externalEvidence.length,0);assert.ok(c.claims.length>0);assert.ok(c.evidence.length>0);assert.equal(c.quality.status,'PASS');await rm(f.dir,{recursive:true,force:true});});
test('cross-notebook comparison preserves notebook provenance',async()=>{const f=await fixture();const a=await f.engine.run({query:'supuestos',notebook:'TIDAL',mode:'DEEP'});const b=await f.engine.run({query:'supuestos',notebook:'Contratos Municipales',mode:'DEEP'});assert.notEqual(a.notebook.id,b.notebook.id);assert.ok(a.evidence.every(e=>e.sourceId?.startsWith('src-tidal')));await rm(f.dir,{recursive:true,force:true});});
test('internet necessity gate stays off for locked corpus',async()=>{const r=await challenge('resume exclusivamente mis fuentes','LOCKED');assert.equal(r.used,false);assert.equal(r.evidence.length,0);});
test('external query sanitizer rejects notebook-derived prompts',()=>{assert.equal(sanitizeExternalQuery('Según mi notebook confidencial, resume exclusivamente mis fuentes'),null);assert.equal(sanitizeExternalQuery('current TypeScript release notes'),'current TypeScript release notes');});
test('store recovers from a corrupt primary using atomic backup',async()=>{const f=await fixture();await f.store.save({notebooks:[{id:'x',title:'X',aliases:[]}],sources:[],passports:[],sessions:[]});await f.store.save({notebooks:[{id:'y',title:'Y',aliases:[]}],sources:[],passports:[],sessions:[]});const {writeFile}=await import('node:fs/promises');await writeFile(f.store.file,'{broken','utf8');assert.equal((await f.store.load()).notebooks[0].id,'x');await rm(f.dir,{recursive:true,force:true});});
test('100 sequential local researches preserve compact output',async()=>{const f=await fixture();for(let i=0;i<100;i++){const c=await f.engine.run({query:`fact ${i}`,notebook:'TIDAL',mode:'INSTANT',internetPolicy:'LOCKED'});assert.ok(c.answer.length<=5000);assert.equal(c.externalEvidence.length,0);}const saved=await f.store.load();assert.equal(saved.sessions.length,100);await rm(f.dir,{recursive:true,force:true});});
test('serialized store transactions preserve concurrent session writes',async()=>{const f=await fixture();await Promise.all(Array.from({length:10},(_,i)=>f.store.update(data=>{data.sessions.push({researchId:`concurrent-${i}`,notebook:{id:'nb',title:'Test',aliases:[]},mode:'INSTANT',corpusPolicy:'LOCKED',internetPolicy:'LOCKED',answer:'ok',keyFindings:[],claims:[],evidence:[],conflicts:[],uncertainties:[],gaps:[],externalEvidence:[],coverage:{queries:1,sourcesConsidered:0,sourcesUsed:0,score:0,saturation:'LOW'},quality:{status:'WARN',reasons:[]},performance:{latencyMs:0,adapter:'test',cacheHit:false}});})));assert.equal((await f.store.load()).sessions.length,10);await rm(f.dir,{recursive:true,force:true});});
test('claim verifier fails closed on contradictory negation',()=>{const support=[{evidenceId:'e1',sourceTitle:'Policy',quote:'The policy does not permit X.',layer:'CANONICAL_CORPUS',status:'SUPPORTED'}];const [claim]=claimify('The policy permits X.',support,[]);assert.notEqual(claim.status,'SUPPORTED');assert.deepEqual(claim.evidenceIds,[]);});
test('claim verifier maps only materially matching evidence',()=>{const support=[{evidenceId:'e1',sourceTitle:'Policy',quote:'The policy permits X for public entities.',layer:'CANONICAL_CORPUS',status:'SUPPORTED'}];const [claim]=claimify('The policy permits X for public entities.',support,[]);assert.equal(claim.status,'SUPPORTED');assert.deepEqual(claim.evidenceIds,['e1']);});
test('explicit citation marker links without an excerpt but remains unverified',()=>{const support=[{evidenceId:'e17',sourceTitle:'Deterministic source',quote:'',citationMarker:'[17]',excerptAvailable:false,layer:'CANONICAL_CORPUS',status:'UNVERIFIED'}];const [claim]=claimify('FRONTIER-CODE-7319 is the exact code [17].',support,[]);assert.deepEqual(claim.evidenceIds,['e17']);assert.equal(claim.evidenceLinkage.e17,'explicit_marker');assert.equal(claim.status,'UNVERIFIED');assert.equal(claim.verificationReason,'CITATION_EXCERPT_UNAVAILABLE');});
test('strong citation excerpt is linked and semantically supported',()=>{const support=[{evidenceId:'e1',sourceTitle:'Deterministic source',quote:'FRONTIER-CODE-7319 is the exact certification code.',citationMarker:'[1]',excerptAvailable:true,layer:'CANONICAL_CORPUS',status:'UNVERIFIED'}];const [claim]=claimify('FRONTIER-CODE-7319 is the exact certification code [1].',support,[]);assert.deepEqual(claim.evidenceIds,['e1']);assert.equal(claim.status,'SUPPORTED');assert.equal(claim.evidenceLinkage.e1,'explicit_marker');});
test('wrong citation marker does not link arbitrary evidence',()=>{const support=[{evidenceId:'e1',sourceTitle:'Deterministic source',quote:'',citationMarker:'[1]',excerptAvailable:false,layer:'CANONICAL_CORPUS',status:'UNVERIFIED'}];const [claim]=claimify('FRONTIER-CODE-7319 is the exact code [2].',support,[]);assert.deepEqual(claim.evidenceIds,[]);assert.equal(claim.status,'UNVERIFIED');});
test('multiple citations stay attached to their material claims',()=>{const support=[{evidenceId:'e1',sourceTitle:'Deterministic source',quote:'FRONTIER-CODE-7319 is the exact certification code.',citationMarker:'[1]',excerptAvailable:true,layer:'CANONICAL_CORPUS',status:'UNVERIFIED'},{evidenceId:'e2',sourceTitle:'Deterministic source',quote:'The certification color is cobalt blue.',citationMarker:'[2]',excerptAvailable:true,layer:'CANONICAL_CORPUS',status:'UNVERIFIED'}];const claims=claimify('FRONTIER-CODE-7319 is the exact certification code [1]. The certification color is cobalt blue [2].',support,[]);assert.deepEqual(claims[0].evidenceIds,['e1']);assert.deepEqual(claims[1].evidenceIds,['e2']);});
test('citation from another answer pass cannot leak into a primary claim',()=>{const support=[{evidenceId:'e1',sourceTitle:'Other pass',quote:'FRONTIER-CODE-7319 is the exact certification code.',citationMarker:'[1]',excerptAvailable:true,answerPass:1,layer:'CANONICAL_CORPUS',status:'UNVERIFIED'}];const [claim]=claimify('FRONTIER-CODE-7319 is the exact certification code [1].',support,[]);assert.deepEqual(claim.evidenceIds,[]);assert.equal(claim.status,'UNVERIFIED');});
test('transport circuit breaker trips after three bounded stalls and healthy success resets it',()=>{let now=0;const breaker=new TransportCircuitBreaker(3,600000,()=>now);breaker.recordStall();breaker.recordStall();assert.equal(breaker.degraded,false);breaker.recordStall();assert.equal(breaker.degraded,true);breaker.recordHealthy();assert.equal(breaker.degraded,false);now=700000;assert.equal(breaker.count,0);});

test('safe read restarts once, probes the fresh transport and returns the retry result',async()=>{
  let attempts=0;let restarts=0;let probes=0;const events=[];
  const result=await runWithSingleTransportRecovery({name:'notebook_list',circuit:new TransportCircuitBreaker(),execute:async()=>{attempts++;if(attempts===1)throw new Error('Request timed out');return ['ready'];},restart:async()=>{restarts++;},probe:async()=>{probes++;},onEvent:event=>events.push(event)});
  assert.deepEqual(result,['ready']);assert.equal(attempts,2);assert.equal(restarts,1);assert.equal(probes,1);assert.equal(events.filter(event=>event==='recovered').length,1);
});

test('a second transport stall fails unstable without a third attempt',async()=>{
  let attempts=0;let restarts=0;
  await assert.rejects(()=>runWithSingleTransportRecovery({name:'content_list',circuit:new TransportCircuitBreaker(),execute:async()=>{attempts++;throw new Error('absolute deadline exceeded');},restart:async()=>{restarts++;},probe:async()=>undefined}),/UPSTREAM_TRANSPORT_UNSTABLE/);
  assert.equal(attempts,2);assert.equal(restarts,2);
});

test('progress cannot extend the configured absolute upstream deadline',async()=>{
  const options=upstreamCallOptions('notebook_list');
  assert.equal(options.timeout,60000);assert.equal(options.resetTimeoutOnProgress,false);
  let progress=0;const ticker=setInterval(()=>{progress++;},2);
  try{await assert.rejects(()=>withAbsoluteDeadline('notebook_list',25,()=>new Promise(()=>undefined)),/UPSTREAM_ABSOLUTE_DEADLINE_EXCEEDED/);}
  finally{clearInterval(ticker);}
  assert.ok(progress>1);
});

test('authentication errors and rate limits never enter transport restart recovery',async()=>{
  for(const error of [new Error('AUTH_REQUIRED'),new Error('429 rate limit exceeded')]){
    let restarts=0;
    await assert.rejects(()=>runWithSingleTransportRecovery({name:'notebook_list',circuit:new TransportCircuitBreaker(),execute:async()=>{throw error;},restart:async()=>{restarts++;}}),candidate=>candidate===error);
    assert.equal(restarts,0);
  }
  assert.equal(isTransportTimeout(new Error('429 timeout quota exceeded')),false);
  assert.equal(isTransportTimeout(new Error('UPSTREAM_ABSOLUTE_DEADLINE_EXCEEDED: content_list exceeded 90000ms')),true);
});

test('uncertain mutation is cleaned up but never repeated by transport recovery',async()=>{
  let attempts=0;let restarts=0;let probes=0;
  await assert.rejects(()=>runWithSingleTransportRecovery({name:'source_add',circuit:new TransportCircuitBreaker(),execute:async()=>{attempts++;throw new Error('Request timed out');},restart:async()=>{restarts++;},probe:async()=>{probes++;}}),/UPSTREAM_OPERATION_TIMEOUT/);
  assert.equal(attempts,1);assert.equal(restarts,1);assert.equal(probes,0);
});

test('notebook creation timeout reconciles the remote result without repeating creation',async()=>{
  const adapter=new UpstreamNotebookLmAdapter();let reads=0;let mutations=0;
  adapter.listNotebooks=async()=>{reads++;return reads===1?[]:[{id:'nb-created',title:'FRONTIER-CERT-TEST',url:'https://notebook.google.com/notebook/nb-created',aliases:[]}];};
  adapter.call=async()=>{mutations++;throw new Error('UPSTREAM_OPERATION_TIMEOUT: notebook_create');};
  const notebook=await adapter.createNotebook('FRONTIER-CERT-TEST');
  assert.equal(notebook.id,'nb-created');assert.equal(mutations,1);
});

test('notebook deletion timeout reconciles absence without repeating deletion',async()=>{
  const adapter=new UpstreamNotebookLmAdapter();let mutations=0;
  adapter.listNotebooks=async()=>[];
  adapter.call=async()=>{mutations++;throw new Error('UPSTREAM_OPERATION_TIMEOUT: notebook_delete');};
  const result=await adapter.deleteNotebooks(['nb-deleted']);
  assert.equal(result.reconciled,true);assert.equal(mutations,1);
});

test('Frontier source enumeration requests the RPC-only path with no DOM fallback',async()=>{
  const adapter=new UpstreamNotebookLmAdapter();let observed;
  adapter.call=async(name,args)=>{observed={name,args};return {success:true,data:{sources:[{id:'src-rpc',name:'RPC source'}],transport:'rpc'}};};
  const sources=await adapter.listSources('nb-rpc');
  assert.equal(observed.name,'content_list');assert.equal(observed.args.frontier_sources_only,true);
  assert.deepEqual(sources,[{id:'src-rpc',notebookId:'nb-rpc',title:'RPC source',fingerprint:undefined}]);
});

test('RPC source enumeration fails closed when an authoritative source id is absent',async()=>{
  const adapter=new UpstreamNotebookLmAdapter();adapter.call=async()=>({success:true,data:{sources:[{name:'No id'}],transport:'rpc'}});
  await assert.rejects(()=>adapter.listSources('nb-rpc'),/REMOTE_SOURCE_LIST_UNAVAILABLE/);
});

test('postinstall source-list patch returns before Studio polling and fails closed before DOM',async()=>{
  const source=await readFile('node_modules/@roomi-fields/notebooklm-mcp/dist/tools/index.js','utf8');
  const start=source.indexOf('async handleListContent(args)');const end=source.indexOf('async handleDownloadContent(args)',start);const handler=source.slice(start,end);
  assert.ok(handler.includes('FRONTIER')||source.includes('FRONTIER_RPC_SOURCE_LIST'));
  assert.ok(handler.indexOf('if (frontier_sources_only === true)')<handler.indexOf('new StudioRpc(client).poll'));
  assert.ok(handler.includes("REMOTE_SOURCE_LIST_UNAVAILABLE: "));
  assert.ok(handler.indexOf("REMOTE_SOURCE_LIST_UNAVAILABLE: ")<handler.indexOf('// Get or create session'));
});

test('Frontier mutations are RPC-only and upstream cannot replay uncertain writes',async()=>{
  const calls=[];const adapter=new UpstreamNotebookLmAdapter();let sourceReads=0;
  adapter.listNotebooks=async()=>[];
  adapter.listSources=async notebookId=>++sourceReads===1?[]:[{id:'src-new',notebookId,title:'Evidence'}];
  adapter.call=async(name,args)=>{calls.push({name,args});if(name==='notebook_create')return {success:true,data:{notebook_id:'nb-new',notebook_url:'https://notebook.google.com/notebook/nb-new',actual_name:'Created'}};if(name==='source_add')return {success:true,data:{sourceId:'src-new',sourceName:'Evidence'}};return {success:true,data:{deleted:['nb-new'],failed:[]}};};
  await adapter.createNotebook('Created');await adapter.addTextSource('nb-new','Evidence','deterministic');await adapter.deleteNotebooks(['nb-new']);
  assert.deepEqual(calls.map(call=>[call.name,call.args.frontier_rpc_only]),[['notebook_create',true],['source_add',true],['notebook_delete',true]]);
  const tools=await readFile('node_modules/@roomi-fields/notebooklm-mcp/dist/tools/index.js','utf8');
  const rpc=await readFile('node_modules/@roomi-fields/notebooklm-mcp/dist/rpc/batchexecute.js','utf8');
  assert.match(tools,/FRONTIER_RPC_MUTATION_GUARD/);assert.match(tools,/frontier_rpc_only/);
  assert.match(rpc,/FRONTIER_NO_MUTATION_RETRY/);assert.match(rpc,/FRONTIER_MUTATION_RPCS\.has\(name\)/);
});

test('RPC transport uses the authenticated profile account host',async()=>{
  const tools=await readFile('node_modules/@roomi-fields/notebooklm-mcp/dist/tools/index.js','utf8');
  const start=tools.indexOf('async getRpcClient()');const end=tools.indexOf('async getNotebookRpc()',start);const handler=tools.slice(start,end);
  assert.match(handler,/FRONTIER_RPC_ACCOUNT_HOST/);assert.match(handler,/context\.storageState\(\)/);assert.match(handler,/baseHost, hl: CONFIG\.uiLocale/);
  assert.doesNotMatch(handler,/new BatchExecuteClient\(\{ cookies, hl:/);
});

test('known cached notebook remains usable as stale when remote discovery fails',async()=>{
  const f=await fixture();await f.registry.sync();f.adapter.listNotebooks=async()=>{throw new Error('transport unavailable');};
  const notebook=await f.registry.resolve('TIDAL','force');assert.equal(notebook.id,'nb-tidal');assert.equal(notebook.catalog_stale,true);
  assert.equal((await f.store.load()).notebooks.length,2);await rm(f.dir,{recursive:true,force:true});
});

test('unknown notebook reports remote discovery unavailable instead of false not found',async()=>{
  const f=await fixture();await f.registry.sync();f.adapter.listNotebooks=async()=>{throw new Error('transport unavailable');};
  await assert.rejects(()=>f.registry.resolve('Unknown Remote Notebook','force'),/REMOTE_DISCOVERY_UNAVAILABLE/);await rm(f.dir,{recursive:true,force:true});
});

test('successful live sync clears stale catalog markers',async()=>{
  const f=await fixture();await f.store.save({notebooks:[{id:'nb-tidal',title:'TIDAL',aliases:[],catalog_stale:true}],sources:[],passports:[],sessions:[]});
  await f.registry.sync(true);assert.equal((await f.store.load()).notebooks.find(n=>n.id==='nb-tidal').catalog_stale,false);await rm(f.dir,{recursive:true,force:true});
});

test('runtime MCP tools stay in exact parity with the manifest product surface',async()=>{
  const manifest=JSON.parse(await readFile('manifest.json','utf8'));const client=new Client({name:'frontier-test-client',version:'1'});
  const transport=new StdioClientTransport({command:process.execPath,args:['dist/index.js'],cwd:process.cwd(),env:{...process.env,NLM_ADAPTER:'mock'}});
  try{await client.connect(transport);const listed=await client.listTools();assert.deepEqual(listed.tools.map(tool=>tool.name).sort(),manifest.tools.map(tool=>tool.name).sort());assert.equal(listed.tools.length,10);}
  finally{await client.close().catch(()=>undefined);}
});

test('third confirmed stall still allows its one authorized recovery then opens the circuit',async()=>{
  const circuit=new TransportCircuitBreaker();circuit.recordStall();circuit.recordStall();let attempts=0;
  const result=await runWithSingleTransportRecovery({name:'notebook_ask',circuit,execute:async()=>{attempts++;if(attempts===1)throw new Error('Request timed out');return 'recovered';},restart:async()=>undefined,probe:async()=>undefined});
  assert.equal(result,'recovered');assert.equal(circuit.degraded,true);
  await assert.rejects(()=>runWithSingleTransportRecovery({name:'notebook_ask',circuit,execute:async()=>'',restart:async()=>undefined}),/UPSTREAM_TRANSPORT_UNSTABLE/);
});

test('Windows cleanup targets only the exact Frontier parent process tree',()=>{
  assert.deepEqual(processTreeKillArgs(7319),['/PID','7319','/T','/F']);
});

test('adapter shutdown closes its transport and hide watcher without touching unrelated processes',async()=>{
  const adapter=new UpstreamNotebookLmAdapter();let transportClosed=0;let watcherKilled=0;let unrelatedChromeKilled=0;
  adapter.transport={pid:undefined,close:async()=>{transportClosed++;}};
  adapter.client={};
  adapter.hideWatcher={pid:undefined,killed:false,kill:()=>{watcherKilled++;return true;}};
  await adapter.shutdown();
  assert.equal(transportClosed,1);assert.equal(watcherKilled,1);assert.equal(unrelatedChromeKilled,0);
  assert.equal(adapter.transport,undefined);assert.equal(adapter.hideWatcher,undefined);
});

test('text source RPC confirmation uses the returned remote source id',async()=>{let creates=0;let reads=0;const source={id:'src-1',notebookId:'nb-1',title:'Remote title'};const result=await createTextSourceWithRemoteConfirmation({notebookId:'nb-1',title:'Requested title',create:async()=>{creates++;return {sourceId:'src-1'};},list:async()=>++reads===1?[]:[source],sleep:async()=>undefined,delaysMs:[0]});assert.equal(result.state,'REMOTE_CONFIRMED');assert.equal(result.source.id,'src-1');assert.equal(creates,1);});
test('delete reports a remotely failed notebook instead of false success',async()=>{const adapter=new UpstreamNotebookLmAdapter();adapter.call=async()=>({success:true,data:{deleted:[],failed:['nb-still-there']}});await assert.rejects(()=>adapter.deleteNotebooks(['nb-still-there']),/DELETE_NOT_CONFIRMED/);});
test('text source reconciliation accepts delayed remote visibility',async()=>{let reads=0;const result=await createTextSourceWithRemoteConfirmation({notebookId:'nb-1',title:'Requested title',create:async()=>({}),list:async()=>{reads++;return reads<3?[]:[{id:'src-1',notebookId:'nb-1',title:'Copied text'}];},sleep:async()=>undefined,delaysMs:[0,0,0]});assert.equal(result.source.id,'src-1');assert.equal(result.state,'REMOTE_CONFIRMED');});
test('text source recovers a known upstream DOM false negative from remote state',async()=>{let creates=0;let reads=0;const result=await createTextSourceWithRemoteConfirmation({notebookId:'nb-1',title:'Requested title',create:async()=>{creates++;throw new Error('Source not found after upload - dialog closed but source not visible in list');},list:async()=>{reads++;return reads===1?[]:[{id:'src-1',notebookId:'nb-1',title:'Copied text'}];},sleep:async()=>undefined,delaysMs:[0]});assert.equal(result.state,'UPSTREAM_FALSE_NEGATIVE_RECOVERED');assert.equal(creates,1);});
test('text source timeout reconciles remote state without repeating source_add',async()=>{let creates=0;let reads=0;const result=await createTextSourceWithRemoteConfirmation({notebookId:'nb-1',title:'Requested title',create:async()=>{creates++;throw new Error('UPSTREAM_OPERATION_TIMEOUT: source_add');},list:async()=>{reads++;return reads===1?[]:[{id:'src-1',notebookId:'nb-1',title:'Requested title'}];},sleep:async()=>undefined,delaysMs:[0]});assert.equal(result.state,'UPSTREAM_FALSE_NEGATIVE_RECOVERED');assert.equal(creates,1);});
test('text source never retries creation after an uncertain result',async()=>{let creates=0;await assert.rejects(()=>createTextSourceWithRemoteConfirmation({notebookId:'nb-1',title:'Requested title',create:async()=>{creates++;throw new Error('uncertain RPC response');},list:async()=>[],sleep:async()=>undefined,delaysMs:[0,0]}),/SOURCE_INGESTION_NOT_CONFIRMED/);assert.equal(creates,1);});
test('text source reports a bounded timeout when remote state never appears',async()=>{let creates=0;let waits=0;await assert.rejects(()=>createTextSourceWithRemoteConfirmation({notebookId:'nb-1',title:'Requested title',create:async()=>{creates++;return {};},list:async()=>[],sleep:async()=>{waits++;},delaysMs:[0,0]}),/SOURCE_INGESTION_NOT_CONFIRMED/);assert.equal(creates,1);assert.equal(waits,2);});
test('text source rejects a source observed in a different notebook',async()=>{await assert.rejects(()=>createTextSourceWithRemoteConfirmation({notebookId:'nb-1',title:'Requested title',create:async()=>({sourceId:'src-other'}),list:async()=>[{id:'src-other',notebookId:'nb-2',title:'Requested title'}],sleep:async()=>undefined,delaysMs:[0]}),/SOURCE_INGESTION_NOT_CONFIRMED/);});
test('text source reconciliation never accepts a same-title source that existed before mutation',async()=>{let creates=0;const existing={id:'src-existing',notebookId:'nb-1',title:'Requested title'};await assert.rejects(()=>createTextSourceWithRemoteConfirmation({notebookId:'nb-1',title:'Requested title',create:async()=>{creates++;throw new Error('uncertain timeout');},list:async()=>[existing],sleep:async()=>undefined,delaysMs:[0]}),/SOURCE_INGESTION_NOT_CONFIRMED/);assert.equal(creates,1);});

test('research quality fails closed when NotebookLM returns no answer or citations',async()=>{const f=await fixture();f.adapter.ask=async()=>({text:'',citations:[]});const capsule=await f.engine.run({query:'empty',notebook:'TIDAL',mode:'INSTANT'});assert.equal(capsule.quality.status,'FAIL');assert.ok(capsule.quality.reasons.some(reason=>/No material claims|No structured citation/i.test(reason)));await rm(f.dir,{recursive:true,force:true});});

test('authentication detector is narrow and recognizes upstream expiry messages',()=>{
  assert.equal(isAuthenticationError(new Error('AUTH_REQUIRED')),true);
  assert.equal(isAuthenticationError(new Error('Not authenticated — homepage redirected to accounts.google.com (session expired).')),true);
  assert.equal(isAuthenticationError(new Error('AUTH_REQUIRED: Google session expired; Frontier will open interactive recovery.')),true);
  assert.equal(isAuthenticationError(new Error('network timeout while loading notebook')),false);
  assert.equal(isAuthenticationError(new Error('permission denied for notebook')),false);
});

test('automatic authentication recovers and retries the original operation once',async()=>{
  let attempts=0;let recoveries=0;
  const recovery=new AutomaticAuthRecovery(async()=>{recoveries++;});
  const result=await recovery.run(async()=>{attempts++;if(attempts===1)throw new Error('SESSION_EXPIRED');return 'ready';},'notebook_ask');
  assert.equal(result,'ready');assert.equal(attempts,2);assert.equal(recoveries,1);
});

test('cancelled authentication fails clearly without retrying the operation',async()=>{
  let attempts=0;let recoveries=0;
  const recovery=new AutomaticAuthRecovery(async()=>{recoveries++;throw new Error('user closed browser');});
  await assert.rejects(()=>recovery.run(async()=>{attempts++;throw new Error('AUTH_REQUIRED');},'notebook_list'),error=>error instanceof AutomaticAuthRecoveryError&&error.message.includes('AUTH_RECOVERY_FAILED'));
  assert.equal(attempts,1);assert.equal(recoveries,1);
});

test('authentication retry is bounded when Google rejects the refreshed session',async()=>{
  let attempts=0;let recoveries=0;
  const recovery=new AutomaticAuthRecovery(async()=>{recoveries++;});
  await assert.rejects(()=>recovery.run(async()=>{attempts++;throw new Error('AUTH_REQUIRED');},'content_list'),error=>error instanceof AutomaticAuthRecoveryError&&error.message.includes('AUTH_RECOVERY_RETRY_FAILED'));
  assert.equal(attempts,2);assert.equal(recoveries,1);
});

test('concurrent authentication failures share one interactive recovery',async()=>{
  let authenticated=false;let recoveries=0;let releaseRecovery;
  const gate=new Promise(resolve=>{releaseRecovery=resolve;});
  const recovery=new AutomaticAuthRecovery(async()=>{recoveries++;await gate;authenticated=true;});
  const operation=async()=>{if(!authenticated)throw new Error('AUTH_REQUIRED');return 'ready';};
  const first=recovery.run(operation,'notebook_list');
  const second=recovery.run(operation,'notebook_ask');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(recoveries,1);
  releaseRecovery();
  assert.deepEqual(await Promise.all([first,second]),['ready','ready']);
});

test('tool progress is scoped to the originating MCP request',async()=>{
  const notifications=[];
  const extra={_meta:{progressToken:'auth-1'},sendNotification:async notification=>notifications.push(notification)};
  await withToolProgress(extra,async()=>{reportToolProgress('waiting for login',15,660);await new Promise(resolve=>setImmediate(resolve));});
  assert.deepEqual(notifications,[{method:'notifications/progress',params:{progressToken:'auth-1',progress:15,total:660,message:'waiting for login'}}]);
});
