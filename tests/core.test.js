import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../dist/storage.js';
import {MockNotebookAdapter} from '../dist/adapter.js';
import {NotebookRegistry} from '../dist/registry.js';
import {ResearchEngine} from '../dist/research.js';
import {challenge} from '../dist/internet.js';
import {AutomaticAuthRecovery, AutomaticAuthRecoveryError, isAuthenticationError} from '../dist/auth-recovery.js';
import {reportToolProgress, withToolProgress} from '../dist/progress.js';

async function fixture(){const dir=await mkdtemp(join(tmpdir(),'nlm-frontier-'));const store=new Store(join(dir,'registry.json'));const adapter=new MockNotebookAdapter();const registry=new NotebookRegistry(store,adapter,0);return {dir,store,adapter,registry,engine:new ResearchEngine(registry,adapter,store)};}
test('cache miss performs live discovery without restart',async()=>{const f=await fixture();await f.registry.sync();f.adapter.addNotebook({id:'nb-new',title:'Nuevo Notebook',aliases:[]},[{id:'src-new',notebookId:'nb-new',title:'Nuevo documento'}]);const n=await f.registry.resolve('Nuevo Notebook');assert.equal(n.id,'nb-new');await f.registry.refresh(n.id);assert.equal((await f.registry.sources(n.id)).length,1);await rm(f.dir,{recursive:true,force:true});});
test('rename and delete are reflected by live refresh',async()=>{const f=await fixture();await f.registry.sync();f.adapter.renameNotebook('nb-tidal','TIDAL Renombrado');assert.equal((await f.registry.resolve('TIDAL Renombrado','force')).id,'nb-tidal');f.adapter.deleteNotebook('nb-tidal');await assert.rejects(()=>f.registry.resolve('TIDAL Renombrado','force'),/NOTEBOOK_NOT_FOUND/);await rm(f.dir,{recursive:true,force:true});});
test('research capsule is locked, cited and compactly structured',async()=>{const f=await fixture();const c=await f.engine.run({query:'¿Qué establecen las fuentes?',notebook:'Contratos Municipales',mode:'DEEP',internetPolicy:'LOCKED'});assert.equal(c.corpusPolicy,'LOCKED');assert.equal(c.externalEvidence.length,0);assert.ok(c.claims.length>0);assert.ok(c.evidence.length>0);assert.equal(c.quality.status,'PASS');await rm(f.dir,{recursive:true,force:true});});
test('cross-notebook comparison preserves notebook provenance',async()=>{const f=await fixture();const a=await f.engine.run({query:'supuestos',notebook:'TIDAL',mode:'DEEP'});const b=await f.engine.run({query:'supuestos',notebook:'Contratos Municipales',mode:'DEEP'});assert.notEqual(a.notebook.id,b.notebook.id);assert.ok(a.evidence.every(e=>e.sourceId?.startsWith('src-tidal')));await rm(f.dir,{recursive:true,force:true});});
test('internet necessity gate stays off for locked corpus',async()=>{const r=await challenge('resume exclusivamente mis fuentes','LOCKED');assert.equal(r.used,false);assert.equal(r.evidence.length,0);});
test('store recovers from a corrupt primary using atomic backup',async()=>{const f=await fixture();await f.store.save({notebooks:[{id:'x',title:'X',aliases:[]}],sources:[],passports:[],sessions:[]});await f.store.save({notebooks:[{id:'y',title:'Y',aliases:[]}],sources:[],passports:[],sessions:[]});const {writeFile}=await import('node:fs/promises');await writeFile(f.store.file,'{broken','utf8');assert.equal((await f.store.load()).notebooks[0].id,'x');await rm(f.dir,{recursive:true,force:true});});
test('100 sequential local researches preserve compact output',async()=>{const f=await fixture();for(let i=0;i<100;i++){const c=await f.engine.run({query:`fact ${i}`,notebook:'TIDAL',mode:'INSTANT',internetPolicy:'LOCKED'});assert.ok(c.answer.length<=5000);assert.equal(c.externalEvidence.length,0);}const saved=await f.store.load();assert.equal(saved.sessions.length,100);await rm(f.dir,{recursive:true,force:true});});

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
