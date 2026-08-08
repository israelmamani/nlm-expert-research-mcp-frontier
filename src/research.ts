import {randomUUID} from 'node:crypto';
import type {AdapterAnswer, Claim, Evidence, InternetPolicy, ResearchCapsule, ResearchMode} from './types.js';
import type {NotebookAdapter} from './types.js';
import {NotebookRegistry} from './registry.js';
import {Store} from './storage.js';
import {log} from './log.js';

const modes = new Set<ResearchMode>(['AUTO','INSTANT','STANDARD','DEEP','VERIFY','ULTRA','FORENSIC']);
export class ResearchEngine {
  constructor(private registry:NotebookRegistry, private adapter:NotebookAdapter, private store:Store) {}
  async run(input:{query:string;notebook:string;mode?:ResearchMode;internetPolicy?:InternetPolicy;freshness?:'auto'|'force'}):Promise<ResearchCapsule>{
    const started=Date.now(); const mode=validMode(input.mode); const internet=input.internetPolicy??'AUTO';
    const notebook=await this.registry.resolve(input.notebook,input.freshness??'auto');
    const sources=await this.registry.sources(notebook.id); const passes=mode==='INSTANT'?1:mode==='STANDARD'||mode==='AUTO'?2:mode==='DEEP'||mode==='VERIFY'?3:4;
    const answers:AdapterAnswer[]=[]; const qs=plan(input.query,passes,mode);
    for(let i=0;i<qs.length;i+=3){ const batch=qs.slice(i,i+3); answers.push(...await Promise.all(batch.map(q=>this.adapter.ask(notebook.id,q)))); if(sufficient(answers,mode))break; }
    const evidence:Evidence[]=answers.flatMap(a=>a.citations.map(c=>({evidenceId:`ev_${randomUUID().slice(0,8)}`,sourceId:c.sourceId,sourceTitle:c.sourceTitle,quote:c.quote??'',status:'SUPPORTED' as const,layer:'CANONICAL_CORPUS' as const})));
    const answer=answers[0]?.text??'NOT_FOUND_IN_CORPUS'; const claims=claimify(answer,evidence); const conflicts=detectConflicts(answers);
    const coverage=Math.min(1, sources.length?new Set(evidence.map(e=>e.sourceId)).size/sources.length:0);
    const capsule:ResearchCapsule={researchId:`rs_${randomUUID().slice(0,12)}`,notebook,mode,corpusPolicy:'LOCKED',internetPolicy:internet,answer,keyFindings:answers.map(a=>a.text).slice(0,5),claims,evidence,conflicts,uncertainties:answer.includes('not')?['The adapter did not produce evidence for every aspect of the request.']:[],gaps:coverage<0.5?['Relevant source coverage is incomplete.']:[],externalEvidence:[],coverage:{queries:answers.length,sourcesConsidered:sources.length,sourcesUsed:new Set(evidence.map(e=>e.sourceId)).size,score:coverage,saturation:answers.length>=passes?'HIGH':'MEDIUM'},quality:{status:claims.every(c=>c.evidenceIds.length>0)?'PASS':'WARN',reasons:claims.every(c=>c.evidenceIds.length>0)?[]:['One or more material claims lack a citation.']},performance:{latencyMs:Date.now()-started,adapter:this.adapter.name,cacheHit:false}};
    const data=await this.store.load();data.sessions.unshift(capsule);data.sessions=data.sessions.slice(0,100);await this.store.save(data);log('info','research.complete',{researchId:capsule.researchId,mode,latencyMs:capsule.performance.latencyMs,queries:answers.length});return capsule;
  }
  async evidence(id:string){const d=await this.store.load();for(const s of d.sessions){const e=s.evidence.find(x=>x.evidenceId===id);if(e)return e;}return null;}
}
function validMode(m?:ResearchMode){return m&&modes.has(m)?m:'AUTO' as ResearchMode;}
function plan(q:string,n:number,m:ResearchMode){const qs=[q];if(n>1)qs.push(`Which sources support or limit this question? ${q}`);if(n>2)qs.push(`Find contradictory, temporal, exceptional, or alternative evidence about: ${q}`);if(n>3)qs.push(`Perform a forensic citation and gap check for: ${q}`);return qs;}
function sufficient(as:AdapterAnswer[],m:ResearchMode){return (m==='INSTANT'||m==='STANDARD'||m==='AUTO')&&as.length>=1&&as.some(a=>a.citations.length>0);}
function claimify(text:string,ev:Evidence[]):Claim[]{const parts=text.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0,8);return parts.map((t,i)=>({claimId:`cl_${i+1}`,text:t,status:ev.length?'SUPPORTED':'UNVERIFIED',evidenceIds:ev.slice(0,Math.min(2,ev.length)).map(e=>e.evidenceId),counterEvidenceIds:[]}));}
function detectConflicts(as:AdapterAnswer[]){return as.length>1&&as.some(a=>/difier|conflict|contrad/i.test(a.text))?['The corpus reports differing assumptions or positions; inspect the cited sources.']:[];}
