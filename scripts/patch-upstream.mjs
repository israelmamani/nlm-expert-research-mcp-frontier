import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const target=fileURLToPath(new URL('../node_modules/@roomi-fields/notebooklm-mcp/dist/tools/index.js',import.meta.url));
const runtimeTarget=fileURLToPath(new URL('../node_modules/@roomi-fields/notebooklm-mcp/dist/session/shared-context-manager.js',import.meta.url));
const authRuntimeTarget=fileURLToPath(new URL('../node_modules/@roomi-fields/notebooklm-mcp/dist/session/browser-session.js',import.meta.url));
const contentTarget=fileURLToPath(new URL('../node_modules/@roomi-fields/notebooklm-mcp/dist/content/content-manager.js',import.meta.url));
const rpcTarget=fileURLToPath(new URL('../node_modules/@roomi-fields/notebooklm-mcp/dist/rpc/batchexecute.js',import.meta.url));
const legacy="const NOTEBOOK_UUID_URL = /notebooklm\\.google\\.com\\/notebook\\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}(?:\\b|\\/|$)/;";
const compatible="const NOTEBOOK_UUID_URL = /notebook(?:lm)?\\.google\\.com\\/notebook\\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}(?:[/?#]|$)/;";
const source=await readFile(target,'utf8');

if(source.includes(compatible)) console.log('NotebookLM upstream compatibility patch already applied.');
else if(source.includes(legacy)){await writeFile(target,source.replace(legacy,compatible),'utf8');console.log('Applied NotebookLM current-host compatibility patch.');}
else throw new Error(`Unsupported @roomi-fields/notebooklm-mcp build: expected create-notebook URL matcher was not found in ${target}`);

const minimizedArg="                '--start-minimized',";
const runtimeSource=await readFile(runtimeTarget,'utf8');
if(runtimeSource.includes(minimizedArg)) console.log('NotebookLM minimized-runtime patch already applied.');
else {
  const anchor="            args: [\n                '--disable-blink-features=AutomationControlled',";
  if(!runtimeSource.includes(anchor))throw new Error(`Unsupported @roomi-fields/notebooklm-mcp build: launch argument anchor was not found in ${runtimeTarget}`);
  await writeFile(runtimeTarget,runtimeSource.replace(anchor,`            args: [\n${minimizedArg}\n                '--disable-blink-features=AutomationControlled',`),'utf8');
  console.log('Applied minimized visible-browser runtime patch.');
}

const externalAuthMarker="process.env.FRONTIER_EXTERNAL_AUTH_RECOVERY === '1'";
const externalAuthGuard=`        if (${externalAuthMarker}) {
            throw new Error('AUTH_REQUIRED: Google session expired; Frontier will open interactive recovery.');
        }
`;
const authRuntimeSource=await readFile(authRuntimeTarget,'utf8');
if(authRuntimeSource.includes(externalAuthMarker)) console.log('NotebookLM external-auth recovery patch already applied.');
else {
  const sectionStart=authRuntimeSource.indexOf('        // Need fresh login');
  const branchAnchor='        if (CONFIG.autoLoginEnabled) {';
  const branchStart=authRuntimeSource.indexOf(branchAnchor,sectionStart);
  if(sectionStart<0||branchStart<0)throw new Error(`Unsupported @roomi-fields/notebooklm-mcp build: authentication fallback anchor was not found in ${authRuntimeTarget}`);
  await writeFile(authRuntimeTarget,`${authRuntimeSource.slice(0,branchStart)}${externalAuthGuard}${authRuntimeSource.slice(branchStart)}`,'utf8');
  console.log('Applied Frontier-owned interactive-auth recovery patch.');
}

