import type {Notebook, Passport, Source} from './types.js';
import type {NotebookAdapter} from './types.js';
import {Store} from './storage.js';
import {log} from './log.js';

export class NotebookRegistry {
  constructor(private store:Store, private adapter:NotebookAdapter, private ttlMs=60_000) {}
  private lastSync=0;
  async sync(force=false) {
    if (!force && Date.now()-this.lastSync<this.ttlMs) return;
    const data=await this.store.load(); const remote=await this.adapter.listNotebooks();
    data.notebooks=remote.map(n=>({...n,aliases:[...new Set([...(n.aliases??[]),normalize(n.title)])]}));
    for (const n of remote) await this.updateSources(data,n);
    data.passports=data.notebooks.map(n=>passport(n,data.sources.filter(s=>s.notebookId===n.id)));
    await this.store.save(data); this.lastSync=Date.now(); log('info','notebook.sync',{count:remote.length});
  }
  async resolve(input:string, freshness='auto'):Promise<Notebook> {
    await this.sync(freshness==='force'); let data=await this.store.load(); let found=find(data.notebooks,input);
    if (!found) { log('info','notebook.cache_miss',{input}); await this.sync(true); data=await this.store.load(); found=find(data.notebooks,input); }
    if (!found) throw new Error(`NOTEBOOK_NOT_FOUND: ${input}`); return found;
  }
  async refresh(notebookId?:string) { await this.sync(true); if(notebookId){const d=await this.store.load(); const n=d.notebooks.find(x=>x.id===notebookId);if(n){await this.updateSources(d,n);await this.store.save(d);}} }
  async sources(id:string){const d=await this.store.load();return d.sources.filter(s=>s.notebookId===id);}
  private async updateSources(data:Awaited<ReturnType<Store['load']>>, n:Notebook){const incoming=await this.adapter.listSources(n.id);data.sources=data.sources.filter(s=>s.notebookId!==n.id).concat(incoming);n.sourceCount=incoming.length;}
}
function normalize(x:string){return x.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();}
function find(ns:Notebook[], input:string){const x=normalize(input);const id=input.match(/(?:notebook\/|id:)([\w-]+)/i)?.[1]??input;return ns.find(n=>n.id===id||normalize(n.title)===x||n.aliases.some(a=>normalize(a)===x)) ?? ns.find(n=>normalize(n.title).includes(x)||x.includes(normalize(n.title)));
}
function passport(n:Notebook,s:Source[]):Passport{return {notebookId:n.id,title:n.title,aliases:n.aliases,sourceCount:s.length,sourceTypes:s.reduce((a,x)=>(a[x.type??'unknown']=(a[x.type??'unknown']??0)+1,a),{} as Record<string,number>),topics:[],lastLiveSync:new Date().toISOString(),fingerprint:Store.fingerprint({n,s}),status:'ready'};}
