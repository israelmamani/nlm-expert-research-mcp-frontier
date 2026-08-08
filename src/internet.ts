import type {Evidence, InternetPolicy} from './types.js';

export interface ExternalResearch {used:boolean; evidence:Evidence[]; reason:string;}
/** Small, opt-in challenger. Search results remain candidates; no snippet is canonical evidence. */
export async function challenge(query:string, policy:InternetPolicy):Promise<ExternalResearch>{
  if(policy==='LOCKED'||!needed(query,policy))return {used:false,evidence:[],reason:'Internet necessity gate: OFF'};
  try {const url=`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;const res=await fetch(url,{headers:{'user-agent':'NLM-Expert-Research-MCP/0.1'}});if(!res.ok)return {used:false,evidence:[],reason:`External HTTP ${res.status}`};const html=await res.text();const evidence:Evidence[]=[];for(const m of html.matchAll(/<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi)){const title=clean(m[2]);const href=decodeURIComponent(m[1]);if(!title||!href)continue;evidence.push({evidenceId:`ext_${evidence.length+1}`,sourceTitle:title,quote:href,layer:'CANDIDATE_EXTERNAL',status:'UNVERIFIED'});if(evidence.length>=5)break;}return {used:evidence.length>0,evidence,reason:'External results are discovery candidates and require explicit verification.'};}
  catch(e){return {used:false,evidence:[],reason:`External research unavailable: ${String(e)}`};}
}
function needed(q:string,p:InternetPolicy){return p!=='AUTO'||/today|current|vigente|actual|verify|verifica|extern|web|internet|falta/i.test(q);}
function clean(s:string){return s.replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&#x27;/g,"'").replace(/\s+/g,' ').trim();}
