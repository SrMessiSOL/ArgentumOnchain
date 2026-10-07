import fs from "fs";
import path from "path";

import pool from "../db";
import { exportFrontendNpcs } from "../repositories/gameNpcs";

function getOptionValue(name: string): string | null {
    const index = process.argv.findIndex(
        (argument) => argument === `--${name}`,
    );
    if (index < 0) {
        return null;
    }

    const nextValue = process.argv[index + 1];
    return nextValue?.trim() ? nextValue.trim() : null;
}

function resolveOutputPath(): string {
    const configuredPath = getOptionValue("output");
    if (configuredPath) {
        return path.resolve(process.cwd(), configuredPath);
    }

    return path.resolve(__dirname, "../jsons/npcs.frontend.json");
}

function formatBytes(bytes: number): string {
    return `${(bytes / 1024).toFixed(1)} KB`;
}

async function main(): Promise<void> {
    const outputPath = resolveOutputPath();
    const npcs = await exportFrontendNpcs();
    const json = `${JSON.stringify(npcs)}\n`;

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, json, "utf8");

    console.log(`Frontend NPCs exported to ${outputPath}`);
    console.log(`Total NPCs: ${Object.keys(npcs).length}`);
    console.log(`Size: ${formatBytes(Buffer.byteLength(json, "utf8"))}`);
}

void main()
    .catch((error) => {
        console.error("Could not export frontend npcs.json", error);
        process.exit(1);
    })
    .finally(async () => {
        await pool.end();
    });
