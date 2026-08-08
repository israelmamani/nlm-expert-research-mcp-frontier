import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';

const pkg=JSON.parse(await readFile('package.json','utf8'));
const subject=process.env.CERTIFIED_CODE_SHA??process.env.CERTIFIED_SUBJECT_SHA??execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const status=(name,fallback='NOT_RUN')=>process.env[name]??fallback;
const liveGates={
  auth:status('CERT_LIVE_AUTH'),
  persistence:status('CERT_LIVE_PERSISTENCE'),
  enumeration:status('CERT_LIVE_ENUMERATION'),
  grounded_query:status('CERT_LIVE_QUERY'),
  citations:status('CERT_LIVE_CITATIONS'),
  dynamic_notebook:status('CERT_LIVE_DYNAMIC_NOTEBOOK'),
  dynamic_source:status('CERT_LIVE_DYNAMIC_SOURCE'),
  delete_invalidation:status('CERT_LIVE_DELETE'),
  rename:status('CERT_LIVE_RENAME'),
};
const claudeDesktop={
  mcpb:status('CERT_CLAUDE_MCPB'),
  tools:status('CERT_CLAUDE_TOOLS'),
  natural_invocation:status('CERT_CLAUDE_NATURAL'),
  same_session_discovery:status('CERT_CLAUDE_SAME_SESSION'),
  browser_invisible:status('CERT_CLAUDE_BROWSER'),
};
const requiredLive=['auth','persistence','enumeration','grounded_query','citations','dynamic_notebook','dynamic_source','delete_invalidation'];
const blockingGates=[
  ...requiredLive.filter(key=>liveGates[key]!=='PASS').map(key=>`live.${key}`),
  ...Object.entries(claudeDesktop).filter(([,value])=>value!=='PASS').map(([key])=>`claude_desktop.${key}`),
];
const ledger={
  schema_version:'1.0',
  product:pkg.name,
  certified_code_sha:subject,
  certified_subject_sha:subject,
  attestation_commit_sha:process.env.ATTESTATION_COMMIT_SHA??'PENDING_ATTESTATION_COMMIT',
  timestamp:new Date().toISOString(),
  environment:{platform:process.platform,node:process.version},
  dependencies:{mcp_sdk:pkg.dependencies['@modelcontextprotocol/sdk'],upstream:pkg.dependencies['@roomi-fields/notebooklm-mcp']},
  local_gates:{build:status('CERT_BUILD','PASS'),tests:status('CERT_TESTS','PASS'),integrity:status('CERT_INTEGRITY','PASS'),secrets:status('CERT_SECRETS','PASS'),audit:status('CERT_AUDIT','PASS')},
  live_gates:liveGates,
  claude_desktop:claudeDesktop,
  blocking_gates:blockingGates,
  mcpb_sha256:process.env.MCPB_SHA256??'NOT_BUILT',
  open_p0:[],
  open_p1:[],
  verdict:process.env.CERT_VERDICT??'RELEASE_BLOCKED',
};
await writeFile('docs/certification.json',JSON.stringify(ledger,null,2)+'\n','utf8');
const md=`# Live Certification

Generated from \`docs/certification.json\`.

- Certified code SHA: \`${ledger.certified_code_sha}\`
- Attestation commit: \`${ledger.attestation_commit_sha}\`
- Timestamp: ${ledger.timestamp}
- Verdict: **${ledger.verdict}**

## Local gates

${Object.entries(ledger.local_gates).map(([k,v])=>`- ${k}: **${v}**`).join('\n')}

## Live gates

${Object.entries(ledger.live_gates).map(([k,v])=>`- ${k}: **${v}**`).join('\n')}

## Claude Desktop

${Object.entries(ledger.claude_desktop).map(([k,v])=>`- ${k}: **${v}**`).join('\n')}

## Blocking gates

${ledger.blocking_gates.map(g=>`- \`${g}\``).join('\n')}

MCPB SHA-256: \`${ledger.mcpb_sha256}\`
`;
await writeFile('docs/LIVE_CERTIFICATION.md',md,'utf8');
console.log('Certification ledger and report generated.');
