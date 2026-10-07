"use client";
import { LocalizedText, LocalizedLabel } from '@/components/LocalizedText';
import { useI18n } from "@/components/I18nProvider";

import React from "react";
import type {
    CharacterStatsSnapshot,
    PlayerHudState,
} from "../lib/aowProtocol";
import { OBJECT_TYPE } from "../lib/aowProtocol";
import { formatNumber as formatLocalizedNumber } from "../lib/number-format";
import type { ObjectsDB } from "../types/game";
import { loadObjectsDB } from "../utils/gameLoader";

type CharacterStatsModalProps = {
    hud: PlayerHudState | null;
    snapshot: CharacterStatsSnapshot | null;
    isOpen: boolean;
    isLoading: boolean;
    onClose: () => void;
};

const classLabels: Record<number, string> = {
    1: "Mago",
    2: "Clerigo",
    3: "Guerrero",
    4: "Asesino",
    6: "Bardo",
    7: "Druida",
    8: "Paladin",
    9: "Cazador",
};

function formatSignedNumber(value?: number | null, suffix = "") {
    if (typeof value !== "number" || Number.isNaN(value)) {
        return "-";
    }

    if (value === 0) {
        return `0${suffix}`;
    }

    return `${value > 0 ? "+" : ""}${formatNumber(value)}${suffix}`;
}

function formatNumber(value?: number | null) {
    if (typeof value !== "number" || Number.isNaN(value)) {
        return "-";
    }

    return formatLocalizedNumber(value);
}

function formatRange(min?: number | null, max?: number | null) {
    if (typeof min !== "number" || typeof max !== "number") {
        return "-";
    }

    return `${formatNumber(min)}/${formatNumber(max)}`;
}

function getActiveFactionSnapshot(snapshot: CharacterStatsSnapshot) {
    if (snapshot.factions.activeFaction === "armada") {
        return {
            label: "Armada",
            data: snapshot.factions.armada,
        };
    }

    if (snapshot.factions.activeFaction === "caos") {
        return {
            label: "Caos",
            data: snapshot.factions.caos,
        };
    }

    return null;
}

function StatCard({
    label,
    value,
    tone = "default",
}: {
    label: string;
    value: React.ReactNode;
    tone?: "default" | "accent";
}) {
    return (
        <div
            className={`rounded-2xl border px-4 py-3 ${tone === "accent" ? "border-amber-300/20 bg-amber-200/10" : "border-white/8 bg-black/20"}`}
        >
            <div className="text-[11px] uppercase tracking-[0.24em] text-stone-400">
                <LocalizedText source={label} />
            </div>
            <div className="mt-2 text-xl font-semibold text-stone-100">
                {typeof value === 'string' ? <LocalizedText source={value} /> : value}
            </div>
        </div>
    );
}

function DetailRow({
    label,
    value,
    description,
}: {
    label: string;
    value: React.ReactNode;
    description?: string;
}) {
    return (
        <div className="border-b border-white/6 py-2 first:pt-0 last:border-b-0 last:pb-0">
            <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-sm text-stone-400">
                    <span><LocalizedText source={label} /></span>
                    {description ? (
                        <span className="group relative inline-flex">
                            <LocalizedLabel><button
                                type="button"
                                className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/15 bg-white/5 text-[10px] font-semibold leading-none text-stone-300 transition hover:border-white/25 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-amber-300/40"
                                aria-label={`Info sobre ${label}`}
                            >
                                i
                            </button></LocalizedLabel>
                            <span className="pointer-events-none absolute left-0 top-full z-10 mt-2 hidden w-64 max-w-[calc(100vw-3rem)] rounded-xl border border-white/10 bg-stone-950/95 px-3 py-2 text-left text-xs leading-5 text-stone-200 shadow-2xl group-hover:block group-focus-within:block">
                                <LocalizedText source={description} />
                            </span>
                        </span>
                    ) : null}
                </span>
                <span className="text-sm font-medium text-stone-100">
                    {typeof value === 'string' ? <LocalizedText source={value} /> : value}
                </span>
            </div>
        </div>
    );
}

