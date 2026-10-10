export class ConnectionBudget {
    private total = 0;
    private addresses = new Map<string,number>();
    constructor(private maxTotal=512,private maxPerAddress=32) {}
    acquire(address:string): (()=>void)|null {
        const count=this.addresses.get(address)??0;
        if(this.total>=this.maxTotal||count>=this.maxPerAddress)return null;
        this.total++;this.addresses.set(address,count+1);
        let released=false;
        return ()=>{if(released)return;released=true;this.total--;const next=(this.addresses.get(address)??1)-1;if(next)this.addresses.set(address,next);else this.addresses.delete(address);};
    }
}
export function connectionBudgetFromEnvironment(env:NodeJS.ProcessEnv=process.env):ConnectionBudget {
    const read=(name:string,fallback:number)=>{
        if(env[name]===undefined)return fallback;
        if(!/^[1-9][0-9]*$/.test(env[name]!)||Number(env[name])>512)throw Error('Invalid connection limit');
        return Number(env[name]);
    };
    return new ConnectionBudget(read('GAME_MAX_CONNECTIONS',512),read('GAME_MAX_CONNECTIONS_PER_ADDRESS',32));
}
export const MAX_OUTBOUND_BUFFER_BYTES=2*1024*1024;
export function outboundWithinBudget(buffered:number,next:number):boolean {
    return Number.isFinite(buffered)&&Number.isFinite(next)&&buffered>=0&&next>=0&&buffered+next<=MAX_OUTBOUND_BUFFER_BYTES;
}
