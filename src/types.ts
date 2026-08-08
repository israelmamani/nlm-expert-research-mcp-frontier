export type ResearchMode = 'AUTO'|'INSTANT'|'STANDARD'|'DEEP'|'VERIFY'|'ULTRA'|'FORENSIC';
export type CorpusPolicy = 'LOCKED'|'OPEN';
export type InternetPolicy = 'LOCKED'|'AUTO'|'VERIFY'|'AUGMENT'|'ULTRA';
export type EvidenceStatus = 'SUPPORTED'|'PARTIALLY_SUPPORTED'|'AMBIGUOUS'|'CONTRADICTED'|'UNVERIFIED';
export type CitationLinkageMethod = 'explicit_marker'|'structured_metadata'|'excerpt_match'|'fallback_match';

export interface Notebook { id: string; title: string; url?: string; aliases: string[]; sourceCount?: number; updatedAt?: string; }
export interface Source { id: string; notebookId: string; title: string; type?: string; fingerprint?: string; updatedAt?: string; }
export interface Citation { sourceId?: string; sourceTitle: string; quote?: string; locator?: string; marker?: string; excerptAvailable?: boolean; }
export interface AdapterAnswer { text: string; citations: Citation[]; sourceIds?: string[]; purpose?: 'primary'|'support'|'counter'|'forensic'; }
export interface NotebookAdapter {
  name: string;
  health(): Promise<{ok:boolean; state:string; detail?:string}>;
  authenticate(interactive?: boolean): Promise<{ok:boolean; state:string; detail?:string}>;
  listNotebooks(): Promise<Notebook[]>;
  listSources(notebookId: string): Promise<Source[]>;
  ask(notebookId: string, query: string): Promise<AdapterAnswer>;
  refresh(): Promise<void>;
  shutdown(): Promise<void>;
}
export interface Passport { notebookId:string; title:string; aliases:string[]; sourceCount:number; sourceTypes:Record<string,number>; topics:string[]; lastLiveSync:string; fingerprint:string; status:'ready'|'degraded'|'unknown'; }
export interface Evidence { evidenceId:string; layer:'CANONICAL_CORPUS'|'VERIFIED_EXTERNAL'|'CANDIDATE_EXTERNAL'|'CLAUDE_INFERENCE'; sourceId?:string; sourceTitle:string; quote:string; locator?:string; citationMarker?:string; excerptAvailable?:boolean; answerPass?:number; role?:'support'|'counter'|'context'; status:EvidenceStatus; }
export interface Claim { claimId:string; text:string; status:EvidenceStatus; evidenceIds:string[]; counterEvidenceIds:string[]; evidenceLinkage?:Record<string,CitationLinkageMethod>; verificationReason?:string; }
export interface ResearchCapsule { researchId:string; notebook:Notebook; mode:ResearchMode; corpusPolicy:CorpusPolicy; internetPolicy:InternetPolicy; answer:string; keyFindings:string[]; claims:Claim[]; evidence:Evidence[]; conflicts:string[]; uncertainties:string[]; gaps:string[]; externalEvidence:Evidence[]; coverage:{queries:number;sourcesConsidered:number;sourcesUsed:number;score:number;saturation:'LOW'|'MEDIUM'|'HIGH'}; quality:{status:'PASS'|'WARN'|'FAIL'; reasons:string[]}; performance:{latencyMs:number;adapter:string;cacheHit:boolean}; }
