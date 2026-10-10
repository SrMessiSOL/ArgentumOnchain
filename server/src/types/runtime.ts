import type { CharacterFaction } from "../factions";

export type Position = {
    x: number;
    y: number;
};

export type FishingState = {
    active?: boolean;
    pendingTarget?: boolean;
    slot?: number;
    itemId?: number;
    power?: number;
    target?: Position;
    origin?: Position;
    startedAt?: number;
    nextTickAt?: number;
};

export type HarvestingSkill = "woodcutting" | "mining";

export type HarvestingState = {
    active?: boolean;
    pendingTarget?: boolean;
    skill?: HarvestingSkill;
    slot?: number;
    itemId?: number;
    target?: Position;
    origin?: Position;
    nextTickAt?: number;
};

export type SmeltingState = {
    active?: boolean;
    pendingTarget?: boolean;
    slot?: number;
    itemId?: number;
    target?: Position;
    origin?: Position;
    nextTickAt?: number;
};

export type CraftingTargetState = {
    pendingTarget?: boolean;
    profession?: "blacksmith";
    slot?: number;
    itemId?: number;
};

export type TimedTracker = {
    tiempoTotal: number;
    startTimer: number;
};

export type SpellTracker = TimedTracker & {
    lanzados: number;
};

export type HitTracker = TimedTracker & {
    hits: number;
};

export type WalkTracker = TimedTracker & {
    pasos: number;
};

export type PendingMoveCommand = {
    heading: number;
    moveId: number;
};

export type UseItemTracker = TimedTracker & {
    usos: number;
    adv: number;
};

export type EntityId = string | number;

export type NumericFlag = number | boolean;

export type RuntimeCallback<T = void> = (value: T) => void;

export type PendingReviveCast = {
    targetId: EntityId;
    spellId: number;
    startedAt: number;
    endsAt: number;
    timeoutId?: ReturnType<typeof setTimeout>;
};

export type WorldSaveResult = {
    ok: boolean;
    durationMs: number;
    savedCharacters: number;
};

export type InventoryRecord = Record<string, InventoryItem>;

export type SpellRecord = Record<string, SpellSlot>;

export type SpellEffect = "Paraliza" | "Inmoviliza";

export type UserSpellEffect =
    | SpellEffect
    | "Remueve"
    | "Agilidad"
    | "Fuerza"
    | "Invisibilidad"
    | "RemueveInvisibilidad";

export type CombatResult = number | string;

export type InventoryItem = {
    idItem: number;
    cant: number;
    equipped?: number | boolean;
};

export type SerializedInventoryItem = {
    idPos: string;
    idItem: number;
    cant: number;
    equipped: number;
};

export type SerializedBankItem = {
    idPos: string;
    idItem: number;
    cant: number;
};

export type SpellSlot = {
    idSpell: number;
};

export type SerializedSpellSlot = {
    idPos: string;
    idSpell: number;
};

export type MapTile = {
    id: number;
    objIndex?: number;
    amount?: number;
    trigger?: number;
    exit?: {
        map: number;
        x: number;
        y: number;
    };
};

export type MapObjectInfo = {
    dropId?: string;
    objIndex: number;
    amount: number;
    cleanupSource?: "drop";
    cleanupRegisteredAt?: number;
};

export type TradeItem = {
    item: number;
    cant: number;
};

export type BankTab = "character" | "account" | "clan";

export type RouteCoord = [number, number];

export type RespawnPosition = {
    posNewX: number;
    posNewY: number;
};

export type DataObject = {
    name: string;
    objType: number;
    newbie?: number;
    valor: number;
    grhIndex?: number;
    minDef?: number;
    maxDef?: number;
    minDefMag?: number;
    maxDefMag?: number;
    resistenciaMagica?: number;
    porcentaje?: number;
    minModificador?: number;
    maxModificador?: number;
    tipoPocion?: number;
    magicDamageBonus?: number;
    magicPenetration?: number;
    spellIndex?: number;
    item?: number;
    amount?: number;
    minHit?: number;
    maxHit?: number;
    apu?: boolean;
    proyectil?: boolean;
    agarrable?: boolean;
    clasesNoPermitidas?: number[];
    razaEnana?: boolean;
    abriga?: boolean;
    manaRequired?: number;
    [key: string]: unknown;
};

export type DataSpell = {
    name: string;
    manaRequired: number;
    type?: number;
    target?: number;
    minSkill?: number;
    subeHp?: number;
    minHp?: number;
    maxHp?: number;
    paraliza?: boolean;
    inmoviliza?: boolean;
    invisibilidad?: boolean;
    staffAffected?: boolean;
    fxGrh?: number;
    wav?: number;
    palabrasMagicas?: string;
    numNpc?: number;
    [key: string]: unknown;
};

export type NpcSpellSlot = {
    idSpell: number;
    cooldownSeconds?: number;
    lastUsedAt?: number;
};