export default function CharacterStatsModal({
    hud,
    snapshot,
    isOpen,
    isLoading,
    onClose,
}: CharacterStatsModalProps) {
    const { t: localizeKey, text: localizeText } = useI18n();

    const [objectsDB, setObjectsDB] = React.useState<ObjectsDB | null>(null);
    const activeFactionSnapshot = React.useMemo(
        () => (snapshot ? getActiveFactionSnapshot(snapshot) : null),
        [snapshot],
    );

    React.useEffect(() => {
        if (!isOpen) {
            return;
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                onClose();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, onClose]);

    React.useEffect(() => {
        if (!isOpen || objectsDB) {
            return;
        }

        let active = true;

        loadObjectsDB()
            .then((data) => {
                if (active) {
                    setObjectsDB(data);
                }
            })
            .catch(() => {
                if (active) {
                    setObjectsDB({});
                }
            });

        return () => {
            active = false;
        };
    }, [isOpen, objectsDB]);

    const equipmentStats = React.useMemo(() => {
        if (!hud || !objectsDB) {
            return null;
        }

        return hud.inventory.reduce(
            (total, item) => {
                if (!item.equipped) {
                    return total;
                }

                const objectData = objectsDB[item.idItem.toString()];

                if (!objectData) {
                    return total;
                }

                total.equippedCount += 1;

                if (
                    item.objType === OBJECT_TYPE.armaduras ||
                    item.objType === OBJECT_TYPE.anillos ||
                    item.objType === OBJECT_TYPE.escudos ||
                    item.objType === OBJECT_TYPE.cascos
                ) {
                    total.minDef += objectData.minDef ?? 0;
                    total.maxDef += objectData.maxDef ?? 0;
                    total.minDefMag += objectData.minDefMag ?? 0;
                    total.maxDefMag += objectData.maxDefMag ?? 0;
                    total.resistenciaMagica +=
                        objectData.resistenciaMagica ?? 0;
                }

                if (
                    item.objType === OBJECT_TYPE.armas ||
                    item.objType === OBJECT_TYPE.flechas
                ) {
                    total.minWeaponHit += objectData.minHit ?? 0;
                    total.maxWeaponHit += objectData.maxHit ?? 0;
                }

                total.magicDamageBonus += objectData.magicDamageBonus ?? 0;

                if (item.objType === OBJECT_TYPE.armas && !total.weaponName) {
                    total.weaponName = item.name;
                    total.isProjectileWeapon = Boolean(objectData.proyectil);
                    total.isStabWeapon = Boolean(objectData.apu);
                }

                return total;
            },
            {
                equippedCount: 0,
                weaponName: "",
                isProjectileWeapon: false,
                isStabWeapon: false,
                minDef: 0,
                maxDef: 0,
                minDefMag: 0,
                maxDefMag: 0,
                resistenciaMagica: 0,
                minWeaponHit: 0,
                maxWeaponHit: 0,
                magicDamageBonus: 0,
            },
        );
    }, [hud, objectsDB]);

    if (!isOpen) {
        return null;
    }

    return (
        <div className="game-modal-backdrop fixed inset-0 z-[96] flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm">
            <div className="game-modal-panel flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-[30px] border border-[#8d7044] bg-[radial-gradient(circle_at_top,#3b2917_0%,#1b130d_42%,#0b0907_100%)] text-stone-100 shadow-[0_35px_140px_rgba(0,0,0,0.62)]">
                <div className="border-b border-amber-200/12 bg-black/20 px-6 py-5">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-[11px] uppercase tracking-[0.34em] text-amber-300/78">{localizeKey("hud.character")}</p>
                            <h2 className="mt-2 text-2xl font-semibold text-[#f5ead2]"><LocalizedText source={"Estadisticas "} /></h2>
                            <p className="mt-2 text-sm text-stone-300/85"><LocalizedText source={"Vista enfocada en combate del personaje actual. "} /></p>
                        </div>

                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-stone-200 transition hover:border-white/20 hover:bg-white/10"
                        >{localizeKey("common.close")}</button>
                    </div>
                </div>

                <div className="overflow-y-auto px-6 py-6">
                    {!hud ? (
                        <div className="rounded-[24px] border border-white/10 bg-black/20 px-5 py-6 text-sm text-stone-300"><LocalizedText source={"Todavia no hay datos del personaje conectados. "} /></div>
                    ) : (
                        <div className="space-y-6">
                            <div className="grid gap-3 md:grid-cols-3">
                                <StatCard
                                    label={localizeKey("creation.name")}
                                    value={<>{hud.nameCharacter || "-"}</>}
                                    tone="accent"
                                />
                                <StatCard
                                    label={localizeKey("creation.class")}
                                    value={
                                        classLabels[hud.idClase ?? 0] ??
                                        `Clase ${hud.idClase ?? "-"}`
                                    }
                                />
                                <StatCard
                                    label={localizeKey("characters.level")}
                                    value={formatNumber(hud.level)}
                                />
                            </div>

                            <div className="grid gap-4 lg:grid-cols-2">
                                <section className="rounded-[24px] border border-white/8 bg-black/20 p-5">
                                    <h3 className="text-[11px] uppercase tracking-[0.3em] text-amber-300/78"><LocalizedText source={"Base de combate "} /></h3>
                                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                        <StatCard
                                            label={localizeKey("hud.health")}
                                            value={formatRange(
                                                hud.hp,
                                                hud.maxHp,
                                            )}
                                        />
                                        <StatCard
                                            label="Mana"
                                            value={formatRange(
                                                hud.mana,
                                                hud.maxMana,
                                            )}
                                        />
                                        <StatCard
                                            label="Golpe base"
                                            value={formatRange(
                                                hud.minHit,
                                                hud.maxHit,
                                            )}
                                        />
                                        <StatCard
                                            label="Arma"
                                            value={
                                                equipmentStats?.weaponName ||
                                                "Sin arma"
                                            }
                                        />
                                    </div>
                                </section>

                                <section className="rounded-[24px] border border-white/8 bg-black/20 p-5">
                                    <h3 className="text-[11px] uppercase tracking-[0.3em] text-amber-300/78"><LocalizedText source={"Atributos "} /></h3>
                                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                        <StatCard
                                            label={localizeKey("hud.strength")}
                                            value={formatNumber(hud.attrFuerza)}
                                        />
                                        <StatCard
                                            label={localizeKey("hud.agility")}
                                            value={formatNumber(
                                                hud.attrAgilidad,
                                            )}
                                        />
                                        <StatCard
                                            label={localizeKey("hud.intelligence")}
                                            value={formatNumber(
                                                hud.attrInteligencia,
                                            )}
                                        />
                                        <StatCard
                                            label={localizeKey("hud.constitution")}
                                            value={formatNumber(
                                                hud.attrConstitucion,
                                            )}
                                        />
                                    </div>
                                </section>
                            </div>

                            <div className="grid gap-4 lg:grid-cols-2">
                                <section className="rounded-[24px] border border-white/8 bg-black/20 p-5">
                                    <h3 className="text-[11px] uppercase tracking-[0.3em] text-amber-300/78"><LocalizedText source={"Ofensiva "} /></h3>
                                    <div className="mt-4">
                                        <DetailRow
                                            label="DaÃ±o equipado"
                                            value={formatRange(
                                                equipmentStats?.minWeaponHit,
                                                equipmentStats?.maxWeaponHit,
                                            )}
                                            description="DaÃ±o base que aporta tu arma o municion equipada."
                                        />
                                        <DetailRow
                                            label="Tipo de arma"
                                            value={
                                                equipmentStats?.isProjectileWeapon
                                                    ? "Distancia"
                                                    : equipmentStats?.isStabWeapon
                                                      ? "ApuÃ±ala"
                                                      : equipmentStats?.weaponName
                                                        ? "Cuerpo a cuerpo"
                                                        : "Sin arma"
                                            }
                                            description="Define si atacas de cerca, a distancia o con un arma apta para apuÃ±alar."
                                        />
                                        <DetailRow
                                            label="Bonus daÃ±o mÃ¡gico %"
                                            value={formatSignedNumber(
                                                equipmentStats?.magicDamageBonus,
                                                "%",
                                            )}
                                            description="Porcentaje extra de daÃ±o mÃ¡gico otorgado por tu equipo actual."
                                        />
                                    </div>
                                </section>

                                <section className="rounded-[24px] border border-white/8 bg-black/20 p-5">
                                    <h3 className="text-[11px] uppercase tracking-[0.3em] text-amber-300/78">{localizeKey("hud.defense")}</h3>
                                    <div className="mt-4">
                                        <DetailRow
                                            label="Defensa equipada"
                                            value={formatRange(
                                                equipmentStats?.minDef,
                                                equipmentStats?.maxDef,
                                            )}
                                            description="Rango de defensa fÃ­sica que suma el equipo que llevas puesto."
                                        />
                                        <DetailRow
                                            label="Defensa mÃ¡gica"
                                            value={formatRange(
                                                equipmentStats?.minDefMag,
                                                equipmentStats?.maxDefMag,
                                            )}
                                            description="Rango de defensa mÃ¡gica aportado por cascos, armaduras y escudos equipados."
                                        />
                                        <DetailRow
                                            label="Resistencia mÃ¡gica"
                                            value={formatSignedNumber(
                                                equipmentStats?.resistenciaMagica,
                                                "%",
                                            )}
                                            description="ReducciÃ³n porcentual adicional frente a daÃ±o mÃ¡gico, si tu equipo la otorga."
                                        />
                                    </div>
                                </section>
                            </div>

                            <div className="grid gap-4 lg:grid-cols-2">
                                {snapshot ? (
                                    <section className="rounded-[24px] border border-white/8 bg-black/20 p-5">
                                        <h3 className="text-[11px] uppercase tracking-[0.3em] text-amber-300/78"><LocalizedText source={"Faccion "} /></h3>
                                        <div className="mt-4">
                                            {isLoading ? (
                                                <div className="text-sm text-stone-400"><LocalizedText source={"Cargando progreso faccionario... "} /></div>
                                            ) : activeFactionSnapshot ? (
                                                <>
                                                    <DetailRow
                                                        label="Alineacion"
                                                        value={
                                                            activeFactionSnapshot.label
                                                        }
                                                    />
                                                    <DetailRow
                                                        label="Puntos de faccion"
                                                        value={formatNumber(
                                                            activeFactionSnapshot
                                                                .data.score,
                                                        )}
                                                        description="Los puntos de faccion se suman con bajas validas. No cuentan newbies, peleas seguras ni objetivos a los que les sacas mas de 10 niveles, salvo que la victima sea nivel 25 o mas. Los re-kills recientes tampoco suman."
                                                    />
                                                    <DetailRow
                                                        label="Rango"
                                                        value={
                                                            activeFactionSnapshot
                                                                .data
                                                                .currentTitle ??
                                                            "Sin rango"
                                                        }
                                                    />
                                                    <DetailRow
                                                        label="Falta para el siguiente"
                                                        value={
                                                            activeFactionSnapshot
                                                                .data.nextTitle
                                                                ? `${formatNumber(activeFactionSnapshot.data.scoreToNextRank)} puntos de faccion para ${activeFactionSnapshot.data.nextTitle}`
                                                                : "Rango maximo"
                                                        }
                                                    />
                                                </>
                                            ) : (
                                                <>
                                                    <DetailRow
                                                        label="Puntos de Armada"
                                                        value={formatNumber(
                                                            snapshot.factions
                                                                .armada.score,
                                                        )}
                                                    />
                                                    <DetailRow
                                                        label="Puntos de Caos"
                                                        value={formatNumber(
                                                            snapshot.factions
                                                                .caos.score,
                                                        )}
                                                    />
                                                </>
                                            )}
                                        </div>
                                    </section>
                                ) : null}

                                <section className="rounded-[24px] border border-white/8 bg-black/20 p-5">
                                    <h3 className="text-[11px] uppercase tracking-[0.3em] text-amber-300/78">
                                        Skills
                                    </h3>
                                    <div className="mt-4">
                                        {isLoading ? (
                                            <div className="text-sm text-stone-400"><LocalizedText source={"Cargando skills del personaje... "} /></div>
                                        ) : snapshot ? (
                                            <>
                                                <DetailRow
                                                    label="Tacticas de combate"
                                                    value={formatNumber(
                                                        snapshot.skills
                                                            .tacticasCombate,
                                                    )}
                                                    description="Skill base usada para calcular evasiÃ³n y desempeÃ±o general en combate."
                                                />
                                                <DetailRow
                                                    label={localizeKey("hud.defense")}
                                                    value={formatNumber(
                                                        snapshot.skills.defensa,
                                                    )}
                                                    description="Skill vinculada al uso defensivo del personaje, especialmente con escudo."
                                                />
                                                <DetailRow
                                                    label="Armas"
                                                    value={formatNumber(
                                                        snapshot.skills.armas,
                                                    )}
                                                    description="Dominio de armas cuerpo a cuerpo que no son de proyectil ni de apuÃ±alar."
                                                />
                                                <DetailRow
                                                    label="Proyectiles"
                                                    value={formatNumber(
                                                        snapshot.skills
                                                            .proyectiles,
                                                    )}
                                                    description="Skill usada cuando atacas con armas de distancia y municiÃ³n."
                                                />
                                                <DetailRow
                                                    label="Combate sin armas"
                                                    value={formatNumber(
                                                        snapshot.skills
                                                            .wrestling,
                                                    )}
                                                    description="Representa tu capacidad ofensiva cuando peleas sin arma equipada."
                                                />
                                                <DetailRow
                                                    label="Ocultarse"
                                                    value={formatNumber(
                                                        snapshot.skills
                                                            .ocultarse,
                                                    )}
                                                    description="Skill relacionada con esconderte y sostener estados de ocultamiento."
                                                />
                                                <DetailRow
                                                    label="ApuÃ±alar"
                                                    value={formatNumber(
                                                        snapshot.skills
                                                            .apunalar,
                                                    )}
                                                    description="Skill usada para armas de apuÃ±alar y sus chequeos asociados."
                                                />
                                            </>
                                        ) : (
                                            <div className="text-sm text-stone-400"><LocalizedText source={"Usa "} /><code>{localizeText("/estadisticas")}</code>{" "}<LocalizedText source={"para pedir estas metricas al servidor. "} /></div>
                                        )}
                                    </div>
                                </section>

                                <section className="rounded-[24px] border border-white/8 bg-black/20 p-5">
                                    <h3 className="text-[11px] uppercase tracking-[0.3em] text-amber-300/78"><LocalizedText source={"Muertes "} /></h3>
                                    <div className="mt-4">
                                        {isLoading ? (
                                            <div className="text-sm text-stone-400"><LocalizedText source={"Cargando bajas del personaje... "} /></div>
                                        ) : snapshot ? (
                                            <>
                                                <DetailRow
                                                    label="NPC matados"
                                                    value={formatNumber(
                                                        snapshot.kills
                                                            .npcMatados,
                                                    )}
                                                />
                                                <DetailRow
                                                    label="Ciudadanos matados"
                                                    value={formatNumber(
                                                        snapshot.kills
                                                            .ciudadanosMatados,
                                                    )}
                                                />
                                                <DetailRow
                                                    label="Criminales matados"
                                                    value={formatNumber(
                                                        snapshot.kills
                                                            .criminalesMatados,
                                                    )}
                                                />
                                            </>
                                        ) : (
                                            <div className="text-sm text-stone-400"><LocalizedText source={"Usa "} /><code>{localizeText("/estadisticas")}</code>{" "}<LocalizedText source={"para pedir estas metricas al servidor. "} /></div>
                                        )}
                                    </div>
                                </section>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
