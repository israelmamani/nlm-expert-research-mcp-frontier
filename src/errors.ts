export type FrontierErrorCode=
  | 'AUTH_REQUIRED'
  | 'AUTH_FAILED'
  | 'RATE_LIMITED'
  | 'REMOTE_DISCOVERY_UNAVAILABLE'
  | 'REMOTE_SOURCE_LIST_UNAVAILABLE'
  | 'UPSTREAM_OPERATION_TIMEOUT'
  | 'UPSTREAM_NO_PROGRESS_STALL'
  | 'UPSTREAM_PROCESS_EXITED'
  | 'UPSTREAM_BROWSER_UNRESPONSIVE'
  | 'UPSTREAM_TRANSPORT_UNSTABLE'
  | 'NOTEBOOK_NOT_FOUND'
  | 'SOURCE_NOT_FOUND'
  | 'SOURCE_INGESTION_NOT_CONFIRMED'
  | 'CREATE_NOT_CONFIRMED'
  | 'DELETE_NOT_CONFIRMED'
  | 'CIRCUIT_OPEN';

export class FrontierError extends Error {
  constructor(readonly code:FrontierErrorCode,message:string,options?:{cause?:unknown}){
    super(`${code}: ${message}`,options);
    this.name='FrontierError';
  }
}
