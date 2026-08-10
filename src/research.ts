import {randomUUID} from 'node:crypto';
import type {AdapterAnswer, CitationLinkageMethod, Claim, Evidence, InternetPolicy, ResearchCapsule, ResearchMode} from './types.js';
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
    // One long-lived upstream browser/RPC session is intentionally serialized.
    // A watchdog restart must never interrupt sibling requests sharing that transport.
    for(const q of qs){const answer=await this.adapter.ask(notebook.id,q.query);answers.push({...answer,purpose:q.purpose});if(mode==='INSTANT')break;}
    const evidence:Evidence[]=dedupeEvidence(answers.flatMap((a,answerPass)=>a.citations.map(c=>({evidenceId:`ev_${randomUUID().slice(0,8)}`,sourceId:c.sourceId,sourceTitle:c.sourceTitle,quote:c.quote??'',locator:c.locator,citationMarker:c.marker??c.locator,excerptAvailable:c.excerptAvailable??Boolean(c.quote?.trim()),answerPass,role:a.purpose==='counter'?'counter':a.purpose==='support'?'support':'context',status:'UNVERIFIED' as const,layer:'CANONICAL_CORPUS' as const}))));
    const answer=answers[0]?.text??'NOT_FOUND_IN_CORPUS'; const primaryEvidence=evidence.filter(e=>e.answerPass===0&&e.role!=='counter'); const counterEvidence=evidence.filter(e=>e.role==='counter'); const claims=claimify(answer,primaryEvidence,counterEvidence); const conflicts=detectConflicts(counterEvidence); const external=await challenge(input.query,internet);
    const usedSourceIds=new Set(evidence.map(e=>e.sourceId).filter((id): id is string=>Boolean(id)));
    const coverage=Math.min(1, sources.length?usedSourceIds.size/sources.length:0);
    const answerPresent=Boolean(answer.trim())&&answer!=='NOT_FOUND_IN_CORPUS';const evidencePresent=evidence.length>0;const claimsPresent=claims.length>0;const claimsSupported=claimsPresent&&claims.every(c=>c.status==='SUPPORTED'||c.status==='PARTIALLY_SUPPORTED');
    const qualityStatus=!answerPresent||!evidencePresent||!claimsPresent?'FAIL':claimsSupported?'PASS':'WARN';
    const capsule:ResearchCapsule={researchId:`rs_${randomUUID().slice(0,12)}`,notebook,mode,corpusPolicy:'LOCKED',internetPolicy:internet,answer:answer.slice(0,8000),keyFindings:answers.map(a=>a.text.slice(0,1200)).slice(0,5),claims,evidence:evidence.map(e=>({...e,quote:e.quote.slice(0,2000)})),conflicts,uncertainties:answer.includes('not')?['The adapter did not produce evidence for every aspect of the request.']:[],gaps:coverage<0.5?['Relevant source coverage is incomplete.']:[],externalEvidence:external.evidence.map(e=>({...e,quote:e.quote.slice(0,1200)})),coverage:{queries:answers.length,sourcesConsidered:sources.length,sourcesUsed:usedSourceIds.size,score:coverage,saturation:answers.length>=passes?'HIGH':'MEDIUM'},quality:{status:qualityStatus,reasons:[...(!answerPresent?['NotebookLM returned no material answer.']:[]),...(!claimsPresent?['No material claims were extracted.']:[]),...(!evidencePresent?['No structured citation evidence was returned.']:[]),...(claimsPresent&&!claimsSupported?['One or more material claims lack specific supporting evidence.']:[]),...(external.used?['External evidence is quarantined as candidate data.']:[])]},performance:{latencyMs:Date.now()-started,adapter:this.adapter.name,cacheHit:false}};
    await this.store.update(data=>{data.sessions.unshift(capsule);data.sessions=data.sessions.slice(0,100);});
    const output=compactCapsule(capsule);
    log('info','research.complete',{researchId:capsule.researchId,mode,latencyMs:capsule.performance.latencyMs,queries:answers.length,outputChars:JSON.stringify(output).length});return output;
  }
  async evidence(id:string){const d=await this.store.load();for(const s of d.sessions){const e=s.evidence.find(x=>x.evidenceId===id);if(e)return e;}return null;}
}
function compactCapsule(capsule:ResearchCapsule):ResearchCapsule{
  const budget=capsule.mode==='INSTANT'?{answer:1200,findings:1,finding:300,evidence:3,quote:240}:capsule.mode==='STANDARD'||capsule.mode==='AUTO'?{answer:3000,findings:2,finding:550,evidence:8,quote:400}:capsule.mode==='DEEP'||capsule.mode==='VERIFY'?{answer:6000,findings:3,finding:800,evidence:16,quote:650}:{answer:8000,findings:5,finding:1200,evidence:30,quote:900};
  const evidence=capsule.evidence.slice(0,budget.evidence).map(item=>({...item,quote:item.quote.slice(0,budget.quote)}));
  const hidden=capsule.evidence.length-evidence.length;
  return {...capsule,answer:capsule.answer.slice(0,budget.answer),keyFindings:capsule.keyFindings.slice(0,budget.findings).map(item=>item.slice(0,budget.finding)),evidence,gaps:hidden>0?[...capsule.gaps,`${hidden} additional evidence item(s) are retained for get_evidence retrieval.`]:capsule.gaps};
}
function validMode(m?:ResearchMode){return m&&modes.has(m)?m:'AUTO' as ResearchMode;}
function plan(q:string,n:number,m:ResearchMode){const qs:[{query:string;purpose:'primary'|'support'|'counter'|'forensic'}]=[{query:q,purpose:'primary'}];if(n>1)qs.push({query:`Which sources support or limit this question? ${q}`,purpose:'support'});if(n>2)qs.push({query:`Find sources that contradict, qualify, distinguish, or create exceptions to this proposition: ${q}`,purpose:'counter'});if(n>3)qs.push({query:`Perform a forensic citation and gap check for: ${q}`,purpose:'forensic'});return qs;}
export function claimify(text:string,support:Evidence[],counter:Evidence[]):Claim[]{const scopedSupport=support.filter(e=>e.answerPass===undefined||e.answerPass===0);const parts=text.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0,8);return parts.map((t,i)=>{
  const explicit=explicitMarkerEvidence(t,scopedSupport);
  const ranked=explicit.length?explicit.map(e=>({e,score:overlap(t,e.quote)})):scopedSupport.filter(e=>Boolean(e.quote.trim())).map(e=>({e,score:overlap(t,e.quote)})).filter(x=>x.score>=0.15).sort((a,b)=>b.score-a.score).slice(0,2);
  const linkage:Record<string,CitationLinkageMethod>={};
  for(const item of ranked)linkage[item.e.evidenceId]=explicit.includes(item.e)?'explicit_marker':'excerpt_match';
  const evidenceIds=ranked.map(item=>item.e.evidenceId);
  const counterIds=counter.map(e=>({e,score:overlap(t,e.quote)})).filter(x=>x.score>=0.35).map(x=>x.e.evidenceId);
  const strongest=Math.max(0,...ranked.map(item=>item.score));
  const excerptUnavailable=evidenceIds.length>0&&ranked.every(item=>!(item.e.excerptAvailable??Boolean(item.e.quote.trim()))||!item.e.quote.trim());
  const status=counterIds.length?'CONTRADICTED':!evidenceIds.length?'UNVERIFIED':excerptUnavailable?'UNVERIFIED':strongest>=0.35?'SUPPORTED':strongest>0?'PARTIALLY_SUPPORTED':'UNVERIFIED';
  const verificationReason=excerptUnavailable?'CITATION_EXCERPT_UNAVAILABLE':!evidenceIds.length?'NO_CITATION_LINKAGE':status==='SUPPORTED'?'LEXICAL_SUPPORT_VERIFIED':status==='PARTIALLY_SUPPORTED'?'PARTIAL_LEXICAL_SUPPORT':'CITATION_LINKED_WITHOUT_VERIFIABLE_SUPPORT';
  return {claimId:`cl_${i+1}`,text:t,status,evidenceIds,counterEvidenceIds:counterIds,evidenceLinkage:linkage,verificationReason};
});}
function explicitMarkerEvidence(claim:string,evidence:Evidence[]){const markers=markerRefs(claim);if(!markers.size)return [];return evidence.filter(item=>{const marker=markerKey(item.citationMarker??item.locator);return marker!==undefined&&markers.has(marker);});}
function markerRefs(text:string){const refs=new Set<string>();for(const group of text.matchAll(/[\[【]\s*([0-9]+(?:\s*[,;]\s*[0-9]+)*)\s*[\]】]/g))for(const value of group[1].split(/[,;]/))refs.add(value.trim());return refs;}
function markerKey(marker:string|undefined){if(!marker)return undefined;const match=marker.match(/(\d+)/);return match?.[1];}
function overlap(a:string,b:string){const passages=b.split(/(?<=[.!?])\s+/).filter(Boolean);return Math.max(0,...passages.map(p=>overlapSentence(a,p)));}
function overlapSentence(a:string,b:string){const words=(x:string)=>new Set(x.toLowerCase().split(/\W+/).filter(w=>w.length>4));const aw=words(a);const bw=words(b);if(!aw.size)return 0;const negA=/\b(no|not|never|sin|nunca|prohib)/i.test(a);const negB=/\b(no|not|never|sin|nunca|prohib)/i.test(b);if(negA!==negB)return 0;return [...aw].filter(w=>bw.has(w)).length/aw.size;}
function dedupeEvidence(items:Evidence[]){const seen=new Set<string>();return items.filter(e=>{const key=`${e.sourceId??e.sourceTitle}|${e.locator??''}|${e.quote}`;if(seen.has(key))return false;seen.add(key);return true;});}
function detectConflicts(as:Evidence[]){return as.length?['Counter-evidence was requested and preserved separately; inspect counterEvidenceIds on affected claims.']:[];}
