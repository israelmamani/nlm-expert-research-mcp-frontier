import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';

const pkg=JSON.parse(await readFile('package.json','utf8'));
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
const subject=process.env.CERTIFIED_CODE_SHA??process.env.CERTIFIED_SUBJECT_SHA??git('rev-parse','HEAD');
const status=name=>process.env[name]??'NOT_RUN';
const pass=value=>value==='PASS'||value==='PASS_WITH_RECOVERY';
const jsonEnv=(name,fallback)=>{try{return process.env[name]?JSON.parse(process.env[name]):fallback;}catch{throw new Error(`${name} must be valid JSON`);}};

const localGates={
  build:status('CERT_BUILD'),
  tests:status('CERT_TESTS'),
  integrity:status('CERT_INTEGRITY'),
  secrets:status('CERT_SECRETS'),
  audit:status('CERT_AUDIT'),
  package_sanity:status('CERT_PACKAGE_SANITY'),
};
const backendLive={
  auth:status('CERT_LIVE_AUTH'),
  persistence:status('CERT_LIVE_PERSISTENCE'),
  enumeration:status('CERT_LIVE_ENUMERATION'),
  grounded_query:status('CERT_LIVE_QUERY'),
  citations:status('CERT_LIVE_CITATIONS'),
  claim_linkage:status('CERT_LIVE_CLAIM_LINKAGE'),
  dynamic_notebook:status('CERT_LIVE_DYNAMIC_NOTEBOOK'),
  dynamic_source:status('CERT_LIVE_DYNAMIC_SOURCE'),
  delete_invalidation:status('CERT_LIVE_DELETE'),
  locked_engine:status('CERT_LIVE_LOCKED_ENGINE'),
  clean_shutdown:status('CERT_LIVE_CLEAN_SHUTDOWN'),
};
const targetedStability={
  status:status('CERT_TARGETED_STATUS'),
  runs:Number(process.env.CERT_TARGETED_RUNS??0),
  citation_linkage:process.env.CERT_TARGETED_CITATION_LINKAGE??'0/0',
  semantic_verified:process.env.CERT_TARGETED_SEMANTIC_VERIFIED??'0/0',
  external_leakage:process.env.CERT_TARGETED_EXTERNAL_LEAKAGE??'NOT_RUN',
  wrong_assignment:process.env.CERT_TARGETED_WRONG_ASSIGNMENT??'NOT_RUN',
  stalls:Number(process.env.CERT_TARGETED_STALLS??0),
  recoveries:Number(process.env.CERT_TARGETED_RECOVERIES??0),
  orphan_processes:Number(process.env.CERT_TARGETED_ORPHANS??0),
};
const soak={
  status:status('CERT_SOAK_STATUS'),
  queries:Number(process.env.CERT_SOAK_QUERIES??0),
  success:Number(process.env.CERT_SOAK_SUCCESS??0),
  fail:Number(process.env.CERT_SOAK_FAIL??0),
  stalls:Number(process.env.CERT_SOAK_STALLS??0),
  recoveries:Number(process.env.CERT_SOAK_RECOVERIES??0),
  median_ms:Number(process.env.CERT_SOAK_MEDIAN_MS??0),
  max_ms:Number(process.env.CERT_SOAK_MAX_MS??0),
};
const claudeDesktop={
  mcpb_installation:status('CERT_CLAUDE_MCPB'),
  server_startup:status('CERT_CLAUDE_SERVER'),
  tool_enumeration:status('CERT_CLAUDE_TOOLS'),
  natural_invocation:status('CERT_CLAUDE_NATURAL'),
  same_session_discovery:status('CERT_CLAUDE_SAME_SESSION'),
  grounded_query:status('CERT_CLAUDE_GROUNDED_QUERY'),
  citation_correctness:status('CERT_CLAUDE_CITATIONS'),
  browser_invisible:status('CERT_CLAUDE_BROWSER'),
  auth_persistence:status('CERT_CLAUDE_AUTH_PERSISTENCE'),
};
const mcpb={
  build:status('CERT_MCPB_BUILD'),
  validation:status('CERT_MCPB_VALIDATION'),
  sha256:process.env.MCPB_SHA256??'NOT_BUILT',
};
const openP0=jsonEnv('CERT_OPEN_P0',[]);
const openP1=jsonEnv('CERT_OPEN_P1',[]);
const required=[
  ...Object.entries(localGates).map(([key,value])=>[`local.${key}`,value]),
  ...Object.entries(backendLive).map(([key,value])=>[`live.${key}`,value]),
  ['targeted_stability',targetedStability.status],
  ['soak',soak.status],
  ...Object.entries(claudeDesktop).map(([key,value])=>[`claude_desktop.${key}`,value]),
  ['mcpb.build',mcpb.build],
  ['mcpb.validation',mcpb.validation],
];
const blockingGates=required.filter(([,value])=>!pass(value)).map(([name])=>name);
if(mcpb.sha256==='NOT_BUILT')blockingGates.push('mcpb.sha256');
const backendReady=Object.values(backendLive).every(pass)&&pass(targetedStability.status)&&pass(soak.status);
const fullyCertified=blockingGates.length===0&&openP0.length===0&&openP1.length===0;
const requestedVerdict=process.env.CERT_VERDICT??'RELEASE_BLOCKED';
if(requestedVerdict==='RELEASE_CERTIFIED'&&!fullyCertified)throw new Error(`Cannot certify release; blocking gates: ${blockingGates.join(', ')||'open defects'}`);
if(process.env.NOTEBOOKLM_LIVE_READY==='YES'&&!backendReady)throw new Error('NOTEBOOKLM_LIVE_READY=YES requires every backend live gate, targeted stability and soak to pass');

