export class AutomaticAuthRecoveryError extends Error {
  readonly code='AUTH_RECOVERY_FAILED';
  constructor(message:string,options?:{cause?:unknown}){super(message,options);this.name='AutomaticAuthRecoveryError';}
}

export type AuthRecoveryEvent='required'|'started'|'completed'|'failed'|'retry_failed';

export function isAuthenticationError(error:unknown){
  const message=error instanceof Error?`${error.name}: ${error.message}`:String(error);
  return /AUTH_REQUIRED|SESSION_EXPIRED|session\s+(?:has\s+)?expired|accounts\.google\.com|not authenticated|authentication (?:required|failed)|re-authentication failed|login required|sign[ -]?in required|redirected to Google sign[ -]?in/i.test(message);
}

/**
 * Retries an authenticated operation exactly once after one shared interactive
 * recovery. Concurrent failures share the same login window.
 */
export class AutomaticAuthRecovery {
  private inFlight?:Promise<void>;
  constructor(
    private readonly recover:()=>Promise<void>,
    private readonly enabled:()=>boolean=()=>true,
    private readonly onEvent:(event:AuthRecoveryEvent,fields:Record<string,unknown>)=>void=()=>undefined,
  ){}

  async run<T>(operation:()=>Promise<T>,operationName='operation'):Promise<T>{
    try{return await operation();}
    catch(initialError){
      if(!this.enabled()||!isAuthenticationError(initialError))throw initialError;
      this.onEvent('required',{operation:operationName});
      try{await this.recoverOnce(operationName);}
      catch(recoveryError){
        this.onEvent('failed',{operation:operationName});
        throw new AutomaticAuthRecoveryError('AUTH_RECOVERY_FAILED: El login fue cancelado o no pudo completarse.',{cause:recoveryError});
      }
      try{return await operation();}
      catch(retryError){
        if(!isAuthenticationError(retryError))throw retryError;
        this.onEvent('retry_failed',{operation:operationName});
        throw new AutomaticAuthRecoveryError('AUTH_RECOVERY_RETRY_FAILED: Google continuó rechazando la sesión después del login; no se harán más intentos automáticos.',{cause:retryError});
      }
    }
  }

  private async recoverOnce(operationName:string){
    if(!this.inFlight){
      this.onEvent('started',{operation:operationName});
      this.inFlight=this.recover().then(()=>{this.onEvent('completed',{operation:operationName});}).finally(()=>{this.inFlight=undefined;});
    }
    await this.inFlight;
  }
}
