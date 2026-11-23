import {
  getPositionLine,
  normalizeDetailedPosition,
  type ApiLineupPlayer,
  type DetailedPosition,
  type Match,
  type Player,
  type Position,
  type TeamInfo,
} from "../types/index.ts";
import { getTierConfig } from "../utils/tier.ts";
import {
  applyLineupEntryMeta,
  doesIdentityMatchPlayer,
} from "./lineupStatus.ts";
import {
  canonicalizeTeamKey,
  isApiBackedMatch,
  resolveMatchClock,
} from "./matchSync.ts";
import {
  canonicalizeIncomingPlayerNames,
  formatPlayerDisplayName,
} from "./playerDisplayName.ts";
import { roundToTen } from "./priceEngine.ts";

export type SupportedFormation = "4-3-3" | "4-2-3-1";

export interface FormationSlotSpec {
  slotKey: string;
  slotPosition: DetailedPosition;
  rowIndex: number;
  colIndex: number;
  compatiblePositions: DetailedPosition[];
  defaultBackNumber: number;
  fallbackKoLastNames: string[];
  fallbackEnLastNames: string[];
  basePriceSeed: number;
}

interface RosterSlot {
  role: DetailedPosition;
  defaultBackNumber: number;
  fallbackKoLastNames: string[];
  fallbackEnLastNames: string[];
  basePriceSeed: number;
}

export const FALLBACK_POOL_BY_POSITION: Record<
  DetailedPosition,
  {
    defaultBackNumber: number;
    ko: string[];
    en: string[];
    basePriceSeed: number;
  }
> = {
  LW: {
    defaultBackNumber: 7,
    ko: [
      "손흥민",
      "마르티넬리",
      "비니시우스",
      "래시포드",
      "니코 윌리엄스",
      "하파엘 레앙",
      "고든",
      "바르콜라",
      "도쿠",
      "크바라츠헬리아",
    ],
    en: [
      "Son",
      "Martinelli",
      "Vinicius",
      "Rashford",
      "Nico Williams",
      "Leao",
      "Gordon",
      "Barcola",
      "Doku",
      "Kvaratskhelia",
    ],
    basePriceSeed: 15500,
  },
  ST: {
    defaultBackNumber: 9,
    ko: [
      "홀란드",
      "케인",
      "라우타로",
      "솔란케",
      "하베르츠",
      "음바페",
      "레반도프스키",
      "이삭",
      "모라타",
      "블라호비치",
    ],
    en: [
      "Haaland",
      "Kane",
      "Lautaro",
      "Solanke",
      "Havertz",
      "Mbappe",
      "Lewandowski",
      "Isak",
      "Morata",
      "Vlahovic",
    ],
    basePriceSeed: 18000,
  },
  RW: {
    defaultBackNumber: 11,
    ko: [
      "살라",
      "사카",
      "야말",
      "뎀벨레",
      "쿠두스",
      "풀리식",
      "호드리구",
      "올리세",
      "음뵈모",
      "페드로 네투",
    ],
    en: [
      "Salah",
      "Saka",
      "Yamal",
      "Dembele",
      "Kudus",
      "Pulisic",
      "Rodrygo",
      "Olise",
      "Mbeumo",
      "Pedro Neto",
    ],
    basePriceSeed: 15800,
  },
  LAM: {
    defaultBackNumber: 11,
    ko: [
      "미토마",
      "무시알라",
      "그릴리쉬",
      "배준호",
      "차비 시몬스",
      "산초",
      "펠릭스",
      "일디즈",
      "은쿤쿠",
      "가르나초",
    ],
    en: [
      "Mitoma",
      "Musiala",
      "Grealish",
      "Bae Jun-Ho",
      "Xavi Simons",
      "Sancho",
      "Joao Felix",
      "Yildiz",
      "Nkunku",
      "Garnacho",
    ],
    basePriceSeed: 13600,
  },
  CAM: {
    defaultBackNumber: 10,
    ko: [
      "매디슨",
      "외데고르",
      "벨링엄",
      "파머",
      "더브라위너",
      "브루노",
      "다니 올모",
      "비르츠",
      "이재성",
      "쿠보",
    ],
    en: [
      "Maddison",
      "Odegaard",
      "Bellingham",
      "Palmer",
      "De Bruyne",
      "Bruno",
      "Dani Olmo",
      "Wirtz",
      "Lee Jae-Sung",
      "Kubo",
    ],
    basePriceSeed: 14600,
  },
  RAM: {
    defaultBackNumber: 47,
    ko: [
      "포든",
      "이강인",
      "도안 리츠",
      "클루셉스키",
      "디아비",
      "보웬",
      "마운트",
      "제레미 피노",
      "브라힘 디아스",
      "아센시오",
    ],
    en: [
      "Foden",
      "Kang-In Lee",
      "Doan",
      "Kulusevski",
      "Diaby",
      "Bowen",
      "Mount",
      "Yeremy Pino",
      "Brahim Diaz",
      "Asensio",
    ],
    basePriceSeed: 14000,
  },
  CM: {
    defaultBackNumber: 8,
    ko: [
      "발베르데",
      "페드리",
      "비티냐",
      "파비안 루이스",
      "베르나르두",
      "바렐라",
      "맥알리스터",
      "프렌키 데용",
      "카마빙가",
      "자이르에메리",
    ],
    en: [
      "Valverde",
      "Pedri",
      "Vitinha",
      "Fabian Ruiz",
      "Bernardo",
      "Barella",
      "Mac Allister",
      "De Jong",
      "Camavinga",
      "Zaire-Emery",
    ],
    basePriceSeed: 13500,
  },
  DM: {
    defaultBackNumber: 6,
    ko: [
      "로드리",
      "라이스",
      "엔도 와타루",
      "황인범",
      "코비 마이누",
      "키미히",
      "카이세도",
      "기마랑이스",
      "츄아메니",
      "주앙 네베스",
    ],
    en: [
      "Rodri",
      "Rice",
      "Endo",
      "Hwang In-Beom",
      "Mainoo",
      "Kimmich",
      "Caicedo",
      "Guimaraes",
      "Tchouameni",
      "Joao Neves",
    ],
    basePriceSeed: 13000,
  },
  LB: {
    defaultBackNumber: 3,
    ko: [
      "우도기",
      "그바르디올",
      "테오",
      "로버트슨",
      "데이비스",
      "디마르코",
      "발데",
      "누누 멘데스",
      "쿠쿠렐라",
      "콜윌",
    ],
    en: [
      "Udogie",
      "Gvardiol",
      "Theo",
      "Robertson",
      "Davies",
      "Dimarco",
      "Balde",
      "Nuno Mendes",
      "Cucurella",
      "Colwill",
    ],
    basePriceSeed: 10000,
  },
  CB: {
    defaultBackNumber: 4,
    ko: [
      "김민재",
      "살리바",
      "후벵 디아스",
      "뤼디거",
      "판더펜",
      "반다이크",
      "로메로",
      "아라우호",
      "바스토니",
      "파우 쿠바르시",
    ],
    en: [
      "Min-Jae Kim",
      "Saliba",
      "Ruben Dias",
      "Rudiger",
      "Van de Ven",
      "Van Dijk",
      "Romero",
      "Araujo",
      "Bastoni",
      "Cubarsi",
    ],
    basePriceSeed: 11200,
  },
  RB: {
    defaultBackNumber: 2,
    ko: [
      "포로",
      "화이트",
      "워커",
      "하키미",
      "카르바할",
      "알렉산더-아놀드",
      "쿤데",
      "프림퐁",
      "설영우",
      "달롯",
    ],
    en: [
      "Porro",
      "White",
      "Walker",
      "Hakimi",
      "Carvajal",
      "Alexander-Arnold",
      "Kounde",
      "Frimpong",
      "Seol Young-Woo",
      "Dalot",
    ],
    basePriceSeed: 10400,
  },
  GK: {
    defaultBackNumber: 1,
    ko: [
      "비카리오",
      "알리송",
      "에데르송",
      "쿠르투아",
      "노이어",
      "픽포드",
      "다비드 라야",
      "돈나룸마",
      "디오구 코스타",
      "조현우",
    ],
    en: [
      "Vicario",
      "Alisson",
      "Ederson",
      "Courtois",
      "Neuer",
      "Pickford",
      "David Raya",
      "Donnarumma",
      "Diogo Costa",
      "Jo Hyeon-Woo",
    ],
    basePriceSeed: 9200,
  },
};

