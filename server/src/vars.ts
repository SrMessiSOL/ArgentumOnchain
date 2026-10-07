export {};
const config = require("./config");
const { applyBalanceDataToVars, createDefaultBalanceData } = require("./balanceData");
const vars = new (Vars as any)();

function Vars(this: any) {
    this.tokenAuth = config.tokenAuth;

    this.serverReady = false;
    this.debugNpcPathfinding = false;

    this.mapData = {};
    this.mapa = {};
    this.infoMapData = {};
    this.personajes = {};
    this.npcs = {};
    this.datNpc = {};
    this.datObj = {};
    this.datSpell = {};
    this.craftingRecipes = [];
    this.smeltingRecipes = [];
    this.gameDataVersions = {
        objs: 0,
        npcs: 0,
        balance: 0,
        craftingRecipes: 0,
        smeltingRecipes: 0,
    };
    this.clients = {};
    this.parties = {};
    this.floorItems = {};
    this.textMaxLength = 140;
    this.maxUsersOnline = Math.max(0, Number(config.initialOnlineRecord) || 0);
    this.usuariosOnline = 0;
    this.usuariosOnlinePvP = 0;

    this.dobleExp = false;
    this.dobleGold = false;
    this.subastasHabilitadas = true;

    this.timing = {
        gameplayTickMs: 50,
        walkStepMs: 200,
        playerStatusTickMs: 500,
        fishingTickMs: 4000,
        npcThinkMs: 650,
        idleCharacterTimeoutMs: 900000,
        idleCharacterSweepMs: 10000,
        cleanupClosedCharactersMs: 60000,
        onlineStatsSnapshotMs: 60000,
        worldSaveMs: Math.max(10000, Number(process.env.AOWEB_AUTOSAVE_MS) || 60000),
        statusDurations: {
            crowdControlUserMs: 8000,
            crowdControlNpcMs: 50000,
            fuerzaAgilidadBuffMs: 90000,
            invisibilitySpellMs: 20000,
            hiddenSkillMs: 15000,
            npcAttackMs: 2000,
        },
        actionCooldowns: {
            dialogMs: 500,
            clickMs: 150,
            doorToggleMs: 250,
            meleeMs: 950,
            rangeMs: 950,
            spellMs: 850,
            meleeToSpellMs: 800,
            spellToMeleeMs: 800,
            useItemMs: 250,
            meleeToUseItemMs: 550,
            dropItemMs: 150,
            equipToggleMs: 125,
            hiddenSkillMs: 150,
            hiddenSkillAfterHitMs: 2500,
        },
        rateLimitWindows: {
            positionWindowMs: 6000,
            attackWindowMs: 9000,
            rangeAttackWindowMs: 7000,
            attackSpellWindowMs: 7000,
            useItemWindowMs: 3800,
        },
        visualEffects: {
            invisibilityFadeOutMs: 350,
            invisibilityFadeInMs: 1800,
            invisibilityMinAlpha: 0,
            invisibilityMaxAlpha: 0.8,
        },
    };

    this.npcAi = {
        flowFieldTtlMs: 400,
        attackTileReservationMs: 1200,
        crowdDetourMaxDepth: 6,
        targetLockMs: 3000,
        lastAggressorMemoryMs: 15000,
        targetSwitchMargin: 10,
        targetScoreWeights: {
            distance: 3,
            pressure: 8,
            escapeTiles: 2,
            attackTiles: 4,
            adjacentBonus: 6,
            currentTargetBonus: 8,
            recentAggressorBonus: 14,
            aggressorRetargetBonus: 18,
        },
    };

    this.direcciones = {
        up: 1,
        down: 2,
        right: 3,
        left: 4,
    };

    this.meditacion = {
        chica: 4,
        mediana: 5,
        grande: 6,
        xgrande: 16,
        xxgrande: 34,
    };

    this.multiplicadorExp = 5;
    this.multiplicadorGold = 3;
    this.partyExpBonusPct = 15;

    this.clases = {
        mago: 1,
        clerigo: 2,
        guerrero: 3,
        asesino: 4,
        bardo: 6,
        druida: 7,
        paladin: 8,
        cazador: 9,
    };

    this.nameClases = [];
    this.nameClases[this.clases.mago] = "Mago";
    this.nameClases[this.clases.clerigo] = "Clérigo";
    this.nameClases[this.clases.guerrero] = "Guerrero";
    this.nameClases[this.clases.asesino] = "Asesino";
    this.nameClases[this.clases.bardo] = "Bardo";
    this.nameClases[this.clases.druida] = "Druida";
    this.nameClases[this.clases.paladin] = "Paladín";
    this.nameClases[this.clases.cazador] = "Cazador";

    this.genero = {
        hombre: 1,
        mujer: 2,
    };

    this.razas = {
        humano: 1,
        elfo: 2,
        elfoDrow: 3,
        enano: 4,
        gnomo: 5,
    };

    this.nameRazas = [];
    this.nameRazas[this.razas.humano] = "Humano";
    this.nameRazas[this.razas.elfo] = "Elfo";
    this.nameRazas[this.razas.elfoDrow] = "Elfo Drow";
    this.nameRazas[this.razas.enano] = "Enano";
    this.nameRazas[this.razas.gnomo] = "Gnomo";

    applyBalanceDataToVars(this, createDefaultBalanceData());

    this.npcType = {
        comun: 0,
        sacerdote: 1,
        guardia: 2,
        entrenador: 3,
        banquero: 4,
        noble: 5,
        dragon: 6,
        timbero: 7,
        guardiaCaos: 8,
        sacerdoteNewbie: 9,
        comerciante: 10,
        subastador: 12,
    };

    this.typePociones = {
        agilidad: 1,
        fuerza: 2,
        vida: 3,
        mana: 4,
        curaVeneno: 5,
    };

    this.objType = {
        comida: 1,
        armas: 2,
        armaduras: 3,
        arboles: 4,
        dinero: 5,
        puerta: 6,
        objetoContenedor: 7,
        carteles: 8,
        llaves: 9,
        foros: 10,
        pociones: 11,
        libros: 12,
        bebidas: 13,
        lenia: 14,
        fogata: 15,
        escudos: 16,
        cascos: 17,
        anillos: 18,
        teleport: 19,
        muebles: 20,
        joyas: 21,
        yacimientos: 22,
        metales: 23,
        pergaminos: 24,
        aura: 25,
        instrumentosMusicales: 26,
        yunque: 27,
        fraguas: 28,
        gemas: 29,
        flores: 30,
        barcos: 31,
        flechas: 32,
        botellasVacias: 33,
        botellasLlenas: 34,
        manchas: 35,
        lingotes: 36,
    };

    this.partesCuerpo = {
        cabeza: 1,
        piernaIzquierda: 2,
        piernaDerecha: 3,
        brazoDerecho: 4,
        brazoIzquierdo: 5,
        torso: 6,
    };

    this.clanNpc = [];
    this.clanNpc[this.npcType.sacerdote] = "<Sacerdote>";
    this.clanNpc[this.npcType.guardia] = "<Guardia>";
    this.clanNpc[this.npcType.entrenador] = "<Entrenador>";
    this.clanNpc[this.npcType.banquero] = "<Banquero>";
    this.clanNpc[this.npcType.guardiaCaos] = "<Guardia Del Caos>";
    this.clanNpc[this.npcType.comerciante] = "<Comerciante>";
    this.clanNpc[this.npcType.subastador] = "<Subastador>";

    this.areaPjs = {};

    this.areaNpc = {};

    this.areaVisionWidth = 31;
    this.areaVisionHeight = 31;
    this.areaVisionRangeX = Math.floor(this.areaVisionWidth / 2);
    this.areaVisionRangeY = Math.floor(this.areaVisionHeight / 2);
    this.areaVisionDiameterX = this.areaVisionRangeX * 2 + 1;
    this.areaVisionDiameterY = this.areaVisionRangeY * 2 + 1;
    this.areaVisionOutsideOffsetX = this.areaVisionRangeX + 1;
    this.areaVisionOutsideOffsetY = this.areaVisionRangeY + 1;

    this.exp = 50;
    this.gold = 10;

    this.toSave = [
        "idHead",
        "minHit",
        "maxHit",
        "idLastHead",
        "idLastBody",
        "idLastWeapon",
        "idLastShield",
        "idLastHelmet",
        "navegando",
        "idHelmet",
        "idWeapon",
        "idBody",
        "idShield",
        "spellsAcertados",
        "spellsErrados",
        "countDie",
        "exp",
        "expNextLevel",
        "level",
        "hp",
        "mana",
        "maxHp",
        "maxMana",
        "posX",
        "posY",
        "map",
        "dead",
        "gold",
        "criminal",
        "faction",
        "npcMatados",
        "ciudadanosMatados",
        "criminalesMatados",
        "fianza",
        "factionScoreArmada",
        "factionScoreCaos",
        "factionRankArmada",
        "factionRankCaos",
        "factionRewardsArmada",
        "factionRewardsCaos",
        "homeMap",
        "homeX",
        "homeY",
    ];

    this.charactersPvP = [
        {
            name: "Mago",
            idHead: 1,
            idBody: 56,
            idShield: 0,
            idWeapon: 10,
            idHelmet: 4,
            idClase: 1,
            idRaza: 1,
            hp: 342,
            hit: 48,
            mana: 2344,
            idItemWeapon: 10,
            idItemBody: 8,
            idItemShield: 0,
            idItemHelmet: 9,
            inv: {
                1: { idItem: 38, cant: 1000, equipped: 0 },
                2: { idItem: 37, cant: 1000, equipped: 0 },
                3: { idItem: 36, cant: 1000, equipped: 0 },
                4: { idItem: 39, cant: 1000, equipped: 0 },
                8: { idItem: 986, cant: 1, equipped: 1 }, //Tunica de Druida
                9: { idItem: 662, cant: 1, equipped: 1 }, //Sombrero de Mago
                10: { idItem: 660, cant: 1, equipped: 1 }, //Baculo Engarzado
            },
            spells: {
                1: { idSpell: 25 },
                2: { idSpell: 23 },
                3: { idSpell: 15 },
                5: { idSpell: 24 },
                6: { idSpell: 10 },
                9: { idSpell: 20 },
                10: { idSpell: 18 },
            },
        },
        {
            name: "Clerigo",
            idHead: 1,
            idBody: 56,
            idShield: 6,
            idWeapon: 24,
            idHelmet: 6,
            idClase: 2,
            idRaza: 1,
            hp: 388,
            hit: 94,
            mana: 1701,
            idItemWeapon: 10,
            idItemBody: 8,
            idItemShield: 11,
            idItemHelmet: 9,
            inv: {
                1: { idItem: 38, cant: 1000, equipped: 0 },
                2: { idItem: 37, cant: 1000, equipped: 0 },
                3: { idItem: 36, cant: 1000, equipped: 0 },
                4: { idItem: 39, cant: 1000, equipped: 0 },
                8: { idItem: 986, cant: 1, equipped: 1 }, //Tunica de Druida
                9: { idItem: 131, cant: 1, equipped: 1 }, //Casco de Hierro completo
                10: { idItem: 129, cant: 1, equipped: 1 }, //Hacha de Guerra Dos Filos
                11: { idItem: 130, cant: 1, equipped: 1 }, //Escudo de Plata
            },
            spells: {
                1: { idSpell: 25 },
                2: { idSpell: 23 },
                3: { idSpell: 15 },
                5: { idSpell: 24 },
                6: { idSpell: 10 },
                9: { idSpell: 20 },
                10: { idSpell: 18 },
            },
        },
        {
            name: "Guerrero",
            idHead: 1,
            idBody: 107,
            idShield: 6,
            idWeapon: 13,
            idHelmet: 6,
            idClase: 3,
            idRaza: 1,
            hp: 480,
            hit: 129,
            mana: 0,
            idItemWeapon: 10,
            idItemBody: 8,
            idItemShield: 11,
            idItemHelmet: 9,
            inv: {
                1: { idItem: 38, cant: 1000, equipped: 0 },
                2: { idItem: 37, cant: 1000, equipped: 0 },
                3: { idItem: 36, cant: 1000, equipped: 0 },
                4: { idItem: 39, cant: 1000, equipped: 0 },
                8: { idItem: 497, cant: 1, equipped: 1 }, //Armadura de Placas de Gala
                9: { idItem: 131, cant: 1, equipped: 1 }, //Casco de Hierro completo
                10: { idItem: 403, cant: 1, equipped: 1 }, //Espada de Plata
                11: { idItem: 130, cant: 1, equipped: 1 }, //Escudo de Plata
            },
            spells: {},
        },
        {
            name: "Asesino",
            idHead: 1,
            idBody: 48,
            idShield: 3,
            idWeapon: 52,
            idHelmet: 6,
            idClase: 4,
            idRaza: 1,
            hp: 411,
            hit: 129,
            mana: 873,
            idItemWeapon: 10,
            idItemBody: 8,
            idItemShield: 11,
            idItemHelmet: 9,
            inv: {
                1: { idItem: 38, cant: 1000, equipped: 0 },
                2: { idItem: 37, cant: 1000, equipped: 0 },
                3: { idItem: 36, cant: 1000, equipped: 0 },
                4: { idItem: 39, cant: 1000, equipped: 0 },
                8: { idItem: 356, cant: 1, equipped: 1 }, //Armadura de las Sombras
                9: { idItem: 131, cant: 1, equipped: 1 }, //Casco de Hierro completo
                10: { idItem: 367, cant: 1, equipped: 1 }, //Daga +4
                11: { idItem: 404, cant: 1, equipped: 1 }, //Escudo de Tortuga
            },
            spells: {
                1: { idSpell: 23 },
                2: { idSpell: 15 },
                5: { idSpell: 24 },
                6: { idSpell: 10 },
                9: { idSpell: 20 },
                10: { idSpell: 18 },
            },
        },
        {
            name: "Bardo",
            idHead: 1,
            idBody: 56,
            idShield: 3,
            idWeapon: 5,
            idHelmet: 1,
            idClase: 6,
            idRaza: 1,
            hp: 388,
            hit: 94,
            mana: 1701,
            idItemWeapon: 10,
            idItemBody: 8,
            idItemShield: 11,
            idItemHelmet: 9,
            inv: {
                1: { idItem: 38, cant: 1000, equipped: 0 },
                2: { idItem: 37, cant: 1000, equipped: 0 },
                3: { idItem: 36, cant: 1000, equipped: 0 },
                4: { idItem: 39, cant: 1000, equipped: 0 },
                8: { idItem: 986, cant: 1, equipped: 1 }, //Túnica de Druida
                9: { idItem: 132, cant: 1, equipped: 1 }, //Casco de Hierro
                10: { idItem: 399, cant: 1, equipped: 1 }, //Cimitarra
                11: { idItem: 404, cant: 1, equipped: 1 }, //Escudo de Tortuga
            },
            spells: {
                1: { idSpell: 25 },
                2: { idSpell: 23 },
                3: { idSpell: 15 },
                5: { idSpell: 24 },
                6: { idSpell: 10 },
                9: { idSpell: 20 },
                10: { idSpell: 18 },
            },
        },
        {
            name: "Druida",
            idHead: 1,
            idBody: 56,
            idShield: 3,
            idWeapon: 10,
            idHelmet: 1,
            idClase: 7,
            idRaza: 1,
            hp: 365,
            hit: 94,
            mana: 1701,
            idItemWeapon: 10,
            idItemBody: 8,
            idItemShield: 0,
            idItemHelmet: 9,
            inv: {
                1: { idItem: 38, cant: 1000, equipped: 0 },
                2: { idItem: 37, cant: 1000, equipped: 0 },
                3: { idItem: 36, cant: 1000, equipped: 0 },
                4: { idItem: 39, cant: 1000, equipped: 0 },
                8: { idItem: 986, cant: 1, equipped: 1 }, //Túnica de Druida
                9: { idItem: 132, cant: 1, equipped: 1 }, //Casco de Hierro
                10: { idItem: 399, cant: 1, equipped: 1 }, //Cimitarra
            },
            spells: {
                1: { idSpell: 25 },
                2: { idSpell: 23 },
                3: { idSpell: 15 },
                5: { idSpell: 24 },
                6: { idSpell: 10 },
                9: { idSpell: 20 },
                10: { idSpell: 18 },
            },
        },
        {
            name: "Paladín",
            idHead: 1,
            idBody: 107,
            idShield: 6,
            idWeapon: 13,
            idHelmet: 6,
            idClase: 8,
            idRaza: 1,
            hp: 457,
            hit: 129,
            mana: 873,
            idItemWeapon: 10,
            idItemBody: 8,
            idItemShield: 11,
            idItemHelmet: 9,
            inv: {
                1: { idItem: 38, cant: 1000, equipped: 0 },
                2: { idItem: 37, cant: 1000, equipped: 0 },
                3: { idItem: 36, cant: 1000, equipped: 0 },
                4: { idItem: 39, cant: 1000, equipped: 0 },
                8: { idItem: 497, cant: 1, equipped: 1 }, //Armadura de Placas de Gala
                9: { idItem: 131, cant: 1, equipped: 1 }, //Casco de Hierro completo
                10: { idItem: 403, cant: 1, equipped: 1 }, //Espada de Plata
                11: { idItem: 130, cant: 1, equipped: 1 }, //Escudo de Plata
            },
            spells: {
                1: { idSpell: 23 },
                2: { idSpell: 15 },
                5: { idSpell: 24 },
                6: { idSpell: 10 },
                9: { idSpell: 20 },
                10: { idSpell: 18 },
            },
        },
        {
            name: "Cazador",
            idHead: 1,
            idBody: 58,
            idShield: 3,
            idWeapon: 47,
            idHelmet: 6,
            idClase: 9,
            idRaza: 1,
            hp: 457,
            hit: 129,
            mana: 0,
            idItemWeapon: 10,
            idItemBody: 8,
            idItemShield: 12,
            idItemHelmet: 9,
            idItemArrow: 11,
            inv: {
                1: { idItem: 38, cant: 1000, equipped: 0 },
                2: { idItem: 37, cant: 1000, equipped: 0 },
                3: { idItem: 36, cant: 1000, equipped: 0 },
                4: { idItem: 39, cant: 1000, equipped: 0 },
                8: { idItem: 360, cant: 1, equipped: 1 }, //Armadura de Cazador
                9: { idItem: 131, cant: 1, equipped: 1 }, //Casco de Hierro completo
                10: { idItem: 665, cant: 1, equipped: 1 }, //Arco de Cazador
                11: { idItem: 553, cant: 1000, equipped: 1 }, //Flecha +3
                12: { idItem: 404, cant: 1, equipped: 1 }, //Escudo de Tortuga,
            },
            spells: {},
        },
    ];

    this.arSounds = {
        SND_SWING: 2,
        SND_TALAR: 13,
        SND_PESCAR: 14,
        SND_MINERO: 15,
        SND_WARP: 3,
        SND_PUERTA: 5,
        SND_NIVEL: 6,
        SND_USERMUERTE: 11,
        SND_IMPACTO: 10,
        SND_IMPACTO2: 12,
        SND_LENADOR: 13,
        SND_FOGATA: 14,
        SND_AVE: 21,
        SND_AVE2: 22,
        SND_AVE3: 34,
        SND_GRILLO: 28,
        SND_GRILLO2: 29,
        SND_SACARARMA: 25,
        SND_ESCUDO: 37,
        SND_BEBER: 46,
    };

    this.fishing = {
        successChance: 80,
        invalidTrigger: 11,
        rods: {
            138: { power: 1 },
            563: { power: 1 },
        },
        fishByPower: {
            1: [
                { itemId: 139, weight: 24326 },
                { itemId: 544, weight: 256 },
                { itemId: 545, weight: 6 },
            ],
        },
    };
}

module.exports = vars;