const textUploadMarker='FRONTIER_TEXT_UPLOAD_DIALOG_SETTLE';
const contentSource=await readFile(contentTarget,'utf8');
if(contentSource.includes(textUploadMarker)) console.log('NotebookLM text-upload race patch already applied.');
else {
  const dispatchAnchor="case 'text':\n                    return await this.uploadText(input, expectedNotebookUuid, existingSourceNames);";
  const textSignature='async uploadText(input, expectedNotebookUuid, previousSourceNames = []) {';
  const textWaitAnchor=`            await this.clickUploadButton();
            // Wait for processing - NotebookLM names pasted text sources`;
  if(!contentSource.includes(dispatchAnchor)||!contentSource.includes(textSignature)||!contentSource.includes(textWaitAnchor))throw new Error(`Unsupported @roomi-fields/notebooklm-mcp build: text-upload anchors were not found in ${contentTarget}`);
  const dispatched=contentSource.replace(dispatchAnchor,"case 'text':\n                    return await this.uploadText(input, expectedNotebookUuid, existingSourceNames, initialSourceCount);");
  const signed=dispatched.replace(textSignature,'async uploadText(input, expectedNotebookUuid, previousSourceNames = [], knownInitialCount) {');
  const settled=signed.replace(textWaitAnchor,`            await this.clickUploadButton();
            // ${textUploadMarker}: do not let panel reconciliation press Escape while NotebookLM commits pasted text.
            await this.page.locator('[role="dialog"]').first().waitFor({ state: 'hidden', timeout: 30000 }).catch(() => { /* multi-upload UI may remain open */ });
            // Wait for processing - NotebookLM names pasted text sources`);
  const resultStart=settled.indexOf('const result = await this.waitForSourceProcessing(input.title ||',settled.indexOf(textUploadMarker));
  const resultEnd=resultStart<0?-1:settled.indexOf(';',resultStart);
  if(resultStart<0||resultEnd<0)throw new Error(`Unsupported @roomi-fields/notebooklm-mcp build: text-upload reconciliation call was not found in ${contentTarget}`);
  const patched=`${settled.slice(0,resultStart)}const result = await this.waitForSourceProcessing(input.title || 'Pasted text', textPreview, expectedNotebookUuid, previousSourceNames, knownInitialCount);${settled.slice(resultEnd+1)}`;
  if(!patched.includes(textUploadMarker)||patched===contentSource)throw new Error(`Unsupported @roomi-fields/notebooklm-mcp build: text-upload patch could not be applied in ${contentTarget}`);
  await writeFile(contentTarget,patched,'utf8');
  console.log('Applied Frontier text-upload dialog-settle patch.');
}

const rpcSourceListMarker='FRONTIER_RPC_SOURCE_LIST';
const latestToolsSource=await readFile(target,'utf8');
if(latestToolsSource.includes(rpcSourceListMarker)) console.log('NotebookLM Frontier RPC-only source-list patch already applied.');
else {
  const definitionStart=latestToolsSource.indexOf("            name: 'list_content',");
  const definitionEnd=latestToolsSource.indexOf("            name: 'download_content',",definitionStart);
  if(definitionStart<0||definitionEnd<0)throw new Error(`Unsupported @roomi-fields/notebooklm-mcp build: list_content definition was not found in ${target}`);
  const definition=latestToolsSource.slice(definitionStart,definitionEnd);
  const propertiesAnchor="                properties: {\n";
  if(!definition.includes(propertiesAnchor))throw new Error(`Unsupported @roomi-fields/notebooklm-mcp build: list_content properties anchor was not found in ${target}`);
  const patchedDefinition=definition.replace(propertiesAnchor,propertiesAnchor+
`                    // ${rpcSourceListMarker}: Frontier metadata reads must never poll Studio or fall back to DOM.
                    frontier_sources_only: {
                        type: 'boolean',
                        description: 'Internal Frontier mode: return RPC source IDs/titles only; never use DOM fallback.',
                    },
`);

  const handlerStart=latestToolsSource.indexOf('    async handleListContent(args) {');
  const handlerEnd=latestToolsSource.indexOf('    async handleDownloadContent(args) {',handlerStart);
  if(handlerStart<0||handlerEnd<0)throw new Error(`Unsupported @roomi-fields/notebooklm-mcp build: list_content handler was not found in ${target}`);
  let handler=latestToolsSource.slice(handlerStart,handlerEnd);
  const destructureAnchor='        const { notebook_url, session_id } = args;';
  const sourcesAnchor='                    const srcs = await new NotebookRpc(client).getSources(lcNotebookId);';
  const rpcCatchStart=handler.indexOf('                catch (e) {',handler.indexOf(sourcesAnchor));
  const fallbackLogStart=handler.indexOf('                    log.warning(',rpcCatchStart);
  if(!handler.includes(destructureAnchor)||!handler.includes(sourcesAnchor)||rpcCatchStart<0||fallbackLogStart<0)throw new Error(`Unsupported @roomi-fields/notebooklm-mcp build: RPC list_content anchors were not found in ${target}`);
  handler=handler.replace(destructureAnchor,'        const { notebook_url, session_id, frontier_sources_only } = args;');
  handler=handler.replace(sourcesAnchor,sourcesAnchor+`
                    if (frontier_sources_only === true) {
                        const sources = srcs.map((s) => ({ id: s.id, name: s.title, type: 'document', status: 'ready' }));
                        log.success(\`  âœ… (RPC) Frontier source list: \${sources.length} sources\`);
                        return { success: true, data: { sources, generatedContent: [], sourceCount: sources.length, hasAudioOverview: false, transport: 'rpc' } };
                    }`);
  const updatedRpcCatchStart=handler.indexOf('                catch (e) {',handler.indexOf(sourcesAnchor));
  const updatedFallbackLogStart=handler.indexOf('                    log.warning(',updatedRpcCatchStart);
  if(updatedRpcCatchStart<0||updatedFallbackLogStart<0)throw new Error(`Unsupported @roomi-fields/notebooklm-mcp build: patched RPC fallback anchors were not found in ${target}`);
  handler=handler.slice(0,updatedFallbackLogStart)+`                    if (frontier_sources_only === true) {
                        const detail = e instanceof Error ? e.message : String(e);
                        return { success: false, error: 'REMOTE_SOURCE_LIST_UNAVAILABLE: ' + detail };
                    }
`+handler.slice(updatedFallbackLogStart);
  const withDefinition=latestToolsSource.slice(0,definitionStart)+patchedDefinition+latestToolsSource.slice(definitionEnd);
  const adjustedHandlerStart=withDefinition.indexOf('    async handleListContent(args) {');
  const adjustedHandlerEnd=withDefinition.indexOf('    async handleDownloadContent(args) {',adjustedHandlerStart);
  const patchedTools=withDefinition.slice(0,adjustedHandlerStart)+handler+withDefinition.slice(adjustedHandlerEnd);
  if(!patchedTools.includes(rpcSourceListMarker)||patchedTools===latestToolsSource)throw new Error(`Unsupported @roomi-fields/notebooklm-mcp build: Frontier RPC source-list patch could not be applied in ${target}`);
  await writeFile(target,patchedTools,'utf8');
  console.log('Applied Frontier RPC-only source-list patch.');
}

