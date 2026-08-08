import {spawnSync} from 'node:child_process';

const env={...process.env,NLM_LIVE_TEST:'1',NLM_LIVE_DYNAMIC_TEST:'1',NLM_LIVE_ENGINE_TEST:'1'};
const result=spawnSync(process.execPath,['--test','tests/live.test.js'],{stdio:'inherit',env});
process.exit(result.status??1);