function makeSlotSpec(
  slotKey: string,
  slotPosition: DetailedPosition,
  rowIndex: number,
  colIndex: number,
  compatiblePositions: DetailedPosition[],
  backNumberOverride?: number
): FormationSlotSpec {
  const pool = FALLBACK_POOL_BY_POSITION[slotPosition];
  return {
    slotKey,
    slotPosition,
    rowIndex,
    colIndex,
    compatiblePositions,
    defaultBackNumber: backNumberOverride ?? pool.defaultBackNumber,
    fallbackKoLastNames: pool.ko,
    fallbackEnLastNames: pool.en,
    basePriceSeed: pool.basePriceSeed,
  };
}

export const FORMATION_433_SLOTS: FormationSlotSpec[] = [
  makeSlotSpec("433-lw", "LW", 0, 0, ["LW", "LAM", "RW", "ST"], 7),
  makeSlotSpec("433-st", "ST", 0, 1, ["ST", "LW", "RW", "CAM"], 9),
  makeSlotSpec("433-rw", "RW", 0, 2, ["RW", "RAM", "LW", "ST"], 11),
  makeSlotSpec("433-lcm", "CM", 1, 0, ["CM", "CAM", "LAM", "DM"], 8),
  makeSlotSpec("433-ccm", "CM", 1, 1, ["CM", "DM", "CAM"], 6),
  makeSlotSpec("433-rcm", "CM", 1, 2, ["CM", "CAM", "RAM", "DM"], 10),
  makeSlotSpec("433-lb", "LB", 2, 0, ["LB", "CB"], 3),
  makeSlotSpec("433-lcb", "CB", 2, 1, ["CB", "LB", "RB"], 4),
  makeSlotSpec("433-rcb", "CB", 2, 2, ["CB", "RB", "LB"], 5),
  makeSlotSpec("433-rb", "RB", 2, 3, ["RB", "CB"], 2),
  makeSlotSpec("433-gk", "GK", 3, 0, ["GK"], 1),
];

export const FORMATION_4231_SLOTS: FormationSlotSpec[] = [
  makeSlotSpec("4231-st", "ST", 0, 0, ["ST", "LW", "RW", "CAM"], 9),
  makeSlotSpec("4231-lam", "LAM", 1, 0, ["LAM", "LW", "CM", "CAM"], 7),
  makeSlotSpec("4231-cam", "CAM", 1, 1, ["CAM", "CM", "LAM", "RAM"], 10),
  makeSlotSpec("4231-ram", "RAM", 1, 2, ["RAM", "RW", "CM", "CAM"], 11),
  makeSlotSpec("4231-ldm", "DM", 2, 0, ["DM", "CM", "CAM"], 6),
  makeSlotSpec("4231-rdm", "DM", 2, 1, ["DM", "CM", "CAM"], 8),
  makeSlotSpec("4231-lb", "LB", 3, 0, ["LB", "CB"], 3),
  makeSlotSpec("4231-lcb", "CB", 3, 1, ["CB", "LB", "RB"], 4),
  makeSlotSpec("4231-rcb", "CB", 3, 2, ["CB", "RB", "LB"], 5),
  makeSlotSpec("4231-rb", "RB", 3, 3, ["RB", "CB"], 2),
  makeSlotSpec("4231-gk", "GK", 4, 0, ["GK"], 1),
];

