import { execSync } from "node:child_process";
import type { NextConfig } from "next";

function resolveBuildId(): string {
    if (process.env.NEXT_BUILD_ID?.trim()) {
        return process.env.NEXT_BUILD_ID.trim();
    }

    try {
        return execSync("git rev-parse --short=12 HEAD", {
            encoding: "utf8",
        }).trim();
    } catch {
        return "development";
    }
}

const buildId = resolveBuildId();

const nextConfig: NextConfig = {
    distDir: process.env.NEXT_DIST_DIR || ".next",
    typescript: {
        tsconfigPath: process.env.NEXT_TSCONFIG_PATH || "tsconfig.json",
    },
    allowedDevOrigins: ["127.0.0.1", "localhost"],
    env: {
        NEXT_PUBLIC_NEXT_BUILD_ID: buildId,
        NEXT_PUBLIC_REALM_ENABLED: process.env.NEXT_PUBLIC_REALM_ENABLED || (process.env.VERCEL ? "0" : "1"),
    },
    generateBuildId: async () => buildId,
    async headers(){return [{source:'/:path*',headers:[
        {key:'X-Content-Type-Options',value:'nosniff'},
        {key:'X-Frame-Options',value:'DENY'},
        {key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},
        {key:'Content-Security-Policy',value:"object-src 'none'; base-uri 'self'; frame-ancestors 'none'"},
        {key:'Strict-Transport-Security',value:'max-age=86400'},
    ]}];},
};

export default nextConfig;
