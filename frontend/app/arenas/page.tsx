"use client";

import { LocalizedText, LocalizedLabel } from '@/components/LocalizedText';
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { AuthErrorResponse } from "../../lib/auth";
import { useAuthRedirect } from "../../hooks/useAuthRedirect";
import {
    PVP_CHARACTER_TEMPLATES,
    type ArenaGameTicketResponse,
    type ArenaRoomDetails,
    type ArenaRoomsResponse,
    type ArenaRoomSummary,
} from "../../lib/arenas";

type CreateRoomForm = {
    name: string;
    isPublic: boolean;
    password: string;
    capacity: string;
};

function ArenasPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const roomId = searchParams.get("room")?.trim() || "";
    useAuthRedirect({
        redirectTo: "/login",
        when: "unauthenticated",
        preserveRedirect: true,
    });
    const [rooms, setRooms] = useState<ArenaRoomSummary[]>([]);
    const [activeRoom, setActiveRoom] = useState<ArenaRoomDetails | null>(null);
    const [createForm, setCreateForm] = useState<CreateRoomForm>({
        name: "",
        isPublic: true,
        password: "",
        capacity: "50",
    });
    const [joinPasswords, setJoinPasswords] = useState<Record<string, string>>(
        {},
    );
    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [actionRoomId, setActionRoomId] = useState<string | null>(null);

    const shareLink = useMemo(() => {
        if (!activeRoom || typeof window === "undefined") {
            return "";
        }

        return `${window.location.origin}/arenas/join/${activeRoom.joinToken}`;
    }, [activeRoom]);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setLoading(true);

            try {
                const roomsResponse = await fetch("/api/arenas/rooms", {
                    cache: "no-store",
                });

                const roomsResult = roomsResponse.ok
                    ? ((await roomsResponse.json()) as
                          | ArenaRoomsResponse
                          | AuthErrorResponse)
                    : { rooms: [] };

                if (!cancelled) {
                    setRooms("rooms" in roomsResult ? roomsResult.rooms : []);
                }
            } catch (loadError) {
                if (!cancelled) {
                    setError(
                        loadError instanceof Error
                            ? loadError.message
                            : "No se pudo cargar Arenas",
                    );
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        void load();

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!roomId) {
            setActiveRoom(null);
            return;
        }

        let cancelled = false;

        const loadRoom = async () => {
            try {
                const response = await fetch(`/api/arenas/rooms/${roomId}`, {
                    cache: "no-store",
                });
                const result = (await response.json()) as
                    | ArenaRoomDetails
                    | AuthErrorResponse;

                if (!response.ok || "error" in result) {
                    throw new Error(
                        "error" in result ? result.error : "Sala no encontrada",
                    );
                }

                if (!cancelled) {
                    setActiveRoom(result);
                }
            } catch (loadError) {
                if (!cancelled) {
                    setActiveRoom(null);
                    setError(
                        loadError instanceof Error
                            ? loadError.message
                            : "No se pudo abrir la sala",
                    );
                }
            }
        };

        void loadRoom();

        return () => {
            cancelled = true;
        };
    }, [roomId]);

    const refreshRooms = async () => {
        const response = await fetch("/api/arenas/rooms", {
            cache: "no-store",
        });
        const result = (await response.json()) as
            | ArenaRoomsResponse
            | AuthErrorResponse;

        if (response.ok && "rooms" in result) {
            setRooms(result.rooms);
        }
    };

    const fetchRoomDetails = async (targetRoomId: string) => {
        const response = await fetch(`/api/arenas/rooms/${targetRoomId}`, {
            cache: "no-store",
        });
        const result = (await response.json()) as
            | ArenaRoomDetails
            | AuthErrorResponse;

        if (!response.ok || "error" in result) {
            throw new Error(
                "error" in result ? result.error : "Sala no encontrada",
            );
        }

        return result;
    };

    const openRoom = (nextRoomId: string) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("room", nextRoomId);
        router.push(`/arenas?${params.toString()}`);
    };

    const clearRoom = () => {
        router.push("/arenas");
    };

    const createRoom = async () => {
        setError(null);
        setInfo(null);
        setActionRoomId("create");

        try {
            const response = await fetch("/api/arenas/rooms", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    name: createForm.name,
                    isPublic: createForm.isPublic,
                    password: createForm.isPublic
                        ? undefined
                        : createForm.password,
                    capacity: Number(createForm.capacity),
                }),
            });

            const result = (await response.json()) as
                | ArenaRoomDetails
                | AuthErrorResponse;

            if (!response.ok || "error" in result) {
                throw new Error(
                    "error" in result
                        ? result.error
                        : "No se pudo crear la sala",
                );
            }

            await refreshRooms();
            openRoom(result.id);
            setInfo(
                "Sala creada. Ya podes compartir el link o elegir tu personaje PvP.",
            );
        } catch (createError) {
            setError(
                createError instanceof Error
                    ? createError.message
                    : "No se pudo crear la sala",
            );
        } finally {
            setActionRoomId(null);
        }
    };

    const joinRoom = async (targetRoom: ArenaRoomSummary) => {
        setError(null);
        setInfo(null);
        setActionRoomId(targetRoom.id);

        try {
            const response = await fetch(
                `/api/arenas/rooms/${targetRoom.id}/join`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        password: targetRoom.isPublic
                            ? undefined
                            : joinPasswords[targetRoom.id],
                    }),
                },
            );

            const result = (await response.json()) as
                | ArenaRoomDetails
                | AuthErrorResponse;

            if (!response.ok || "error" in result) {
                throw new Error(
                    "error" in result
                        ? result.error
                        : "No se pudo entrar a la sala",
                );
            }

            await refreshRooms();
            openRoom(result.id);
        } catch (joinError) {
            setError(
                joinError instanceof Error
                    ? joinError.message
                    : "No se pudo entrar a la sala",
            );
        } finally {
            setActionRoomId(null);
        }
    };

    const leaveRoom = async () => {
        if (!activeRoom) {
            return;
        }

        setError(null);
        setInfo(null);
        setActionRoomId(activeRoom.id);

        try {
            await fetch(`/api/arenas/rooms/${activeRoom.id}/leave`, {
                method: "POST",
            });
            await refreshRooms();
            clearRoom();
        } catch {
            setError("No se pudo salir de la sala");
        } finally {
            setActionRoomId(null);
        }
    };

    const selectTemplate = async (templateId: number) => {
        if (!activeRoom) {
            return;
        }

        setError(null);
        setInfo(null);
        setActionRoomId(`template:${templateId}`);

        try {
            let room = activeRoom;

            if (!room.member) {
                const joinResponse = await fetch(
                    `/api/arenas/join/${room.joinToken}`,
                    {
                        method: "POST",
                    },
                );
                const joinResult = (await joinResponse.json()) as
                    | ArenaRoomDetails
                    | AuthErrorResponse;

                if (!joinResponse.ok || "error" in joinResult) {
                    throw new Error(
                        "error" in joinResult
                            ? joinResult.error
                            : "No se pudo entrar a la sala",
                    );
                }

                room = await fetchRoomDetails(joinResult.id);
                setActiveRoom(room);
            }

            const response = await fetch(
                `/api/arenas/rooms/${room.id}/select-template`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ templateId }),
                },
            );

            const result = (await response.json()) as
                | ArenaGameTicketResponse
                | AuthErrorResponse;

            if (!response.ok || "error" in result) {
                throw new Error(
                    "error" in result
                        ? result.error
                        : "No se pudo entrar a la arena",
                );
            }

            router.push(
                `/play?mode=arena&room=${encodeURIComponent(room.id)}&ticket=${encodeURIComponent(result.ticket)}&idChar=${templateId}`,
            );
        } catch (selectionError) {
            setError(
                selectionError instanceof Error
                    ? selectionError.message
                    : "No se pudo entrar a la arena",
            );
        } finally {
            setActionRoomId(null);
        }
    };

    return (
        <main className="min-h-screen overflow-y-auto bg-[radial-gradient(circle_at_top,#7c2d1230,transparent_34%),radial-gradient(circle_at_bottom,#0f766e26,transparent_32%),linear-gradient(180deg,#111827,#0b1120)] px-4 py-10 text-stone-100">
            <div className="mx-auto max-w-6xl space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h1 className="mt-2 text-3xl font-semibold text-white">
                            Arenas
                        </h1>
                    </div>
                </div>

                {error ? (
                    <div className="rounded-2xl bg-rose-500/12 px-4 py-3 text-sm text-rose-200">
                        <LocalizedText source={error} />
                    </div>
                ) : null}
                {info ? (
                    <div className="rounded-2xl bg-emerald-500/12 px-4 py-3 text-sm text-emerald-200">
                        <LocalizedText source={info} />
                    </div>
                ) : null}

                <div className="grid gap-6 xl:grid-cols-[1.05fr,1.3fr]">
                    <section className="rounded-[28px] border border-white/8 bg-stone-950/80 p-5 shadow-2xl backdrop-blur-md">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-xs uppercase tracking-[0.24em] text-stone-400"><LocalizedText source={"Crear sala "} /></p>
                                <h2 className="mt-2 text-xl font-semibold text-white"><LocalizedText source={"Nueva arena "} /></h2>
                            </div>
                        </div>

                        <div className="mt-5 space-y-3">
                            <div>
                                <p className="mb-2 px-1 text-xs uppercase tracking-[0.24em] text-stone-400"><LocalizedText source={"Nombre de sala "} /></p>
                                <LocalizedLabel><input
                                    autoComplete="off"
                                    value={createForm.name}
                                    onChange={(event) =>
                                        setCreateForm((current) => ({
                                            ...current,
                                            name: event.target.value,
                                        }))
                                    }
                                    placeholder="Nombre de la sala"
                                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-amber-300/40"
                                /></LocalizedLabel>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                                <button
                                    type="button"
                                    onClick={() =>
                                        setCreateForm((current) => ({
                                            ...current,
                                            isPublic: true,
                                        }))
                                    }
                                    className={`rounded-2xl border px-4 py-3 text-sm transition ${
                                        createForm.isPublic
                                            ? "border-cyan-300/55 bg-cyan-300/12 text-cyan-100"
                                            : "border-white/10 bg-white/5 text-stone-300"
                                    }`}
                                ><LocalizedText source={"Sala publica "} /></button>
                                <button
                                    type="button"
                                    onClick={() =>
                                        setCreateForm((current) => ({
                                            ...current,
                                            isPublic: false,
                                        }))
                                    }
                                    className={`rounded-2xl border px-4 py-3 text-sm transition ${
                                        !createForm.isPublic
                                            ? "border-amber-300/55 bg-amber-300/12 text-amber-100"
                                            : "border-white/10 bg-white/5 text-stone-300"
                                    }`}
                                ><LocalizedText source={"Sala privada "} /></button>
                            </div>

                            <div>
                                <p className="mb-2 px-1 text-xs uppercase tracking-[0.24em] text-stone-400"><LocalizedText source={"Maxima cantidad de jugadores "} /></p>
                                <LocalizedLabel><input
                                    autoComplete="off"
                                    value={createForm.capacity}
                                    onChange={(event) =>
                                        setCreateForm((current) => ({
                                            ...current,
                                            capacity: event.target.value,
                                        }))
                                    }
                                    placeholder="Cantidad maxima de jugadores"
                                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-amber-300/40"
                                /></LocalizedLabel>
                            </div>

                            {!createForm.isPublic ? (
                                <div>
                                    <p className="mb-2 px-1 text-xs uppercase tracking-[0.24em] text-stone-400">
                                        Password
                                    </p>
                                    <LocalizedLabel><input
                                        autoComplete="off"
                                        value={createForm.password}
                                        onChange={(event) =>
                                            setCreateForm((current) => ({
                                                ...current,
                                                password: event.target.value,
                                            }))
                                        }
                                        placeholder="Password de la sala"
                                        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-amber-300/40"
                                    /></LocalizedLabel>
                                </div>
                            ) : null}

                            <button
                                type="button"
                                onClick={() => void createRoom()}
                                disabled={loading || actionRoomId === "create"}
                                className="w-full rounded-2xl bg-amber-300 px-4 py-3 text-sm font-semibold text-stone-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                                <LocalizedText source={actionRoomId === "create"
                                    ? "Creando..."
                                    : "Crear sala"} />
                            </button>
                        </div>
                    </section>

                    <section className="rounded-[28px] border border-white/8 bg-stone-950/80 p-5 shadow-2xl backdrop-blur-md">
                        {activeRoom ? (
                            <div className="space-y-5">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <p className="text-xs uppercase tracking-[0.24em] text-stone-400"><LocalizedText source={"Sala activa "} /></p>
                                        <h2 className="mt-2 text-2xl font-semibold text-white">
                                            {activeRoom.name}
                                        </h2>
                                        <p className="mt-2 text-sm text-stone-300">
                                            {activeRoom.connectedPlayers}{" "}<LocalizedText source={"conectados - Mapa "} />{activeRoom.mapId}
                                        </p>
                                    </div>

                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => void leaveRoom()}
                                            disabled={
                                                actionRoomId === activeRoom.id
                                            }
                                            className="rounded-full border border-white/10 px-4 py-2 text-sm text-stone-200 transition hover:border-white/25 hover:bg-white/5"
                                        ><LocalizedText source={"Salir "} /></button>
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-white/8 bg-white/5 p-4 text-sm text-stone-300">
                                    <p><LocalizedText source={"Creador:"} />{" "}
                                        <span className="font-semibold text-white">
                                            {activeRoom.owner.name}
                                        </span>
                                    </p>
                                    <p className="mt-2 break-all"><LocalizedText source={"Link privado:"} />{" "}
                                        <span className="text-cyan-200">
                                            {shareLink || <LocalizedText source="Generando..." />}
                                        </span>
                                    </p>
                                </div>

                                <div>
                                    <p className="text-xs uppercase tracking-[0.24em] text-stone-400"><LocalizedText source={"Elegir personaje PvP "} /></p>
                                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                        {PVP_CHARACTER_TEMPLATES.map(
                                            (template) => {
                                                const isSelected =
                                                    activeRoom.member
                                                        ?.selectedPvpTemplateId ===
                                                    template.id;

                                                return (
                                                    <button
                                                        key={template.id}
                                                        type="button"
                                                        onClick={() =>
                                                            void selectTemplate(
                                                                template.id,
                                                            )
                                                        }
                                                        disabled={Boolean(
                                                            actionRoomId?.startsWith(
                                                                "template:",
                                                            ),
                                                        )}
                                                        className={`rounded-[24px] border p-4 text-left transition ${
                                                            isSelected
                                                                ? "border-cyan-300/60 bg-cyan-300/10"
                                                                : "border-white/10 bg-white/5 hover:border-white/25 hover:bg-white/8"
                                                        }`}
                                                    >
                                                        <p className="text-lg font-semibold text-white">
                                                            <LocalizedText source={template.name} />
                                                        </p>
                                                    </button>
                                                );
                                            },
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div>
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-xs uppercase tracking-[0.24em] text-stone-400"><LocalizedText source={"Salas publicas "} /></p>
                                        <h2 className="mt-2 text-2xl font-semibold text-white"><LocalizedText source={"Unirse a una arena "} /></h2>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => void refreshRooms()}
                                        className="rounded-full border border-white/10 px-4 py-2 text-sm text-stone-200 transition hover:border-white/25 hover:bg-white/5"
                                    ><LocalizedText source={"Actualizar "} /></button>
                                </div>

                                <div className="mt-5 space-y-3">
                                    {rooms.length > 0 ? (
                                        rooms.map((room) => (
                                            <div
                                                key={room.id}
                                                className="rounded-[24px] border border-white/8 bg-white/5 p-4"
                                            >
                                                <div className="flex flex-wrap items-start justify-between gap-3">
                                                    <div>
                                                        <p className="text-lg font-semibold text-white">
                                                            {room.name}
                                                        </p>
                                                        <p className="mt-2 text-xs uppercase tracking-[0.24em] text-stone-400">
                                                            {
                                                                room.connectedPlayers
                                                            }{" "}<LocalizedText source={"conectados - capacidad"} />{" "}
                                                            {room.capacity}
                                                        </p>
                                                        <p className="mt-2 text-sm text-stone-300"><LocalizedText source={"Creador:"} />{" "}
                                                            {room.owner.name}
                                                        </p>
                                                    </div>

                                                    <div className="flex min-w-[220px] flex-col gap-2">
                                                        {!room.isPublic ? (
                                                            <LocalizedLabel><input
                                                                autoComplete="off"
                                                                value={
                                                                    joinPasswords[
                                                                        room.id
                                                                    ] || ""
                                                                }
                                                                onChange={(
                                                                    event,
                                                                ) =>
                                                                    setJoinPasswords(
                                                                        (
                                                                            current,
                                                                        ) => ({
                                                                            ...current,
                                                                            [room.id]:
                                                                                event
                                                                                    .target
                                                                                    .value,
                                                                        }),
                                                                    )
                                                                }
                                                                placeholder="Password"
                                                                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none transition focus:border-amber-300/40"
                                                            /></LocalizedLabel>
                                                        ) : null}

                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                void joinRoom(
                                                                    room,
                                                                )
                                                            }
                                                            disabled={
                                                                actionRoomId ===
                                                                room.id
                                                            }
                                                            className="rounded-2xl bg-cyan-300 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-70"
                                                        >
                                                            <LocalizedText source={actionRoomId ===
                                                            room.id
                                                                ? "Entrando..."
                                                                : "Unirse"} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="rounded-[24px] border border-dashed border-white/10 bg-white/4 p-6 text-sm text-stone-400"><LocalizedText source={"No hay salas publicas activas. Crea la primera. "} /></div>
                                    )}
                                </div>
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </main>
    );
}

export default function ArenasPage() {
    return (
        <Suspense fallback={<main className="min-h-screen bg-black" />}>
            <ArenasPageContent />
        </Suspense>
    );
}
