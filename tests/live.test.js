import test from 'node:test';
import assert from 'node:assert/strict';
import {UpstreamNotebookLmAdapter} from '../dist/upstream-adapter.js';
import {NotebookRegistry} from '../dist/registry.js';
import {Store} from '../dist/storage.js';
import {ResearchEngine} from '../dist/research.js';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const CERT_TEXT='FRONTIER-CODE-7319 is the exact certification code. The certification color is cobalt blue. The certification animal is the condor. No other code, color, or animal is valid.';
const CERT_QUERY='Using only the notebook source, what are the exact certification code, color, and animal? Include NotebookLM citations.';

test('LIVE NotebookLM auth persistence and enumeration',{skip:!process.env.NLM_LIVE_TEST,timeout:300000},async()=>{
  const adapter=new UpstreamNotebookLmAdapter();
  try{
    const health=await adapter.health();assert.equal(health.ok,true,health.detail);
    await adapter.shutdown();
    const persisted=await adapter.health();assert.equal(persisted.ok,true,`Authentication did not persist after restart: ${persisted.detail}`);
    const notebooks=await adapter.listNotebooks();assert.ok(notebooks.length>0,'Authenticated account returned no notebooks');
    console.log(JSON.stringify({event:'frontier.live_auth',auth:'PASS',persistence:'PASS',enumeration:'PASS',notebooks:notebooks.length}));
  }finally{await adapter.shutdown();}
});

