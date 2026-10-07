"use client";
import { LocalizedLabel } from '@/components/LocalizedText';
import { useI18n } from "@/components/I18nProvider";
import {useGameWallet} from './GameWalletProvider';
import {ensureLinkedWallet,jsonPost} from '@/lib/game-wallet';
import {Transaction} from '@solana/web3.js';
import {economyEnglish,economySpanish} from '@/lib/economy-locales';
import {walletEnglish,walletSpanish} from '@/lib/wallet-locales';

import PortalModal from './PortalModal';
import AssetTransactionVisual,{type AssetStage} from './AssetTransactionVisual';
import Link from "next/link";
import {uxEnglish,uxSpanish} from "@/lib/ux-copy";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import CharacterSpritePreview from "../components/CharacterSpritePreview";
import type { AuthErrorResponse, AuthSession } from "../lib/auth";
import {
    DISPLAY_NAME_MAX_LENGTH,
    getDisplayNameError,
} from "../lib/name-validation";
import { useAuthRedirect } from "../hooks/useAuthRedirect";
import type { BodiesDB, GraphicsDB, HeadsDB } from "../types/game";
import { loadBodiesDB, loadGraphicsDB, loadHeadsDB } from "../utils/gameLoader";
import {
    characterClassOptions,
    getBaseStats,
    getClassOption,
    getHeadIds,
    getRaceAppearance,
    getRaceOption,
    raceOptions,
    type CharacterClassKey,
    type GenderKey,
    type RaceKey,
} from "../lib/characterCreation";

const initialClass = characterClassOptions[0].key;
const initialRace = raceOptions[0].key;
const FRONT_DIRECTION = "2";

function resolveGraphicFrame(graphicsDB: GraphicsDB, graphicId: number) {
    const graphic = graphicsDB[graphicId.toString()];

    if (!graphic) {
        return null;
    }

    if (graphic.numFile) {
        return graphic;
    }

    const frameId =
        graphic.frames?.[FRONT_DIRECTION] ??
        graphic.frames?.["1"] ??
        Object.values(graphic.frames ?? {})[0];

    if (!frameId) {
        return null;
    }

    return graphicsDB[frameId.toString()] ?? null;
}

function isRenderableHead(
    headId: number,
    headsDB: HeadsDB,
    graphicsDB: GraphicsDB,
) {
    const headData = headsDB[headId.toString()];

    if (!headData) {
        return false;
    }

    return Boolean(resolveGraphicFrame(graphicsDB, headData[FRONT_DIRECTION]));
}

function isRenderableBody(
    bodyId: number,
    bodiesDB: BodiesDB,
    graphicsDB: GraphicsDB,
) {
    const bodyData = bodiesDB[bodyId.toString()];

    if (!bodyData) {
        return false;
    }

    return Boolean(resolveGraphicFrame(graphicsDB, bodyData[FRONT_DIRECTION]));
}

