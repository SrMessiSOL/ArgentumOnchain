"use client";
import {createContext,useContext,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {AppProvider,useConnector,useConnectorClient} from '@solana/connector/react';
import {getDefaultConfig,createTransactionSigner,type TransactionSigner} from '@solana/connector/headless';
import {Transaction} from '@solana/web3.js';
import PortalModal from './PortalModal';
import {useI18n} from './I18nProvider';

type GameWallet={address:string;signMessage(message:Uint8Array):Promise<Uint8Array>;signTransaction(tx:Transaction):Promise<Transaction>};
const Context=createContext<{connect(switchWallet?:boolean):Promise<GameWallet>;address:string|null;disconnect:()=>Promise<void>}|null>(null);
export function useGameWallet(){const value=useContext(Context);if(!value)throw Error('Wallet provider missing');return value;}
export function wrapSigner(signer:TransactionSigner):GameWallet{return {address:signer.address,
 signMessage:async(message)=>{if(!signer.signMessage)throw Error('wallet.unsupported');return signer.signMessage(message);},
 signTransaction:async(tx)=>{const result=await signer.signTransaction(new Uint8Array(tx.serialize({requireAllSignatures:false})));if(!(result instanceof Uint8Array))throw Error('wallet.unsupported');return Transaction.from(result);}
};}
function WalletPicker({children}:{children:ReactNode}){
 const client=useConnectorClient(),state=useConnector(),{locale,t}=useI18n();
 const [open,setOpen]=useState(false),[working,setWorking]=useState(false),[error,setError]=useState(false);
 const pending=useRef<{resolve:(wallet:GameWallet)=>void;reject:(error:Error)=>void}|null>(null);
 function current(){const s=client?.getSnapshot();if(!client||s?.wallet.status!=='connected')return null;const wallet=client.getConnector(s.wallet.session.connectorId);if(!wallet)return null;const signer=createTransactionSigner({wallet,account:s.wallet.session.selectedAccount.account,cluster:s.cluster??undefined});return signer?wrapSigner(signer):null;}
 function cancel(){pending.current?.reject(Error('economy.walletRejected'));pending.current=null;setOpen(false);}
 useEffect(()=>()=>{pending.current?.reject(Error('economy.walletRejected'));},[]);
 async function connect(switchWallet=false){const wallet=current();if(wallet&&!switchWallet)return wallet;if(pending.current)throw Error('assets.pending');setError(false);setOpen(true);return new Promise<GameWallet>((resolve,reject)=>{pending.current={resolve,reject};});}
 async function choose(id:Parameters<NonNullable<typeof client>['connectWallet']>[0]){if(!client||working)return;setWorking(true);setError(false);try{await client.connectWallet(id);const wallet=current();if(!wallet)throw Error('wallet.unsupported');pending.current?.resolve(wallet);pending.current=null;setOpen(false);}catch{setError(true);}finally{setWorking(false);}}
 const displayName=(name:string)=>name;
 return <Context.Provider value={{connect,address:state.wallet.status==='connected'?state.wallet.session.selectedAccount.account.address:null,disconnect:async()=>{await client?.disconnectWallet();}}}>{children}{open&&<PortalModal title={locale==='es'?'Elegí tu wallet':'Choose your wallet'} locked={working} onClose={cancel}><div className="wallet-options"><p>{locale==='es'?'Conectá una wallet compatible con Solana. Después te pediremos verificar tu propiedad con una firma.':'Connect a Solana-compatible wallet. You will then be asked to verify ownership with a signature.'}</p>{state.connectors.filter(w=>w.ready).map(w=><button key={w.id} disabled={working} onClick={()=>choose(w.id)}>{displayName(w.name)}<span>→</span></button>)}{!state.connectors.some(w=>w.ready)&&<div className="wallet-empty"><h3>{locale==='es'?'No encontramos wallets':'No wallet detected'}</h3><p>{locale==='es'?'Abrí esta página desde el navegador de tu wallet de Solana, o instalá una extensión compatible con Wallet Standard y recargá.':'Open this page in your Solana wallet’s browser, or install a Wallet Standard browser extension and reload.'}</p></div>}{error&&<p role="alert">{locale==='es'?'No se pudo conectar. Reintentá o elegí otra wallet.':'Connection failed. Retry or choose another wallet.'}</p>}<small>Solana devnet · {locale==='es'?'Activos de prueba':'Test assets'}</small><button disabled={working} onClick={cancel}>{t('common.cancel')}</button></div></PortalModal>}</Context.Provider>;
}
export default function GameWalletProvider({children}:{children:ReactNode}){
 const config=useMemo(()=>getDefaultConfig({appName:'AOCHAIN',appUrl:process.env.NEXT_PUBLIC_SITE_URL,network:'devnet',clusters:[{id:'solana:devnet',label:'Devnet',url:'https://api.devnet.solana.com'}],autoConnect:true,enableMobile:true,persistClusterSelection:false}),[]);
 return <AppProvider connectorConfig={config}><WalletPicker>{children}</WalletPicker></AppProvider>;
}
