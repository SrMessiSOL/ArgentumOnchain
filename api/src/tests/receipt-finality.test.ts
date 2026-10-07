import {test,expect,vi,afterEach} from 'vitest';
import {economyConnection,receiptState} from '../economy-chain';
import {DEVNET_GENESIS} from '../cosmetic-policy';
afterEach(()=>vi.restoreAllMocks());
function proof(status:unknown){
 vi.spyOn(economyConnection,'getGenesisHash').mockResolvedValue(DEVNET_GENESIS);
 vi.spyOn(economyConnection,'getSignatureStatuses').mockResolvedValue({context:{slot:1},value:[status]} as never);
 vi.spyOn(economyConnection,'getBlockHeight').mockResolvedValue(200);
}
test('provisional errors retain signed reservations',async()=>{proof({err:{InstructionError:[0,'Custom']},confirmationStatus:'processed'});expect(await receiptState('fixture',100)).toBe('pending');});
test('missing signed history never authorizes an expiry refund',async()=>{proof(null);expect(await receiptState('fixture',100)).toBe('pending');});
test('finalized success commits settlement',async()=>{proof({err:null,confirmationStatus:'finalized'});expect(await receiptState('fixture',100)).toBe('complete');});
test('finalized failure releases a failed transaction',async()=>{proof({err:{InstructionError:[0,'Custom']},confirmationStatus:'finalized'});expect(await receiptState('fixture',100)).toBe('failed');});
test('never-signed expired preparations can fail',async()=>{proof(null);expect(await receiptState(null,100)).toBe('failed');});
