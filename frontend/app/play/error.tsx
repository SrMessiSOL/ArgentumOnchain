"use client";

import { LocalizedText } from '@/components/LocalizedText';
import { useEffect } from "react";

type PlayRouteErrorProps = {
    error: Error & { digest?: string };
    reset: () => void;
};

export default function PlayRouteError({ error, reset }: PlayRouteErrorProps) {
    useEffect(() => {
        void error;
    }, [error]);

    return (
        <div className="fixed inset-0 flex items-center justify-center bg-black px-6 text-white">
            <div className="max-w-md rounded-2xl border border-white/10 bg-zinc-950/90 p-6 text-center shadow-2xl">
                <h2 className="mb-2 text-xl font-semibold"><LocalizedText source={"Esta pagina no pudo cargarse "} /></h2>
                <p className="mb-6 text-sm text-zinc-300"><LocalizedText source={"Puedes reintentar sin recargar toda la pagina. "} /></p>
                <button
                    className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-zinc-200"
                    onClick={() => reset()}
                    type="button"
                ><LocalizedText source={"Reintentar "} /></button>
            </div>
        </div>
    );
}
