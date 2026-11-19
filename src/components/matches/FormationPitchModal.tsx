"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  X,
  ChevronDown,
  ChevronUp,
  Users,
  Sparkles,
  ShoppingBag,
} from "lucide-react";
import {
  Match,
  Player,
  Holding,
  TradeType,
  Position,
  DetailedPosition,
  ApiLineupPlayer,
  getPositionLine,
  normalizeDetailedPosition,
} from "@/types";
import {
  roundToTen,
  clampToPriceLimit,
  doesPlayerBelongToTeam,
  isNationalTeamMatch,
  calculateChangePercentFromOpen,
  calculateDiffFromOpen,
} from "@/store/useTradeStore";
import { getTierConfig } from "@/utils/tier";

interface FormationPitchModalProps {
  match: Match | null;
  players: Player[];
  holdings: Record<string, Holding>;
  onClose: () => void;
  onSelectPlayerTrade: (player: Player, type: TradeType) => void;
}

export type SupportedFormation = "4-3-3" | "4-2-3-1";

export interface FormationSlotSpec {
  slotKey: string;
  slotPosition: DetailedPosition;
  rowIndex: number; // 0 = top attack row .. last = GK row
  colIndex: number; // left -> right (0-based within row)
  compatiblePositions: DetailedPosition[]; // Priority 2 adjacent/same-line fallback order
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

const FALLBACK_POOL_BY_POSITION: Record<
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

/**
 * 1) 4-3-3 고정 11슬롯 구성 (좌 ➔ 우 순서 엄수):
 * - Row 0 (공격 3): [LW] (좌측 윙어), [ST] (중앙 스트라이커), [RW] (우측 윙어)
 * - Row 1 (중원 3): [CM] (좌측 중앙 미드필더), [CM] (중앙/수비형 미드필더), [CM] (우측 중앙 미드필더)
 * - Row 2 (수비 4): [LB] (좌측 풀백), [CB] (좌측 센터백), [CB] (우측 센터백), [RB] (우측 풀백)
 * - Row 3 (골키퍼 1): [GK] (중앙 최후방)
 */
export const FORMATION_433_SLOTS: FormationSlotSpec[] = [
  // Row 0: [LW, ST, RW]
  makeSlotSpec("433-lw", "LW", 0, 0, ["LW", "LAM", "RW", "ST"], 7),
  makeSlotSpec("433-st", "ST", 0, 1, ["ST", "LW", "RW", "CAM"], 9),
  makeSlotSpec("433-rw", "RW", 0, 2, ["RW", "RAM", "LW", "ST"], 11),
  // Row 1: [CM (좌), CM (중/DM), CM (우)]
  makeSlotSpec("433-lcm", "CM", 1, 0, ["CM", "CAM", "LAM", "DM"], 8),
  makeSlotSpec("433-ccm", "CM", 1, 1, ["CM", "DM", "CAM"], 6),
  makeSlotSpec("433-rcm", "CM", 1, 2, ["CM", "CAM", "RAM", "DM"], 10),
  // Row 2: [LB, CB (좌), CB (우), RB]
  makeSlotSpec("433-lb", "LB", 2, 0, ["LB", "CB"], 3),
  makeSlotSpec("433-lcb", "CB", 2, 1, ["CB", "LB", "RB"], 4),
  makeSlotSpec("433-rcb", "CB", 2, 2, ["CB", "RB", "LB"], 5),
  makeSlotSpec("433-rb", "RB", 2, 3, ["RB", "CB"], 2),
  // Row 3: [GK]
  makeSlotSpec("433-gk", "GK", 3, 0, ["GK"], 1),
];

/**
 * 2) 4-2-3-1 고정 11슬롯 구성 (좌 ➔ 우 순서 엄수):
 * - Row 0 (원톱 1): [ST] (중앙 최전방 원톱 스트라이커)
 * - Row 1 (2선 3): [LAM] (좌측 공미/윙어), [CAM] (중앙 공미), [RAM] (우측 공미/윙어)
 * - Row 2 (3선 2): [DM] (좌측 수미), [DM] (우측 수미)
 * - Row 3 (수비 4): [LB] (좌측 풀백), [CB] (좌측 센터백), [CB] (우측 센터백), [RB] (우측 풀백)
 * - Row 4 (골키퍼 1): [GK] (중앙 최후방)
 */
export const FORMATION_4231_SLOTS: FormationSlotSpec[] = [
  // Row 0: [ST]
  makeSlotSpec("4231-st", "ST", 0, 0, ["ST", "LW", "RW", "CAM"], 9),
  // Row 1: [LAM, CAM, RAM]
  makeSlotSpec("4231-lam", "LAM", 1, 0, ["LAM", "LW", "CM", "CAM"], 7),
  makeSlotSpec("4231-cam", "CAM", 1, 1, ["CAM", "CM", "LAM", "RAM"], 10),
  makeSlotSpec("4231-ram", "RAM", 1, 2, ["RAM", "RW", "CM", "CAM"], 11),
  // Row 2: [DM (좌), DM (우)]
  makeSlotSpec("4231-ldm", "DM", 2, 0, ["DM", "CM", "CAM"], 6),
  makeSlotSpec("4231-rdm", "DM", 2, 1, ["DM", "CM", "CAM"], 8),
  // Row 3: [LB, CB (좌), CB (우), RB]
  makeSlotSpec("4231-lb", "LB", 3, 0, ["LB", "CB"], 3),
  makeSlotSpec("4231-lcb", "CB", 3, 1, ["CB", "LB", "RB"], 4),
  makeSlotSpec("4231-rcb", "CB", 3, 2, ["CB", "RB", "LB"], 5),
  makeSlotSpec("4231-rb", "RB", 3, 3, ["RB", "CB"], 2),
  // Row 4: [GK]
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

/**
 * 절대 금지 규칙 (구역 침범 차단 가드):
 * 1) CB, LB, RB, GK 선수는 어떠한 경우에도 ST, LW, RW, CAM, LAM, RAM (및 CM, DM) 슬롯에 배치할 수 없다.
 * 2) ST, LW, RW 선수는 DF (LB, CB, RB) 또는 GK 슬롯에 배치할 수 없다.
 * 3) GK 슬롯에는 오직 GK만, GK 선수는 오직 GK 슬롯에만 배치할 수 있다.
 * 4) LB와 RB 간 좌우 풀백 스왑을 금지한다 (풀백 부재 시 CB만 보완 허용).
 */
export function isPositionAllowedInSlot(
  playerPosRaw: Position,
  slotPos: DetailedPosition
): boolean {
  const playerPos = normalizeDetailedPosition(playerPosRaw);

  if (slotPos === "GK" || playerPos === "GK") {
    return playerPos === "GK" && slotPos === "GK";
  }

  // Rule 1: CB, LB, RB, GK can NEVER be placed in ST, LW, RW, CAM, LAM, RAM, CM, DM slots
  if (DEFENSIVE_POSITIONS.has(playerPos) && ATTACK_AND_MID_SLOTS.has(slotPos)) {
    return false;
  }

  // Rule 2: ST, LW, RW can NEVER be placed in DF (LB, CB, RB) or GK slots
  if (FORWARD_POSITIONS.has(playerPos) && DEFENSIVE_POSITIONS.has(slotPos)) {
    return false;
  }

  // Rule 3: Midfielders cannot be placed into DF slots
  if (
    !DEFENSIVE_POSITIONS.has(playerPos) &&
    DEFENSIVE_POSITIONS.has(slotPos)
  ) {
    return false;
  }

  // Rule 4: Prevent LB <-> RB left/right fullback inversion
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

function extractLastName(player: Player): string {
  const koTrimmed = player.name.trim();
  if (koTrimmed.length <= 4) return koTrimmed;
  const parts = koTrimmed.split(" ");
  return parts[parts.length - 1];
}

function hashSeed(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// Generate 12 historical price points leading up to currentPrice so sparkline is always rich
function buildSparklineHistory(
  basePrice: number,
  currentPrice: number,
  seed: number
) {
  const points = [];
  const count = 12;
  for (let i = 0; i < count; i++) {
    const minute = Math.min(90, i * 6);
    if (i === 0) {
      points.push({
        minute: 0,
        timeLabel: "0'",
        price: basePrice,
        changePercentFromOpen: 0,
      });
    } else if (i === count - 1) {
      points.push({
        minute,
        timeLabel: `${minute}'`,
        price: currentPrice,
        changePercentFromOpen: Number(
          (((currentPrice - basePrice) / Math.max(1, basePrice)) * 100).toFixed(2)
        ),
      });
    } else {
      const progress = i / (count - 1);
      const linear = basePrice + (currentPrice - basePrice) * progress;
      const wave = (((seed + i * 19) % 9) - 4) * 0.006 * basePrice;
      const p = clampToPriceLimit(linear + wave, basePrice);
      points.push({
        minute,
        timeLabel: `${minute}'`,
        price: p,
        changePercentFromOpen: Number(
          (((p - basePrice) / Math.max(1, basePrice)) * 100).toFixed(2)
        ),
      });
    }
  }
  return points;
}

// Pure helper to build a strictly deduplicated 11-player starting lineup + 5-player bench for a team
// Enforces 2-pass priority slot matching (Priority 1: Exact DetailedPosition match -> Priority 2: Adjacent compatible role)
// and strict zone-invasion guard (CB/LB/RB/GK never in ST/LW/RW/CAM/LAM/RAM/CM/DM; ST/LW/RW never in DF/GK).
export function buildTeamLineupForMatch(
  match: Match,
  side: "HOME" | "AWAY",
  storePlayers: Player[]
): {
  startingLineup: Player[];
  benchLineup: Player[];
  formation: SupportedFormation;
} {
  const activeTeam = side === "HOME" ? match.homeTeam : match.awayTeam;
  const formation = normalizeSupportedFormation(activeTeam?.formation, side);
  if (!activeTeam) {
    return {
      startingLineup: [],
      benchLineup: [],
      formation,
    };
  }

  const isAMatch = isNationalTeamMatch(match);

  // Include non-synthetic base players (from dummyData / store) that belong to this team
  // - For A-Matches: strictly matches ONLY player.nationalTeam === activeTeam
  // - For Club Matches: strictly matches ONLY club fields
  const baseTeamPlayersFromStore = storePlayers.filter(
    (p) =>
      !p.id.startsWith("pitch-") &&
      doesPlayerBelongToTeam(p, activeTeam, isAMatch)
  );

  const apiLineup: ApiLineupPlayer[] = Array.isArray(activeTeam.lineup)
    ? activeTeam.lineup.slice(0, 11)
    : [];
  const apiBench: ApiLineupPlayer[] = Array.isArray(activeTeam.bench)
    ? activeTeam.bench.slice(0, 5)
    : [];

  const usedIds = new Set<string>();
  const usedNames = new Set<string>();

  const markUsed = (p: Player) => {
    usedIds.add(p.id);
    usedNames.add(p.name.trim());
  };

  const teamSeed = hashSeed(`${match.id}-${activeTeam.id}-${side}`);
  const sidePoolOffset = side === "HOME" ? 0 : 5;

  // Build candidate pool for starting 11:
  // 1) Resolve explicit apiLineup entries against storePlayers (or build temporary candidate if not yet in store)
  // 2) Append any remaining baseTeamPlayersFromStore so club/national team stars are available for slot matching
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
      baseTeamPlayersFromStore.find(
        (p) =>
          (entryId && p.id === entryId) ||
          (extId && (p.id === extId || p.id === `api-p-${extId}`)) ||
          (entryNameTrimmed && p.name.trim() === entryNameTrimmed) ||
          (entryNameTrimmed &&
            p.englishName.trim().toLowerCase() ===
              entryNameTrimmed.toLowerCase())
      ) ??
      (!isAMatch
        ? storePlayers.find(
            (p) =>
              !p.id.startsWith("pitch-") &&
              ((entryId && p.id === entryId) ||
                (extId && (p.id === extId || p.id === `api-p-${extId}`)))
          )
        : undefined)
    );
  };

  apiLineup.forEach((entry, idx) => {
    const matched = findStorePlayerForEntry(entry);
    if (matched) {
      // If entry explicitly specifies a DetailedPosition for this match, respect it if compatible with player's line
      const entryPos = entry.position
        ? normalizeDetailedPosition(entry.position)
        : normalizeDetailedPosition(matched.position);
      const matchedPos = normalizeDetailedPosition(matched.position);
      const effectivePosition =
        getPositionLine(entryPos) === getPositionLine(matchedPos)
          ? entryPos
          : matchedPos;

      const candidate: Player =
        effectivePosition !== matched.position
          ? { ...matched, position: effectivePosition }
          : matched;

      if (!seenCandidateIds.has(candidate.id)) {
        seenCandidateIds.add(candidate.id);
        starterCandidates.push(candidate);
      }
      return;
    }

    if (!isAMatch && entry && entry.name) {
      const normalizedPos = normalizeDetailedPosition(entry.position);
      const pool = FALLBACK_POOL_BY_POSITION[normalizedPos];
      const basePrice = roundToTen(
        pool.basePriceSeed + ((teamSeed + idx * 17) % 8) * 100
      );
      const deltaPct = (((teamSeed + idx * 7) % 13) - 6) * 0.008;
      const currentPrice = clampToPriceLimit(
        basePrice * (1 + deltaPct),
        basePrice
      );
      const tierCfg = getTierConfig(basePrice);
      const tempId =
        entry.id !== undefined
          ? String(entry.id)
          : `pitch-api-${match.id}-${activeTeam.id}-${idx}`;

      if (!seenCandidateIds.has(tempId)) {
        seenCandidateIds.add(tempId);
        starterCandidates.push({
          id: tempId,
          name: entry.name.trim(),
          englishName: entry.name.trim(),
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
          currentPrice,
          previousPrice: basePrice,
          priceHistory: buildSparklineHistory(
            basePrice,
            currentPrice,
            teamSeed + idx
          ),
          lastEvent: {
            text: "⚡ 포지션 정상 소화 · 실시간 시세 거래 가능",
            sentiment: currentPrice >= basePrice ? "positive" : "neutral",
            minute: match.minute ?? 45,
          },
          stats: {
            rating: Number(
              (6.5 + ((teamSeed + idx * 11) % 14) * 0.1).toFixed(1)
            ),
            goals: 0,
            assists: 0,
            shotsOnTarget: 1,
            keyPasses: 1,
          },
        });
      }
    }
  });

  // Also include all baseTeamPlayersFromStore in the candidate pool (so if apiLineup is absent or partial, real players are matched to their true positions)
  for (const baseP of baseTeamPlayersFromStore) {
    if (!seenCandidateIds.has(baseP.id)) {
      seenCandidateIds.add(baseP.id);
      starterCandidates.push({
        ...baseP,
        position: normalizeDetailedPosition(baseP.position),
      });
    }
  }

  // Select the 11 fixed slots for the active formation ("4-3-3" or "4-2-3-1")
  const formationSlots: FormationSlotSpec[] =
    formation === "4-2-3-1" ? FORMATION_4231_SLOTS : FORMATION_433_SLOTS;

  const assignedStarters: Array<Player | null> = new Array(
    formationSlots.length
  ).fill(null);

  // PASS 1 (1순위 — 정확 매칭): player.position === slot.slotPosition
  formationSlots.forEach((slot, slotIdx) => {
    const exactCandidate = starterCandidates.find((p) => {
      if (usedIds.has(p.id) || usedNames.has(p.name.trim())) return false;
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

  // PASS 2 (2순위 — 동일 라인/인접 포지션 보완 + 절대 금지 구역 침범 가드)
  formationSlots.forEach((slot, slotIdx) => {
    if (assignedStarters[slotIdx]) return;

    for (const compatPos of slot.compatiblePositions) {
      if (!isPositionAllowedInSlot(compatPos, slot.slotPosition)) continue;

      const compatibleCandidate = starterCandidates.find((p) => {
        if (usedIds.has(p.id) || usedNames.has(p.name.trim())) return false;
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

  // Helper to build a synthetic role-matched slot player (Pass 3 fallback when team has fewer than 11 players in store)
  const buildSyntheticForSlot = (
    slot: RosterSlot,
    slotIdx: number,
    isBench: boolean
  ): Player => {
    const synId = `pitch-${match.id}-${activeTeam.id}-${
      isBench ? "bench" : "start"
    }-${slotIdx}`;

    // If this exact slot player was already registered into Zustand store AND its position is allowed in this slot, reuse its live store state
    const existingSynInStore = storePlayers.find((p) => p.id === synId);
    if (
      existingSynInStore &&
      !usedIds.has(existingSynInStore.id) &&
      (isBench ||
        isPositionAllowedInSlot(existingSynInStore.position, slot.role))
    ) {
      markUsed(existingSynInStore);
      return {
        ...existingSynInStore,
        position: slot.role,
      };
    }

    const poolSize = Math.min(5, slot.fallbackKoLastNames.length);
    let candidateIdx =
      sidePoolOffset + ((teamSeed + slotIdx) % Math.max(1, poolSize));
    if (candidateIdx >= slot.fallbackKoLastNames.length) {
      candidateIdx = candidateIdx % slot.fallbackKoLastNames.length;
    }

    let koName = slot.fallbackKoLastNames[candidateIdx];
    let enName = slot.fallbackEnLastNames[candidateIdx];

    if (usedNames.has(koName)) {
      for (let k = 0; k < slot.fallbackKoLastNames.length; k++) {
        const altKo = slot.fallbackKoLastNames[k];
        if (!usedNames.has(altKo)) {
          koName = altKo;
          enName = slot.fallbackEnLastNames[k] || altKo;
          break;
        }
      }
    }

    usedIds.add(synId);
    usedNames.add(koName);

    const virtualRating = Number(
      (6.4 + ((teamSeed + slotIdx * 11) % 15) * 0.1).toFixed(1)
    );
    const basePrice = roundToTen(
      slot.basePriceSeed + ((teamSeed + slotIdx * 17) % 8) * 100
    );
    const deltaPct = (((teamSeed + slotIdx * 7) % 13) - 6) * 0.008;
    const currentPrice = clampToPriceLimit(
      basePrice * (1 + deltaPct),
      basePrice
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
      currentPrice,
      previousPrice: basePrice,
      priceHistory: buildSparklineHistory(
        basePrice,
        currentPrice,
        teamSeed + slotIdx
      ),
      lastEvent: {
        text: isBench
          ? "📋 벤치 대기 중 · 교체 투입 시 시세 변동"
          : "⚡ 포지션 정상 소화 · 실시간 시세 거래 가능",
        sentiment: currentPrice >= basePrice ? "positive" : "neutral",
        minute: match.minute ?? 45,
      },
      stats: {
        rating: virtualRating,
        goals: 0,
        assists: 0,
        shotsOnTarget: 1,
        keyPasses: 1,
      },
    };
  };

  // PASS 3: Fill any still-unassigned starter slots with role-specific fallback players (never violating zone guard)
  const starters: Player[] = formationSlots.map((slot, slotIdx) => {
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

  // Build 5-player bench:
  // 1) Explicit apiBench matches
  // 2) Remaining unused baseTeamPlayersFromStore
  // 3) Role-specific bench fallback (for club teams with < 16 store players)
  const bench: Player[] = [];
  for (const entry of apiBench) {
    if (bench.length >= 5) break;
    const matched = findStorePlayerForEntry(entry);
    if (matched && !usedIds.has(matched.id) && !usedNames.has(matched.name.trim())) {
      markUsed(matched);
      bench.push({
        ...matched,
        position: normalizeDetailedPosition(entry.position || matched.position),
      });
    }
  }

  for (const baseP of baseTeamPlayersFromStore) {
    if (bench.length >= 5) break;
    if (!usedIds.has(baseP.id) && !usedNames.has(baseP.name.trim())) {
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
      bench.push(buildSyntheticForSlot(slot, idx, true));
    }
  }

  return {
    startingLineup: starters.slice(0, 11),
    benchLineup: bench.slice(0, 5),
    formation,
  };
}

export default function FormationPitchModal({
  match,
  players,
  holdings,
  onClose,
  onSelectPlayerTrade,
}: FormationPitchModalProps) {
  const [selectedSide, setSelectedSide] = useState<"HOME" | "AWAY">("HOME");
  const [pitchPlayers, setPitchPlayers] = useState<Player[]>([]);
  const [benchPlayers, setBenchPlayers] = useState<Player[]>([]);
  const [formationLabel, setFormationLabel] = useState<string>("4-3-3");
  const [isBenchOpen, setIsBenchOpen] = useState<boolean>(false);

  const activeTeam =
    selectedSide === "HOME" ? match?.homeTeam : match?.awayTeam;

  // Team selection handler: completely replaces (never appends) pitchPlayers with max 11 players
  const handleSelectTeam = useCallback(
    (side: "HOME" | "AWAY") => {
      setSelectedSide(side);
      if (!match) {
        setPitchPlayers([]);
        setBenchPlayers([]);
        return;
      }
      const selectedLineup = buildTeamLineupForMatch(match, side, players);
      setPitchPlayers(selectedLineup.startingLineup.slice(0, 11));
      setBenchPlayers(selectedLineup.benchLineup.slice(0, 5));
      setFormationLabel(selectedLineup.formation);
    },
    [match, players]
  );

  // Reset to HOME team when switching to a different match
  useEffect(() => {
    setSelectedSide("HOME");
    setIsBenchOpen(false);
  }, [match?.id]);

  // Synchronize and replace pitchPlayers whenever active team or live player prices update
  useEffect(() => {
    if (!match || !activeTeam) {
      setPitchPlayers([]);
      setBenchPlayers([]);
      return;
    }
    const currentTeamLineup = buildTeamLineupForMatch(
      match,
      selectedSide,
      players
    );
    setPitchPlayers(currentTeamLineup.startingLineup.slice(0, 11));
    setBenchPlayers(currentTeamLineup.benchLineup.slice(0, 5));
    setFormationLabel(currentTeamLineup.formation);
  }, [match, activeTeam?.id, selectedSide, players]);

  const isUpcoming =
    match?.status === "UPCOMING" ||
    match?.rawStatus === "TIMED" ||
    match?.rawStatus === "SCHEDULED";

  // Enforce .slice(0, 11) safety guard before arranging into formation rows
  const startingPlayers = useMemo(
    () => pitchPlayers.slice(0, 11),
    [pitchPlayers]
  );

  const startingRows = useMemo(() => {
    const capped = startingPlayers.slice(0, 11);
    if (capped.length < 11) {
      return capped.length > 0 ? [capped] : [];
    }

    if (formationLabel === "4-2-3-1") {
      // Exact slot mapping for FORMATION_4231_SLOTS (left -> right):
      // [0]: ST
      // [1..3]: LAM, CAM, RAM
      // [4..5]: DM, DM
      // [6..9]: LB, CB, CB, RB
      // [10]: GK
      return [
        [capped[0]], // [ST]
        [capped[1], capped[2], capped[3]], // [LAM, CAM, RAM]
        [capped[4], capped[5]], // [DM, DM]
        [capped[6], capped[7], capped[8], capped[9]], // [LB, CB, CB, RB]
        [capped[10]], // [GK]
      ];
    }

    // Exact slot mapping for FORMATION_433_SLOTS (left -> right):
    // [0..2]: LW, ST, RW
    // [3..5]: CM, CM, CM
    // [6..9]: LB, CB, CB, RB
    // [10]: GK
    return [
      [capped[0], capped[1], capped[2]], // [LW, ST, RW]
      [capped[3], capped[4], capped[5]], // [CM, CM, CM]
      [capped[6], capped[7], capped[8], capped[9]], // [LB, CB, CB, RB]
      [capped[10]], // [GK]
    ];
  }, [startingPlayers, formationLabel]);

  if (!match || !activeTeam) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 backdrop-blur-[2px] animate-fadeIn"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-[480px] flex-col overflow-hidden rounded-t-3xl bg-[#f8f9fa] shadow-2xl animate-slideUp"
      >
        {/* Modal Top Header */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3.5 shrink-0">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-extrabold text-[#00985f] border border-emerald-200">
                포메이션 피치 뷰
              </span>
              <span className="text-xs font-bold text-gray-500">
                {match.leagueName}
              </span>
            </div>
            <h2 className="mt-0.5 text-sm font-extrabold text-gray-900">
              {match.homeTeam.name}{" "}
              <span className="font-mono text-[#00985f]">
                {match.status === "UPCOMING"
                  ? "vs"
                  : `${match.homeTeam.score ?? 0} : ${
                      match.awayTeam.score ?? 0
                    }`}
              </span>{" "}
              {match.awayTeam.name}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-gray-100 p-2 text-gray-500 transition hover:bg-gray-200 hover:text-gray-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Segmented Team Switcher: [홈팀 포메이션] / [원정팀 포메이션] */}
        <div className="bg-white px-4 pb-3 pt-2 border-b border-gray-200/80 shrink-0">
          <div className="grid grid-cols-2 rounded-2xl bg-gray-100 p-1 text-xs font-extrabold">
            <button
              type="button"
              onClick={() => handleSelectTeam("HOME")}
              className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 transition ${
                selectedSide === "HOME"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              <span
                style={{ backgroundColor: match.homeTeam.color }}
                className="h-2.5 w-2.5 rounded-full"
              />
              <span className="truncate">{match.homeTeam.name}</span>
              <span className="font-mono text-[10px] text-gray-400">
                ({normalizeSupportedFormation(match.homeTeam.formation, "HOME")})
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectTeam("AWAY")}
              className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 transition ${
                selectedSide === "AWAY"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              <span
                style={{ backgroundColor: match.awayTeam.color }}
                className="h-2.5 w-2.5 rounded-full"
              />
              <span className="truncate">{match.awayTeam.name}</span>
              <span className="font-mono text-[10px] text-gray-400">
                ({normalizeSupportedFormation(match.awayTeam.formation, "AWAY")})
              </span>
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-4 py-3.5 space-y-4">
          {/* Pre-kickoff: single slim status chip, pitch renders immediately */}
          <>
              {isUpcoming && (
                <div className="flex items-center rounded-full bg-amber-50 border border-amber-200/80 px-3 py-1 text-[11px] font-bold text-amber-900">
                  예상 선발 · 킥오프 45분 전 공식 라인업 확정
                </div>
              )}

              {/* Guide Pill */}
              <div className="flex items-center justify-between text-xs text-gray-500 px-1">
                <span className="flex items-center gap-1 font-medium">
                  <Sparkles className="h-3.5 w-3.5 text-[#00985f]" />
                  선수를 터치하면 즉시 매수/매도 창이 열립니다
                </span>
                <span className="font-mono font-bold text-gray-700">
                  {formationLabel} · 선발 {startingPlayers.slice(0, 11).length}명
                </span>
              </div>

              {/* Football Pitch Container (FotMob Light Grass Style) */}
              <div
                className="relative w-full overflow-hidden rounded-3xl border-2 border-[#2b8a57] shadow-inner"
                style={{
                  background:
                    "repeating-linear-gradient(to bottom, #1e824c 0px, #1e824c 44px, #238c53 44px, #238c53 88px)",
                }}
              >
                {/* Pitch White Line Markings */}
                <div className="pointer-events-none absolute inset-3 rounded-xl border-2 border-white/35">
                  <div className="mx-auto h-14 w-44 border-x-2 border-b-2 border-white/35" />
                  <div className="mx-auto -mt-14 h-6 w-20 border-x-2 border-b-2 border-white/35" />
                  <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 border-t-2 border-white/35" />
                  <div className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/35" />
                  <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/50" />
                  <div className="absolute bottom-0 left-1/2 h-14 w-44 -translate-x-1/2 border-x-2 border-t-2 border-white/35" />
                  <div className="absolute bottom-0 left-1/2 h-6 w-20 -translate-x-1/2 border-x-2 border-t-2 border-white/35" />
                </div>

                {/* Players Positioned by Formation Rows (strictly from startingPlayers.slice(0, 11)) */}
                <div className="relative z-10 flex min-h-[450px] flex-col justify-between py-5 px-2">
                  {startingRows.map((row, rowIdx) => (
                    <div
                      key={`${selectedSide}-row-${rowIdx}`}
                      className="flex items-center justify-around gap-1"
                    >
                      {row.map((player) => {
                        const base =
                          player.openPrice ??
                          player.basePrice ??
                          player.initialPrice;
                        const diff = calculateDiffFromOpen(
                          player.currentPrice,
                          base
                        );
                        const pct = calculateChangePercentFromOpen(
                          player.currentPrice,
                          base
                        ).toFixed(1);
                        const isUp = diff > 0;
                        const isDown = diff < 0;
                        const holding = holdings[player.id];

                        return (
                          <button
                            key={`${player.id}-${player.position}`}
                            type="button"
                            onClick={() => onSelectPlayerTrade(player, "BUY")}
                            className="group flex flex-col items-center focus:outline-none active:scale-95 transition-transform"
                          >
                            {/* Jersey Number Circle Badge + Rating */}
                            <div className="relative">
                              <div
                                style={{ backgroundColor: activeTeam.color }}
                                className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white font-mono text-xs font-black text-white shadow-md group-hover:scale-105 transition"
                              >
                                {player.backNumber}
                              </div>

                              {/* Rating Mini Pill */}
                              <span className="absolute -right-2 -top-1 rounded-full bg-white px-1.5 py-0.2 font-mono text-[9px] font-extrabold text-gray-900 shadow">
                                {player.stats.rating.toFixed(1)}
                              </span>

                              {/* Owned Holdings Dot */}
                              {holding && holding.quantity > 0 && (
                                <span className="absolute -left-2 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#00985f] px-1 text-[9px] font-black text-white border border-white shadow">
                                  {holding.quantity}
                                </span>
                              )}
                            </div>

                            {/* Player Last Name + DetailedPosition Tag */}
                            <span className="mt-1 flex items-center gap-1 rounded-md bg-black/45 px-1.5 py-0.5 text-[11px] font-extrabold text-white backdrop-blur-[2px]">
                              <span className="font-mono text-[9px] font-black text-emerald-300">
                                {player.position}
                              </span>
                              <span>{extractLastName(player)}</span>
                            </span>

                            {/* Mini Live Price Chip: e.g. 16,400P ▲9.3% */}
                            <div className="mt-0.5 flex items-center gap-0.5 rounded-full bg-white/95 px-2 py-0.5 font-mono text-[9px] font-extrabold shadow-sm">
                              <span className="text-gray-900">
                                {player.currentPrice.toLocaleString()}P
                              </span>
                              <span
                                className={
                                  isUp
                                    ? "text-[#00A878]"
                                    : isDown
                                    ? "text-[#F07868]"
                                    : "text-[#A8B2BC]"
                                }
                              >
                                {isUp ? "▲" : isDown ? "▼" : ""}
                                {Math.abs(Number(pct)).toFixed(1)}%
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              {/* Collapsible Bench (Substitutes) Accordion */}
              <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                <button
                  type="button"
                  onClick={() => setIsBenchOpen((prev) => !prev)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-gray-50"
                >
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-[#00985f]" />
                    <span className="text-xs font-extrabold text-gray-900">
                      후보 선수 (Bench) 목록 ({benchPlayers.slice(0, 5).length}명)
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-gray-400">
                    <span>{isBenchOpen ? "접기" : "펼치기"}</span>
                    {isBenchOpen ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </div>
                </button>

                {isBenchOpen && (
                  <div className="divide-y divide-gray-100 border-t border-gray-100 px-3 py-1">
                    {benchPlayers.slice(0, 5).map((sub) => {
                      const base =
                        sub.openPrice ?? sub.basePrice ?? sub.initialPrice;
                      const diff = calculateDiffFromOpen(
                        sub.currentPrice,
                        base
                      );
                      const pct = calculateChangePercentFromOpen(
                        sub.currentPrice,
                        base
                      ).toFixed(1);
                      const isUp = diff > 0;
                      const isDown = diff < 0;
                      const holding = holdings[sub.id];

                      return (
                        <div
                          key={`${sub.id}-${sub.position}`}
                          onClick={() => onSelectPlayerTrade(sub, "BUY")}
                          className="flex cursor-pointer items-center justify-between py-2.5 px-1 transition hover:bg-gray-50"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              style={{ backgroundColor: activeTeam.color }}
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-black text-white"
                            >
                              {sub.backNumber}
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-bold text-gray-900 truncate">
                                  {sub.name}
                                </span>
                                <span className="rounded bg-gray-100 px-1.5 py-0.2 text-[10px] font-bold text-gray-600">
                                  {sub.position}
                                </span>
                                {holding && holding.quantity > 0 && (
                                  <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.2 text-[10px] font-bold text-[#00985f]">
                                    <ShoppingBag className="h-2.5 w-2.5" />
                                    {holding.quantity}주
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <div className="text-right font-mono text-xs">
                              <span className="font-black text-gray-900">
                                {sub.currentPrice.toLocaleString()}P
                              </span>
                              <span
                                className={`ml-1.5 text-[11px] font-bold ${
                                  isUp
                                    ? "text-[#00A878]"
                                    : isDown
                                    ? "text-[#F07868]"
                                    : "text-[#A8B2BC]"
                                }`}
                              >
                                {isUp ? "+" : ""}
                                {pct}%
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectPlayerTrade(sub, "BUY");
                              }}
                              className="rounded-lg bg-[#00A878] px-2.5 py-1 text-[11px] font-bold text-white hover:opacity-95"
                            >
                              매수
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
          </>
        </div>
      </div>
    </div>
  );
}
