import test from 'node:test';
import assert from 'node:assert/strict';
import {UpstreamNotebookLmAdapter} from '../dist/upstream-adapter.js';
import {NotebookRegistry} from '../dist/registry.js';
import {Store} from '../dist/storage.js';
import {ResearchEngine} from '../dist/research.js';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('LIVE NotebookLM health, enumeration, grounded answer and citations (explicit opt-in)',{skip:!process.env.NLM_LIVE_TEST,timeout:240000},async()=>{const adapter=new UpstreamNotebookLmAdapter();try{const health=await adapter.health();assert.equal(health.ok,true,health.detail);const notebooks=await adapter.listNotebooks();assert.ok(Array.isArray(notebooks));assert.ok(notebooks.length>0,'Authenticated account returned no notebooks');const answer=await adapter.ask(notebooks[0].id,'Según exclusivamente las fuentes de este notebook, indica su tema principal en dos frases. No uses conocimiento externo.');assert.ok(answer.text.length>20,'NotebookLM returned an empty answer');assert.ok(answer.citations.length>0,'NotebookLM returned no structured citations');}finally{await adapter.shutdown();}});

test('LIVE same-process new notebook, source discovery, query and delete invalidation',{skip:!process.env.NLM_LIVE_DYNAMIC_TEST,timeout:600000},async()=>{const adapter=new UpstreamNotebookLmAdapter();const dir=await mkdtemp(join(tmpdir(),'frontier-live-'));const registry=new NotebookRegistry(new Store(join(dir,'registry.json')),adapter,3600000);let created;try{await registry.sync(true);const name=`Frontier Live Certification ${Date.now()}`;created=await adapter.createNotebook(name);assert.equal(created.title,name,'Notebook title was not applied');const resolved=await registry.resolve(name);assert.equal(resolved.id,created.id,'Refresh-on-miss did not discover the new notebook');const sourceTitle='Frontier deterministic source';await adapter.addTextSource(created.id,sourceTitle,'FRONTIER-CODE-7319 is the exact certification code. The certification color is cobalt blue. No other code or color is valid.');await registry.refresh(created.id);const sources=await registry.sources(created.id);assert.ok(sources.some(s=>s.title.toLowerCase().includes('frontier')),'New source was not discovered without restart');const answer=await adapter.ask(created.id,'Según exclusivamente la fuente, ¿cuál es el código exacto y cuál es el color de certificación?');assert.match(answer.text,/FRONTIER-CODE-7319/i);assert.match(answer.text,/cobalt|azul cobalto/i);assert.ok(answer.citations.length>0,'New-notebook answer returned no citations');await adapter.deleteNotebooks([created.id]);await registry.refresh();await assert.rejects(()=>registry.resolve(created.id,'force'),/NOTEBOOK_NOT_FOUND/);}finally{if(created){const remaining=await adapter.listNotebooks().catch(()=>[]);if(remaining.some(n=>n.id===created.id))await adapter.deleteNotebooks([created.id]).catch(()=>undefined);}await adapter.shutdown();await rm(dir,{recursive:true,force:true});}});

