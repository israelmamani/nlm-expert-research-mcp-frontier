import {createApp,doctor} from './server.js';
const command=process.argv[2]??'help'; const {adapter,store}=createApp();
if(command==='doctor'){console.log(JSON.stringify(await doctor(adapter,store),null,2));await adapter.shutdown().catch(()=>undefined);}
else if(command==='setup-auth'){const r=await adapter.authenticate(true);console.log(JSON.stringify({setup_auth:r,manual:'Complete Google login and 2FA manually in the visible window. Passwords are never handled by this application.'},null,2));await adapter.shutdown().catch(()=>undefined);}
else if(command==='help') console.log('nlm-mcp doctor | nlm-mcp setup-auth');
else {console.error(`Unknown command: ${command}`);process.exitCode=1;}
