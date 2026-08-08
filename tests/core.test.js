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

async function fixture(){const dir=await mkdtemp(join(tmpdir(),'nlm-frontier-'));const store=new Store(join(dir,'registry.json'));const adapter=new MockNotebookAdapter();const registry=new NotebookRegistry(store,adapter,0);return {dir,store,adapter,registry,engine:new ResearchEngine(registry,adapter,store)};}
test('cache miss performs live discovery without restart',async()=>{const f=await fixture();await f.registry.sync();f.adapter.addNotebook({id:'nb-new',title:'Nuevo Notebook',aliases:[]},[{id:'src-new',notebookId:'nb-new',title:'Nuevo documento'}]);const n=await f.registry.resolve('Nuevo Notebook');assert.equal(n.id,'nb-new');assert.equal((await f.registry.sources(n.id)).length,1);await rm(f.dir,{recursive:true,force:true});});
test('rename and delete are reflected by live refresh',async()=>{const f=await fixture();await f.registry.sync();f.adapter.renameNotebook('nb-tidal','TIDAL Renombrado');assert.equal((await f.registry.resolve('TIDAL Renombrado','force')).id,'nb-tidal');f.adapter.deleteNotebook('nb-tidal');await assert.rejects(()=>f.registry.resolve('TIDAL Renombrado','force'),/NOTEBOOK_NOT_FOUND/);await rm(f.dir,{recursive:true,force:true});});
test('research capsule is locked, cited and compactly structured',async()=>{const f=await fixture();const c=await f.engine.run({query:'¿Qué establecen las fuentes?',notebook:'Contratos Municipales',mode:'DEEP',internetPolicy:'LOCKED'});assert.equal(c.corpusPolicy,'LOCKED');assert.equal(c.externalEvidence.length,0);assert.ok(c.claims.length>0);assert.ok(c.evidence.length>0);assert.equal(c.quality.status,'PASS');await rm(f.dir,{recursive:true,force:true});});
test('cross-notebook comparison preserves notebook provenance',async()=>{const f=await fixture();const a=await f.engine.run({query:'supuestos',notebook:'TIDAL',mode:'DEEP'});const b=await f.engine.run({query:'supuestos',notebook:'Contratos Municipales',mode:'DEEP'});assert.notEqual(a.notebook.id,b.notebook.id);assert.ok(a.evidence.every(e=>e.sourceId?.startsWith('src-tidal')));await rm(f.dir,{recursive:true,force:true});});
test('internet necessity gate stays off for locked corpus',async()=>{const r=await challenge('resume exclusivamente mis fuentes','LOCKED');assert.equal(r.used,false);assert.equal(r.evidence.length,0);});
test('store recovers from a corrupt primary using atomic backup',async()=>{const f=await fixture();await f.store.save({notebooks:[{id:'x',title:'X',aliases:[]}],sources:[],passports:[],sessions:[]});await f.store.save({notebooks:[{id:'y',title:'Y',aliases:[]}],sources:[],passports:[],sessions:[]});const {writeFile}=await import('node:fs/promises');await writeFile(f.store.file,'{broken','utf8');assert.equal((await f.store.load()).notebooks[0].id,'x');await rm(f.dir,{recursive:true,force:true});});
test('100 sequential local researches preserve compact output',async()=>{const f=await fixture();for(let i=0;i<100;i++){const c=await f.engine.run({query:`fact ${i}`,notebook:'TIDAL',mode:'INSTANT',internetPolicy:'LOCKED'});assert.ok(c.answer.length<=5000);assert.equal(c.externalEvidence.length,0);}const saved=await f.store.load();assert.equal(saved.sessions.length,100);await rm(f.dir,{recursive:true,force:true});});