test('LIVE controlled notebook lifecycle, locked engine and soak',{skip:!process.env.NLM_LIVE_DYNAMIC_TEST&&!process.env.NLM_LIVE_ENGINE_TEST,timeout:1800000},async()=>{
  const adapter=new UpstreamNotebookLmAdapter();
  const dir=await mkdtemp(join(tmpdir(),'frontier-cert-live-'));
  const store=new Store(join(dir,'registry.json'));
  const registry=new NotebookRegistry(store,adapter,3600000);
  const engineRuns=Number(process.env.NLM_LIVE_ENGINE_RUNS??5);
  const soakRuns=Number(process.env.NLM_LIVE_SOAK_RUNS??0);
  const targetedLatencies=[];const soakLatencies=[];
  let linkagePasses=0;let semanticPasses=0;let created;
  try{
    const health=await adapter.health();assert.equal(health.ok,true,health.detail);
    await registry.sync(true);
    const name=`FRONTIER-CERT-${Date.now()}`;
    created=await adapter.createNotebook(name);assert.equal(created.title,name,'Notebook title was not applied');
    const resolved=await registry.resolve(name);assert.equal(resolved.id,created.id,'Refresh-on-miss did not discover the notebook in the same session');

    const confirmed=await adapter.addTextSource(created.id,'Frontier deterministic source',CERT_TEXT);
    assert.ok(confirmed.source.id,'Remote source confirmation returned no source id');
    await registry.refresh(created.id);
    const sources=await registry.sources(created.id);
    assert.ok(sources.some(source=>source.id===confirmed.source.id),'RPC source list did not expose the newly added source');

    const grounded=await adapter.ask(created.id,CERT_QUERY);assertDeterministicAnswer(grounded);
    console.log(JSON.stringify({event:'frontier.live_dynamic',dynamicNotebook:'PASS',dynamicSource:'PASS',groundedQuery:'PASS',citations:'PASS',sourceId:confirmed.source.id.slice(-8)}));

    const engine=new ResearchEngine(registry,adapter,store);
    for(let i=0;i<engineRuns;i++){
      const started=Date.now();
      const capsule=await engine.run({query:CERT_QUERY,notebook:created.id,mode:'INSTANT',internetPolicy:'LOCKED'});
      targetedLatencies.push(Date.now()-started);
      assert.equal(capsule.corpusPolicy,'LOCKED');assert.equal(capsule.internetPolicy,'LOCKED');assert.equal(capsule.externalEvidence.length,0);
      assert.match(capsule.answer,/FRONTIER-CODE-7319/i);assert.match(capsule.answer,/cobalt|azul cobalto/i);assert.match(capsule.answer,/c[oó]ndor/i);
      const material=capsule.claims.filter(claim=>/7319|cobalt|cobalto|c[oó]ndor/i.test(claim.text));
      assert.ok(material.length>0,'No deterministic material claim was produced');
      assert.ok(material.some(claim=>claim.evidenceIds.length>0),'No deterministic claim linked to a citation');
      assert.ok(material.every(claim=>claim.evidenceIds.every(id=>capsule.evidence.some(evidence=>evidence.evidenceId===id&&evidence.answerPass===0))),'Wrong-pass citation assignment');
      linkagePasses++;if(material.some(claim=>claim.status==='SUPPORTED'||claim.status==='PARTIALLY_SUPPORTED'))semanticPasses++;
      console.log(JSON.stringify({event:'frontier.live_locked_engine',run:i+1,latencyMs:targetedLatencies.at(-1),citationLinkage:'PASS',semanticVerification:material.some(claim=>claim.status==='SUPPORTED'||claim.status==='PARTIALLY_SUPPORTED')?'PASS':'PARTIAL',externalEvidence:0,wrongCitationAssignment:0}));
    }
    assert.equal(linkagePasses,engineRuns);
    console.log(JSON.stringify({event:'frontier.live_locked_engine.summary',runs:`${engineRuns}/${engineRuns}`,citationLinkage:`${linkagePasses}/${engineRuns}`,semanticVerified:`${semanticPasses}/${engineRuns}`,externalLeakage:`0/${engineRuns}`,wrongCitationAssignment:`0/${engineRuns}`,medianLatencyMs:median(targetedLatencies),maxLatencyMs:Math.max(...targetedLatencies)}));

    for(let i=0;i<soakRuns;i++){
      const started=Date.now();const answer=await adapter.ask(created.id,CERT_QUERY);soakLatencies.push(Date.now()-started);assertDeterministicAnswer(answer);
      console.log(JSON.stringify({event:'frontier.live_soak',query:i+1,status:'PASS',latencyMs:soakLatencies.at(-1),citations:answer.citations.length}));
    }
    if(soakRuns)console.log(JSON.stringify({event:'frontier.live_soak.summary',queries:`${soakRuns}/${soakRuns}`,fail:0,medianLatencyMs:median(soakLatencies),maxLatencyMs:Math.max(...soakLatencies)}));

    await adapter.deleteNotebooks([created.id]);created=undefined;
    await registry.refresh();await assert.rejects(()=>registry.resolve(name,'force'),/NOTEBOOK_NOT_FOUND/);
    console.log(JSON.stringify({event:'frontier.live_delete_invalidation',status:'PASS'}));
  }finally{
    if(created){const remaining=await adapter.listNotebooks().catch(()=>[]);if(remaining.some(notebook=>notebook.id===created.id))await adapter.deleteNotebooks([created.id]).catch(()=>undefined);}
    await adapter.shutdown();await rm(dir,{recursive:true,force:true});
  }
});

function assertDeterministicAnswer(answer){
  assert.match(answer.text,/FRONTIER-CODE-7319/i);assert.match(answer.text,/cobalt|azul cobalto/i);assert.match(answer.text,/c[oó]ndor/i);
  assert.ok(answer.citations.length>0,'NotebookLM returned no structured citations');
  assert.ok(answer.citations.every(citation=>citation.sourceId),'RPC citation omitted authoritative sourceId');
  assert.ok(answer.citations.every(citation=>citation.sourceTitle),'RPC citation omitted source title');
}

function median(values){const sorted=[...values].sort((a,b)=>a-b);const middle=Math.floor(sorted.length/2);return sorted.length%2?sorted[middle]:Math.round((sorted[middle-1]+sorted[middle])/2);}
