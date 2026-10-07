import type { IncomingPacketHandlerArgs } from "./incomingPacketTypes";

export async function handleIncomingUiPacket({
    packet,
    engine,
    ctx,
}: IncomingPacketHandlerArgs): Promise<boolean> {
    switch (packet.type) {
        case "cosmeticSnapshot":
            if(engine && packet.payload.map===engine.mapNumber){
                engine.remoteCosmetics=new Map(packet.payload.entries.map((entry:{id:number;kind:"explorer"|"first-hunt"})=>[entry.id,{kind:entry.kind,expiresAt:Date.now()+6_000}]));
            }
            return true;
        case "console":
            if (
                /Comienzas a pescar\.|Has dejado de pescar\.|La pesca se canceló\.|Debes equiparte la caña de pescar/i.test(
                    packet.payload.msg,
                )
            ) {
                ctx.clearTargetingMode();
            }

            ctx.onConsoleMessage?.({
                text: packet.payload.msg,
                color: packet.payload.color,
                source: "console",
                channel: packet.payload.channel ?? "console",
                senderName: packet.payload.senderName,
                npcName: packet.payload.npcName,
            });
            ctx.emitStatus({
                connected: true,
                connecting: false,
                worldName: engine?.worldName,
                consoleLine: packet.payload.msg,
            });
            return true;

        case "dialog": {
            if (packet.payload.id > 0) {
                ctx.showDialogBubble(
                    packet.payload.id,
                    engine?.personajes[packet.payload.id]?.isNpc
                        ? (ctx.localizeNpcDialog?.(packet.payload.msg) ?? packet.payload.msg)
                        : packet.payload.msg,
                    packet.payload.color,
                );
            }

            const dialogSpeakerName =
                packet.payload.name?.trim() ||
                (packet.payload.id > 0
                    ? engine?.personajes[
                          packet.payload.id
                      ]?.nameCharacter?.trim()
                    : undefined);
            const dialogSpeakerType =
                packet.payload.id > 0 &&
                engine?.personajes[packet.payload.id]?.isNpc
                    ? "npc"
                    : "user";

            if (packet.payload.writeToConsole) {
                ctx.onConsoleMessage?.({
                    text: dialogSpeakerName
                        ? `[${dialogSpeakerName}]: ${packet.payload.msg}`
                        : packet.payload.msg,
                    color: packet.payload.color,
                    source: "dialog",
                    speakerType: dialogSpeakerType,
                    channel: "console",
                });
            }
            return true;
        }

        case "globalNotice":
            ctx.onGlobalNotice?.({
                text: packet.payload.msg,
                durationMs: packet.payload.durationMs,
            });
            return true;

        case "animFX":
            if (!engine) {
                return true;
            }
            await ctx.renderEntityFX(
                engine,
                packet.payload.id,
                packet.payload.fxGrh,
            );
            return true;

        case "spellProjectile": {
            if (!engine) {
                return true;
            }
            const spellProjectileData =
                engine.spellsDB?.[String(packet.payload.spellId)];
            if (!spellProjectileData) {
                return true;
            }
            await ctx.renderSpellProjectileVisual(
                engine,
                { x: packet.payload.startX, y: packet.payload.startY },
                { x: packet.payload.endX, y: packet.payload.endY },
                spellProjectileData,
            );
            return true;
        }

        case "spellVisual": {
            if (packet.payload.msg && packet.payload.casterId) {
                ctx.showDialogBubble(
                    packet.payload.casterId,
                    packet.payload.msg,
                    "#E69500",
                );
            }

            if (!engine) {
                return true;
            }

            if (
                typeof packet.payload.spellId === "number" &&
                typeof packet.payload.startX === "number" &&
                typeof packet.payload.startY === "number" &&
                typeof packet.payload.endX === "number" &&
                typeof packet.payload.endY === "number"
            ) {
                const spellProjectileData =
                    engine.spellsDB?.[String(packet.payload.spellId)];
                if (spellProjectileData) {
                    await ctx.renderSpellProjectileVisual(
                        engine,
                        {
                            x: packet.payload.startX,
                            y: packet.payload.startY,
                        },
                        {
                            x: packet.payload.endX,
                            y: packet.payload.endY,
                        },
                        spellProjectileData,
                    );
                }
            }

            if (
                typeof packet.payload.targetId === "number" &&
                typeof packet.payload.fxGrh === "number"
            ) {
                await ctx.renderEntityFX(
                    engine,
                    packet.payload.targetId,
                    packet.payload.fxGrh,
                );
            }

            if (
                typeof packet.payload.targetId === "number" &&
                typeof packet.payload.soundId === "number"
            ) {
                ctx.soundManagerRef.current?.play({
                    soundId: packet.payload.soundId,
                    listener: ctx.resolveEntitySoundPosition(
                        engine,
                        engine.user?.id,
                    ),
                    source: ctx.resolveEntitySoundPosition(
                        engine,
                        packet.payload.targetId,
                    ),
                });
            }

            return true;
        }

        case "createProjectile":
            if (!engine) {
                return true;
            }
            await ctx.renderProjectileVisual(
                engine,
                { x: packet.payload.startX, y: packet.payload.startY },
                { x: packet.payload.endX, y: packet.payload.endY },
                packet.payload.grhIndex,
            );
            return true;

        case "playSound":
            if (!engine) {
                return true;
            }
            ctx.soundManagerRef.current?.play({
                soundId: packet.payload.soundId,
                listener: ctx.resolveEntitySoundPosition(
                    engine,
                    engine.user?.id,
                ),
                source: ctx.resolveEntitySoundPosition(
                    engine,
                    packet.payload.id,
                ),
            });
            return true;

        case "error":
            ctx.setIsSceneReady(false);
            ctx.emitStatus({
                connected: false,
                connecting: false,
                error: packet.payload.msg,
            });
            return true;

        case "closeForce":
            ctx.setIsSceneReady(false);
            ctx.emitStatus({
                connected: false,
                connecting: false,
                error: "El servidor cerro la sesion.",
            });
            ctx.disconnectSocket();
            return true;

        default:
            return false;
    }
}