export const STARTING_11_TEMPLATE: RosterSlot[] = FORMATION_433_SLOTS.map(
  (s) => ({
    role: s.slotPosition,
    defaultBackNumber: s.defaultBackNumber,
    fallbackKoLastNames: s.fallbackKoLastNames,
    fallbackEnLastNames: s.fallbackEnLastNames,
    basePriceSeed: s.basePriceSeed,
  })
);

const BENCH_5_TEMPLATE: RosterSlot[] = [
  {
    role: "ST",
    defaultBackNumber: 14,
    fallbackKoLastNames: [
      "황희찬",
      "트로사르",
      "알바레즈",
      "조타",
      "도쿠",
      "밀리크",
      "자니올로",
      "페란 토레스",
      "곤살루 하무스",
      "에키티케",
    ],
    fallbackEnLastNames: [
      "Hwang",
      "Trossard",
      "Alvarez",
      "Jota",
      "Doku",
      "Milik",
      "Zaniolo",
      "Ferran",
      "G. Ramos",
      "Ekitike",
    ],
    basePriceSeed: 11800,
  },
  {
    role: "CAM",
    defaultBackNumber: 18,
    fallbackKoLastNames: [
      "클루셉스키",
      "카마빙가",
      "흐라벤베르흐",
      "코바치치",
      "은쿤쿠",
      "맥케니",
      "파지올리",
      "가비",
      "자이르에메리",
      "메이누",
    ],
    fallbackEnLastNames: [
      "Kulusevski",
      "Camavinga",
      "Gravenberch",
      "Kovacic",
      "Nkunku",
      "McKennie",
      "Fagioli",
      "Gavi",
      "Zaire-Emery",
      "Mainoo",
    ],
    basePriceSeed: 4800,
  },
  {
    role: "CM",
    defaultBackNumber: 21,
    fallbackKoLastNames: [
      "사르",
      "조르지뉴",
      "모드리치",
      "귄도안",
      "에제",
      "더글라스 루이스",
      "프레테시",
      "우가르테",
      "파블로비치",
      "미레티",
    ],
    fallbackEnLastNames: [
      "Sarr",
      "Jorginho",
      "Modric",
      "Gundogan",
      "Eze",
      "Douglas Luiz",
      "Frattesi",
      "Ugarte",
      "Pavlovic",
      "Miretti",
    ],
    basePriceSeed: 4600,
  },
  {
    role: "CB",
    defaultBackNumber: 15,
    fallbackKoLastNames: [
      "스톤스",
      "드라구신",
      "파바르",
      "밀리탕",
      "아칸지",
      "다닐루",
      "사보나",
      "데브라이",
      "뤼카 에르난데스",
      "조 고메즈",
    ],
    fallbackEnLastNames: [
      "Stones",
      "Dragusin",
      "Pavard",
      "Militao",
      "Akanji",
      "Danilo",
      "Savona",
      "De Vrij",
      "L. Hernandez",
      "J. Gomez",
    ],
    basePriceSeed: 4500,
  },
  {
    role: "GK",
    defaultBackNumber: 13,
    fallbackKoLastNames: [
      "오르테가",
      "라야",
      "케파",
      "루닌",
      "슈체스니",
      "페린",
      "골리니",
      "벤투",
      "마마르다슈빌리",
      "뉘벨",
    ],
    fallbackEnLastNames: [
      "Ortega",
      "Raya",
      "Kepa",
      "Lunin",
      "Szczesny",
      "Perin",
      "Gollini",
      "Bento",
      "Mamardashvili",
      "Nubel",
    ],
    basePriceSeed: 4200,
  },
];

const DEFENSIVE_POSITIONS = new Set<DetailedPosition>(["GK", "LB", "CB", "RB"]);
const FORWARD_POSITIONS = new Set<DetailedPosition>(["LW", "ST", "RW"]);
const ATTACK_AND_MID_SLOTS = new Set<DetailedPosition>([
  "LW",
  "ST",
  "RW",
  "LAM",
  "CAM",
  "RAM",
  "CM",
  "DM",
]);

export function isPositionAllowedInSlot(
  playerPosRaw: Position,
  slotPos: DetailedPosition
): boolean {
  const playerPos = normalizeDetailedPosition(playerPosRaw);

  if (slotPos === "GK" || playerPos === "GK") {
    return playerPos === "GK" && slotPos === "GK";
  }
  if (DEFENSIVE_POSITIONS.has(playerPos) && ATTACK_AND_MID_SLOTS.has(slotPos)) {
    return false;
  }
  if (FORWARD_POSITIONS.has(playerPos) && DEFENSIVE_POSITIONS.has(slotPos)) {
    return false;
  }
  if (
    !DEFENSIVE_POSITIONS.has(playerPos) &&
    DEFENSIVE_POSITIONS.has(slotPos)
  ) {
    return false;
  }
  if (
    (slotPos === "LB" && playerPos === "RB") ||
    (slotPos === "RB" && playerPos === "LB")
  ) {
    return false;
  }

  return true;
}

export function normalizeSupportedFormation(
  rawFormation?: string,
  side: "HOME" | "AWAY" = "HOME"
): SupportedFormation {
  if (rawFormation?.trim() === "4-2-3-1") return "4-2-3-1";
  if (rawFormation?.trim() === "4-3-3") return "4-3-3";
  return side === "HOME" ? "4-3-3" : "4-2-3-1";
}

