import pool from "../db";

type ClassSummaryRow = {
    id_clase: number;
    chars: string;
    avg_level: string;
    avg_hp: string;
    avg_mana: string;
    avg_min_hit: string;
    avg_max_hit: string;
    avg_spells_hit: string | null;
    avg_spells_miss: string | null;
    avg_spell_accuracy: string | null;
};

type ComboSummaryRow = {
    id_clase: number;
    id_raza: number;
    chars: string;
    avg_level: string;
};

type ChallengeClassRow = {
    class_name: string;
    appearances: string;
    wins: string;
    winrate: string;
    avg_level?: string;
};

type SpellUsageRow = {
    id_clase: number;
    id_spell: number;
    users: string;
};

type NamedClass = 1 | 2 | 3 | 4 | 6 | 7 | 8 | 9;

const CLASS_NAMES: Record<number, string> = {
    1: "Mago",
    2: "Clerigo",
    3: "Guerrero",
    4: "Asesino",
    6: "Bardo",
    7: "Druida",
    8: "Paladin",
    9: "Cazador",
};

const RACE_NAMES: Record<number, string> = {
    1: "Humano",
    2: "Elfo",
    3: "Elfo Drow",
    4: "Enano",
    5: "Gnomo",
};

const SPELLS = require("../jsons/spells.json") as Record<
    string,
    {
        name?: string;
        manaRequired?: number;
        minSkill?: number;
        minHp?: number;
        maxHp?: number;
        subeHp?: number;
        paraliza?: boolean;
        inmoviliza?: boolean;
        subeAg?: number;
        subeFz?: number;
        invisibilidad?: boolean;
    }
>;

const KEY_SPELL_IDS = [2, 8, 15, 23, 25, 9, 24, 18, 20, 14];

function getClassName(classId: number): string {
    return CLASS_NAMES[classId] ?? `Clase ${classId}`;
}

function getRaceName(raceId: number): string {
    return RACE_NAMES[raceId] ?? `Raza ${raceId}`;
}

function getSpellLabel(spellId: number): string {
    return SPELLS[String(spellId)]?.name ?? `Spell ${spellId}`;
}

function printSection(title: string): void {
    console.log(`\n=== ${title} ===`);
}

function formatSpell(spellId: number): string {
    const spell = SPELLS[String(spellId)] ?? {};
    const tags: string[] = [];

    if (Number(spell.subeHp ?? 0) === 2) tags.push("damage");
    if (spell.paraliza) tags.push("paralyze");
    if (spell.inmoviliza) tags.push("root");
    if (spell.subeAg) tags.push("agi");
    if (spell.subeFz) tags.push("str");
    if (spell.invisibilidad) tags.push("invis");

    return `${getSpellLabel(spellId)} [mana=${Number(spell.manaRequired ?? 0)}, skill=${Number(
        spell.minSkill ?? 0,
    )}${tags.length ? `, ${tags.join("/")}` : ""}]`;
}

async function loadEndgameClassSummary(
    minLevel: number,
    maxLevel: number,
): Promise<ClassSummaryRow[]> {
    const result = await pool.query<ClassSummaryRow>(
        `
      SELECT
        id_clase,
        COUNT(*) AS chars,
        ROUND(AVG(level)::numeric, 2) AS avg_level,
        ROUND(AVG(max_hp)::numeric, 1) AS avg_hp,
        ROUND(AVG(max_mana)::numeric, 1) AS avg_mana,
        ROUND(AVG(min_hit)::numeric, 1) AS avg_min_hit,
        ROUND(AVG(max_hit)::numeric, 1) AS avg_max_hit,
        ROUND(AVG(spells_acertados)::numeric, 1) AS avg_spells_hit,
        ROUND(AVG(spells_errados)::numeric, 1) AS avg_spells_miss,
        ROUND(
          AVG(
            CASE
              WHEN (spells_acertados + spells_errados) > 0
                THEN spells_acertados::numeric / (spells_acertados + spells_errados)
            END
          )::numeric,
          3
        ) AS avg_spell_accuracy
      FROM characters
      WHERE deleted_at IS NULL
        AND level BETWEEN $1 AND $2
      GROUP BY id_clase
      ORDER BY COUNT(*) DESC, id_clase ASC
    `,
        [minLevel, maxLevel],
    );

    return result.rows;
}

async function loadTopClassRaceCombos(
    minLevel: number,
    maxLevel: number,
): Promise<ComboSummaryRow[]> {
    const result = await pool.query<ComboSummaryRow>(
        `
      SELECT
        id_clase,
        id_raza,
        COUNT(*) AS chars,
        ROUND(AVG(level)::numeric, 1) AS avg_level
      FROM characters
      WHERE deleted_at IS NULL
        AND level BETWEEN $1 AND $2
      GROUP BY id_clase, id_raza
      ORDER BY COUNT(*) DESC, id_clase ASC, id_raza ASC
      LIMIT 15
    `,
        [minLevel, maxLevel],
    );

    return result.rows;
}