const rpcCitationMarker='FRONTIER_RPC_CITATION_SOURCE_ID';
const citationToolsSource=await readFile(target,'utf8');
if(citationToolsSource.includes(rpcCitationMarker)) console.log('NotebookLM Frontier RPC citation source-id patch already applied.');
else {
  const citationAnchor=`                                number: r.citation_number,
                                sourceText: r.cited_text || '',`;
  if(!citationToolsSource.includes(citationAnchor))throw new Error(`Unsupported @roomi-fields/notebooklm-mcp build: RPC citation mapping anchor was not found in ${target}`);
  const patchedCitations=citationToolsSource.replace(citationAnchor,`                                number: r.citation_number,
                                // ${rpcCitationMarker}: retain remote provenance in Frontier evidence.
                                sourceId: r.source_id,
                                sourceText: r.cited_text || '',`);
  await writeFile(target,patchedCitations,'utf8');
  console.log('Applied Frontier RPC citation source-id patch.');
}

const rpcMutationMarker='FRONTIER_RPC_MUTATION_GUARD';
const mutationToolsSource=await readFile(target,'utf8');
if(mutationToolsSource.includes(rpcMutationMarker)) console.log('NotebookLM Frontier RPC-only mutation guard already applied.');

if(!mutationToolsSource.includes(rpcMutationMarker)) {
  let patched=mutationToolsSource;
  const replaceRequired=(anchor,replacement)=>{
    if(!patched.includes(anchor))throw new Error(`Unsupported @roomi-fields/notebooklm-mcp build: mutation guard anchor was not found in ${target}`);
    patched=patched.replace(anchor,replacement);
  };
  replaceRequired(
    '        const { source_type, file_path, url, text, title, notebook_url, session_id, show_browser } = args;',
    `        const { source_type, file_path, url, text, title, notebook_url, session_id, show_browser, frontier_rpc_only } = args; // ${rpcMutationMarker}`,
  );
  replaceRequired('        const { notebook_ids, show_browser } = args;','        const { notebook_ids, show_browser, frontier_rpc_only } = args;');
  replaceRequired('        const { name, show_browser } = args;','        const { name, show_browser, frontier_rpc_only } = args;');
  const insertBeforeLog=(fragment,guard)=>{
    const fragmentIndex=patched.indexOf(fragment);
    if(fragmentIndex<0)throw new Error(`Unsupported @roomi-fields/notebooklm-mcp build: mutation log anchor was not found in ${target}`);
    const lineStart=patched.lastIndexOf('\n',fragmentIndex)+1;
    patched=patched.slice(0,lineStart)+guard+'\n'+patched.slice(lineStart);
  };
  insertBeforeLog('RPC add_source returned no id; falling back to browser flow...',"                    if (frontier_rpc_only === true) return { success: false, error: 'CREATE_NOT_CONFIRMED: RPC add_source returned no authoritative source id' };");
  insertBeforeLog('RPC add_source failed (',"                    if (frontier_rpc_only === true) return { success: false, error: 'CREATE_NOT_CONFIRMED: RPC add_source failed: ' + (e instanceof Error ? e.message : String(e)) };");
  insertBeforeLog('RPC delete failed (',"                if (frontier_rpc_only === true) return { success: false, error: 'DELETE_NOT_CONFIRMED: RPC delete failed: ' + (e instanceof Error ? e.message : String(e)) };");
  insertBeforeLog('RPC create failed (',"                if (frontier_rpc_only === true) return { success: false, error: 'CREATE_NOT_CONFIRMED: RPC create failed: ' + (e instanceof Error ? e.message : String(e)) };");
  await writeFile(target,patched,'utf8');
  console.log('Applied Frontier RPC-only mutation guard.');
}

