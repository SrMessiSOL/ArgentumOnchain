import { readFile } from "node:fs/promises";
import path from "node:path";
import type { RankingHeadSprite } from "@/lib/ranking";

type HeadsWithFileDB = Record<
    string,
    | [
          numFile: string,
          sourceX: number,
          sourceY: number,
          width: number,
          height: number,
      ]
    | null
>;

async function loadHeadsWithFileDB(): Promise<HeadsWithFileDB> {
    const filePath = path.join(
        process.cwd(),
        "public",
        "init",
        "headswithfile.json",
    );
    return JSON.parse(await readFile(filePath, "utf8")) as HeadsWithFileDB;
}

export async function getRankingHeadSprites(
    headIds: number[],
): Promise<Record<string, RankingHeadSprite | null>> {
    if (headIds.length === 0) {
        return {};
    }

    try {
        const headsWithFileDB = await loadHeadsWithFileDB();
        const uniqueHeadIds = [...new Set(headIds)];

        return Object.fromEntries(
            uniqueHeadIds.map((headId) => {
                const graphic = headsWithFileDB[String(headId)] ?? null;

                if (!graphic) {
                    return [String(headId), null];
                }

                return [
                    String(headId),
                    {
                        numFile: graphic[0],
                        sourceX: graphic[1],
                        sourceY: graphic[2],
                        width: graphic[3],
                        height: graphic[4],
                    },
                ];
            }),
        );
    } catch (error) {
        console.error(
            "Could not resolve ranking character heads:",
            error,
        );
        return {};
    }
}