const ledger={
  schema_version:'2.0',
  product:pkg.name,
  version:pkg.version,
  certified_code_sha:subject,
  certified_subject_sha:subject,
  attestation_commit_sha:process.env.ATTESTATION_COMMIT_SHA??'PENDING_ATTESTATION_COMMIT',
  generated_from_head_sha:git('rev-parse','HEAD'),
  timestamp:new Date().toISOString(),
  environment:{platform:process.platform,node:process.version,chrome:process.env.CERT_CHROME_VERSION??'NOT_RECORDED'},
  dependencies:{mcp_sdk:pkg.dependencies['@modelcontextprotocol/sdk'],upstream:pkg.dependencies['@roomi-fields/notebooklm-mcp']},
  local_gates:localGates,
  targeted_stability:targetedStability,
  soak,
  backend_live_gates:backendLive,
  live_gates:backendLive,
  claude_desktop:claudeDesktop,
  mcpb,
  evidence:jsonEnv('CERT_EVIDENCE',{}),
  blocking_gates:[...new Set(blockingGates)],
  open_p0:openP0,
  open_p1:openP1,
  NOTEBOOKLM_LIVE_READY:backendReady?'YES':'NO',
  verdict:requestedVerdict,
};
await writeFile('docs/certification.json',JSON.stringify(ledger,null,2)+'\n','utf8');

const section=(title,values)=>`## ${title}\n\n${Object.entries(values).map(([key,value])=>`- ${key}: **${typeof value==='object'?JSON.stringify(value):value}**`).join('\n')}`;
const markdown=`# Live Certification\n\nGenerated from \`docs/certification.json\`. No gate defaults to PASS.\n\n- Product version: \`${ledger.version}\`\n- Certified code SHA: \`${ledger.certified_code_sha}\`\n- Attestation commit: \`${ledger.attestation_commit_sha}\`\n- Generated from HEAD: \`${ledger.generated_from_head_sha}\`\n- Timestamp: ${ledger.timestamp}\n- NotebookLM live ready: **${ledger.NOTEBOOKLM_LIVE_READY}**\n- Verdict: **${ledger.verdict}**\n\n${section('Local gates',ledger.local_gates)}\n\n${section('Targeted stability',ledger.targeted_stability)}\n\n${section('Soak',ledger.soak)}\n\n${section('Backend live gates',ledger.backend_live_gates)}\n\n${section('Claude Desktop',ledger.claude_desktop)}\n\n${section('MCPB',ledger.mcpb)}\n\n## Blocking gates\n\n${ledger.blocking_gates.length?ledger.blocking_gates.map(gate=>`- \`${gate}\``).join('\n'):'- None'}\n\n## Open defects\n\n- P0: ${ledger.open_p0.length?JSON.stringify(ledger.open_p0):'None'}\n- P1: ${ledger.open_p1.length?JSON.stringify(ledger.open_p1):'None'}\n`;
await writeFile('docs/LIVE_CERTIFICATION.md',markdown,'utf8');
console.log('Certification ledger and report generated without implicit PASS values.');
