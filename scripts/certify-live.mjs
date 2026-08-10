import {spawnSync,execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';

const env={...process.env,NLM_LIVE_TEST:'1',NLM_LIVE_DYNAMIC_TEST:'1',NLM_LIVE_ENGINE_TEST:'1',NLM_LIVE_ENGINE_RUNS:'5',NLM_LIVE_SOAK_RUNS:'10'};
const run=spawnSync(process.execPath,['--test','tests/live.test.js'],{encoding:'utf8',env,maxBuffer:64*1024*1024});
process.stdout.write(run.stdout??'');process.stderr.write(run.stderr??'');
const events=parseEvents(`${run.stdout??''}\n${run.stderr??''}`);
const targeted=events.find(event=>event.event==='frontier.live_locked_engine.summary');
const soak=events.find(event=>event.event==='frontier.live_soak.summary');
const auth=events.find(event=>event.event==='frontier.live_auth');
const dynamic=events.find(event=>event.event==='frontier.live_dynamic');
const deletion=events.find(event=>event.event==='frontier.live_delete_invalidation');
const stalls=events.filter(event=>event.event==='upstream.transport_recovery_stall').length;
const recoveries=events.filter(event=>event.event==='upstream.recovered_after_transport_restart').length;
let cleanShutdown={event:'frontier.clean_shutdown',upstream_node:-1,profile_chrome:-1,hide_watchers:-1};
let cleanupStatus=process.platform==='win32'?1:0;
if((run.status??1)===0&&process.platform==='win32'){
  const cleanup=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File','scripts/check-clean-shutdown.ps1'],{encoding:'utf8',env,maxBuffer:1024*1024});
  process.stdout.write(cleanup.stdout??'');process.stderr.write(cleanup.stderr??'');
  cleanShutdown=parseEvents(cleanup.stdout??'').find(event=>event.event==='frontier.clean_shutdown')??cleanShutdown;
  cleanupStatus=cleanup.status??1;
}
const passed=(run.status??1)===0&&cleanupStatus===0;
const record={
  schema_version:'1.0',
  code_sha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  timestamp:new Date().toISOString(),
  status:passed?'PASS':'FAIL',
  auth:auth??null,
  dynamic:dynamic??null,
  targeted:targeted?{...targeted,stalls,recoveries,orphanProcesses:cleanShutdown.upstream_node+cleanShutdown.profile_chrome+cleanShutdown.hide_watchers}:null,
  soak:soak?{...soak,stalls,recoveries}:null,
  delete_invalidation:deletion?.status??'NOT_RUN',
  clean_shutdown:cleanShutdown,
  test_exit_code:run.status??1,
  cleanup_exit_code:cleanupStatus,
};
await mkdir('.data/certification',{recursive:true});
await writeFile('.data/certification/backend-live-result.json',JSON.stringify(record,null,2)+'\n','utf8');
console.log(JSON.stringify({event:'frontier.backend_live.summary',status:record.status,evidence:'.data/certification/backend-live-result.json',stalls,recoveries}));
process.exit(passed?0:(run.status??cleanupStatus??1));

function parseEvents(text){
  const values=[];
  for(const line of text.split(/\r?\n/)){
    const first=line.indexOf('{');const last=line.lastIndexOf('}');if(first<0||last<=first)continue;
    try{const value=JSON.parse(line.slice(first,last+1));if(value&&typeof value==='object')values.push(value);}catch{}
  }
  return values;
}
