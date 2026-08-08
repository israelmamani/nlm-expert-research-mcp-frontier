import {TransportCircuitBreaker} from './transport-circuit-breaker.js';

export type TransportRecoveryEvent=
  | 'stall'
  | 'restart'
  | 'probe_ok'
  | 'recovered'
  | 'retry_failed';

export type TransportRecoveryOptions<T>={
  name:string;
  execute:()=>Promise<T>;
  restart:()=>Promise<void>;
  probe?:()=>Promise<void>;
  circuit:TransportCircuitBreaker;
  retryable?:boolean;
  isTransportFailure?:(error:unknown)=>boolean;
  onEvent?:(event:TransportRecoveryEvent,fields:Record<string,unknown>)=>void;
};

const RECOVERABLE_OPERATIONS=new Set(['server_health','notebook_list','content_list','notebook_ask']);

export function isRecoverableTransportOperation(name:string){return RECOVERABLE_OPERATIONS.has(name);}

export function isTransportTimeout(error:unknown){
  const message=error instanceof Error?`${error.name}: ${error.message}`:String(error);
  return /request timed out|timed out|timeout|absolute deadline|deadline exceeded|ECONNRESET|EPIPE|transport (?:closed|disconnected)|connection closed/i.test(message)
    && !/rate.?limit|too many requests|\b429\b|quota/i.test(message);
}

export async function withAbsoluteDeadline<T>(name:string,budgetMs:number,operation:()=>Promise<T>):Promise<T>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  const deadline=new Promise<never>((_,reject)=>{
    timer=setTimeout(()=>reject(new Error(`UPSTREAM_ABSOLUTE_DEADLINE_EXCEEDED: ${name} exceeded ${budgetMs}ms`)),budgetMs);
  });
  try{return await Promise.race([operation(),deadline]);}
  finally{if(timer)clearTimeout(timer);}
}

export async function runWithSingleTransportRecovery<T>(options:TransportRecoveryOptions<T>):Promise<T>{
  if(options.circuit.degraded)throw unstableError(options.name);
  const isTransportFailure=options.isTransportFailure??isTransportTimeout;
  try{
    const result=await options.execute();
    options.circuit.recordHealthy();
    return result;
  }catch(initialError){
    if(!isTransportFailure(initialError))throw initialError;
    options.circuit.recordStall();
    options.onEvent?.('stall',{name:options.name,stalls:options.circuit.count,attempt:1});
    await options.restart();
    options.onEvent?.('restart',{name:options.name,attempt:1});
    const retryable=options.retryable??isRecoverableTransportOperation(options.name);
    if(!retryable)throw timeoutError(options.name,initialError);

    try{
      if(options.probe&&options.name!=='server_health'){
        await options.probe();
        options.onEvent?.('probe_ok',{name:options.name});
      }
      const result=await options.execute();
      options.onEvent?.('recovered',{name:options.name,attempts:2,status:'RECOVERED_AFTER_TRANSPORT_RESTART'});
      return result;
    }catch(retryError){
      if(!isTransportFailure(retryError))throw retryError;
      options.circuit.recordStall();
      options.onEvent?.('retry_failed',{name:options.name,stalls:options.circuit.count,attempt:2});
      await options.restart();
      throw unstableError(options.name,retryError);
    }
  }
}

function timeoutError(name:string,cause:unknown){
  return new Error(`UPSTREAM_OPERATION_TIMEOUT: ${name} exceeded its bounded transport budget; mutation was not retried`,{cause});
}

function unstableError(name:string,cause?:unknown){
  return new Error(`UPSTREAM_TRANSPORT_UNSTABLE: ${name} failed after the single authorized transport recovery`,cause===undefined?undefined:{cause});
}
