export type RankingCharacter = {
    id: string;
    name: string;
    level: number;
    exp: number;
    expNextLevel: number;
    kills: number;
    idClase: number;
    idRaza: number;
    criminal: boolean;
    faction: "none" | "armada" | "caos";
    clanName: string | null;
    headId: number;
    bodyId: number;
    updatedAt: string;
};

export type RankingResponse = {
    characters: RankingCharacter[];
};

export type RankingPageData = RankingResponse & {
    unavailable?: boolean;
    headSpritesById: Record<string, RankingHeadSprite | null>;
};

export type RankingHeadSprite = {
    numFile: string;
    width: number;
    height: number;
    sourceX: number;
    sourceY: number;
};
