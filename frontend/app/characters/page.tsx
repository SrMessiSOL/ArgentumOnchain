"use client";
import { LocalizedText, LocalizedLabel } from '@/components/LocalizedText';
import {economyEnglish,economySpanish} from '@/lib/economy-locales';
import { useI18n } from "@/components/I18nProvider";

import {portalEnglish,portalSpanish} from '@/lib/portal-copy';
import { ArrowRight,Plus,BookOpen,Shield,Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PortalModal from '@/components/PortalModal';
import { useEffect, useState } from "react";
import CharacterSpritePreview from "@/components/CharacterSpritePreview";
import type { AuthErrorResponse, AuthSession } from "../../lib/auth";
import { useAuthRedirect } from "../../hooks/useAuthRedirect";

type DeleteCandidate = {
    id: string;
    name: string;
};

function getCharacterAppearance(character: AuthSession["characters"][number]) {
    return {
        headId: character.id_head,
        bodyId: character.id_body,
        weaponId: character.id_weapon,
        shieldId: character.id_shield,
        helmetId: character.id_helmet,
    };
}

function getCharacterNamePresentation(
    character: AuthSession["characters"][number],
) {
    if (character.isAdministrator) {
        return { label: "Administrador", color: "#419900" };
    }

    if (character.faction === "armada") {
        return { label: "Armada", color: "#00AFFF" };
    }

    if (character.faction === "caos") {
        return { label: "Caos", color: "#9B0000" };
    }

    if (character.criminal) {
        return { label: "Criminal", color: "red" };
    }

    return { label: "Ciudadano", color: "#3333ff" };
}

export default function CharactersPage() {
    const {locale, t: localizeKey, text: localizeText } = useI18n();

    const copy=locale==='es'?portalSpanish:portalEnglish;
    const [focusedId,setFocusedId]=useState('');
    const [stakesLoading,setStakesLoading]=useState(true);
    const [stakes,setStakes]=useState<Record<string,string>>({});
    useEffect(()=>{fetch('/api/game-assets',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(d=>{if(d)setStakes(Object.fromEntries(d.characters.map((c:any)=>[c.id,c.chain_state])));}).catch(()=>{}).finally(()=>setStakesLoading(false));},[]);
    const router = useRouter();
    const { session } = useAuthRedirect({
        redirectTo: "/login",
        when: "unauthenticated",
        preserveRedirect: true,
    });
    const [localSession, setLocalSession] = useState<AuthSession | null>(null);
    const [pendingCharacterId, setPendingCharacterId] = useState<string | null>(
        null,
    );
    const [deletingCharacterId, setDeletingCharacterId] = useState<
        string | null
    >(null);
    const [deleteCandidate, setDeleteCandidate] =
        useState<DeleteCandidate | null>(null);
    const [deleteConfirmationText, setDeleteConfirmationText] = useState("");
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setLocalSession(session);
    }, [session]);

    const selectCharacter = async (characterId: string) => {
        setPendingCharacterId(characterId);
        setError(null);

        try {
            const response = await fetch("/api/auth/select-character", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ characterId }),
            });

            const result = (await response.json()) as
                | AuthSession
                | AuthErrorResponse;

            if (!response.ok || "error" in result) {
                throw new Error(
                    "error" in result
                        ? result.error
                        : "No se pudo seleccionar el personaje",
                );
            }

            setLocalSession(result);
            router.push("/play");
            router.refresh();
        } catch (selectionError) {
            setError(
                selectionError instanceof Error
                    ? selectionError.message
                    : localizeKey("common.unexpected"),
            );
        } finally {
            setPendingCharacterId(null);
        }
    };

    const deleteCharacter = async (characterId: string) => {
        setDeletingCharacterId(characterId);
        setError(null);

        try {
            const response = await fetch(
                `/api/auth/delete-character/${encodeURIComponent(characterId)}`,
                {
                    method: "DELETE",
                },
            );

            const result = (await response.json()) as
                | AuthSession
                | AuthErrorResponse;

            if (!response.ok || "error" in result) {
                throw new Error(
                    "error" in result
                        ? result.error
                        : "No se pudo borrar el personaje",
                );
            }

            setLocalSession(result);
            setDeleteCandidate(null);
            router.refresh();
        } catch (deletionError) {
            setError(
                deletionError instanceof Error
                    ? deletionError.message
                    : localizeKey("common.unexpected"),
            );
        } finally {
            setDeletingCharacterId(null);
        }
    };

    const closeDeleteModal = () => {
        setDeleteCandidate(null);
        setDeleteConfirmationText("");
    };

    const activeSession = localSession;
    const chosen=activeSession?.characters.find(c=>c._id===(focusedId||activeSession.selectedCharacterId))??activeSession?.characters[0];
    const playerName=(name:string)=>name;

    return (
        <main className="player-portal portal-play">
            <header className="portal-page-heading"><div><p className="portal-eyebrow">AOCHAIN / {copy.play}</p><h1>{copy.choose}</h1><p>{copy.playIntro}</p></div><span className="portal-test-badge"><i/>{copy.test}</span></header>
            
            {activeSession?<div className="portal-play-layout"><section className="portal-roster"><div className="portal-section-heading"><h2>{copy.roster}</h2><span>{activeSession.characters.length}</span></div><div className="portal-roster-list">{activeSession.characters.map(character=><button type="button" className={'portal-roster-choice '+(chosen?._id===character._id?'is-selected':'')} aria-pressed={chosen?._id===character._id} key={character._id} onClick={()=>setFocusedId(character._id)} disabled={Boolean(pendingCharacterId||deletingCharacterId)}><span className="portal-roster-portrait"><CharacterSpritePreview {...getCharacterAppearance(character)} scale={0.65} className="portal-sprite"/></span><span><strong>{playerName(character.name)}</strong><small>{localizeText(character.className)} · {copy.level} {character.level}</small></span></button>)}</div><Link href="/createcharacter" className="portal-create"><Plus size={17}/>{copy.newCharacter}</Link><p className="portal-smallprint">{copy.createHelp}</p></section>
            {chosen?<section className="portal-selected"><div className="portal-selected-top"><span className="portal-test-badge"><Shield size={13}/>{copy.shared}</span><span className="portal-level">{copy.level} {chosen.level}</span></div><div className="portal-hero-art"><CharacterSpritePreview {...getCharacterAppearance(chosen)} scale={2.5} className="portal-sprite"/><span className="portal-hero-platform"/></div><div className="portal-selected-info"><p className="portal-eyebrow">{localizeText(chosen.className)} · {localizeText(chosen.raceName)}</p><h2>{playerName(chosen.name)}</h2>{chosen.clanName&&<span className="portal-clan">{playerName(chosen.clanName)}</span>}{stakesLoading?<button className="portal-primary" disabled>{locale==='es'?'Verificando personaje…':'Checking character…'}</button>:stakes[chosen._id]==='staked'?<button className="portal-primary" disabled={Boolean(pendingCharacterId||deletingCharacterId)} onClick={()=>void selectCharacter(chosen._id)}>{pendingCharacterId?copy.entering:copy.enter}<ArrowRight size={18}/></button>:<><p className="play-stake-guidance">{locale==='es'?'Este personaje necesita estar minteado y stakeado para entrar al reino.':'This character must be minted and staked before entering the realm.'}</p><Link className="portal-primary" href={'/profile?view=characters&character='+chosen._id}>{locale==='es'?'Preparar personaje para jugar':'Get this character ready'}<ArrowRight size={18}/></Link></>}{error&&<PortalModal title={locale==='es'?'No se pudo entrar':'Could not enter the realm'} onClose={()=>setError(null)}><p>{localizeText(error)}</p><Link href="/profile">{copy.manage}</Link></PortalModal>}<details className="portal-character-settings"><summary>{copy.settings}</summary><Link href="/wallet">{copy.manage}</Link><button type="button" onClick={()=>{setDeleteCandidate({id:chosen._id,name:chosen.name});setDeleteConfirmationText('');setError(null);}} disabled={Boolean(pendingCharacterId||deletingCharacterId)}><Trash2 size={14}/>{localizeKey('characters.delete')}</button></details></div></section>:<section className="portal-first"><Shield size={38}/><h2>{copy.first}</h2><p>{copy.firstHelp}</p><Link className="portal-primary" href="/createcharacter">{copy.newCharacter}<ArrowRight size={18}/></Link></section>}
            <aside className="portal-learn"><BookOpen size={23}/><div><h3>{copy.learn}</h3><p>{copy.learnHelp}</p></div><Link href="/wiki">{copy.openGuide}<ArrowRight size={15}/></Link></aside></div>:<div className="portal-loading" role="status">{localizeKey('characters.loading')}</div>}
            {deleteCandidate ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/70 px-4 backdrop-blur-sm">
                    <div className="w-full max-w-md rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(28,25,23,0.96),rgba(12,10,9,0.98))] p-6 shadow-2xl">
                        <div className="flex items-start gap-4">
                            <div className="rounded-2xl border border-rose-400/25 bg-rose-400/10 p-3 text-rose-100">
                                <Trash2 className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-lg font-semibold text-white">{localizeKey("characters.delete")}</p>
                                <p className="mt-2 text-sm leading-6 text-stone-300">{localizeKey("characters.deletingName")}{" "}
                                    <span className="font-semibold text-white">
                                        {deleteCandidate.name}
                                    </span>
                                    .
                                </p>
                                <p className="mt-3 text-sm leading-6 text-stone-400">{localizeKey("characters.type")}{" "}<span className="font-semibold text-white"><LocalizedText source={"BORRAR"} /></span>{" "}{localizeKey("characters.confirmSuffix")}</p>
                            </div>
                        </div>

                        <label className="mt-6 block">
                            <span className="text-xs font-medium uppercase tracking-[0.22em] text-stone-400">{localizeKey("characters.confirmation")}</span>
                            <LocalizedLabel><input
                                type="text"
                                value={deleteConfirmationText}
                                onChange={(event) =>
                                    setDeleteConfirmationText(event.target.value)
                                }
                                disabled={Boolean(deletingCharacterId)}
                                autoComplete="off"
                                spellCheck={false}
                                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-stone-500 focus:border-rose-400/50 focus:bg-white/7 disabled:cursor-not-allowed disabled:opacity-60"
                                placeholder="BORRAR"
                            /></LocalizedLabel>
                        </label>

                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={closeDeleteModal}
                                disabled={Boolean(deletingCharacterId)}
                                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-stone-200 transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                            >{localizeKey("common.cancel")}</button>
                            <button
                                type="button"
                                onClick={() =>
                                    void deleteCharacter(deleteCandidate.id)
                                }
                                disabled={
                                    Boolean(deletingCharacterId) ||
                                    !["BORRAR", "DELETE"].includes(deleteConfirmationText.trim())
                                }
                                className="rounded-full border border-rose-400/35 bg-rose-500/15 px-4 py-2 text-sm font-medium text-rose-100 transition hover:border-rose-400/55 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {deletingCharacterId === deleteCandidate.id
                                    ? localizeKey("characters.deleting")
                                    : localizeKey("characters.deleteConfirm")}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </main>
    );
}
