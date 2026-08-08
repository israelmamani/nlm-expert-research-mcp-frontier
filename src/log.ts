export type LogLevel = 'error'|'warn'|'info'|'debug';
const rank:Record<LogLevel,number> = {error:0,warn:1,info:2,debug:3};
const level = (process.env.NLM_LOG_LEVEL as LogLevel) || 'info';
export function log(l:LogLevel, event:string, fields:Record<string,unknown> = {}) {
  if (rank[l] > rank[level]) return;
  process.stderr.write(JSON.stringify({ts:new Date().toISOString(),level:l,event,...fields})+'\n');
}