export default function CreateCharacterView() {
    const { locale, t: localizeKey, text: localizeText } = useI18n();

    const router = useRouter();
    const { session } = useAuthRedirect({
        redirectTo: "/login",
        when: "unauthenticated",
        preserveRedirect: true,
    });
    const [creatingCharacter, setCreatingCharacter] = useState(false);
    const walletConnection=useGameWallet();
    const [mintStage,setMintStage]=useState<AssetStage|null>(null);
    const [draftId,setDraftId]=useState<string|null>(null);
    const [newCharacterName, setNewCharacterName] = useState("");
    const [selectedClass, setSelectedClass] =
        useState<CharacterClassKey>(initialClass);
    const [selectedRace, setSelectedRace] = useState<RaceKey>(initialRace);
    const [selectedGender, setSelectedGender] = useState<GenderKey>("male");
    const [selectedHeadIndex, setSelectedHeadIndex] = useState(0);
    const [graphicsDB, setGraphicsDB] = useState<GraphicsDB | null>(null);
    const [bodiesDB, setBodiesDB] = useState<BodiesDB | null>(null);
    const [headsDB, setHeadsDB] = useState<HeadsDB | null>(null);
    const [error, setError] = useState<string | null>(null);

    const selectedClassOption = useMemo(
        () => getClassOption(selectedClass),
        [selectedClass],
    );
    const selectedRaceOption = useMemo(
        () => getRaceOption(selectedRace),
        [selectedRace],
    );
    const headIds = useMemo(
        () => getHeadIds(selectedRace, selectedGender),
        [selectedRace, selectedGender],
    );
    const selectedAppearance = useMemo(
        () => getRaceAppearance(selectedRace, selectedGender),
        [selectedRace, selectedGender],
    );
    const availableHeadIds = useMemo(() => {
        if (!graphicsDB || !headsDB) {
            return headIds;
        }

        return headIds.filter((headId) =>
            isRenderableHead(headId, headsDB, graphicsDB),
        );
    }, [graphicsDB, headIds, headsDB]);
    const selectedHeadId =
        availableHeadIds[selectedHeadIndex] ??
        availableHeadIds[0] ??
        headIds[0];
    const hasRenderableBody = useMemo(() => {
        if (!graphicsDB || !bodiesDB) {
            return true;
        }

        return isRenderableBody(
            selectedAppearance.bodyId,
            bodiesDB,
            graphicsDB,
        );
    }, [bodiesDB, graphicsDB, selectedAppearance.bodyId]);
    const baseStats = useMemo(
        () => getBaseStats(selectedClass, selectedRace),
        [selectedClass, selectedRace],
    );

    useEffect(() => {
        setSelectedHeadIndex(0);
    }, [selectedRace, selectedGender]);

    useEffect(() => {
        let cancelled = false;

        Promise.all([loadGraphicsDB(), loadBodiesDB(), loadHeadsDB()])
            .then(([graphics, bodies, heads]) => {
                if (cancelled) {
                    return;
                }

                setGraphicsDB(graphics);
                setBodiesDB(bodies);
                setHeadsDB(heads);
            })
            .catch((loadError) => {
                console.error(
                    "Error loading character creation assets:",
                    loadError,
                );
            });

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (selectedHeadIndex >= availableHeadIds.length) {
            setSelectedHeadIndex(0);
        }
    }, [availableHeadIds.length, selectedHeadIndex]);

    const cycleHead = (direction: "prev" | "next") => {
        const total = availableHeadIds.length;

        if (total === 0) {
            return;
        }

        setSelectedHeadIndex((current) => {
            if (direction === "prev") {
                return (current - 1 + total) % total;
            }

            return (current + 1) % total;
        });
    };

    const createCharacter = async () => {
        const trimmedName = newCharacterName.trim();

        if (!trimmedName) {
            setError("Necesitas escribir un nombre para tu personaje.");
            return;
        }

        const nameError = getDisplayNameError(trimmedName);

        if (nameError) {
            setError(nameError);
            return;
        }

        setCreatingCharacter(true);setMintStage('preparing');
        setError(null);

        try {
            const wallet=await walletConnection.connect();
            await ensureLinkedWallet(wallet);
            let characterId=draftId;
            if(!characterId){
            const response = await fetch("/api/auth/create-character", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    name: trimmedName,
                    class: selectedClass,
                    race: selectedRace,
                    gender: selectedGender,
                    headId: selectedHeadId,
                }),
            });

            const result = (await response.json()) as
                | AuthSession
                | AuthErrorResponse;

            if (!response.ok || "error" in result) {
                throw new Error(
                    "error" in result
                        ? result.error
                        : "No se pudo crear el personaje",
                );
            }

            characterId=result.characters.find(c=>c.name.toLowerCase()===trimmedName.toLowerCase())?._id??null;
            if(!characterId)throw Error('assets.failed');
            setDraftId(characterId);
            }
            const prepared=await jsonPost('/api/game-assets/prepare',{kind:'mint',characterId});
            if(prepared.wallet!==wallet.address)throw Error('economy.wrongWallet');
            setMintStage('signing');sessionStorage.setItem('aochain:asset-operation',prepared.id);
            const signed=await wallet.signTransaction(Transaction.from(Uint8Array.from(atob(prepared.transaction),c=>c.charCodeAt(0))));
            setMintStage('confirming');
            await jsonPost('/api/game-assets/submit',{operationId:prepared.id,transaction:btoa(String.fromCharCode(...signed.serialize({requireAllSignatures:false})))});
            router.push("/wallet?operation="+encodeURIComponent(prepared.id));
            router.refresh();
        } catch (creationError) {
            setMintStage(null);
            setError(
                creationError instanceof Error
                    ? (locale==='es'?economySpanish:economyEnglish)[creationError.message as keyof typeof economyEnglish]??(locale==='es'?walletSpanish:walletEnglish)[creationError.message as keyof typeof walletEnglish]??creationError.message
                    : "Error inesperado al crear el personaje",
            );
        } finally {
            setCreatingCharacter(false);
        }
    };

    const statItems = [
        { label: "Fue", value: baseStats.fuerza },
        { label: "Agi", value: baseStats.agilidad },
        { label: "Int", value: baseStats.inteligencia },
        { label: "Car", value: baseStats.carisma },
        { label: "CON", value: baseStats.constitucion },
        { label: "HP", value: baseStats.vida },
        { label: "MP", value: baseStats.mana },
    ];
    return (
        <main className="realm-creation player-portal portal-creation min-h-screen overflow-y-auto bg-[radial-gradient(circle_at_top,#0f766e33,transparent_35%),radial-gradient(circle_at_bottom,#f59e0b22,transparent_30%),linear-gradient(180deg,#0f172a,#0c0a09)] px-4 py-10 text-stone-100">
            <div className="mx-auto max-w-full">
                <div className="portal-page-heading">
                    <div>
                        <Link className="realm-back-link" href="/characters">← {locale === "es" ? uxSpanish.back : uxEnglish.back}</Link>
                        <h1 className="mt-2 text-3xl font-semibold text-stone-50">{localizeKey("characters.create")}</h1>
                        <p className="realm-page-intro">{locale === "es" ? uxSpanish.creationHelp : uxEnglish.creationHelp}</p>
                        <p>{locale==='es'?'Elegí tu wallet para crear, mintear y stakear. La wallet pedirá tu firma y cobrará la comisión de prueba en devnet.':'Your wallet approves the character mint and pays the devnet network fee.'}</p>
                    </div>
                </div>

                {session ? (
                    <section className="rounded-[28px] border border-white/8 bg-stone-950/82 p-4 shadow-2xl backdrop-blur-md md:p-5">
                        <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
                            <div className="space-y-4">
                                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                                    <label htmlFor="character-name" className="text-[11px] uppercase tracking-[0.28em] text-stone-400">{localizeKey("creation.name")}</label>
                                    <LocalizedLabel><input
                                        id="character-name"
                                        aria-label={localizeKey("creation.name")}
                                        value={newCharacterName}
                                        onChange={(event) =>
                                            setNewCharacterName(
                                                event.target.value,
                                            )
                                        }
                                        maxLength={DISPLAY_NAME_MAX_LENGTH}
                                        className="mt-2 w-full rounded-[18px] border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition focus:border-amber-300/70"
                                        placeholder=""
                                    /></LocalizedLabel>
                                </div>

                                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                                    <p className="text-[11px] uppercase tracking-[0.28em] text-stone-400">{localizeKey("creation.gender")}</p>
                                    <div className="mt-3 grid grid-cols-2 gap-2">
                                        {(
                                            [
                                                ["male", "Masculino"],
                                                ["female", "Femenino"],
                                            ] as const
                                        ).map(([key, label]) => {
                                            const isActive =
                                                key === selectedGender;

                                            return (
                                                <button
                                                    key={key}
                                                    aria-pressed={isActive}
                                                    type="button"
                                                    onClick={() =>
                                                        setSelectedGender(key)
                                                    }
                                                    className={`rounded-[18px] border px-3 py-3 text-sm font-semibold transition ${
                                                        isActive
                                                            ? "border-emerald-300/60 bg-emerald-300/10 text-emerald-100"
                                                            : "border-white/8 bg-white/3 text-stone-200 hover:border-white/18 hover:bg-white/6"
                                                    }`}
                                                >
                                                    {localizeText(label)}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                                    <p className="text-[11px] uppercase tracking-[0.28em] text-stone-400">{localizeKey("creation.class")}</p>
                                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                        {characterClassOptions.map((option) => {
                                            const isActive =
                                                option.key === selectedClass;

                                            return (
                                                <button
                                                    key={option.key}
                                                    aria-pressed={isActive}
                                                    type="button"
                                                    onClick={() =>
                                                        setSelectedClass(
                                                            option.key,
                                                        )
                                                    }
                                                    className={`rounded-[18px] border px-3 py-3 text-left transition ${
                                                        isActive
                                                            ? "border-amber-300/60 bg-amber-300/12"
                                                            : "border-white/8 bg-white/3 hover:border-white/18 hover:bg-white/6"
                                                    }`}
                                                >
                                                    <p className="text-sm font-semibold text-white">
                                                        {localizeText(option.label)}
                                                    </p>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                                    <p className="text-[11px] uppercase tracking-[0.28em] text-stone-400">{localizeKey("creation.race")}</p>
                                    <div className="mt-3 grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                                        {raceOptions.map((option) => {
                                            const isActive =
                                                option.key === selectedRace;

                                            return (
                                                <button
                                                    key={option.key}
                                                    aria-pressed={isActive}
                                                    type="button"
                                                    onClick={() =>
                                                        setSelectedRace(
                                                            option.key,
                                                        )
                                                    }
                                                    className={`rounded-[18px] border px-3 py-3 text-left transition ${
                                                        isActive
                                                            ? "border-cyan-300/55 bg-cyan-300/10"
                                                            : "border-white/8 bg-white/3 hover:border-white/18 hover:bg-white/6"
                                                    }`}
                                                >
                                                    <p className="text-sm font-semibold text-white">
                                                        {localizeText(option.label)}
                                                    </p>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            <aside className="space-y-4">
                                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <p className="text-[11px] uppercase tracking-[0.28em] text-amber-200/75">{localizeKey("creation.preview")}</p>
                                            <p className="mt-2 text-lg font-semibold text-white">
                                                {localizeText(selectedClassOption.label)}{" "}
                                                {localizeText(selectedRaceOption.label)}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="mt-4 flex justify-center">
                                        {hasRenderableBody && selectedHeadId ? (
                                            <CharacterSpritePreview
                                                bodyId={
                                                    selectedAppearance.bodyId
                                                }
                                                headId={selectedHeadId}
                                                scale={1.8}
                                            />
                                        ) : (
                                            <div className="flex h-[248px] w-[202px] items-center justify-center rounded-[28px] border border-white/10 bg-black/20 px-4 text-center text-sm text-stone-400">{localizeKey("creation.invalidAppearance")}</div>
                                        )}
                                    </div>

                                    <div className="mt-4 rounded-[18px] border border-white/8 bg-white/4 px-3 py-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <button
                                                type="button"
                                                aria-label={locale === "es" ? uxSpanish.previousHead : uxEnglish.previousHead}
                                                onClick={() =>
                                                    cycleHead("prev")
                                                }
                                                className="rounded-full border border-white/10 bg-black/25 px-3 py-2 text-sm font-semibold text-stone-200 transition hover:border-white/20 hover:bg-white/8"
                                            >
                                                &lt;
                                            </button>
                                            <div className="text-center">
                                                <p className="text-[11px] uppercase tracking-[0.24em] text-stone-400">{localizeKey("creation.head")}</p>
                                                <p className="mt-1 text-lg font-semibold text-white">
                                                    {selectedHeadId ?? "-"}
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                aria-label={locale === "es" ? uxSpanish.nextHead : uxEnglish.nextHead}
                                                onClick={() =>
                                                    cycleHead("next")
                                                }
                                                className="rounded-full border border-white/10 bg-black/25 px-3 py-2 text-sm font-semibold text-stone-200 transition hover:border-white/20 hover:bg-white/8"
                                            >
                                                &gt;
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                                    <div className="mb-3 flex items-center justify-between gap-3">
                                        <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-200/75">{localizeKey("creation.stats")}</p>
                                    </div>
                                    <div className="grid grid-cols-4 gap-2">
                                        {statItems.map((stat) => (
                                            <div
                                                key={localizeText(stat.label)}
                                                className="rounded-[16px] border border-white/8 bg-white/4 px-2 py-3 text-center"
                                            >
                                                <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">
                                                    {localizeText(stat.label)}
                                                </p>
                                                <p className="mt-1 text-lg font-semibold text-white">
                                                    {stat.value}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => void createCharacter()}
                                    disabled={creatingCharacter}
                                    className="w-full rounded-[20px] bg-amber-300 px-4 py-3.5 text-sm font-semibold text-stone-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-stone-400"
                                >
                                    {creatingCharacter
                                        ? localizeKey("creation.pending")
                                        : locale==='es'?'Crear y mintear con wallet':'Create & mint with wallet'}
                                </button>
                            </aside>
                        </div>

                        {mintStage&&!error&&<PortalModal title={locale==='es'?'Creando tu personaje':'Creating your character'} locked={creatingCharacter} onClose={()=>setMintStage(null)}><AssetTransactionVisual stage={mintStage}><CharacterSpritePreview bodyId={selectedAppearance.bodyId} headId={selectedHeadId} scale={1.2}/></AssetTransactionVisual></PortalModal>}
                        {error ? (
                            <PortalModal title={locale==='es'?'No se pudo crear el personaje':'Could not create the character'} onClose={()=>{setError(null);setMintStage(null);}}><p role="alert">
                                {localizeText(error)}</p>
                                {draftId&&<><p>{locale==='es'?'El personaje ya está guardado. Reintentá el mint cuando la operación pendiente termine; no vuelvas a crearlo.':'Your character is saved. Retry minting after any pending operation ends; you do not need to create it again.'}</p><Link href="/wallet">{locale==='es'?'Ver personaje y operaciones':'View character and operations'}</Link></>}
                            </PortalModal>
                        ) : null}
                    </section>
                ) : (
                    <div className="rounded-[28px] border border-white/8 bg-stone-950/80 p-6 text-stone-300 shadow-2xl backdrop-blur-md">{localizeKey("creation.loading")}</div>
                )}
            </div>
        </main>
    );
}
