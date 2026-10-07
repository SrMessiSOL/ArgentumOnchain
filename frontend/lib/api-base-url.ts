const DEFAULT_API_BASE_URL = "http://host.docker.internal/api";

export function getApiBaseUrl(): string {
    if (process.env.VERCEL) {
        const backend = new URL(process.env.API_BASE_URL || "");
        if (backend.protocol !== "https:" || backend.username || backend.password || backend.search || backend.hash) {
            throw new Error("Vercel requires a server-side HTTPS backend API_BASE_URL");
        }
        return backend.toString().replace(/\/$/, "");
    }
    return (
        process.env.API_BASE_URL?.trim() ||
        process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
        DEFAULT_API_BASE_URL
    );
}

export function getApiBaseUrlCandidates(): string[] {
    if (process.env.VERCEL) return [getApiBaseUrl()];
    return [
        process.env.API_BASE_URL?.trim(),
        process.env.NEXT_PUBLIC_API_BASE_URL?.trim(),
        DEFAULT_API_BASE_URL,
    ].filter((value, index, values): value is string => {
        if (!value) {
            return false;
        }

        return values.indexOf(value) === index;
    });
}