function parseOutfieldFormationCounts(rawFormation?: string): number[] | null {
  const cleaned = (rawFormation || "").trim();
  if (!/^\d+(?:-\d+){2,3}$/.test(cleaned)) return null;
  const parts = cleaned.split("-").map(Number);
  if (parts.some((n) => !Number.isFinite(n) || n <= 0)) return null;
  return parts.reduce((sum, n) => sum + n, 0) === 10 ? parts : null;
}

export function resolvePitchFormationLabel(
  rawFormation?: string,
  side: "HOME" | "AWAY" = "HOME"
): string {
  const cleaned = (rawFormation || "").trim();
  if (cleaned === "4-2-3-1" || cleaned === "4-3-3") return cleaned;
  if (parseOutfieldFormationCounts(cleaned)) return cleaned;
  return normalizeSupportedFormation(rawFormation, side);
}

/**
 * Split starting players into top-to-bottom pitch rows (Attackers -> Midfield -> Defense -> GK).
 */
export function buildFormationRows(
  startingPlayers: Player[],
  formationLabel: string
): Player[][] {
  const capped = startingPlayers.slice(0, 11);
  if (capped.length < 11) {
    return capped.length > 0 ? [capped] : [];
  }

  if (formationLabel === "4-2-3-1") {
    return [
      [capped[0]],
      [capped[1], capped[2], capped[3]],
      [capped[4], capped[5]],
      [capped[6], capped[7], capped[8], capped[9]],
      [capped[10]],
    ];
  }

  if (formationLabel === "4-3-3") {
    return [
      [capped[0], capped[1], capped[2]],
      [capped[3], capped[4], capped[5]],
      [capped[6], capped[7], capped[8], capped[9]],
      [capped[10]],
    ];
  }

  const outfieldCounts = parseOutfieldFormationCounts(formationLabel);
  if (outfieldCounts) {
    const rowCounts = [...outfieldCounts].reverse();
    rowCounts.push(1);
    const rows: Player[][] = [];
    let cursor = 0;
    for (const count of rowCounts) {
      rows.push(capped.slice(cursor, cursor + count));
      cursor += count;
    }
    return rows;
  }

  return [
    [capped[0], capped[1], capped[2]],
    [capped[3], capped[4], capped[5]],
    [capped[6], capped[7], capped[8], capped[9]],
    [capped[10]],
  ];
}

