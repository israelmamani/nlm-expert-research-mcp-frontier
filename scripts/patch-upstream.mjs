import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const target=fileURLToPath(new URL('../node_modules/@roomi-fields/notebooklm-mcp/dist/tools/index.js',import.meta.url));
const runtimeTarget=fileURLToPath(new URL('../node_modules/@roomi-fields/notebooklm-mcp/dist/session/shared-context-manager.js',import.meta.url));
const authRuntimeTarget=fileURLToPath(new URL('../node_modules/@roomi-fields/notebooklm-mcp/dist/session/browser-session.js',import.meta.url));
const contentTarget=fileURLToPath(new URL('../node_modules/@roomi-fields/notebooklm-mcp/dist/content/content-manager.js',import.meta.url));
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
