"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  X,
  ChevronDown,
  ChevronUp,
  Users,
  Sparkles,
  ShoppingBag,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import {
  ActiveMatchContext,
  Match,
  Player,
  Holding,
  TradeType,
  Position,
  DetailedPosition,
  ApiLineupPlayer,
  getPositionLine,
  normalizeDetailedPosition,
  buildActiveMatchContext,
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
import { WEIGHTS } from "@/lib/weights";
import { formatMinuteLabel, type PlayerEvent } from "@/lib/priceEngine";
import {
  applyLineupEntryMeta,
  reconcileTeamGoalMarkers,
  resolveMatchManagers,
  resolvePlayerMatchStatus,
  type PlayerMatchLineupStatus,
} from "@/lib/lineupStatus";
import PlayerAvatar from "@/components/PlayerAvatar";

interface FormationPitchModalProps {
  match: Match | null;
  players: Player[];
  holdings: Record<string, Holding>;
  onClose: () => void;
  onSelectPlayerTrade: (
    player: Player,
    type: TradeType,
    matchContext?: ActiveMatchContext
  ) => void;
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
    ? activeTeam.bench
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

      const baseCandidate: Player =
        effectivePosition !== matched.position
          ? { ...matched, position: effectivePosition }
          : matched;
      const candidate = applyLineupEntryMeta(baseCandidate, entry);

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
      const tierCfg = getTierConfig(basePrice);
      const tempId =
        entry.id !== undefined
          ? String(entry.id)
          : `pitch-api-${match.id}-${activeTeam.id}-${idx}`;

      if (!seenCandidateIds.has(tempId)) {
        seenCandidateIds.add(tempId);
        starterCandidates.push(
          applyLineupEntryMeta(
            {
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
                  Number(
                    (6.5 + ((teamSeed + idx * 11) % 14) * 0.1).toFixed(1)
                  ),
                goals: 0,
                assists: 0,
                shotsOnTarget: 0,
                keyPasses: 0,
              },
            },
            entry
          )
        );
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

  // Build bench list:
  // 1) Explicit apiBench matches (preserving all explicit entries and metadata)
  // 2) Remaining unused baseTeamPlayersFromStore
  // 3) Role-specific bench fallback (for club teams with < 16 store players)
  const bench: Player[] = [];
  apiBench.forEach((entry, idx) => {
    const matched = findStorePlayerForEntry(entry);
    if (matched && !usedIds.has(matched.id) && !usedNames.has(matched.name.trim())) {
      markUsed(matched);
      bench.push(
        applyLineupEntryMeta(
          {
            ...matched,
            position: normalizeDetailedPosition(entry.position || matched.position),
          },
          entry
        )
      );
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
      if (!usedIds.has(tempId)) {
        usedIds.add(tempId);
        usedNames.add(entry.name.trim());
        bench.push(
          applyLineupEntryMeta(
            {
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
            entry
          )
        );
      }
    }
  });

  const maxBenchSize = Math.max(5, apiBench.length);
  for (const baseP of baseTeamPlayersFromStore) {
    if (bench.length >= maxBenchSize) break;
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

  const applySelectedMatchContext = (p: Player): Player => {
    const isMatchUpcoming =
      match.status === "UPCOMING" ||
      match.rawStatus === "TIMED" ||
      match.rawStatus === "SCHEDULED";
    const base = roundToTen(
      p.basePrice ?? p.openPrice ?? p.initialPrice ?? p.currentPrice ?? 10000
    );
    const isCrossMatchPlayer = p.matchId !== match.id;

    if (isMatchUpcoming || isCrossMatchPlayer) {
      return {
        ...p,
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
        subInMinute: isMatchUpcoming ? undefined : p.subInMinute,
        subOutMinute: isMatchUpcoming ? undefined : p.subOutMinute,
        yellowCards: isMatchUpcoming ? 0 : p.yellowCards ?? 0,
        redCards: isMatchUpcoming ? 0 : p.redCards ?? 0,
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
          rating: p.stats?.rating ?? 7.2,
          goals: 0,
          assists: 0,
          shotsOnTarget: 0,
          keyPasses: 0,
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
    }

    return {
      ...p,
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

interface MatchCardBadgesProps {
  yellowCards: number;
  redCards: number;
  size?: "xs" | "sm";
}

function MatchCardBadges({
  yellowCards,
  redCards,
  size = "xs",
}: MatchCardBadgesProps) {
  if (yellowCards <= 0 && redCards <= 0) return null;
  const cardDim =
    size === "xs"
      ? "h-[10px] w-[7px] rounded-[1.5px]"
      : "h-[12px] w-[8.5px] rounded-[2px]";
  const yellowCount = Math.min(2, yellowCards);
  const redCount = Math.min(1, redCards);

  return (
    <span
      data-testid="match-card-badges"
      className="inline-flex shrink-0 items-center gap-0.5"
      aria-label={[
        yellowCount > 0 ? `옐로카드 ${yellowCount}장` : "",
        redCount > 0 ? `레드카드 ${redCount}장` : "",
      ]
        .filter(Boolean)
        .join(", ")}
    >
      {Array.from({ length: yellowCount }).map((_, idx) => (
        <span
          key={`yc-${idx}`}
          data-testid="yellow-card-badge"
          title="옐로카드"
          className={`inline-block ${cardDim} border border-amber-500/60 bg-[#FACC15] shadow-[0_1px_1px_rgba(0,0,0,0.16)]`}
        />
      ))}
      {Array.from({ length: redCount }).map((_, idx) => (
        <span
          key={`rc-${idx}`}
          data-testid="red-card-badge"
          title="레드카드"
          className={`inline-block ${cardDim} border border-rose-700/60 bg-[#EF4444] shadow-[0_1px_1px_rgba(0,0,0,0.18)]`}
        />
      ))}
    </span>
  );
}

interface SubTimeBadgeProps {
  direction: "IN" | "OUT";
  minute: number;
  compact?: boolean;
}

function SubTimeBadge({
  direction,
  minute,
  compact = false,
}: SubTimeBadgeProps) {
  const isIn = direction === "IN";
  const label = formatMinuteLabel(minute);

  return (
    <span
      data-testid={isIn ? "sub-in-badge" : "sub-out-badge"}
      title={isIn ? `${label} 교체 투입` : `${label} 교체 아웃`}
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-full border font-mono font-extrabold tabular-nums leading-none whitespace-nowrap ${
        compact
          ? "px-1 py-0.5 text-[8px] sm:text-[9px] shadow-xs"
          : "px-1.5 py-0.5 text-[10px]"
      } ${
        isIn
          ? "border-emerald-200 bg-emerald-50 text-[#00A878]"
          : "border-rose-200 bg-white/95 text-[#E11D48]"
      }`}
    >
      <span>{label}</span>
      {isIn ? (
        <ArrowRight
          className={compact ? "h-2.5 w-2.5 text-[#00A878]" : "h-3 w-3 text-[#00A878]"}
          strokeWidth={2.75}
        />
      ) : (
        <ArrowLeft
          className={compact ? "h-2.5 w-2.5 text-[#E11D48]" : "h-3 w-3 text-[#E11D48]"}
          strokeWidth={2.75}
        />
      )}
    </span>
  );
}

interface PitchPlayerNodeProps {
  player: Player;
  teamColor: string;
  holdingQty: number;
  status: PlayerMatchLineupStatus;
  isUpcoming?: boolean;
  onSelect: (player: Player, type: TradeType) => void;
}

const PitchPlayerNode = React.memo(function PitchPlayerNode({
  player,
  teamColor,
  holdingQty,
  status,
  isUpcoming = false,
  onSelect,
}: PitchPlayerNodeProps) {
  const base = player.openPrice ?? player.basePrice ?? player.initialPrice;
  const displayPrice = isUpcoming
    ? Math.round((base * (1 + WEIGHTS.LINEUP_CONFIRMED)) / 10) * 10
    : player.currentPrice;
  const diff = displayPrice - base;
  const pct = isUpcoming
    ? (WEIGHTS.LINEUP_CONFIRMED * 100).toFixed(2)
    : calculateChangePercentFromOpen(displayPrice, base).toFixed(2);
  const isUp = diff > 0;
  const isDown = diff < 0;

  return (
    <button
      type="button"
      onClick={() => onSelect(player, "BUY")}
      className="group relative flex min-w-0 flex-1 max-w-[74px] sm:max-w-[92px] flex-col items-center rounded-xl sm:rounded-2xl border border-gray-200/90 bg-[#FFFFFF] px-1 pt-1.5 pb-1.5 sm:px-2 sm:pt-2 sm:pb-2 shadow-xs transition hover:-translate-y-0.5 hover:border-[#00A878] hover:shadow-sm focus:outline-none active:scale-95"
    >
      {/* Top Bar: Left (Holdings + Captain) / Right (Match Rating) — flex layout prevents corner overlap */}
      <div className="flex w-full items-center justify-between gap-0.5 min-h-[14px]">
        <div className="flex items-center gap-0.5 min-w-0">
          {holdingQty > 0 && (
            <span className="flex h-3.5 min-w-[14px] sm:h-4 sm:min-w-[16px] items-center justify-center rounded-full bg-[#00A878] px-1 text-[8px] sm:text-[9px] font-black text-white">
              {holdingQty}
            </span>
          )}
          {status.isCaptain && (
            <span
              data-testid="captain-badge"
              title="주장"
              className="flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-gray-900 px-1 text-[8px] font-black text-white leading-none"
            >
              C
            </span>
          )}
        </div>

        <span className="rounded bg-[#F7F9F8] px-1 py-0.5 font-mono text-[8px] sm:text-[9px] font-extrabold text-gray-700 tabular-nums border border-gray-200/70 leading-none">
          {player.stats.rating.toFixed(1)}
        </span>
      </div>

      {/* Avatar Area with Dedicated Non-Overlapping Corner Anchors */}
      <div className="relative my-1 flex items-center justify-center">
        <PlayerAvatar
          player={player}
          teamColorOverride={teamColor}
          size={34}
        />

        {/* Avatar Top-Left: Sub-Out Minute + Red ← Icon */}
        {status.subOutMinute !== undefined && (
          <div className="pointer-events-none absolute -left-3.5 -top-1 z-10">
            <SubTimeBadge direction="OUT" minute={status.subOutMinute} compact />
          </div>
        )}

        {/* Avatar Left/Bottom-Left: Yellow / Red Card Badges (flex-gap prevents multi-card overlap) */}
        {(status.yellowCards > 0 || status.redCards > 0) && (
          <div className="pointer-events-none absolute -left-2.5 -bottom-0.5 z-10 flex items-center gap-0.5 rounded bg-white/90 px-0.5 py-0.5 shadow-xs border border-gray-200/70">
            <MatchCardBadges
              yellowCards={status.yellowCards}
              redCards={status.redCards}
              size="xs"
            />
          </div>
        )}

        {/* Avatar Bottom-Right: Goal / Assist Markers (separated from cards & rating) */}
        {(status.goals > 0 || status.assists > 0) && (
          <div
            data-testid="pitch-goal-assist-badges"
            className="pointer-events-none absolute -right-2.5 -bottom-0.5 z-10 flex items-center gap-0.5 rounded-full bg-white/95 px-1 py-0.5 text-[8px] font-black leading-none shadow-xs border border-gray-200/70"
          >
            {status.goals > 0 && (
              <span title={`득점 ${status.goals}`}>
                ⚽{status.goals > 1 ? status.goals : ""}
              </span>
            )}
            {status.assists > 0 && (
              <span title={`도움 ${status.assists}`} className="text-sky-700">
                🅰️{status.assists > 1 ? status.assists : ""}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Middle: Player Name + Subtle Position Label */}
      <div className="flex w-full items-center justify-center gap-0.5 sm:gap-1 px-0.5">
        <span className="truncate text-[10px] sm:text-[11px] font-extrabold text-gray-900 leading-tight">
          {extractLastName(player)}
        </span>
        <span className="shrink-0 text-[8px] sm:text-[9px] font-semibold text-gray-400 leading-tight">
          {player.position}
        </span>
      </div>

      {/* Bottom: Current Price + Change % */}
      <div className="mt-0.5 flex max-w-full items-center gap-0.5 sm:gap-1 font-mono text-[8.5px] sm:text-[9.5px] font-bold tabular-nums">
        <span className="truncate text-gray-800">
          {displayPrice.toLocaleString()}
        </span>
        <span
          className={`shrink-0 ${
            isUp
              ? "text-[#00A878]"
              : isDown
              ? "text-[#F07868]"
              : "text-[#A8B2BC]"
          }`}
        >
          {isUp ? "+" : isDown ? "-" : ""}
          {Math.abs(Number(pct)).toFixed(2)}%
        </span>
      </div>
    </button>
  );
});

interface BenchPlayerRowProps {
  sub: Player;
  teamColor: string;
  holdingQty: number;
  status: PlayerMatchLineupStatus;
  isUpcoming?: boolean;
  onSelect: (player: Player, type: TradeType) => void;
}

const BenchPlayerRow = React.memo(function BenchPlayerRow({
  sub,
  teamColor,
  holdingQty,
  status,
  isUpcoming = false,
  onSelect,
}: BenchPlayerRowProps) {
  const base = sub.openPrice ?? sub.basePrice ?? sub.initialPrice;
  const hasPlayed =
    status.subInMinute !== undefined ||
    (sub.events?.length ?? 0) > 0 ||
    status.yellowCards > 0 ||
    status.redCards > 0;
  // Pre-match bench exclusion: -2.00%; unused bench during LIVE/FT: fixed 0.00%
  const displayPrice = isUpcoming
    ? Math.round((base * (1 + WEIGHTS.LINEUP_EXCLUDED)) / 10) * 10
    : hasPlayed
    ? sub.currentPrice
    : base;
  const diff = displayPrice - base;
  const pct = isUpcoming
    ? (WEIGHTS.LINEUP_EXCLUDED * 100).toFixed(2)
    : hasPlayed
    ? calculateChangePercentFromOpen(displayPrice, base).toFixed(2)
    : "0.00";
  const isUp = diff > 0;
  const isDown = diff < 0;

  return (
    <div
      data-testid={`bench-row-${sub.id}`}
      onClick={() => onSelect(sub, "BUY")}
      className="flex cursor-pointer items-center justify-between gap-2 py-2.5 px-1 transition hover:bg-gray-50"
    >
      {/* Left: Avatar + Name + Position + Rating + Card Badges + Holdings */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <PlayerAvatar
          player={sub}
          teamColorOverride={teamColor}
          size={32}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-gray-900 truncate">
              {sub.name}
            </span>
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-gray-600 leading-none">
              {sub.position}
            </span>
            {!isUpcoming && (
              <span className="rounded bg-[#F7F9F8] border border-gray-200/80 px-1 py-0.5 font-mono text-[10px] font-extrabold text-gray-700 tabular-nums leading-none">
                {sub.stats.rating.toFixed(1)}
              </span>
            )}
            <MatchCardBadges
              yellowCards={status.yellowCards}
              redCards={status.redCards}
              size="sm"
            />
            {status.goals > 0 && (
              <span className="text-[10px] font-bold text-gray-800">
                ⚽{status.goals > 1 ? status.goals : ""}
              </span>
            )}
            {status.assists > 0 && (
              <span className="text-[10px] font-bold text-sky-700">
                🅰️{status.assists > 1 ? status.assists : ""}
              </span>
            )}
            {holdingQty > 0 && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-[#00985f] leading-none">
                <ShoppingBag className="h-2.5 w-2.5" />
                {holdingQty}주
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Right: Substitution Badges (IN → / OUT ←) + Price + Buy */}
      <div className="flex items-center gap-2 shrink-0">
        {(status.subInMinute !== undefined || status.subOutMinute !== undefined) && (
          <div
            data-testid="bench-sub-badges"
            className="flex items-center gap-1"
          >
            {status.subInMinute !== undefined && (
              <SubTimeBadge direction="IN" minute={status.subInMinute} />
            )}
            {status.subOutMinute !== undefined && (
              <SubTimeBadge direction="OUT" minute={status.subOutMinute} />
            )}
          </div>
        )}

        <div className="text-right font-mono text-xs tabular-nums">
          <span className="font-black text-gray-900">
            {displayPrice.toLocaleString()}P
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
            onSelect(sub, "BUY");
          }}
          className="rounded-lg bg-[#00A878] px-2.5 py-1 text-[11px] font-bold text-white hover:opacity-95"
        >
          매수
        </button>
      </div>
    </div>
  );
});

export interface FormationPitchContentProps {
  match: Match;
  players: Player[];
  holdings: Record<string, Holding>;
  providerEventsByPlayer?: Record<string, PlayerEvent[]>;
  onSelectPlayerTrade: (
    player: Player,
    type: TradeType,
    matchContext?: ActiveMatchContext
  ) => void;
  onCollapseInline?: () => void;
}

export function FormationPitchContent({
  match,
  players,
  holdings,
  providerEventsByPlayer,
  onSelectPlayerTrade,
  onCollapseInline,
}: FormationPitchContentProps) {
  const [selectedSide, setSelectedSide] = useState<"HOME" | "AWAY">("HOME");
  const [isBenchOpen, setIsBenchOpen] = useState<boolean>(true);

  const activeTeam =
    selectedSide === "HOME" ? match.homeTeam : match.awayTeam;

  const handleSelectTeam = useCallback((side: "HOME" | "AWAY") => {
    setSelectedSide(side);
  }, []);

  useEffect(() => {
    setSelectedSide("HOME");
    setIsBenchOpen(true);
  }, [match.id]);

  const currentTeamLineup = useMemo(
    () => buildTeamLineupForMatch(match, selectedSide, players),
    [match, selectedSide, players]
  );
  const benchPlayers = currentTeamLineup.benchLineup;
  const formationLabel = currentTeamLineup.formation;

  const isUpcoming =
    match.status === "UPCOMING" ||
    match.rawStatus === "TIMED" ||
    match.rawStatus === "SCHEDULED";

  const handleSelectWithContext = useCallback(
    (player: Player, type: TradeType) => {
      onSelectPlayerTrade(player, type, buildActiveMatchContext(match));
    },
    [match, onSelectPlayerTrade]
  );

  const startingPlayers = useMemo(
    () => currentTeamLineup.startingLineup.slice(0, 11),
    [currentTeamLineup]
  );

  const teamStatusById = useMemo(() => {
    const rawMap: Record<string, PlayerMatchLineupStatus> = {};
    const orderedIds: string[] = [];
    for (const p of [...startingPlayers, ...benchPlayers]) {
      orderedIds.push(p.id);
      rawMap[p.id] = resolvePlayerMatchStatus({
        player: p,
        match,
        providerPlayerEvents: providerEventsByPlayer?.[p.id],
        teamSide: selectedSide,
      });
    }
    return reconcileTeamGoalMarkers(orderedIds, rawMap, activeTeam.score);
  }, [
    startingPlayers,
    benchPlayers,
    match,
    providerEventsByPlayer,
    selectedSide,
    activeTeam.score,
  ]);

  const { homeManager, awayManager } = useMemo(
    () => resolveMatchManagers(match),
    [match]
  );

  const startingRows = useMemo(() => {
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

    return [
      [capped[0], capped[1], capped[2]],
      [capped[3], capped[4], capped[5]],
      [capped[6], capped[7], capped[8], capped[9]],
      [capped[10]],
    ];
  }, [startingPlayers, formationLabel]);

  return (
    <div className="space-y-3">
      {/* Segmented Team Switcher */}
      <div className="flex items-center justify-between gap-2">
        <div className="grid flex-1 grid-cols-2 rounded-xl bg-gray-200/75 p-1 text-xs font-extrabold">
          <button
            type="button"
            onClick={() => handleSelectTeam("HOME")}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2 transition ${
              selectedSide === "HOME"
                ? "bg-white text-gray-900 shadow-xs"
                : "text-gray-500 hover:text-gray-800"
            }`}
          >
            <span
              style={{ backgroundColor: match.homeTeam.color }}
              className="h-2 w-2 rounded-full"
            />
            <span className="truncate">{match.homeTeam.name}</span>
            <span className="font-mono text-[10px] text-gray-400">
              ({normalizeSupportedFormation(match.homeTeam.formation, "HOME")})
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectTeam("AWAY")}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2 transition ${
              selectedSide === "AWAY"
                ? "bg-white text-gray-900 shadow-xs"
                : "text-gray-500 hover:text-gray-800"
            }`}
          >
            <span
              style={{ backgroundColor: match.awayTeam.color }}
              className="h-2 w-2 rounded-full"
            />
            <span className="truncate">{match.awayTeam.name}</span>
            <span className="font-mono text-[10px] text-gray-400">
              ({normalizeSupportedFormation(match.awayTeam.formation, "AWAY")})
            </span>
          </button>
        </div>

        {onCollapseInline && (
          <button
            type="button"
            onClick={onCollapseInline}
            className="shrink-0 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-600 transition hover:bg-gray-100"
          >
            접기
          </button>
        )}
      </div>

      {isUpcoming && (
        <div className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200/80 px-3 py-1 text-[11px] font-bold text-amber-900">
          예상 선발 · 킥오프 45분 전 공식 라인업 확정
        </div>
      )}

      {/* Guide Pill */}
      <div className="flex items-center justify-between gap-2 text-[11px] sm:text-xs text-gray-500 px-1">
        <span className="flex items-center gap-1 font-medium truncate">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-[#00A878]" />
          <span className="truncate">선수를 터치하면 차트·주문 창이 열립니다</span>
        </span>
        <span className="shrink-0 font-mono font-bold text-gray-700">
          {formationLabel} · {startingPlayers.slice(0, 11).length}명
        </span>
      </div>

      {/* Soft Ivory Green Pitch Container */}
      <div className="relative w-full overflow-hidden rounded-2xl sm:rounded-3xl border border-[#00A878]/25 bg-[#E8F5EF]">
        {/* Crisp White 1.5px Pitch Markings */}
        <div className="pointer-events-none absolute inset-2 sm:inset-3 rounded-xl border-[1.5px] border-white">
          <div className="mx-auto h-12 sm:h-14 w-36 sm:w-44 border-x-[1.5px] border-b-[1.5px] border-white" />
          <div className="mx-auto -mt-12 sm:-mt-14 h-5 sm:h-6 w-16 sm:w-20 border-x-[1.5px] border-b-[1.5px] border-white" />
          <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 border-t-[1.5px] border-white" />
          <div className="absolute left-1/2 top-1/2 h-16 w-16 sm:h-20 sm:w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-white" />
          <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
          <div className="absolute bottom-0 left-1/2 h-12 sm:h-14 w-36 sm:w-44 -translate-x-1/2 border-x-[1.5px] border-t-[1.5px] border-white" />
          <div className="absolute bottom-0 left-1/2 h-5 sm:h-6 w-16 sm:w-20 -translate-x-1/2 border-x-[1.5px] border-t-[1.5px] border-white" />
        </div>

        {/* Players Positioned by Formation Rows */}
        <div className="relative z-10 flex min-h-[370px] sm:min-h-[430px] flex-col justify-between py-3.5 sm:py-5 px-1 sm:px-2">
          {startingRows.map((row, rowIdx) => (
            <div
              key={`${selectedSide}-row-${rowIdx}`}
              className="flex items-center justify-around gap-1 sm:gap-1.5"
            >
              {row.map((player) => (
                <PitchPlayerNode
                  key={`${player.id}-${player.position}`}
                  player={player}
                  teamColor={activeTeam.color}
                  holdingQty={holdings[player.id]?.quantity ?? 0}
                  status={
                    teamStatusById[player.id] ??
                    resolvePlayerMatchStatus({
                      player,
                      match,
                      providerPlayerEvents: providerEventsByPlayer?.[player.id],
                      teamSide: selectedSide,
                    })
                  }
                  isUpcoming={isUpcoming}
                  onSelect={handleSelectWithContext}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Collapsible Bench (Substitutes / 교체명단) Accordion */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <button
          type="button"
          onClick={() => setIsBenchOpen((prev) => !prev)}
          className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-gray-50"
        >
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-[#00A878]" />
            <span
              data-testid="bench-section-title"
              className="text-xs font-extrabold text-gray-900"
            >
              교체명단 ({benchPlayers.length}명)
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
          <div className="border-t border-gray-100">
            <div className="divide-y divide-gray-100 px-3 py-1">
              {benchPlayers.map((sub) => (
                <BenchPlayerRow
                  key={`${sub.id}-${sub.position}`}
                  sub={sub}
                  teamColor={activeTeam.color}
                  holdingQty={holdings[sub.id]?.quantity ?? 0}
                  status={
                    teamStatusById[sub.id] ??
                    resolvePlayerMatchStatus({
                      player: sub,
                      match,
                      providerPlayerEvents: providerEventsByPlayer?.[sub.id],
                      teamSide: selectedSide,
                    })
                  }
                  isUpcoming={isUpcoming}
                  onSelect={handleSelectWithContext}
                />
              ))}
            </div>

            {/* Non-tradable Team Managers Row (감독) - always visible inside 교체명단 */}
            <div
              data-testid="bench-managers-section"
              className="border-t border-gray-100 bg-[#F9FAFB] px-3 py-2.5"
            >
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[11px] font-extrabold text-gray-500">
                  감독
                </span>
                <span className="text-[10px] font-medium text-gray-400">
                  양 팀 사령탑 (비거래)
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {[
                  {
                    side: "HOME",
                    teamName: match.homeTeam.name,
                    shortName: match.homeTeam.shortName,
                    color: match.homeTeam.color,
                    managerName: homeManager ?? "감독 정보 미제공",
                    isMissing: !homeManager,
                  },
                  {
                    side: "AWAY",
                    teamName: match.awayTeam.name,
                    shortName: match.awayTeam.shortName,
                    color: match.awayTeam.color,
                    managerName: awayManager ?? "감독 정보 미제공",
                    isMissing: !awayManager,
                  },
                ].map((mgr) => (
                  <div
                    key={mgr.side}
                    data-testid={`manager-card-${mgr.side.toLowerCase()}`}
                    className="flex items-center gap-2.5 rounded-xl border border-gray-200/80 bg-white px-2.5 py-2 select-none"
                  >
                    <div
                      className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-gray-200/80 bg-[#F7F9F8]"
                      aria-label={`${mgr.managerName} 감독`}
                    >
                      <svg
                        viewBox="0 0 64 64"
                        width={32}
                        height={32}
                        className="block h-full w-full"
                        role="img"
                        aria-hidden="true"
                      >
                        <circle cx="32" cy="22" r="9" fill={mgr.color} opacity="0.9" />
                        <path
                          d="M16 53 C16 40 22 34 32 34 C42 34 48 40 48 53 Z"
                          fill={mgr.color}
                          opacity="0.88"
                        />
                        <path
                          d="M27 34 L32 45 L37 34"
                          fill="#FFFFFF"
                          opacity="0.9"
                        />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`truncate text-xs font-extrabold ${
                          mgr.isMissing ? "text-gray-400" : "text-gray-900"
                        }`}
                      >
                        {mgr.managerName}
                      </p>
                      <p className="truncate text-[10px] font-semibold text-gray-500">
                        {mgr.teamName} ({mgr.shortName})
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function FormationPitchModal({
  match,
  players,
  holdings,
  onClose,
  onSelectPlayerTrade,
}: FormationPitchModalProps) {
  if (!match) return null;

  return (
    <div
      className="lg:hidden fixed inset-0 z-40 flex items-end justify-center bg-black/55 animate-fadeIn"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-[480px] flex-col overflow-hidden rounded-t-3xl bg-[#F7F9F8] shadow-2xl animate-slideUp"
      >
        {/* Modal Top Header */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3.5 shrink-0">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-extrabold text-[#00A878] border border-emerald-200">
                포메이션 피치 뷰
              </span>
              <span className="text-xs font-bold text-gray-500">
                {match.leagueName}
              </span>
            </div>
            <h2 className="mt-0.5 text-sm font-extrabold text-gray-900">
              {match.homeTeam.name}{" "}
              <span className="font-mono text-[#00A878]">
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

        {/* Single Scrollable Content */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3.5">
          <FormationPitchContent
            match={match}
            players={players}
            holdings={holdings}
            onSelectPlayerTrade={onSelectPlayerTrade}
          />
        </div>
      </div>
    </div>
  );
}
