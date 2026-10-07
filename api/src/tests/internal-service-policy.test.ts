import {test,expect,vi} from 'vitest';
import {createInternalAuthorization,gameServiceMayAccess} from '../internalServicePolicy';
const game='game-'.repeat(10),admin='admin-'.repeat(10);
function check(token:string|undefined,method:string,path:string){
 const json=vi.fn(),status=vi.fn(()=>({json})),next=vi.fn();createInternalAuthorization(admin,game)({header:()=>token,method,path} as any,{status} as any,next);return {status,json,next};
}
test('game credential permits gameplay persistence and reads but denies database content edits',()=>{
 for(const [method,path] of [['PUT','/character_save/character/items'],['POST','/game-ticket/consume'],['GET','/internal/game-data/npcs/changes'],['POST','/internal/game-session/check'],['GET','/internal/characters/character/cosmetic-title'],['POST','/internal/market/buy'],['PUT','/internal/vaults/account/account']])expect(check(game,method,path).next).toHaveBeenCalledOnce();
 for(const [method,path] of [['PUT','/internal/game-data/npcs/1'],['DELETE','/internal/game-data/crafting-recipes/1'],['PUT','/internal/game-data/balance'],['POST','/unknown'],['POST','/auth/economy/prepare'],['PUT','/internal/characters/character/cosmetic-title']]){const result=check(game,method,path);expect(result.status).toHaveBeenCalledWith(403);expect(result.next).not.toHaveBeenCalled();}
});
test('route boundaries reject suffixes, encoded separators and different verbs',()=>{
 for(const path of ['/character_save/id/admin','/internal/vaults/account/id/extra','/internal/market/listings/id/cancel/extra','/internal/characters/id%2fextra/connect'])expect(gameServiceMayAccess('POST',path)).toBe(false);
 expect(gameServiceMayAccess('PUT','/character_save/id%2fextra')).toBe(false);expect(gameServiceMayAccess('DELETE','/internal/vaults/account/id')).toBe(false);
});
test('administrator retains explicit internal authority; wrong, empty and oversized credentials fail',()=>{
 expect(check(admin,'PUT','/internal/game-data/npcs/1').next).toHaveBeenCalledOnce();
 for(const token of [undefined,'',game+'x','x'.repeat(600)])expect(check(token,'GET','/character').status).toHaveBeenCalledWith(401);
 expect(()=>createInternalAuthorization(game,game)).toThrow();expect(()=>createInternalAuthorization(admin,'short')).toThrow();
});
