import {randomUUID} from 'node:crypto';
import type {AdapterAnswer, Claim, Evidence, InternetPolicy, ResearchCapsule, ResearchMode} from './types.js';
import type {NotebookAdapter} from './types.js';
import {NotebookRegistry} from './registry.js';
import {Store} from './storage.js';
import {log} from './log.js';
import {challenge} from './internet.js';

const modes = new Set<ResearchMode>(['AUTO','INSTANT','STANDARD','DEEP','VERIFY','ULTRA','FORENSIC']);
export class ResearchEngine {
  constructor(private registry:NotebookRegistry, private adapter:NotebookAdapter, private store:Store) {}
  async run(input:{query:string;notebook:string;mode?:ResearchMode;internetPolicy?:InternetPolicy;freshness?:'auto'|'force'}):Promise<ResearchCapsule>{
    const started=Date.now(); const mode=validMode(input.mode); const internet=input.internetPolicy??'LOCKED';
    const notebook=await this.registry.resolve(input.notebook,input.freshness??'auto');
    const sources=await this.registry.sources(notebook.id); const passes=mode==='INSTANT'?1:mode==='STANDARD'||mode==='AUTO'?2:mode==='DEEP'||mode==='VERIFY'?3:4;
    const answers:AdapterAnswer[]=[]; const qs=plan(input.query,passes,mode);
    for(let i=0;i<qs.length;i+=3){ const batch=qs.slice(i,i+3); answers.push(...await Promise.all(batch.map(q=>this.adapter.ask(notebook.id,q.query).then(a=>({...a,purpose:q.purpose}))))); if(mode==='INSTANT')break; }
    const evidence:Evidence[]=dedupeEvidence(answers.flatMap(a=>a.citations.map(c=>({evidenceId:`ev_${randomUUID().slice(0,8)}`,sourceId:c.sourceId,sourceTitle:c.sourceTitle,quote:c.quote??'',locator:c.locator,role:a.purpose==='counter'?'counter':a.purpose==='support'?'support':'context',status:'SUPPORTED' as const,layer:'CANONICAL_CORPUS' as const}))));
    const answer=answers[0]?.text??'NOT_FOUND_IN_CORPUS'; const supportEvidence=evidence.filter(e=>e.role!=='counter'); const counterEvidence=evidence.filter(e=>e.role==='counter'); const claims=claimify(answer,supportEvidence,counterEvidence); const conflicts=detectConflicts(counterEvidence); const external=await challenge(input.query,internet);
    const usedSourceIds=new Set(evidence.map(e=>e.sourceId).filter((id): id is string=>Boolean(id)));
    const coverage=Math.min(1, sources.length?usedSourceIds.size/sources.length:0);
    const capsule:ResearchCapsule={researchId:`rs_${randomUUID().slice(0,12)}`,notebook,mode,corpusPolicy:'LOCKED',internetPolicy:internet,answer:answer.slice(0,5000),keyFindings:answers.map(a=>a.text.slice(0,700)).slice(0,5),claims,evidence:evidence.map(e=>({...e,quote:e.quote.slice(0,800)})),conflicts,uncertainties:answer.includes('not')?['The adapter did not produce evidence for every aspect of the request.']:[],gaps:coverage<0.5?['Relevant source coverage is incomplete.']:[],externalEvidence:external.evidence,coverage:{queries:answers.length,sourcesConsidered:sources.length,sourcesUsed:usedSourceIds.size,score:coverage,saturation:answers.length>=passes?'HIGH':'MEDIUM'},quality:{status:claims.every(c=>c.status==='SUPPORTED'||c.status==='PARTIALLY_SUPPORTED')?'PASS':'WARN',reasons:[...(claims.every(c=>c.status==='SUPPORTED'||c.status==='PARTIALLY_SUPPORTED')?[]:['One or more material claims lack specific supporting evidence.']),...(external.used?['External evidence is quarantined as candidate data.']:[])]},performance:{latencyMs:Date.now()-started,adapter:this.adapter.name,cacheHit:false}};
    await this.store.update(data=>{data.sessions.unshift(capsule);data.sessions=data.sessions.slice(0,100);}); log('info','research.complete',{researchId:capsule.researchId,mode,latencyMs:capsule.performance.latencyMs,queries:answers.length});return capsule;
  }
  async evidence(id:string){const d=await this.store.load();for(const s of d.sessions){const e=s.evidence.find(x=>x.evidenceId===id);if(e)return e;}return null;}
}
function validMode(m?:ResearchMode){return m&&modes.has(m)?m:'AUTO' as ResearchMode;}
function plan(q:string,n:number,m:ResearchMode){const qs:[{query:string;purpose:'primary'|'support'|'counter'|'forensic'}]=[{query:q,purpose:'primary'}];if(n>1)qs.push({query:`Which sources support or limit this question? ${q}`,purpose:'support'});if(n>2)qs.push({query:`Find sources that contradict, qualify, distinguish, or create exceptions to this proposition: ${q}`,purpose:'counter'});if(n>3)qs.push({query:`Perform a forensic citation and gap check for: ${q}`,purpose:'forensic'});return qs;}
export function claimify(text:string,support:Evidence[],counter:Evidence[]):Claim[]{const parts=text.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0,8);return parts.map((t,i)=>{const ranked=support.map(e=>({e,score:overlap(t,e.quote)})).filter(x=>x.score>=0.15).sort((a,b)=>b.score-a.score);const ids=ranked.slice(0,2).filter(x=>x.score>=0.35).map(x=>x.e.evidenceId);const partial=ranked.slice(0,2).map(x=>x.e.evidenceId);const counterIds=counter.map(e=>({e,score:overlap(t,e.quote)})).filter(x=>x.score>=0.35).map(x=>x.e.evidenceId);const status=counterIds.length?'CONTRADICTED':ids.length?'SUPPORTED':partial.length?'PARTIALLY_SUPPORTED':'UNVERIFIED';return {claimId:`cl_${i+1}`,text:t,status,evidenceIds:ids.length?ids:partial,counterEvidenceIds:counterIds};});}
function overlap(a:string,b:string){const passages=b.split(/(?<=[.!?])\s+/).filter(Boolean);return Math.max(0,...passages.map(p=>overlapSentence(a,p)));}
function overlapSentence(a:string,b:string){const words=(x:string)=>new Set(x.toLowerCase().split(/\W+/).filter(w=>w.length>4));const aw=words(a);const bw=words(b);if(!aw.size)return 0;const negA=/\b(no|not|never|sin|nunca|prohib)/i.test(a);const negB=/\b(no|not|never|sin|nunca|prohib)/i.test(b);if(negA!==negB)return 0;return [...aw].filter(w=>bw.has(w)).length/aw.size;}
function dedupeEvidence(items:Evidence[]){const seen=new Set<string>();return items.filter(e=>{const key=`${e.sourceId??e.sourceTitle}|${e.locator??''}|${e.quote}`;if(seen.has(key))return false;seen.add(key);return true;});}
function detectConflicts(as:Evidence[]){return as.length?['Counter-evidence was requested and preserved separately; inspect counterEvidenceIds on affected claims.']:[];}