async function loadChallengeMetaAllTime(): Promise<ChallengeClassRow[]> {
    const result = await pool.query<ChallengeClassRow>(
        `
      WITH participants AS (
        SELECT
          ch.id,
          ch.winner_side,
          (p->>'teamSide')::int AS team_side,
          p->>'className' AS class_name,
          (p->>'level')::int AS level
        FROM challenge_history ch
        CROSS JOIN LATERAL jsonb_array_elements(ch.participants) AS p
      )
      SELECT
        class_name,
        COUNT(*) AS appearances,
        SUM(CASE WHEN team_side = winner_side THEN 1 ELSE 0 END) AS wins,
        ROUND(100.0 * SUM(CASE WHEN team_side = winner_side THEN 1 ELSE 0 END) / COUNT(*), 1) AS winrate,
        ROUND(AVG(level)::numeric, 1) AS avg_level
      FROM participants
      GROUP BY class_name
      ORDER BY COUNT(*) DESC, class_name ASC
    `,
    );

    return result.rows;
}

async function loadChallengeMetaRecent(
    days: number,
): Promise<ChallengeClassRow[]> {
    const result = await pool.query<ChallengeClassRow>(
        `
      WITH participants AS (
        SELECT
          ch.id,
          ch.winner_side,
          (p->>'teamSide')::int AS team_side,
          p->>'className' AS class_name
        FROM challenge_history ch
        CROSS JOIN LATERAL jsonb_array_elements(ch.participants) AS p
        WHERE ch.finished_at >= NOW() - ($1::int * INTERVAL '1 day')
      )
      SELECT
        class_name,
        COUNT(*) AS appearances,
        SUM(CASE WHEN team_side = winner_side THEN 1 ELSE 0 END) AS wins,
        ROUND(100.0 * SUM(CASE WHEN team_side = winner_side THEN 1 ELSE 0 END) / COUNT(*), 1) AS winrate
      FROM participants
      GROUP BY class_name
      ORDER BY COUNT(*) DESC, class_name ASC
    `,
        [days],
    );

    return result.rows;
}

async function loadKeySpellUsage(
    minLevel: number,
    maxLevel: number,
): Promise<Map<number, Map<number, number>>> {
    const result = await pool.query<SpellUsageRow>(
        `
      SELECT
        c.id_clase,
        cs.id_spell,
        COUNT(DISTINCT cs.character_id) AS users
      FROM character_spells cs
      JOIN characters c ON c.id = cs.character_id
      WHERE c.deleted_at IS NULL
        AND c.level BETWEEN $1 AND $2
        AND cs.id_spell = ANY($3::int[])
      GROUP BY c.id_clase, cs.id_spell
      ORDER BY c.id_clase ASC, COUNT(DISTINCT cs.character_id) DESC, cs.id_spell ASC
    `,
        [minLevel, maxLevel, KEY_SPELL_IDS],
    );

    const usage = new Map<number, Map<number, number>>();

    for (const row of result.rows) {
        const byClass = usage.get(row.id_clase) ?? new Map<number, number>();
        byClass.set(row.id_spell, Number(row.users));
        usage.set(row.id_clase, byClass);
    }

    return usage;
}

async function main(): Promise<void> {
    const rawArgs = process.argv.slice(2).filter((value) => value !== "--");
    const minLevel = Number(rawArgs[0] ?? 35);
    const maxLevel = Number(rawArgs[1] ?? 50);

    const [
        classSummary,
        topCombos,
        challengeAllTime,
        challengeRecent,
        keySpellUsage,
    ] = await Promise.all([
        loadEndgameClassSummary(minLevel, maxLevel),
        loadTopClassRaceCombos(minLevel, maxLevel),
        loadChallengeMetaAllTime(),
        loadChallengeMetaRecent(7),
        loadKeySpellUsage(minLevel, maxLevel),
    ]);

    printSection(`Snapshot ${minLevel}-${maxLevel} by class`);
    for (const row of classSummary) {
        console.log(
            [
                `${getClassName(row.id_clase)} (#${row.id_clase})`,
                `chars=${row.chars}`,
                `avgLvl=${row.avg_level}`,
                `hp=${row.avg_hp}`,
                `mana=${row.avg_mana}`,
                `hit=${row.avg_min_hit}-${row.avg_max_hit}`,
                `spellAcc=${row.avg_spell_accuracy ?? "-"}`,
            ].join(" | "),
        );
    }

    printSection(`Top class/race combinations ${minLevel}-${maxLevel}`);
    for (const row of topCombos) {
        console.log(
            `${getClassName(row.id_clase)} / ${getRaceName(row.id_raza)} | chars=${row.chars} | avgLvl=${row.avg_level}`,
        );
    }

    printSection("All-time challenge meta by class");
    for (const row of challengeAllTime) {
        console.log(
            `${row.class_name} | appearances=${row.appearances} | wins=${row.wins} | winrate=${row.winrate}% | avgLvl=${row.avg_level ?? "-"}`,
        );
    }

    printSection("Last 7 days challenge meta by class");
    for (const row of challengeRecent) {
        console.log(
            `${row.class_name} | appearances=${row.appearances} | wins=${row.wins} | winrate=${row.winrate}%`,
        );
    }

    printSection(`Key spell adoption ${minLevel}-${maxLevel}`);
    for (const classId of [1, 2, 4, 6, 7, 8] as NamedClass[]) {
        const byClass = keySpellUsage.get(classId) ?? new Map<number, number>();
        const spellParts = KEY_SPELL_IDS.map((spellId) => {
            const users = byClass.get(spellId) ?? 0;
            return `${formatSpell(spellId)} => ${users}`;
        });

        console.log(`\n${getClassName(classId)} (#${classId})`);
        for (const part of spellParts) {
            console.log(`- ${part}`);
        }
    }
}

main()
    .catch(async (error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await pool.end().catch(() => undefined);
    });