export type RuntimeCharacter = {
    id: EntityId;
    _id?: string;
    idAccount?: string;
    arenaRoomId?: string | null;
    spawnMap?: number;
    spawnPos?: Position;
    homeMap?: number;
    homeX?: number;
    homeY?: number;
    nameCharacter: string;
    map: number;
    pos: Position;
    heading: number;
    pendingMoveQueue?: PendingMoveCommand[];
    pendingMoveTimerId?: ReturnType<typeof setTimeout> | null;
    lastProcessedMoveId?: number;
    stateVersion?: number;
    ignoreMovementUntil?: number;
    nextWalkAt?: number;
    dead?: NumericFlag;
    deadWorldActive?: boolean;
    deadWorldTransitionEndsAt?: number;
    deadWorldTimeoutId?: ReturnType<typeof setTimeout> | null;
    meditar?: boolean;
    mana?: number;
    maxMana?: number;
    hp?: number;
    maxHp?: number;
    gold?: number;
    privileges?: number;
    invisibleAdmin?: boolean;
    invisibleSpell?: boolean;
    hiddenSkill?: boolean;
    hiddenSkillStartedAt?: number;
    hiddenSkillExpiresAt?: number;
    hiddenSkillCooldownUntil?: number;
    cooldownInvisibleSpell?: number;
    criminal?: NumericFlag;
    faction?: CharacterFaction;
    factionScoreArmada?: number;
    factionScoreCaos?: number;
    factionRankArmada?: number;
    factionRankCaos?: number;
    factionRewardsArmada?: number;
    factionRewardsCaos?: number;
    jailMinutes?: number;
    jailReason?: string | null;
    color?: string;
    clan?: string;
    clanId?: string | null;
    clanAlignment?: "citizen" | "criminal" | null;
    clanMinJoinLevel?: number | null;
    clanRole?: "leader" | "co_leader" | "member" | null;
    pvpChar?: boolean;
    connected?: boolean;
    cerrado?: boolean;
    level?: number;
    skillState?: unknown;
    exp?: number;
    expNextLevel?: number;
    idClase?: number;
    idRaza?: number;
    idGenero?: number;
    idHead?: number;
    idHelmet?: number;
    idWeapon?: number;
    idShield?: number;
    idBody?: number;
    idLastHead?: number;
    idLastHelmet?: number;
    idLastWeapon?: number;
    idLastShield?: number;
    idLastBody?: number;
    idItemWeapon?: number | string;
    idItemBody?: number | string;
    idItemShield?: number | string;
    idItemHelmet?: number | string;
    idItemArrow?: number | string;
    idItemRing?: number | string;
    attrFuerza?: number;
    attrAgilidad?: number;
    attrInteligencia?: number;
    attrConstitucion?: number;
    bkAttrFuerza?: number;
    bkAttrAgilidad?: number;
    cooldownFuerza?: number;
    cooldownAgilidad?: number;
    inmovilizado?: NumericFlag;
    zonaSegura?: NumericFlag;
    navegando?: NumericFlag;
    seguroActivado?: boolean;
    seguroClanActivado?: boolean;
    logoutRequestedAt?: number;
    logoutExpiresAt?: number;
    pvpMapChangeBlockedUntil?: number;
    disconnectOnDeath?: boolean;
    nextDialogAt?: number;
    nextMeleeAt?: number;
    nextSpellAt?: number;
    nextSpellAfterMeleeAt?: number;
    nextMeleeAfterSpellAt?: number;
    nextUseItemAt?: number;
    nextUseItemAfterMeleeAt?: number;
    nextResyncPositionAt?: number;
    fishing?: FishingState;
    harvesting?: HarvestingState;
    smelting?: SmeltingState;
    craftingTarget?: CraftingTargetState;
    useObj?: UseItemTracker;
    spell?: SpellTracker;
    hit?: HitTracker;
    walk?: WalkTracker;
    inv?: InventoryRecord | Array<SerializedInventoryItem>;
    bank?: InventoryRecord | Array<SerializedBankItem>;
    spells?: SpellRecord | Array<SerializedSpellSlot>;
    items?: Array<SerializedInventoryItem>;
    bankItems?: Array<SerializedBankItem>;
    tradeMode?: "merchant" | "bank" | "market";
    tradeBankTab?: BankTab;
    tradeBankGold?: number;
    tradeHasClanVault?: boolean;
    tradeClanName?: string | null;
    summons?: EntityId[];
    summonTargetNpcId?: EntityId;
    partyId?: string | null;
    partyLeaderId?: EntityId | null;
    partyInvitationFrom?: EntityId | null;
    partyInvitationExpiresAt?: number;
    pendingReviveCast?: PendingReviveCast | null;
    lastMovementActivityAt?: number;
    lastCombatActivityAt?: number;
    challengeMatchId?: string | null;
    challengeTeam?: 1 | 2 | null;
    challengeLockedUntil?: number;
    adminSummonedBot?: boolean;
    adminSummonedBotOwnerId?: EntityId;
    [key: string]: unknown;
};

