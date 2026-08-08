import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const target=fileURLToPath(new URL('../node_modules/@roomi-fields/notebooklm-mcp/dist/tools/index.js',import.meta.url));
const runtimeTarget=fileURLToPath(new URL('../node_modules/@roomi-fields/notebooklm-mcp/dist/session/shared-context-manager.js',import.meta.url));
const legacy="const NOTEBOOK_UUID_URL = /notebooklm\\.google\\.com\\/notebook\\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}(?:\\b|\\/|$)/;";
const compatible="const NOTEBOOK_UUID_URL = /notebook(?:lm)?\\.google\\.com\\/notebook\\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}(?:[/?#]|$)/;";
const source=await readFile(target,'utf8');

if(source.includes(compatible)){
  console.log('NotebookLM upstream compatibility patch already applied.');
}else if(source.includes(legacy)){
  await writeFile(target,source.replace(legacy,compatible),'utf8');
  console.log('Applied NotebookLM current-host compatibility patch.');
}else{
  throw new Error(`Unsupported @roomi-fields/notebooklm-mcp build: expected create-notebook URL matcher was not found in ${target}`);
}

const minimizedArg="                '--start-minimized',";
const runtimeSource=await readFile(runtimeTarget,'utf8');
if(runtimeSource.includes(minimizedArg)){
  console.log('NotebookLM minimized-runtime patch already applied.');
}else{
  const anchor="            args: [\n                '--disable-blink-features=AutomationControlled',";
  if(!runtimeSource.includes(anchor))throw new Error(`Unsupported @roomi-fields/notebooklm-mcp build: launch argument anchor was not found in ${runtimeTarget}`);
  await writeFile(runtimeTarget,runtimeSource.replace(anchor,`            args: [\n${minimizedArg}\n                '--disable-blink-features=AutomationControlled',`),'utf8');
  console.log('Applied minimized visible-browser runtime patch.');
}