function hashSeed(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function defaultIsNationalTeamMatch(match: Match): boolean {
  if (typeof match.isInternational === "boolean") return match.isInternational;
  const lid = (match.leagueId || "").trim().toLowerCase();
  return (
    lid === "amatch" ||
    lid === "wc" ||
    lid === "ec" ||
    lid === "nl" ||
    Boolean(match.leagueName?.includes("A매치"))
  );
}

function defaultDoesPlayerBelongToTeam(
  player: Player,
  team: TeamInfo,
  isAMatch: boolean
): boolean {
  if (isAMatch) {
    return (
      player.nationalTeam === team.name ||
      player.nationalTeam === team.shortName
    );
  }
  const pKey = canonicalizeTeamKey({
    id: player.teamId,
    name: player.teamName,
    shortName: player.teamShort,
  });
  const tKey = canonicalizeTeamKey(team);
  return (
    player.teamName === team.name ||
    (Boolean(pKey) && pKey !== "UNKNOWN" && pKey === tKey)
  );
}

function getLineSortRank(pos: Position): number {
  const det = normalizeDetailedPosition(pos);
  if (det === "GK") return 4;
  if (det === "LB" || det === "CB" || det === "RB") return 3;
  if (det === "DM" || det === "CM") return 2;
  if (det === "LAM" || det === "CAM" || det === "RAM") return 1;
  return 0;
}

/**
 * Pure helper to build a team's starting lineup & bench for a match.
 * - Real API / explicit lineups never pull unrelated store players or fixed dummy stars (`FALLBACK_POOL_BY_POSITION`).
 * - API-backed / `usesDummyLineup` matches without an official lineup return empty arrays instead of fabricating dummy rosters.
 * - Local offline demo matches without an explicit lineup keep synthetic slot fallback for Demo Mode.
 */
export function buildTeamLineupForMatch(
  match: Match,
  side: "HOME" | "AWAY",
  storePlayers: Player[],
  matchers?: {
    isNationalTeamMatch?: (m: Match) => boolean;
    doesPlayerBelongToTeam?: (
      p: Player,
      t: TeamInfo,
      isAMatch: boolean
    ) => boolean;
  }
): {
  startingLineup: Player[];
  benchLineup: Player[];
  formation: string;
} {
  const activeTeam = side === "HOME" ? match.homeTeam : match.awayTeam;
  const apiLineup: ApiLineupPlayer[] = Array.isArray(activeTeam?.lineup)
    ? activeTeam.lineup.slice(0, 11)
    : [];
  const apiBench: ApiLineupPlayer[] = Array.isArray(activeTeam?.bench)
    ? activeTeam.bench
    : [];

  const hasExplicitLineup = apiLineup.length > 0;
  const formation = hasExplicitLineup
    ? resolvePitchFormationLabel(activeTeam?.formation, side)
    : normalizeSupportedFormation(activeTeam?.formation, side);

  if (!activeTeam) {
    return { startingLineup: [], benchLineup: [], formation };
  }

  const isApiMatch = isApiBackedMatch(match);
  if (!hasExplicitLineup && (isApiMatch || Boolean(match.usesDummyLineup))) {
    // Do not inject fixed dummy star names (`FALLBACK_POOL_BY_POSITION`) into real matches lacking official lineups.
    return { startingLineup: [], benchLineup: [], formation };
  }

  const isAMatchFn = matchers?.isNationalTeamMatch ?? defaultIsNationalTeamMatch;
  const belongsToTeamFn =
    matchers?.doesPlayerBelongToTeam ?? defaultDoesPlayerBelongToTeam;
  const isAMatch = isAMatchFn(match);

  const baseTeamPlayersFromStore = storePlayers.filter(
    (p) => !p.id.startsWith("pitch-") && belongsToTeamFn(p, activeTeam, isAMatch)
  );

  const isMatchUpcoming = resolveMatchClock(match).isUpcoming;
  const isScoreOnlyMatch = match.providerMode === "SCORE_ONLY";
  const stripMatchEvents =
    isMatchUpcoming || isScoreOnlyMatch || Boolean(match.usesDummyLineup);

  const usedIds = new Set<string>();
  const usedNames = new Set<string>();
  const entryByPlayerId = new Map<string, ApiLineupPlayer>();

  const markUsed = (p: Pick<Player, "id" | "name" | "englishName">) => {
    usedIds.add(p.id);
    usedNames.add(formatPlayerDisplayName(p, "full"));
    usedNames.add(p.name.trim());
  };

  const isPlayerUsed = (p: Pick<Player, "id" | "name" | "englishName">) =>
    usedIds.has(p.id) ||
    usedNames.has(p.name.trim()) ||
    usedNames.has(formatPlayerDisplayName(p, "full"));

  const teamSeed = hashSeed(`${match.id}-${activeTeam.id}-${side}`);
  const sidePoolOffset = side === "HOME" ? 0 : 5;

  const starterCandidates: Player[] = [];
  const seenCandidateIds = new Set<string>();

  const findStorePlayerForEntry = (
    entry: ApiLineupPlayer
  ): Player | undefined => {
    const entryId = entry.id !== undefined ? String(entry.id) : "";
    const extId =
      entry.externalId !== undefined ? String(entry.externalId) : "";
    const entryNameTrimmed = (entry.name || "").trim();

    return (
      baseTeamPlayersFromStore.find((p) =>
        doesIdentityMatchPlayer(
          p,
          entryId || extId || undefined,
          entryNameTrimmed
        )
      ) ??
      (!isAMatch
        ? storePlayers.find(
            (p) =>
              !p.id.startsWith("pitch-") &&
              ((entryId && p.id === entryId) ||
                (extId &&
                  (p.id === extId ||
                    p.id === `api-p-${extId}` ||
                    p.id === `af-p-${extId}`)))
          )
        : undefined)
    );
  };

  apiLineup.forEach((entry, idx) => {
    const matched = findStorePlayerForEntry(entry);
    if (matched) {
      const entryPos = entry.position
        ? normalizeDetailedPosition(entry.position)
        : normalizeDetailedPosition(matched.position);
      const matchedPos = normalizeDetailedPosition(matched.position);
      const effectivePosition =
        getPositionLine(entryPos) === getPositionLine(matchedPos)
          ? entryPos
          : matchedPos;

      const baseCandidate: Player =
        effectivePosition !== matched.position
          ? { ...matched, position: effectivePosition }
          : matched;
      const candidate = applyLineupEntryMeta(
        baseCandidate,
        entry,
        stripMatchEvents
      );
      entryByPlayerId.set(candidate.id, entry);

      if (!seenCandidateIds.has(candidate.id)) {
        seenCandidateIds.add(candidate.id);
        starterCandidates.push(candidate);
      }
      return;
    }

    if (entry && entry.name) {
      const normalizedPos = normalizeDetailedPosition(entry.position);
      const pool = FALLBACK_POOL_BY_POSITION[normalizedPos];
      const basePrice = roundToTen(
        pool.basePriceSeed + ((teamSeed + idx * 17) % 8) * 100
      );
      const tierCfg = getTierConfig(basePrice);
      const tempId =
        entry.id !== undefined
          ? String(entry.id)
          : `pitch-api-${match.id}-${activeTeam.id}-${idx}`;
      const canonicalNames = canonicalizeIncomingPlayerNames({
        id: tempId,
        name: entry.name.trim(),
        englishName: entry.name.trim(),
      });

      if (!seenCandidateIds.has(tempId)) {
        seenCandidateIds.add(tempId);
        entryByPlayerId.set(tempId, entry);
        starterCandidates.push(
          applyLineupEntryMeta(
            {
              id: tempId,
              name: canonicalNames.name,
              englishName: canonicalNames.englishName,
              nationalTeam: entry.nationalTeam || activeTeam.name,
              matchId: match.id,
              teamId: activeTeam.id,
              teamName: entry.team || activeTeam.name,
              teamShort: activeTeam.shortName,
              teamColor: activeTeam.color,
              position: normalizedPos,
              backNumber: entry.shirtNumber || pool.defaultBackNumber,
              tier: tierCfg.tier,
              totalShares: tierCfg.totalShares,
              marketSupply: tierCfg.marketSupply,
              basePrice,
              initialPrice: basePrice,
              currentPrice: basePrice,
              previousPrice: basePrice,
              events: [],
              priceHistory: [
                {
                  minute: 0,
                  timeLabel: "0'",
                  price: basePrice,
                  changePercentFromOpen: 0,
                },
              ],
              lastEvent: {
                text: "⚡ 포지션 정상 소화 · 실시간 시세 거래 가능",
                sentiment: "neutral",
                minute: 0,
              },
              stats: {
                rating:
                  entry.rating ??
                  Number((6.5 + ((teamSeed + idx * 11) % 14) * 0.1).toFixed(1)),
                goals: 0,
                assists: 0,
                shotsOnTarget: 0,
                keyPasses: 0,
              },
            },
            entry,
            stripMatchEvents
          )
        );
      }
    }
  });

  // Only mix baseTeamPlayersFromStore into starters for local demo matches without explicit lineups
  if (!hasExplicitLineup) {
    for (const baseP of baseTeamPlayersFromStore) {
      if (!seenCandidateIds.has(baseP.id)) {
        seenCandidateIds.add(baseP.id);
        starterCandidates.push({
          ...baseP,
          position: normalizeDetailedPosition(baseP.position),
        });
      }
    }
  }

  let starters: Player[] = [];
  const isCustomFormation =
    hasExplicitLineup && formation !== "4-3-3" && formation !== "4-2-3-1";

  if (isCustomFormation) {
    starters = [...starterCandidates].sort(
      (a, b) => getLineSortRank(a.position) - getLineSortRank(b.position)
    );
    starters.forEach((p) => markUsed(p));
  } else {
    const formationSlots: FormationSlotSpec[] =
      formation === "4-2-3-1" ? FORMATION_4231_SLOTS : FORMATION_433_SLOTS;
    const assignedStarters: Array<Player | null> = new Array(
      formationSlots.length
    ).fill(null);

    formationSlots.forEach((slot, slotIdx) => {
      const exactCandidate = starterCandidates.find((p) => {
        if (isPlayerUsed(p)) return false;
        const pPos = normalizeDetailedPosition(p.position);
        return (
          pPos === slot.slotPosition &&
          isPositionAllowedInSlot(pPos, slot.slotPosition)
        );
      });
      if (exactCandidate) {
        markUsed(exactCandidate);
        assignedStarters[slotIdx] = exactCandidate;
      }
    });

    formationSlots.forEach((slot, slotIdx) => {
      if (assignedStarters[slotIdx]) return;
      for (const compatPos of slot.compatiblePositions) {
        if (!isPositionAllowedInSlot(compatPos, slot.slotPosition)) continue;
        const compatibleCandidate = starterCandidates.find((p) => {
          if (isPlayerUsed(p)) return false;
          const pPos = normalizeDetailedPosition(p.position);
          return (
            pPos === compatPos && isPositionAllowedInSlot(pPos, slot.slotPosition)
          );
        });
        if (compatibleCandidate) {
          markUsed(compatibleCandidate);
          assignedStarters[slotIdx] = compatibleCandidate;
          break;
        }
      }
    });

    if (hasExplicitLineup) {
      // Place any remaining real apiLineup starters (e.g. 5th DF or 3-DF/4-MF setups) without dropping anyone or injecting dummy stars
      for (const unplaced of starterCandidates) {
        if (isPlayerUsed(unplaced)) continue;
        const gkSlotIdx = assignedStarters.findIndex(
          (val, idx) =>
            !val &&
            formationSlots[idx].slotPosition === "GK" &&
            normalizeDetailedPosition(unplaced.position) === "GK"
        );
        const sameLineIdx = assignedStarters.findIndex(
          (val, idx) =>
            !val &&
            getPositionLine(normalizeDetailedPosition(unplaced.position)) ===
              getPositionLine(formationSlots[idx].slotPosition)
        );
        const anyOpenIdx = assignedStarters.findIndex((val) => !val);
        const targetIdx =
          gkSlotIdx !== -1
            ? gkSlotIdx
            : sameLineIdx !== -1
            ? sameLineIdx
            : anyOpenIdx;
        if (targetIdx !== -1) {
          markUsed(unplaced);
          assignedStarters[targetIdx] = unplaced;
        }
      }
      starters = assignedStarters.filter((p): p is Player => p !== null);
    } else {
      const buildSyntheticForSlot = (
        slot: RosterSlot,
        slotIdx: number,
        isBench: boolean
      ): Player => {
        const synId = `pitch-${match.id}-${activeTeam.id}-${
          isBench ? "bench" : "start"
        }-${slotIdx}`;
        const existingSynInStore = storePlayers.find((p) => p.id === synId);
        if (
          existingSynInStore &&
          !isPlayerUsed(existingSynInStore) &&
          (isBench ||
            isPositionAllowedInSlot(existingSynInStore.position, slot.role))
        ) {
          markUsed(existingSynInStore);
          return { ...existingSynInStore, position: slot.role };
        }

        const poolSize = Math.min(5, slot.fallbackKoLastNames.length);
        let candidateIdx =
          sidePoolOffset + ((teamSeed + slotIdx) % Math.max(1, poolSize));
        if (candidateIdx >= slot.fallbackKoLastNames.length) {
          candidateIdx = candidateIdx % slot.fallbackKoLastNames.length;
        }

        let koName = slot.fallbackKoLastNames[candidateIdx];
        let enName = slot.fallbackEnLastNames[candidateIdx];
        const resolveFullName = (kName: string, eName?: string) =>
          formatPlayerDisplayName({ name: kName, englishName: eName }, "full");

        if (
          usedNames.has(koName) ||
          usedNames.has(resolveFullName(koName, enName))
        ) {
          for (let k = 0; k < slot.fallbackKoLastNames.length; k++) {
            const altKo = slot.fallbackKoLastNames[k];
            const altEn = slot.fallbackEnLastNames[k] || altKo;
            if (
              !usedNames.has(altKo) &&
              !usedNames.has(resolveFullName(altKo, altEn))
            ) {
              koName = altKo;
              enName = altEn;
              break;
            }
          }
        }

        usedIds.add(synId);
        usedNames.add(koName);
        usedNames.add(resolveFullName(koName, enName));

        const virtualRating = Number(
          (6.4 + ((teamSeed + slotIdx * 11) % 15) * 0.1).toFixed(1)
        );
        const basePrice = roundToTen(
          slot.basePriceSeed + ((teamSeed + slotIdx * 17) % 8) * 100
        );
        const tierCfg = getTierConfig(basePrice);

        return {
          id: synId,
          name: koName,
          englishName: enName,
          nationalTeam: activeTeam.name,
          matchId: match.id,
          teamId: activeTeam.id,
          teamName: activeTeam.name,
          teamShort: activeTeam.shortName,
          teamColor: activeTeam.color,
          position: slot.role,
          backNumber: slot.defaultBackNumber,
          tier: tierCfg.tier,
          totalShares: tierCfg.totalShares,
          marketSupply: tierCfg.marketSupply,
          basePrice,
          initialPrice: basePrice,
          currentPrice: basePrice,
          previousPrice: basePrice,
          events: [],
          priceHistory: [
            {
              minute: 0,
              timeLabel: "0'",
              price: basePrice,
              changePercentFromOpen: 0,
            },
          ],
          lastEvent: {
            text: isBench
              ? "📋 벤치 대기 중 · 교체 투입 시 시세 변동"
              : "⚡ 포지션 정상 소화 · 실시간 시세 거래 가능",
            sentiment: "neutral",
            minute: 0,
          },
          stats: {
            rating: virtualRating,
            goals: 0,
            assists: 0,
            shotsOnTarget: 0,
            keyPasses: 0,
          },
        };
      };

      starters = formationSlots.map((slot, slotIdx) => {
        const matched = assignedStarters[slotIdx];
        if (matched) return matched;
        return buildSyntheticForSlot(
          {
            role: slot.slotPosition,
            defaultBackNumber: slot.defaultBackNumber,
            fallbackKoLastNames: slot.fallbackKoLastNames,
            fallbackEnLastNames: slot.fallbackEnLastNames,
            basePriceSeed: slot.basePriceSeed,
          },
          slotIdx,
          false
        );
      });
    }
  }

  const bench: Player[] = [];
  apiBench.forEach((entry, idx) => {
    const matched = findStorePlayerForEntry(entry);
    if (matched) {
      if (!isPlayerUsed(matched)) {
        markUsed(matched);
        entryByPlayerId.set(matched.id, entry);
        bench.push(
          applyLineupEntryMeta(
            {
              ...matched,
              position: normalizeDetailedPosition(
                entry.position || matched.position
              ),
            },
            entry,
            stripMatchEvents
          )
        );
      }
      return;
    }

    if (entry && entry.name && !usedNames.has(entry.name.trim())) {
      const normalizedPos = normalizeDetailedPosition(entry.position);
      const pool = FALLBACK_POOL_BY_POSITION[normalizedPos];
      const basePrice = roundToTen(
        pool.basePriceSeed + ((teamSeed + (idx + 12) * 17) % 8) * 100
      );
      const tierCfg = getTierConfig(basePrice);
      const tempId =
        entry.id !== undefined
          ? String(entry.id)
          : `pitch-api-bench-${match.id}-${activeTeam.id}-${idx}`;
      const canonicalNames = canonicalizeIncomingPlayerNames({
        id: tempId,
        name: entry.name.trim(),
        englishName: entry.name.trim(),
      });
      if (!usedIds.has(tempId) && !usedNames.has(canonicalNames.name)) {
        usedIds.add(tempId);
        usedNames.add(entry.name.trim());
        usedNames.add(canonicalNames.name);
        entryByPlayerId.set(tempId, entry);
        bench.push(
          applyLineupEntryMeta(
            {
              id: tempId,
              name: canonicalNames.name,
              englishName: canonicalNames.englishName,
              nationalTeam: entry.nationalTeam || activeTeam.name,
              matchId: match.id,
              teamId: activeTeam.id,
              teamName: entry.team || activeTeam.name,
              teamShort: activeTeam.shortName,
              teamColor: activeTeam.color,
              position: normalizedPos,
              backNumber: entry.shirtNumber || pool.defaultBackNumber,
              tier: tierCfg.tier,
              totalShares: tierCfg.totalShares,
              marketSupply: tierCfg.marketSupply,
              basePrice,
              initialPrice: basePrice,
              currentPrice: basePrice,
              previousPrice: basePrice,
              events: [],
              priceHistory: [
                {
                  minute: 0,
                  timeLabel: "0'",
                  price: basePrice,
                  changePercentFromOpen: 0,
                },
              ],
              lastEvent: {
                text: "📋 벤치 대기 중 · 교체 투입 시 시세 변동",
                sentiment: "neutral",
                minute: 0,
              },
              stats: {
                rating: entry.rating ?? 6.5,
                goals: 0,
                assists: 0,
                shotsOnTarget: 0,
                keyPasses: 0,
              },
            },
            entry,
            stripMatchEvents
          )
        );
      }
    }
  });

  const maxBenchSize = hasExplicitLineup
    ? apiBench.length
    : Math.max(5, apiBench.length);

  if (!hasExplicitLineup) {
    for (const baseP of baseTeamPlayersFromStore) {
      if (bench.length >= maxBenchSize) break;
      if (
        !usedIds.has(baseP.id) &&
        !usedNames.has(baseP.name.trim()) &&
        !usedNames.has(formatPlayerDisplayName(baseP, "full"))
      ) {
        markUsed(baseP);
        bench.push({
          ...baseP,
          position: normalizeDetailedPosition(baseP.position),
        });
      }
    }

    if (!isAMatch && bench.length < 5) {
      for (let idx = bench.length; idx < 5; idx++) {
        const slot = BENCH_5_TEMPLATE[idx];
        const synId = `pitch-${match.id}-${activeTeam.id}-bench-${idx}`;
        const existingSynInStore = storePlayers.find((p) => p.id === synId);
        if (existingSynInStore && !isPlayerUsed(existingSynInStore)) {
          markUsed(existingSynInStore);
          bench.push({ ...existingSynInStore, position: slot.role });
          continue;
        }
        const poolSize = Math.min(5, slot.fallbackKoLastNames.length);
        let candidateIdx =
          sidePoolOffset + ((teamSeed + idx) % Math.max(1, poolSize));
        if (candidateIdx >= slot.fallbackKoLastNames.length) {
          candidateIdx = candidateIdx % slot.fallbackKoLastNames.length;
        }
        let koName = slot.fallbackKoLastNames[candidateIdx];
        let enName = slot.fallbackEnLastNames[candidateIdx];
        const resolveFullName = (kName: string, eName?: string) =>
          formatPlayerDisplayName({ name: kName, englishName: eName }, "full");
        if (
          usedNames.has(koName) ||
          usedNames.has(resolveFullName(koName, enName))
        ) {
          for (let k = 0; k < slot.fallbackKoLastNames.length; k++) {
            const altKo = slot.fallbackKoLastNames[k];
            const altEn = slot.fallbackEnLastNames[k] || altKo;
            if (
              !usedNames.has(altKo) &&
              !usedNames.has(resolveFullName(altKo, altEn))
            ) {
              koName = altKo;
              enName = altEn;
              break;
            }
          }
        }
        usedIds.add(synId);
        usedNames.add(koName);
        usedNames.add(resolveFullName(koName, enName));
        const basePrice = roundToTen(
          slot.basePriceSeed + ((teamSeed + idx * 17) % 8) * 100
        );
        const tierCfg = getTierConfig(basePrice);
        bench.push({
          id: synId,
          name: koName,
          englishName: enName,
          nationalTeam: activeTeam.name,
          matchId: match.id,
          teamId: activeTeam.id,
          teamName: activeTeam.name,
          teamShort: activeTeam.shortName,
          teamColor: activeTeam.color,
          position: slot.role,
          backNumber: slot.defaultBackNumber,
          tier: tierCfg.tier,
          totalShares: tierCfg.totalShares,
          marketSupply: tierCfg.marketSupply,
          basePrice,
          initialPrice: basePrice,
          currentPrice: basePrice,
          previousPrice: basePrice,
          events: [],
          priceHistory: [
            {
              minute: 0,
              timeLabel: "0'",
              price: basePrice,
              changePercentFromOpen: 0,
            },
          ],
          lastEvent: {
            text: "📋 벤치 대기 중 · 교체 투입 시 시세 변동",
            sentiment: "neutral",
            minute: 0,
          },
          stats: {
            rating: Number(
              (6.4 + ((teamSeed + idx * 11) % 15) * 0.1).toFixed(1)
            ),
            goals: 0,
            assists: 0,
            shotsOnTarget: 0,
            keyPasses: 0,
          },
        });
      }
    }
  }

  const applySelectedMatchContext = (p: Player): Player => {
    const base = roundToTen(
      p.basePrice ?? p.openPrice ?? p.initialPrice ?? p.currentPrice ?? 10000
    );
    const isCrossMatchPlayer = p.matchId !== match.id;
    const matchedEntry = entryByPlayerId.get(p.id);
    const canonicalNames = canonicalizeIncomingPlayerNames({
      id: p.id,
      name: p.name,
      englishName: p.englishName,
    });

    if (
      isMatchUpcoming ||
      isCrossMatchPlayer ||
      isScoreOnlyMatch ||
      Boolean(match.usesDummyLineup)
    ) {
      const resetPlayer: Player = {
        ...p,
        name: canonicalNames.name,
        englishName: canonicalNames.englishName,
        matchId: match.id,
        teamId: activeTeam.id,
        teamName: activeTeam.name,
        teamShort: activeTeam.shortName,
        teamColor: activeTeam.color,
        basePrice: base,
        openPrice: base,
        initialPrice: base,
        previousPrice: base,
        currentPrice: base,
        highPrice: base,
        lowPrice: base,
        isCaptain:
          matchedEntry?.isCaptain ??
          (isCrossMatchPlayer ? false : p.isCaptain ?? false),
        subInMinute: undefined,
        subOutMinute: undefined,
        yellowCards: 0,
        redCards: 0,
        events: [],
        priceHistory: [
          {
            minute: 0,
            timeLabel: "0'",
            price: base,
            changePercentFromOpen: 0,
          },
        ],
        stats: {
          rating: matchedEntry?.rating ?? p.stats?.rating ?? 7.2,
          goals: 0,
          assists: 0,
          shotsOnTarget: 0,
          keyPasses: 0,
          yellowCards: 0,
          redCards: 0,
        },
        lastEvent: isMatchUpcoming
          ? {
              text: "⏰ 킥오프 대기 중 · 기준 시가",
              sentiment: "neutral",
              minute: 0,
            }
          : {
              text: "⚡ 라인업 출전 · 실시간 시세 연동",
              sentiment: "neutral",
              minute: 0,
            },
      };

      return matchedEntry
        ? applyLineupEntryMeta(resetPlayer, matchedEntry, stripMatchEvents)
        : resetPlayer;
    }

    return {
      ...p,
      name: canonicalNames.name,
      englishName: canonicalNames.englishName,
      matchId: match.id,
      teamId: activeTeam.id,
      teamName: activeTeam.name,
      teamShort: activeTeam.shortName,
      teamColor: activeTeam.color,
    };
  };

  return {
    startingLineup: starters.slice(0, 11).map(applySelectedMatchContext),
    benchLineup: bench.slice(0, maxBenchSize).map(applySelectedMatchContext),
    formation,
  };
}
