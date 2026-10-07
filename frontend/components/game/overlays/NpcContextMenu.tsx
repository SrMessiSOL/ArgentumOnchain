import { LocalizedText } from '@/components/LocalizedText';
import type { RefObject } from "react";

type InspectableNpc = {
    entityId: number;
    name: string;
};

type RevivableCharacter = {
    entityId: number;
    name: string;
};

type NpcContextMenuState = {
    x: number;
    y: number;
    npc: InspectableNpc;
};

type DeadCharacterContextMenuState = {
    x: number;
    y: number;
    character: RevivableCharacter;
};

type NpcContextMenuProps = {
    menuRef: RefObject<HTMLDivElement | null>;
    npcContextMenu: NpcContextMenuState | null;
    deadCharacterContextMenu: DeadCharacterContextMenuState | null;
    isAdmin: boolean;
    removingNpcEntityId: number | null;
    onInspectNpc: (npc: InspectableNpc) => void;
    onRemoveNpc: (npc: InspectableNpc) => void;
    onRemoveNpcPermanently: (npc: InspectableNpc) => void;
    onReviveCharacter: (character: RevivableCharacter) => void;
};

export function NpcContextMenu({
    menuRef,
    npcContextMenu,
    deadCharacterContextMenu,
    isAdmin,
    removingNpcEntityId,
    onInspectNpc,
    onRemoveNpc,
    onRemoveNpcPermanently,
    onReviveCharacter,
}: NpcContextMenuProps) {
    if (npcContextMenu) {
        return (
            <div
                ref={menuRef}
                className="absolute z-30 min-w-40 rounded-2xl border border-cyan-200/15 bg-stone-950/95 p-2 shadow-2xl backdrop-blur-md"
                style={{ left: npcContextMenu.x, top: npcContextMenu.y }}
            >
                <div className="mb-2 px-2 text-[10px] uppercase tracking-[0.2em] text-stone-400">
                    <LocalizedText source={npcContextMenu.npc.name} />
                </div>
                <button
                    type="button"
                    onClick={() => onInspectNpc(npcContextMenu.npc)}
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-stone-100 transition hover:bg-cyan-300/12"
                >
                    <span><LocalizedText source={"Inspeccionar"} /></span>
                    <span className="text-xs uppercase tracking-[0.16em] text-cyan-200/70">
                        NPC
                    </span>
                </button>
                {isAdmin ? (
                    <>
                        <button
                            type="button"
                            disabled={
                                removingNpcEntityId ===
                                npcContextMenu.npc.entityId
                            }
                            onClick={() => onRemoveNpc(npcContextMenu.npc)}
                            className="mt-1 flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-rose-100 transition hover:bg-rose-400/12 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <span><LocalizedText source={"Quitar del mapa"} /></span>
                            <span className="text-xs uppercase tracking-[0.16em] text-rose-200/70">
                                Admin
                            </span>
                        </button>
                        <button
                            type="button"
                            disabled={
                                removingNpcEntityId ===
                                npcContextMenu.npc.entityId
                            }
                            onClick={() =>
                                onRemoveNpcPermanently(npcContextMenu.npc)
                            }
                            className="mt-1 flex w-full items-center justify-between rounded-xl border border-rose-300/20 bg-rose-500/10 px-3 py-2 text-left text-sm text-rose-100 transition hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <span><LocalizedText source={"Quitar permanente"} /></span>
                            <span className="text-xs uppercase tracking-[0.16em] text-rose-200/70">
                                JSON
                            </span>
                        </button>
                    </>
                ) : null}
            </div>
        );
    }

    if (!deadCharacterContextMenu) {
        return null;
    }

    return (
        <div
            ref={menuRef}
            className="absolute z-30 min-w-40 rounded-2xl border border-cyan-200/15 bg-stone-950/95 p-2 shadow-2xl backdrop-blur-md"
            style={{
                left: deadCharacterContextMenu.x,
                top: deadCharacterContextMenu.y,
            }}
        >
            <div className="mb-2 px-2 text-[10px] uppercase tracking-[0.2em] text-stone-400">
                {deadCharacterContextMenu.character.name}
            </div>
            <button
                type="button"
                onClick={() =>
                    onReviveCharacter(deadCharacterContextMenu.character)
                }
                className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-emerald-100 transition hover:bg-emerald-400/12"
            >
                <span><LocalizedText source={"Revivir"} /></span>
                <span className="text-xs uppercase tracking-[0.16em] text-emerald-200/70">
                    Admin
                </span>
            </button>
        </div>
    );
}
