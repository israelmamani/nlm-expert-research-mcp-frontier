import {createApp,doctor} from './server.js';
const command=process.argv[2]??'help'; const {adapter,store}=createApp();
if(command==='doctor'){console.log(JSON.stringify(await doctor(adapter,store),null,2));}
else if(command==='setup-auth'){const r=await adapter.authenticate(true);console.log(JSON.stringify({setup_auth:r,manual:'If AUTH_REQUIRED, open NotebookLM in a visible browser, complete Google login and 2FA manually, then rerun doctor.'},null,2));}
else if(command==='help') console.log('nlm-mcp doctor | nlm-mcp setup-auth');
else {console.error(`Unknown command: ${command}`);process.exitCode=1;}
