import {chromium, type BrowserContext, type Page} from 'playwright';
import {mkdir, open, rm, readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {spawn, type ChildProcess} from 'node:child_process';
import type {AdapterAnswer, Citation, Notebook, NotebookAdapter, Source} from './types.js';
import {log} from './log.js';

const HOME='https://notebook.google.com/';
const AUTH='https://accounts.google.com/v3/signin/identifier?continue=https%3A%2F%2Fnotebook.google.com%2F&flowName=GlifWebSignIn&flowEntry=ServiceLogin';
const ANSWER='.to-user-container .message-text-content';
const INPUTS=['textarea.query-box-input','textarea[aria-label*="query" i]','textarea[aria-label*="consulta" i]','textarea[aria-label*="pregunta" i]','textarea[aria-label*="requete" i]'];
const SUBMITS=['button.submit-button','button[aria-label*="send" i]','button[aria-label*="enviar" i]'];

/** Real NotebookLM browser transport. UI selectors are deliberately isolated here. */
export class NotebookLmBrowserAdapter implements NotebookAdapter {
  name='notebooklm-browser';
  private context?:BrowserContext; private page?:Page; private lockHandle?:Awaited<ReturnType<typeof open>>; private cdpProcess?:ChildProcess; private cdpBrowser?:Awaited<ReturnType<typeof chromium.connectOverCDP>>;
  private readonly dataDir=process.env.NLM_DATA_DIR??join(process.cwd(),'.data');
  private readonly profileDir=process.env.NLM_BROWSER_PROFILE??join(this.dataDir,'browser-profile');
  private readonly lockFile=join(this.profileDir,'.lock');
  private readonly mode=(process.env.NLM_BROWSER_MODE??'auto') as 'auto'|'headless'|'visible';
  private timeout=Number(process.env.NLM_BROWSER_TIMEOUT_MS??60000);

  async health(){
    try { await this.openHome(); return {ok:true,state:'READY'}; }
    catch(e){const msg=String(e);const state=msg.includes('AUTH_REQUIRED')?'AUTH_REQUIRED':msg.includes('PROFILE_LOCKED')?'DEGRADED':'TRANSPORT_UNAVAILABLE';return {ok:false,state,detail:msg};}
  }
  async authenticate(interactive=false){
    try { if(interactive) await this.ensureInteractive(); else await this.ensure(false); const p=await this.getPage(); await p.goto(AUTH,{waitUntil:'domcontentloaded',timeout:this.timeout});
      if(!interactive) return {ok:false,state:'AUTH_REQUIRED',detail:'Run setup-auth for visible manual Google authentication.'};
      const deadline=Date.now()+Number(process.env.NLM_AUTH_TIMEOUT_MS??600000);
      while(Date.now()<deadline){if(await this.isAuthenticated(p)&&await this.hasSessionCookies()){log('info','auth.verified');await this.close();return {ok:true,state:'READY',detail:`Persistent profile: ${this.profileDir}`};}await new Promise(r=>setTimeout(r,500));}
      await this.close();return {ok:false,state:'AUTH_TIMEOUT',detail:'Google login was not completed before the deadline.'};
    } catch(e){await this.close().catch(()=>undefined);return {ok:false,state:'AUTH_ERROR',detail:String(e)};}
  }
  async listNotebooks(){const p=await this.openHome();return scrapeNotebooks(await p.evaluate(()=>Array.from(document.querySelectorAll('a[href*="/notebook/"]')).map(a=>({href:(a as HTMLAnchorElement).href,text:(a.textContent??'').trim(),parent:(a.parentElement?.parentElement?.textContent??'').trim()}))));}
  async listSources(notebookId:string){const p=await this.openNotebook(notebookId);return await p.evaluate((id)=>Array.from(document.querySelectorAll('.single-source-container')).map((el,i)=>({id:el.getAttribute('data-source-id')??`${id}-source-${i+1}`,notebookId:id,title:(el.textContent??'').replace(/\s+/g,' ').trim(),type:undefined})),notebookId);
  }
  async ask(notebookId:string,query:string):Promise<AdapterAnswer>{
    const p=await this.openNotebook(notebookId); const before=await p.locator(ANSWER).allInnerTexts().catch(()=>[]); const input=await firstVisible(p,INPUTS); if(!input)throw new Error('UI_INPUT_NOT_FOUND');
    await input.fill(query); const submit=await firstVisible(p,SUBMITS); if(submit)await submit.click(); else await input.press('Enter');
    const text=await waitForAnswer(p,query,before,this.timeout); if(!text)throw new Error('ANSWER_TIMEOUT');
    const citations=await extractCitations(p);const sources=await this.listSources(notebookId).catch(()=>[]);for(const c of citations){const match=sources.find(s=>c.sourceTitle.toLowerCase().includes(s.title.toLowerCase())||s.title.toLowerCase().includes(c.sourceTitle.toLowerCase()));if(match)c.sourceId=match.id;}return {text,citations,sourceIds:citations.map(c=>c.sourceId).filter(Boolean) as string[]};
  }
  async refresh(){await this.openHome();}
  async shutdown(){await this.close();}
  private async openHome(){let p=await this.getPage();await p.goto(HOME,{waitUntil:'domcontentloaded',timeout:this.timeout});if(!(await this.isAuthenticated(p))&&this.mode==='auto'){await this.close();await this.ensureInteractive(false);p=await this.getPage();await p.goto(HOME,{waitUntil:'domcontentloaded',timeout:this.timeout});}if(!(await this.isAuthenticated(p))){const title=await p.title().catch(()=> '');throw new Error(`AUTH_REQUIRED url=${p.url()} title=${title.slice(0,120)}`);}await p.waitForLoadState('networkidle',{timeout:Math.min(15000,this.timeout)}).catch(()=>undefined);return p;}
  private async openNotebook(id:string){const p=await this.openHome();const url=`${HOME}notebook/${encodeURIComponent(id)}`;if(!p.url().includes(`/notebook/${id}`))await p.goto(url,{waitUntil:'domcontentloaded',timeout:this.timeout});if(!(await this.isAuthenticated(p)))throw new Error('AUTH_REQUIRED');return p;}
  private async getPage(){await this.ensure(false);if(!this.page||this.page.isClosed())this.page=await this.context!.newPage();return this.page;}
  private async ensure(interactive=false,force=false){if(this.context&&!this.context.pages().some(p=>!p.isClosed())){this.page=await this.context.newPage();return;}if(this.context)return;await mkdir(this.profileDir,{recursive:true});await this.prepareLock(force);this.lockHandle=await open(this.lockFile,'wx').catch(()=>undefined);if(!this.lockHandle)throw new Error('PROFILE_LOCKED: persistent profile lock could not be acquired');await this.lockHandle.writeFile(String(process.pid));const executable=process.env.NLM_CHROME_PATH??findChrome();this.context=await chromium.launchPersistentContext(this.profileDir,{headless:!(interactive||this.mode==='visible'),executablePath:executable||undefined,viewport:{width:1440,height:1000},args:['--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding']});this.page=this.context.pages()[0]??await this.context.newPage();}
  private async ensureInteractive(show=true){
    if(this.context)return; await mkdir(this.profileDir,{recursive:true}); await this.prepareLock(false);
    this.lockHandle=await open(this.lockFile,'wx').catch(()=>undefined);if(!this.lockHandle)throw new Error('PROFILE_LOCKED: persistent profile lock could not be acquired');await this.lockHandle.writeFile(String(process.pid));
    const executable=process.env.NLM_CHROME_PATH??findChrome();if(!executable)throw new Error('CHROME_NOT_FOUND: set NLM_CHROME_PATH or install Google Chrome');
    const port=Number(process.env.NLM_CDP_PORT??9222);const backgroundArgs=show?[]:['--start-minimized','--window-position=-32000,-32000','--hide-crash-restore-bubble'];this.cdpProcess=spawn(executable,[`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1',`--user-data-dir=${this.profileDir}`,'--no-first-run','--no-default-browser-check',...backgroundArgs,'about:blank'],{windowsHide:false,stdio:'ignore'});
    const deadline=Date.now()+15000;let endpoint='';while(Date.now()<deadline){try{const response=await fetch(`http://127.0.0.1:${port}/json/version`);if(response.ok){const info=await response.json() as {webSocketDebuggerUrl?:string};endpoint=info.webSocketDebuggerUrl??'';if(endpoint)break;}}catch{}await new Promise(r=>setTimeout(r,250));}
    if(!endpoint){
      // Some managed Windows Chrome builds suppress the DevTools HTTP endpoint.
      // Fall back to Playwright's headed persistent context; authentication
      // remains visible and manual, while normal runtime stays headless.
      if(this.cdpProcess&&!this.cdpProcess.killed)this.cdpProcess.kill(); this.cdpProcess=undefined;
      this.context=await chromium.launchPersistentContext(this.profileDir,{headless:false,executablePath:executable||undefined,viewport:{width:1440,height:1000},args:['--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding']});
      this.page=this.context.pages()[0]??await this.context.newPage(); return;
    }
    this.cdpBrowser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);this.context=this.cdpBrowser.contexts()[0]??await this.cdpBrowser.newContext();this.page=this.context.pages()[0]??await this.context.newPage();if(show)await this.page.goto(AUTH,{waitUntil:'domcontentloaded',timeout:this.timeout});
  }
  private async isAuthenticated(p:Page){const url=p.url();if(url.includes('accounts.google.com'))return false;return url.includes('notebooklm.google.com')||url.includes('notebook.google.com');}
  private async hasSessionCookies(){if(!this.context)return false;const cookies=await this.context.cookies(['https://accounts.google.com','https://notebooklm.google.com']).catch(()=>[]);return cookies.some(c=>['SID','HSID','SSID','LSID','OSID','APISID','SAPISID'].includes(c.name));}
  private async close(){
    if(this.cdpBrowser){
      await this.page?.goto('chrome://quit/',{waitUntil:'commit',timeout:3000}).catch(()=>undefined);
      await waitForExit(this.cdpProcess,5000);
      await this.cdpBrowser.close().catch(()=>undefined);this.cdpBrowser=undefined;
    } else await this.context?.close().catch(()=>undefined);
    this.context=undefined;this.page=undefined;
    if(this.cdpProcess&&!this.cdpProcess.killed)this.cdpProcess.kill();this.cdpProcess=undefined;
    await this.lockHandle?.close().catch(()=>undefined);this.lockHandle=undefined;await rm(this.lockFile,{force:true}).catch(()=>undefined);
  }
  private async prepareLock(force:boolean){if(!existsSync(this.lockFile))return;if(force){await rm(this.lockFile,{force:true});return;}let pid=0;try{pid=Number((await readFile(this.lockFile,'utf8')).trim());}catch{}let alive=false;if(pid){try{process.kill(pid,0);alive=true;}catch{alive=false;}}if(alive)throw new Error(`PROFILE_LOCKED: persistent profile is owned by PID ${pid}`);await rm(this.lockFile,{force:true});}
}

function findChrome(){const candidates=process.platform==='win32'?[process.env.PROGRAMFILES+'\\Google\\Chrome\\Application\\chrome.exe',process.env.LOCALAPPDATA+'\\Google\\Chrome\\Application\\chrome.exe']:[];return candidates.find(x=>x&&existsSync(x));}
async function firstVisible(p:Page,selectors:string[]){for(const s of selectors){const l=p.locator(s).first();if(await l.isVisible().catch(()=>false))return l;}return null;}
function scrapeNotebooks(rows:{href:string;text:string;parent:string}[]):Notebook[]{const seen=new Set<string>();const out:Notebook[]=[];for(const row of rows){const m=row.href.match(/\/notebook\/([^/?#]+)/);if(!m||seen.has(m[1]))continue;seen.add(m[1]);const title=(row.text||row.parent).replace(/\s+/g,' ').trim();out.push({id:m[1],title:title||m[1],url:row.href,aliases:[]});}return out;}
async function waitForAnswer(p:Page,q:string,before:string[],timeout:number){const end=Date.now()+timeout;let last='';let stable=0;while(Date.now()<end){const texts=await p.locator(ANSWER).allInnerTexts().catch(()=>[]);const candidate=(texts.at(-1)??'').replace(/\s+/g,' ').trim();if(candidate&&candidate.toLowerCase()!==q.toLowerCase()&&!before.includes(candidate)&&!/^thinking|loading|searching/i.test(candidate)){if(candidate===last)stable++;else{last=candidate;stable=1;}if(stable>=3)return candidate;}await new Promise(r=>setTimeout(r,400));}return null;}
async function extractCitations(p:Page):Promise<Citation[]>{const markers=await p.locator('.to-user-container:last-child button.citation-marker, .to-user-container:last-child button[data-citation]').evaluateAll(btns=>btns.map((b,i)=>({i,n:(b.textContent??'').match(/\d+/)?.[0]??String(i+1),label:b.querySelector('[aria-label]')?.getAttribute('aria-label')??''}))).catch(()=>[]);const out:Citation[]=[];for(const marker of markers){const b=p.locator('.to-user-container:last-child button.citation-marker, .to-user-container:last-child button[data-citation]').nth(marker.i);await b.click().catch(()=>undefined);let quote='';const end=Date.now()+2000;while(Date.now()<end&&!quote){quote=await p.locator('.paragraph .highlighted,.highlighted').allInnerTexts().then(x=>x.join(' ').trim()).catch(()=> '');if(!quote)await new Promise(r=>setTimeout(r,150));}const label=marker.label.replace(/^.*?:\s*/,'').trim()||`Citation ${marker.n}`;out.push({sourceTitle:label,sourceId:undefined,quote,locator:`citation:${marker.n}`});await p.keyboard.press('Escape').catch(()=>undefined);}return out;}
function waitForExit(proc:ChildProcess|undefined,timeoutMs:number){if(!proc||proc.exitCode!==null)return Promise.resolve();return new Promise<void>(resolve=>{const timer=setTimeout(resolve,timeoutMs);proc.once('exit',()=>{clearTimeout(timer);resolve();});});}
