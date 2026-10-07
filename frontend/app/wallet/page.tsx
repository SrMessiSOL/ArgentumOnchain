"use client";
import {useAuthRedirect} from '@/hooks/useAuthRedirect';
import GameAssets from '@/components/GameAssets';
import {useI18n} from '@/components/I18nProvider';
import {portalEnglish,portalSpanish} from '@/lib/portal-copy';
export default function WalletPage(){const {session,loading}=useAuthRedirect({redirectTo:'/login',when:'unauthenticated',preserveRedirect:true});const {locale}=useI18n(),copy=locale==='es'?portalSpanish:portalEnglish;if(loading||!session)return <main className="player-portal"><div className="portal-loading" role="status">{locale==='es'?'Cargando tu cuenta…':'Checking your account…'}</div></main>;return <main lang={locale} className="player-portal portal-collection"><header className="portal-page-heading"><div><p className="portal-eyebrow">AOCHAIN / {copy.collection}</p><h1>{copy.collectionHeading}</h1><p>{copy.collectionIntro}</p></div><span className="portal-test-badge"><i/>{copy.test}</span></header><GameAssets/></main>;}
