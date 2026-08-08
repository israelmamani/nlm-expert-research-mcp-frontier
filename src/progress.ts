import {AsyncLocalStorage} from 'node:async_hooks';
import type {RequestHandlerExtra} from '@modelcontextprotocol/sdk/shared/protocol.js';
import type {ServerNotification, ServerRequest} from '@modelcontextprotocol/sdk/types.js';
import {log} from './log.js';

type ToolExtra=RequestHandlerExtra<ServerRequest,ServerNotification>;
type ProgressReporter=(message:string,progress:number,total?:number)=>Promise<void>;
const context=new AsyncLocalStorage<ProgressReporter>();

export function withToolProgress<T>(extra:ToolExtra,work:()=>Promise<T>):Promise<T>{
  const token=extra._meta?.progressToken;
  const report:ProgressReporter=async(message,progress,total)=>{
    if(token===undefined)return;
    await extra.sendNotification({method:'notifications/progress',params:{progressToken:token,progress,total,message}});
  };
  return context.run(report,work);
}

export function reportToolProgress(message:string,progress:number,total?:number){
  const report=context.getStore();
  if(!report)return;
  void report(message,progress,total).catch(error=>log('debug','progress.notification_failed',{detail:String(error)}));
}
