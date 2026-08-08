import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
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

test('text source RPC confirmation uses the returned remote source id',async()=>{let creates=0;const source={id:'src-1',notebookId:'nb-1',title:'Remote title'};const result=await createTextSourceWithRemoteConfirmation({notebookId:'nb-1',title:'Requested title',create:async()=>{creates++;return {sourceId:'src-1'};},list:async()=>[source],sleep:async()=>undefined,delaysMs:[0]});assert.equal(result.state,'REMOTE_CONFIRMED');assert.equal(result.source.id,'src-1');assert.equal(creates,1);});
test('text source reconciliation accepts delayed remote visibility',async()=>{let reads=0;const result=await createTextSourceWithRemoteConfirmation({notebookId:'nb-1',title:'Requested title',create:async()=>({}),list:async()=>{reads++;return reads<3?[]:[{id:'src-1',notebookId:'nb-1',title:'Copied text'}];},sleep:async()=>undefined,delaysMs:[0,0,0]});assert.equal(result.source.id,'src-1');assert.equal(result.state,'REMOTE_CONFIRMED');});
test('text source recovers a known upstream DOM false negative from remote state',async()=>{let creates=0;let reads=0;const result=await createTextSourceWithRemoteConfirmation({notebookId:'nb-1',title:'Requested title',create:async()=>{creates++;throw new Error('Source not found after upload - dialog closed but source not visible in list');},list:async()=>{reads++;return reads===1?[]:[{id:'src-1',notebookId:'nb-1',title:'Copied text'}];},sleep:async()=>undefined,delaysMs:[0]});assert.equal(result.state,'UPSTREAM_FALSE_NEGATIVE_RECOVERED');assert.equal(creates,1);});
test('text source never retries creation after an uncertain result',async()=>{let creates=0;await assert.rejects(()=>createTextSourceWithRemoteConfirmation({notebookId:'nb-1',title:'Requested title',create:async()=>{creates++;throw new Error('uncertain RPC response');},list:async()=>[],sleep:async()=>undefined,delaysMs:[0,0]}),/SOURCE_INGESTION_NOT_CONFIRMED/);assert.equal(creates,1);});
test('text source reports a bounded timeout when remote state never appears',async()=>{let creates=0;let waits=0;await assert.rejects(()=>createTextSourceWithRemoteConfirmation({notebookId:'nb-1',title:'Requested title',create:async()=>{creates++;return {};},list:async()=>[],sleep:async()=>{waits++;},delaysMs:[0,0]}),/SOURCE_INGESTION_NOT_CONFIRMED/);assert.equal(creates,1);assert.equal(waits,2);});
test('text source rejects a source observed in a different notebook',async()=>{await assert.rejects(()=>createTextSourceWithRemoteConfirmation({notebookId:'nb-1',title:'Requested title',create:async()=>({sourceId:'src-other'}),list:async()=>[{id:'src-other',notebookId:'nb-2',title:'Requested title'}],sleep:async()=>undefined,delaysMs:[0]}),/SOURCE_INGESTION_NOT_CONFIRMED/);});

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