const noMutationRetryMarker='FRONTIER_NO_MUTATION_RETRY';
const rpcSource=await readFile(rpcTarget,'utf8');
if(rpcSource.includes(noMutationRetryMarker)) console.log('NotebookLM mutation no-retry patch already applied.');
else {
  const userAgentAnchor="const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';";
  const driftAnchor=`            if (err instanceof RpcDriftError)\n                throw err;`;
  if(!rpcSource.includes(userAgentAnchor)||!rpcSource.includes(driftAnchor))throw new Error(`Unsupported @roomi-fields/notebooklm-mcp build: mutation retry anchors were not found in ${rpcTarget}`);
  let patched=rpcSource.replace(userAgentAnchor,`${userAgentAnchor}\n// ${noMutationRetryMarker}: an uncertain write must be reconciled by Frontier, never replayed here.\nconst FRONTIER_MUTATION_RPCS = new Set(['CREATE_NOTEBOOK', 'DELETE_NOTEBOOK', 'RENAME_NOTEBOOK', 'ADD_SOURCE', 'ADD_SOURCE_URL_V2', 'DELETE_SOURCE']);`);
  patched=patched.replace(driftAnchor,`${driftAnchor}\n            if (FRONTIER_MUTATION_RPCS.has(name))\n                throw err;`);
  await writeFile(rpcTarget,patched,'utf8');
  console.log('Applied NotebookLM mutation no-retry patch.');
}

const rpcAccountHostMarker='FRONTIER_RPC_ACCOUNT_HOST';
const hostToolsSource=await readFile(target,'utf8');
if(hostToolsSource.includes(rpcAccountHostMarker)) console.log('NotebookLM account-resolved RPC host patch already applied.');
else {
  const hostAnchor=`        const raw = await context.cookies('https://notebooklm.google.com');
        const cookies = raw.map((c) => ({ name: c.name, value: c.value }));
        return new BatchExecuteClient({ cookies, hl: CONFIG.uiLocale });`;
  if(!hostToolsSource.includes(hostAnchor))throw new Error(`Unsupported @roomi-fields/notebooklm-mcp build: RPC account-host anchor was not found in ${target}`);
  const patched=hostToolsSource.replace(hostAnchor,`        // ${rpcAccountHostMarker}: use the host where this authenticated profile actually runs.
        const state = await context.storageState();
        const notebookOrigin = state.origins.find((entry) => /^https:\\/\\/notebook(?:lm)?\\.google\\.com$/i.test(entry.origin))?.origin;
        const baseHost = notebookOrigin ? new URL(notebookOrigin).hostname : 'notebooklm.google.com';
        const raw = await context.cookies(\`https://\${baseHost}\`);
        const cookies = raw.map((c) => ({ name: c.name, value: c.value }));
        return new BatchExecuteClient({ cookies, baseHost, hl: CONFIG.uiLocale });`);
  await writeFile(target,patched,'utf8');
  console.log('Applied NotebookLM account-resolved RPC host patch.');
}