test('LIVE Frontier engine deterministically links cited locked claims',{skip:!process.env.NLM_LIVE_ENGINE_TEST,timeout:1800000},async()=>{
  const adapter=new UpstreamNotebookLmAdapter();
  const dir=await mkdtemp(join(tmpdir(),'frontier-engine-live-'));
  const store=new Store(join(dir,'registry.json'));
  const registry=new NotebookRegistry(store,adapter,3600000);
  let created;
  const runs=Number(process.env.NLM_LIVE_ENGINE_RUNS??5);
  const soakRuns=Number(process.env.NLM_LIVE_SOAK_RUNS??0);
  let linkagePasses=0;let semanticPasses=0;
  const targetedLatencies=[];const soakLatencies=[];
  try{
    const health=await adapter.health();
    assert.equal(health.ok,true,health.detail);
    await registry.sync(true);
    created=await adapter.createNotebook(`FRONTIER-CERT-ENGINE-${Date.now()}`);
    await adapter.addTextSource(created.id,'Frontier deterministic source','FRONTIER-CODE-7319 is the exact certification code. The certification color is cobalt blue. No other code or color is valid.');
    await registry.refresh(created.id);
    const engine=new ResearchEngine(registry,adapter,store);
    for(let i=0;i<runs;i++){
      const started=Date.now();
      const capsule=await engine.run({query:'Using only this source, state the exact certification code and certification color in two concise sentences. Include NotebookLM citation markers for each factual sentence.',notebook:created.id,mode:'INSTANT',internetPolicy:'LOCKED'});
      targetedLatencies.push(Date.now()-started);
      assert.equal(capsule.corpusPolicy,'LOCKED');assert.equal(capsule.internetPolicy,'LOCKED');assert.equal(capsule.performance.adapter,adapter.name);
      assert.match(capsule.answer,/FRONTIER-CODE-7319/i);assert.match(capsule.answer,/cobalt|azul cobalto/i);
      assert.ok(capsule.evidence.length>0,'Frontier capsule has no cited evidence');assert.equal(capsule.externalEvidence.length,0);
      const material=capsule.claims.filter(claim=>/7319|cobalt|cobalto/i.test(claim.text));
      assert.ok(material.length>0,'Frontier capsule did not produce a deterministic material claim');
      assert.ok(material.some(claim=>claim.evidenceIds.length>0),'Frontier capsule did not link a deterministic claim to a citation');
      assert.ok(material.every(claim=>claim.evidenceIds.every(id=>capsule.evidence.some(e=>e.evidenceId===id&&e.answerPass===0))),'Citation leaked from another answer pass');
      linkagePasses++;if(material.some(claim=>claim.status==='SUPPORTED'||claim.status==='PARTIALLY_SUPPORTED'))semanticPasses++;
      console.log(JSON.stringify({event:'frontier.live_locked_engine',run:i+1,latencyMs:targetedLatencies.at(-1),citationLinkage:'PASS',semanticVerification:material.some(claim=>claim.status==='SUPPORTED'||claim.status==='PARTIALLY_SUPPORTED')?'PASS':'PARTIAL',externalEvidence:capsule.externalEvidence.length,wrongCitationAssignment:0}));
    }
    assert.equal(linkagePasses,runs);
    console.log(JSON.stringify({event:'frontier.live_locked_engine.summary',runs:`${runs}/${runs}`,citationLinkage:`${linkagePasses}/${runs}`,semanticVerified:`${semanticPasses}/${runs}`,externalLeakage:`0/${runs}`,wrongCitationAssignment:`0/${runs}`,medianLatencyMs:median(targetedLatencies),maxLatencyMs:Math.max(...targetedLatencies)}));

    for(let i=0;i<soakRuns;i++){
      const started=Date.now();
      const answer=await adapter.ask(created.id,'Using only the source, return the exact certification code and certification color in one sentence with citations.');
      soakLatencies.push(Date.now()-started);
      assert.match(answer.text,/FRONTIER-CODE-7319/i);assert.match(answer.text,/cobalt|azul cobalto/i);assert.ok(answer.citations.length>0,'Soak answer returned no citations');
      console.log(JSON.stringify({event:'frontier.live_soak',query:i+1,status:'PASS',latencyMs:soakLatencies.at(-1),citations:answer.citations.length}));
    }
    if(soakRuns)console.log(JSON.stringify({event:'frontier.live_soak.summary',queries:`${soakRuns}/${soakRuns}`,fail:0,medianLatencyMs:median(soakLatencies),maxLatencyMs:Math.max(...soakLatencies)}));
  }finally{
    if(created){const remaining=await adapter.listNotebooks().catch(()=>[]);if(remaining.some(n=>n.id===created.id))await adapter.deleteNotebooks([created.id]).catch(()=>undefined);}
    await adapter.shutdown();await rm(dir,{recursive:true,force:true});
  }
});

function median(values){const sorted=[...values].sort((a,b)=>a-b);const middle=Math.floor(sorted.length/2);return sorted.length%2?sorted[middle]:Math.round((sorted[middle-1]+sorted[middle])/2);}
