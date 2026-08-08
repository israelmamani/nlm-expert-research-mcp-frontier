import {mkdir, readFile, writeFile, rename, copyFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {createHash} from 'node:crypto';
import type {Notebook, Passport, ResearchCapsule, Source} from './types.js';

export interface Registry { notebooks:Notebook[]; sources:Source[]; passports:Passport[]; sessions:ResearchCapsule[]; }
const empty:Registry = {notebooks:[],sources:[],passports:[],sessions:[]};
export class Store {
  constructor(public readonly file:string) {}
  async load():Promise<Registry> {
    try { return {...empty,...JSON.parse(await readFile(this.file,'utf8'))}; }
    catch { try { return {...empty,...JSON.parse(await readFile(this.file+'.bak','utf8'))}; } catch { return structuredClone(empty); } }
  }
  async save(data:Registry) {
    await mkdir(dirname(this.file),{recursive:true}); const temp=`${this.file}.${process.pid}.tmp`; const body=JSON.stringify(data,null,2);
    await writeFile(temp,body,'utf8'); try { await copyFile(this.file,this.file+'.bak'); } catch { /* first write */ } await rename(temp,this.file);
  }
  static fingerprint(value:unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,16); }
}
