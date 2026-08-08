import {runServer} from './server.js';
runServer().catch(err=>{process.stderr.write(JSON.stringify({level:'error',event:'server.fatal',error:String(err)})+'\n');process.exitCode=1;});