export type PartyRuntimeMember = {
    id: EntityId;
    nameCharacter: string;
    map: number;
    pos: Position;
    online: boolean;
    isLeader: boolean;
};

export type ClanRuntimeMember = {
    id: EntityId;
    nameCharacter: string;
    map: number;
    pos: Position;
    online: boolean;
};

export type PartyRuntimeStateDelta = {
    upsert: PartyRuntimeMember[];
    remove: EntityId[];
};

export type ClanRuntimeStateDelta = {
    upsert: ClanRuntimeMember[];
    remove: EntityId[];
};

export type PartyRuntimeState = {
    id: string;
    leaderId: EntityId;
    memberIds: EntityId[];
};

export type RuntimeNpc = {
    id: EntityId;
    templateNpcIndex?: number;
    spawnMapNum?: number;
    spawnOrigin?: Position;
    nameCharacter?: string;
    map: number;
    pos: Position;
    heading?: number;
    movement?: number;
    rute?: Array<RouteCoord>;
    pathTargetId?: EntityId;
    pathTargetPos?: Position;
    nextPathfindAt?: number;
    lastChasePos?: Position;
    currentTargetId?: EntityId;
    currentTargetLockedUntil?: number;
    lastAggressorId?: EntityId;
    lastAggressedAt?: number;
    reservedAttackTargetId?: EntityId;
    reservedAttackPos?: Position;
    attackReservationExpiresAt?: number;
    isNpc?: boolean;
    hp?: number;
    maxHp?: number;
    minHit?: number;
    maxHit?: number;
    def?: number;
    defM?: number;
    magicResistance?: number;
    magicDef?: number;
    poderAtaque?: number;
    poderEvasion?: number;
    inmovilizado?: NumericFlag;
    paralizado?: NumericFlag;
    cooldownAtaque?: number;
    cooldownParalizado?: number;
    nextThinkAt?: number;
    aguaValida?: NumericFlag;
    tierraInvalida?: NumericFlag;
    npcType?: number;
    snd1?: number;
    snd2?: number;
    soundClose?: number;
    spellCastIntervalMs?: number;
    lastSpellCastAt?: number;
    spellRange?: number;
    spells?: NpcSpellSlot[];
    summonedByUserId?: EntityId;
    summonExpiresAt?: number;
    summonCreatedAt?: number;
    color?: string;
    clan?: string;
    objs?: Record<string, TradeItem>;
    drop?: DropItem[];
    [key: string]: unknown;
};

export type DropItem = {
    item: number;
    cant: number;
};

export type RuntimeClient = {
    bufferedAmount?: number;
    sessionCredentialHash?: string;
    ping?: () => void;
    terminate?: () => void;
    id?: EntityId;
    clientIp?: string;
    connectedAt?: number;
    outboundQueue?: Array<{
        frame: Buffer;
        bytes: number;
    }>;
    outboundQueueBytes?: number;
    outboundFlushTimerId?: ReturnType<typeof setTimeout> | null;
    outboundFlushGroupDepth?: number;
    outboundPendingImmediateAfterGroup?: boolean;
    packetCount?: number;
    packetCountNonPing?: number;
    recentPacketIntervalsMs?: number[];
    recentPacketTimestamps?: number[];
    recentPacketTimestamps60s?: number[];
    lastPacketAt?: number;
    lastPacketIntervalMs?: number;
    minPacketIntervalMs?: number;
    lastActivityAt?: number;
    packetTypeCounts?: Record<string, number>;
    nextMapClickAt?: number;
    nextDoorToggleAt?: number;
    nextDropItemAt?: number;
    nextBuyItemAt?: number;
    nextSellItemAt?: number;
    nextEquipToggleAt?: number;
    nextReorderBankAt?: number;
    nextMarketBrowseAt?: number;
    nextMarketWriteAt?: number;
    nextMarketNoticeAt?: number;
    marketActionInFlight?: boolean;
    OPEN: number;
    readyState: number;
    on: (event: string, listener: (...args: unknown[]) => void) => void;
    send: (data: unknown) => void;
    close: (code?: number, reason?: string) => void;
    _socket?: {
        remoteAddress?: string;
    };
    [key: string]: unknown;
};

export type RuntimeConnectionRequest = {
    headers?: Record<string, string | string[] | undefined>;
    socket?: {
        remoteAddress?: string;
    };
};

export type RuntimeCharacters = Record<string, RuntimeCharacter | undefined>;
export type RuntimeNpcs = Record<string, RuntimeNpc | undefined>;
export type RuntimeClients = Record<string, RuntimeClient | undefined>;
export type AreaNpcMap = Record<string, EntityId[] | undefined>;
