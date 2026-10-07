"use client";
import MarketExchange from "@/components/MarketExchange";
import {useAuthRedirect} from "@/hooks/useAuthRedirect";
import {useI18n} from "@/components/I18nProvider";

export default function Page(){
    const {session,loading}=useAuthRedirect({redirectTo:"/login",when:"unauthenticated",preserveRedirect:true});
    const {locale}=useI18n();
    if(loading||!session)return <main className="player-portal"><div className="portal-loading" role="status">{locale==='es'?'Cargando tu cuenta…':'Checking your account…'}</div></main>;
    return <MarketExchange/>;
}
