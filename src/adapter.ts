import type {AdapterAnswer, Notebook, NotebookAdapter, Source} from './types.js';
import {log} from './log.js';

/** Deterministic adapter used for local contract tests and offline development. */
export class MockNotebookAdapter implements NotebookAdapter {
  name = 'mock';
  private notebooks:Notebook[] = [
    {id:'nb-contracts',title:'Contratos Municipales',aliases:['contratos','municipales'],sourceCount:2},
    {id:'nb-tidal',title:'TIDAL',aliases:['tidal'],sourceCount:2}
  ];
  private sources:Source[] = [
    {id:'src-law',notebookId:'nb-contracts',title:'Ley de Contrataciones',type:'pdf'},
    {id:'src-bid',notebookId:'nb-contracts',title:'Pliego de licitación',type:'pdf'},
    {id:'src-tidal-spec',notebookId:'nb-tidal',title:'TIDAL technical report',type:'pdf'},
    {id:'src-tidal-fin',notebookId:'nb-tidal',title:'TIDAL financial model',type:'xlsx'}
  ];
  private answers:Record<string,string> = {
    'nb-contracts': 'Las fuentes describen requisitos de contratación, criterios de evaluación y obligaciones del adjudicatario. La ley establece el marco general; el pliego concreta el procedimiento para este caso. La evidencia no permite afirmar hechos fuera de esos documentos.',
    'nb-tidal': 'Las fuentes describen la arquitectura técnica y supuestos financieros del proyecto TIDAL. Los documentos difieren en sus supuestos de costes; esa diferencia debe conservarse como conflicto, no resolverse por inferencia.'
  };
  async health(){return {ok:true,state:'READY'};}
  async authenticate(){return {ok:true,state:'READY',detail:'mock adapter requires no credentials'};}
  async listNotebooks(){return structuredClone(this.notebooks);}
  async listSources(id:string){return this.sources.filter(s=>s.notebookId===id).map(s=>({...s}));}
  async ask(id:string, query:string):Promise<AdapterAnswer>{
    log('debug','mock.ask',{notebookId:id,queryLength:query.length});
    const text = this.answers[id] ?? 'NOT_FOUND_IN_CORPUS: no grounded answer is available in this notebook.';
    const ss = this.sources.filter(s=>s.notebookId===id);
    return {text,citations:ss.slice(0,2).map(s=>({sourceId:s.id,sourceTitle:s.title,quote:text})),sourceIds:ss.map(s=>s.id)};
  }
  async refresh(){}
  async shutdown(){}
  addNotebook(n:Notebook, sources:Source[]=[]){this.notebooks.push(n);this.sources.push(...sources);}
  renameNotebook(id:string,title:string){const n=this.notebooks.find(x=>x.id===id);if(n)n.title=title;}
  deleteNotebook(id:string){this.notebooks=this.notebooks.filter(n=>n.id!==id);this.sources=this.sources.filter(s=>s.notebookId!==id);}
}

/** Placeholder for the optional real browser transport. It fails closed until explicitly implemented/configured. */
export class BrowserNotebookAdapter implements NotebookAdapter {
  name='browser-experimental';
  async health(){return {ok:false,state:'TRANSPORT_UNAVAILABLE',detail:'Real NotebookLM browser transport is not enabled in this build.'};}
  async authenticate(_interactive?:boolean){return {ok:false,state:'AUTH_REQUIRED',detail:'Run setup-auth; browser transport must be supplied/configured.'};}
  async listNotebooks():Promise<Notebook[]>{throw new Error('BROWSER_TRANSPORT_UNAVAILABLE');}
  async listSources(_notebookId:string):Promise<Source[]>{throw new Error('BROWSER_TRANSPORT_UNAVAILABLE');}
  async ask(_notebookId:string,_query:string):Promise<AdapterAnswer>{throw new Error('BROWSER_TRANSPORT_UNAVAILABLE');}
  async refresh(){}
  async shutdown(){}
}
