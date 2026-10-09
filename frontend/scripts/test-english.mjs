import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const cwd=fileURLToPath(new URL('../',import.meta.url));
const loader=new URL('../../server/node_modules/tsx/dist/loader.mjs',import.meta.url).href;
for(const file of ['tests/economy-progress.test.ts','tests/sign-locations.test.ts','tests/english-coverage.test.ts','tests/english-release.test.ts','tests/english-edge-cases.test.ts','tests/game-i18n.test.ts','tests/combat-localization.test.ts','tests/clan-display.test.ts','tests/display-helper-boundaries.test.ts','tests/operational-english.test.ts','../server/src/commandAliases.test.ts']) {
 const result=spawnSync(process.execPath,['--import',loader,file],{cwd,stdio:'inherit'});
 if(result.error)throw result.error;
 if(result.status!==0)process.exit(result.status??1);
}



