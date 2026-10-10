// A signing request must never reopen the picker for an active/restoring session.
export async function resolveSigningWallet<T>(options:{
    status:()=>string; current:()=>T|null; wait:()=>Promise<void>; choose:()=>Promise<T>;
}, switchWallet=false):Promise<T> {
    if(switchWallet) return options.choose();
    for(let attempt=0;options.status()==='connecting' && attempt<50;attempt++) await options.wait();
    if(options.status()==='connecting') throw Error('assets.pending');
    if(options.status()==='connected') {
        const wallet=options.current();
        if(!wallet) throw Error('wallet.unsupported');
        return wallet;
    }
    return options.choose();
}
