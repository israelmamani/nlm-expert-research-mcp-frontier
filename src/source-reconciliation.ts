export type ReconciledSource={id:string;notebookId:string;title:string};
export type SourceCreationSignal={sourceId?:string;sourceName?:string};
export type ReconciliationState='REMOTE_CONFIRMED'|'UPSTREAM_FALSE_NEGATIVE_RECOVERED';

export const SOURCE_RECONCILIATION_DELAYS_MS=[1000,2000,4000,4000,4000,4000,4000,4000];

function matchSource(sources:ReconciledSource[],baseline:Set<string>,notebookId:string,signal:SourceCreationSignal,title:string){
  const eligible=sources.filter(source=>source.notebookId===notebookId);
  if(signal.sourceId){const byId=eligible.find(source=>source.id===signal.sourceId);if(byId)return byId;}
  const expectedTitle=signal.sourceName??title;
  const byTitle=eligible.find(source=>source.title===expectedTitle);if(byTitle)return byTitle;
  const added=eligible.filter(source=>!baseline.has(source.id));
  return added.length===1?added[0]:undefined;
}

export async function createTextSourceWithRemoteConfirmation(options:{notebookId:string;title:string;create:()=>Promise<SourceCreationSignal>;list:()=>Promise<ReconciledSource[]>;sleep?:(ms:number)=>Promise<void>;delaysMs?:number[]}){
  const baselineRows=await options.list();
  const baseline=new Set(baselineRows.map(source=>source.id));
  let signal:SourceCreationSignal={};let creationError:unknown;
  try{signal=await options.create();}catch(error){creationError=error;}
  const sleep=options.sleep??(ms=>new Promise<void>(resolve=>setTimeout(resolve,ms)));
  for(const delay of options.delaysMs??SOURCE_RECONCILIATION_DELAYS_MS){
    const source=matchSource(await options.list(),baseline,options.notebookId,signal,options.title);
    if(source)return {source,state:creationError?'UPSTREAM_FALSE_NEGATIVE_RECOVERED' as const:'REMOTE_CONFIRMED' as const};
    await sleep(delay);
  }
  const finalSource=matchSource(await options.list(),baseline,options.notebookId,signal,options.title);
  if(finalSource)return {source:finalSource,state:creationError?'UPSTREAM_FALSE_NEGATIVE_RECOVERED' as const:'REMOTE_CONFIRMED' as const};
  const reason=creationError?String(creationError):'upstream source_add returned without remote confirmation';
  throw new Error(`SOURCE_INGESTION_NOT_CONFIRMED: ${reason}`);
}
