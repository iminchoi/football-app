"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  X,
  ChevronDown,
  ChevronUp,
  Users,
  Sparkles,
  ShoppingBag,
  Clock,
  Eye,
} from "lucide-react";
import {
  Match,
  Player,
  Holding,
  TradeType,
  Position,
  ApiLineupPlayer,
} from "@/types";
import { roundToTen, clampToPriceLimit } from "@/store/useTradeStore";

interface FormationPitchModalProps {
  match: Match | null;
  players: Player[];
  holdings: Record<string, Holding>;
  onClose: () => void;
  onSelectPlayerTrade: (player: Player, type: TradeType) => void;
}

interface RosterSlot {
  role: Position;
  defaultBackNumber: number;
  fallbackKoLastNames: string[];
  fallbackEnLastNames: string[];
  basePriceSeed: number;
}

// 11-player starting template (3 FW, 3 MF, 4 DF, 1 GK) with 10 distinct names per slot
// (First 5 used primarily for HOME, next 5 for AWAY so teams never overlap)
export const STARTING_11_TEMPLATE: RosterSlot[] = [
  // FW (3)
  {
    role: "FW",
    defaultBackNumber: 7,
    fallbackKoLastNames: [
      "손흥민",
      "마르티넬리",
      "포든",
      "비니시우스",
      "래시포드",
      "일디즈",
      "하파엘 레앙",
      "그리즈만",
      "니코 윌리엄스",
      "바르콜라",
    ],
    fallbackEnLastNames: [
      "Son",
      "Martinelli",
      "Foden",
      "Vinicius",
      "Rashford",
      "Yildiz",
      "Leao",
      "Griezmann",
      "Nico Williams",
      "Barcola",
    ],
    basePriceSeed: 15500,
  },
  {
    role: "FW",
    defaultBackNumber: 9,
    fallbackKoLastNames: [
      "홀란드",
      "케인",
      "라우타로",
      "솔란케",
      "하베르츠",
      "블라호비치",
      "음바페",
      "레반도프스키",
      "이삭",
      "피나몬티",
    ],
    fallbackEnLastNames: [
      "Haaland",
      "Kane",
      "Lautaro",
      "Solanke",
      "Havertz",
      "Vlahovic",
      "Mbappe",
      "Lewandowski",
      "Isak",
      "Pinamonti",
    ],
    basePriceSeed: 17000,
  },
  {
    role: "FW",
    defaultBackNumber: 11,
    fallbackKoLastNames: [
      "살라",
      "사카",
      "야말",
      "뎀벨레",
      "쿠두스",
      "콘세이상",
      "풀리식",
      "호드리구",
      "올리세",
      "음뵈모",
    ],
    fallbackEnLastNames: [
      "Salah",
      "Saka",
      "Yamal",
      "Dembele",
      "Kudus",
      "Conceicao",
      "Pulisic",
      "Rodrygo",
      "Olise",
      "Mbeumo",
    ],
    basePriceSeed: 15800,
  },
  // MF (3)
  {
    role: "MF",
    defaultBackNumber: 10,
    fallbackKoLastNames: [
      "매디슨",
      "외데고르",
      "벨링엄",
      "무시알라",
      "파머",
      "코프메이너르스",
      "바렐라",
      "비르츠",
      "차비 시몬스",
      "주앙 네베스",
    ],
    fallbackEnLastNames: [
      "Maddison",
      "Odegaard",
      "Bellingham",
      "Musiala",
      "Palmer",
      "Koopmeiners",
      "Barella",
      "Wirtz",
      "Xavi Simons",
      "Joao Neves",
    ],
    basePriceSeed: 14200,
  },
  {
    role: "MF",
    defaultBackNumber: 8,
    fallbackKoLastNames: [
      "더브라위너",
      "라이스",
      "발베르데",
      "페드리",
      "브루노",
      "로카텔리",
      "찰하노글루",
      "비티냐",
      "맥알리스터",
      "프렌키 데용",
    ],
    fallbackEnLastNames: [
      "De Bruyne",
      "Rice",
      "Valverde",
      "Pedri",
      "Bruno",
      "Locatelli",
      "Calhanoglu",
      "Vitinha",
      "Mac Allister",
      "De Jong",
    ],
    basePriceSeed: 13800,
  },
  {
    role: "MF",
    defaultBackNumber: 6,
    fallbackKoLastNames: [
      "로드리",
      "이강인",
      "키미히",
      "카이세도",
      "기마랑이스",
      "케프렌 튀랑",
      "츄아메니",
      "파비안 루이스",
      "토날리",
      "바델리",
    ],
    fallbackEnLastNames: [
      "Rodri",
      "Lee",
      "Kimmich",
      "Caicedo",
      "Guimaraes",
      "K. Thuram",
      "Tchouameni",
      "Fabian Ruiz",
      "Tonali",
      "Badelj",
    ],
    basePriceSeed: 12800,
  },
  // DF (4)
  {
    role: "DF",
    defaultBackNumber: 23,
    fallbackKoLastNames: [
      "포로",
      "화이트",
      "워커",
      "하키미",
      "카르바할",
      "캄비아소",
      "아놀드",
      "쿤데",
      "프림퐁",
      "덤프리스",
    ],
    fallbackEnLastNames: [
      "Porro",
      "White",
      "Walker",
      "Hakimi",
      "Carvajal",
      "Cambiaso",
      "Arnold",
      "Kounde",
      "Frimpong",
      "Dumfries",
    ],
    basePriceSeed: 10200,
  },
  {
    role: "DF",
    defaultBackNumber: 3,
    fallbackKoLastNames: [
      "김민재",
      "살리바",
      "후벵디아스",
      "뤼디거",
      "판더펜",
      "브레메르",
      "파우 쿠바르시",
      "마르퀴뇨스",
      "코나테",
      "칼룰루",
    ],
    fallbackEnLastNames: [
      "Kim",
      "Saliba",
      "Dias",
      "Rudiger",
      "Van de Ven",
      "Bremer",
      "Cubarsi",
      "Marquinhos",
      "Konate",
      "Kalulu",
    ],
    basePriceSeed: 11200,
  },
  {
    role: "DF",
    defaultBackNumber: 4,
    fallbackKoLastNames: [
      "반다이크",
      "로메로",
      "아라우호",
      "바스토니",
      "마갈량이스",
      "가티",
      "우파메카노",
      "파초",
      "타",
      "바스케스",
    ],
    fallbackEnLastNames: [
      "Van Dijk",
      "Romero",
      "Araujo",
      "Bastoni",
      "Gabriel",
      "Gatti",
      "Upamecano",
      "Pacho",
      "Tah",
      "Vasquez",
    ],
    basePriceSeed: 11000,
  },
  {
    role: "DF",
    defaultBackNumber: 19,
    fallbackKoLastNames: [
      "우도기",
      "그바르디올",
      "테오",
      "로버트슨",
      "데이비스",
      "디마르코",
      "발데",
      "누누 멘데스",
      "칼라피오리",
      "마르틴",
    ],
    fallbackEnLastNames: [
      "Udogie",
      "Gvardiol",
      "Theo",
      "Robertson",
      "Davies",
      "Dimarco",
      "Balde",
      "Nuno Mendes",
      "Calafiori",
      "Martin",
    ],
    basePriceSeed: 10000,
  },
  // GK (1)
  {
    role: "GK",
    defaultBackNumber: 1,
    fallbackKoLastNames: [
      "비카리오",
      "알리송",
      "에데르송",
      "쿠르투아",
      "노이어",
      "디 그레고리오",
      "애미 마르티네스",
      "돈나룸마",
      "오블락",
      "좀머",
    ],
    fallbackEnLastNames: [
      "Vicario",
      "Alisson",
      "Ederson",
      "Courtois",
      "Neuer",
      "Di Gregorio",
      "Martinez",
      "Donnarumma",
      "Oblak",
      "Sommer",
    ],
    basePriceSeed: 9200,
  },
];

const BENCH_5_TEMPLATE: RosterSlot[] = [
  {
    role: "FW",
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
    role: "MF",
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
    basePriceSeed: 11400,
  },
  {
    role: "MF",
    defaultBackNumber: 21,
    fallbackKoLastNames: [
      "사르",
      "조르지뉴",
      "모드리치",
      "구도간",
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
    basePriceSeed: 10600,
  },
  {
    role: "DF",
    defaultBackNumber: 5,
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
    basePriceSeed: 9800,
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
    basePriceSeed: 8600,
  },
];

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
    if (i === 0) {
      points.push({ timeLabel: "시초", price: basePrice });
    } else if (i === count - 1) {
      points.push({ timeLabel: "현재", price: currentPrice });
    } else {
      const progress = i / (count - 1);
      const linear = basePrice + (currentPrice - basePrice) * progress;
      const wave = (((seed + i * 19) % 9) - 4) * 0.006 * basePrice;
      points.push({
        timeLabel: `${i * 5}'`,
        price: clampToPriceLimit(linear + wave, basePrice),
      });
    }
  }
  return points;
}

// Pure helper to build a strictly deduplicated 11-player starting lineup + 5-player bench for a team
export function buildTeamLineupForMatch(
  match: Match,
  side: "HOME" | "AWAY",
  storePlayers: Player[]
): {
  startingLineup: Player[];
  benchLineup: Player[];
  formation: string;
} {
  const activeTeam = side === "HOME" ? match.homeTeam : match.awayTeam;
  if (!activeTeam) {
    return {
      startingLineup: [],
      benchLineup: [],
      formation: "4-3-3",
    };
  }

  // Only include non-synthetic base players (from dummyData) that strictly belong to this match & team
  // Synthetic players ("pitch-...") are matched 1:1 by their exact slot ID (`synId`) to prevent cross-slot duplication!
  const baseTeamPlayersFromStore = storePlayers.filter(
    (p) =>
      !p.id.startsWith("pitch-") &&
      p.matchId === match.id &&
      (p.teamId === activeTeam.id ||
        p.teamShort.toUpperCase() === activeTeam.shortName.toUpperCase())
  );

  const apiLineup: ApiLineupPlayer[] = Array.isArray(activeTeam.lineup)
    ? activeTeam.lineup.slice(0, 11)
    : [];
  const apiBench: ApiLineupPlayer[] = Array.isArray(activeTeam.bench)
    ? activeTeam.bench.slice(0, 5)
    : [];

  const usedIds = new Set<string>();
  const usedNames = new Set<string>();
  const teamSeed = hashSeed(`${match.id}-${activeTeam.id}-${side}`);
  const sidePoolOffset = side === "HOME" ? 0 : 5;

  const buildSlotPlayer = (
    slot: RosterSlot,
    slotIdx: number,
    isBench: boolean
  ): Player => {
    const synId = `pitch-${match.id}-${activeTeam.id}-${
      isBench ? "bench" : "start"
    }-${slotIdx}`;

    // 1. If this exact slot player was already registered into Zustand store, use its live store state
    const existingSynInStore = storePlayers.find((p) => p.id === synId);
    if (existingSynInStore && !usedIds.has(existingSynInStore.id)) {
      usedIds.add(existingSynInStore.id);
      usedNames.add(existingSynInStore.name);
      return existingSynInStore;
    }

    // 2. Check if a non-synthetic base store player matches this match, team, and position
    if (!isBench) {
      const existingBase = baseTeamPlayersFromStore.find(
        (p) =>
          p.position === slot.role &&
          !usedIds.has(p.id) &&
          !usedNames.has(p.name)
      );
      if (existingBase) {
        usedIds.add(existingBase.id);
        usedNames.add(existingBase.name);
        return existingBase;
      }
    }

    // 3. Check if API provided real lineup/bench entry for this index
    const apiSourceList = isBench ? apiBench : apiLineup;
    const apiEntry = apiSourceList[slotIdx];

    // Pick a unique fallback name from the side's pool (0..4 for HOME, 5..9 for AWAY)
    const poolSize = Math.min(5, slot.fallbackKoLastNames.length);
    let candidateIdx =
      sidePoolOffset + ((teamSeed + slotIdx) % Math.max(1, poolSize));
    if (candidateIdx >= slot.fallbackKoLastNames.length) {
      candidateIdx = candidateIdx % slot.fallbackKoLastNames.length;
    }

    let koName = apiEntry?.name || slot.fallbackKoLastNames[candidateIdx];
    let enName = apiEntry?.name || slot.fallbackEnLastNames[candidateIdx];

    // Ensure no duplicate name within the same team's roster
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

    const backNumber = apiEntry?.shirtNumber || slot.defaultBackNumber;

    // Auto-map virtual rating between 6.2 and 7.8
    const virtualRating = Number(
      (6.2 + ((teamSeed + slotIdx * 11) % 17) * 0.1).toFixed(1)
    );

    const basePrice = roundToTen(
      slot.basePriceSeed + ((teamSeed + slotIdx * 17) % 12) * 100
    );
    const deltaPct = (((teamSeed + slotIdx * 7) % 13) - 6) * 0.008;
    const currentPrice = clampToPriceLimit(
      basePrice * (1 + deltaPct),
      basePrice
    );

    return {
      id: synId,
      name: koName,
      englishName: enName,
      matchId: match.id,
      teamId: activeTeam.id,
      teamName: activeTeam.name,
      teamShort: activeTeam.shortName,
      teamColor: activeTeam.color,
      position: slot.role,
      backNumber,
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

  // Hard cap at 11 starters and 5 bench players via .slice(0, 11) and .slice(0, 5)
  const starters = STARTING_11_TEMPLATE.slice(0, 11).map((slot, idx) =>
    buildSlotPlayer(slot, idx, false)
  );
  const bench = BENCH_5_TEMPLATE.slice(0, 5).map((slot, idx) =>
    buildSlotPlayer(slot, idx, true)
  );

  const formation =
    activeTeam.formation || (side === "HOME" ? "4-3-3" : "4-2-3-1");

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
  const [previewConfirmed, setPreviewConfirmed] = useState<boolean>(false);

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
    setPreviewConfirmed(false);
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
      return [
        [capped[1]], // Striker (#9)
        [capped[0], capped[3], capped[2]], // LW, CAM, RW
        [capped[4], capped[5]], // Double Pivot
        [capped[6], capped[7], capped[8], capped[9]], // Back 4
        [capped[10]], // GK
      ];
    }

    // Default 4-3-3 (3 FW + 3 MF + 4 DF + 1 GK = 11)
    return [
      [capped[0], capped[1], capped[2]], // 3 FW
      [capped[3], capped[4], capped[5]], // 3 MF
      [capped[6], capped[7], capped[8], capped[9]], // 4 DF
      [capped[10]], // 1 GK
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
                {isUpcoming ? "예상 라인업 프리뷰" : "포메이션 피치 뷰"}
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
                ({match.homeTeam.formation || "4-3-3"})
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
                ({match.awayTeam.formation || "4-2-3-1"})
              </span>
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-4 py-3.5 space-y-4">
          {/* Status Branch: Before Kickoff (TIMED / SCHEDULED) */}
          {isUpcoming && !previewConfirmed ? (
            <div className="rounded-3xl border border-gray-200 bg-white p-6 text-center shadow-sm my-4">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 border border-amber-200">
                <Clock className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-extrabold text-gray-900">
                경기 시작 전입니다.
              </h3>
              <p className="mt-1 text-xs font-medium text-gray-500 leading-relaxed">
                공식 라인업은 킥오프 약 45분 전에 발표됩니다.
                <br />
                아래 버튼을 눌러 양 팀 대표 선발 예상 11명을 피치 뷰로 미리 확인하고 선점 매수할 수 있습니다.
              </p>

              <button
                type="button"
                onClick={() => setPreviewConfirmed(true)}
                className="mt-5 inline-flex items-center justify-center gap-1.5 rounded-2xl bg-[#00985f] px-5 py-3 text-xs font-extrabold text-white shadow-md transition hover:bg-[#007f4f] active:scale-95"
              >
                <Eye className="h-4 w-4" />
                <span>예상 라인업 미리보기</span>
              </button>
            </div>
          ) : (
            <>
              {isUpcoming && (
                <div className="flex items-center justify-between rounded-xl bg-amber-50 border border-amber-200/80 px-3.5 py-2 text-xs text-amber-900">
                  <span className="font-bold">
                    🕒 공식 라인업 발표 전 · 예상 선발 11명 미리보기 모드
                  </span>
                  <span className="font-mono text-[10px] font-bold text-amber-700">
                    사전 거래 가능
                  </span>
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
                        const base = player.basePrice ?? player.initialPrice;
                        const diff = player.currentPrice - base;
                        const pct = ((diff / base) * 100).toFixed(1);
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

                            {/* Player Last Name */}
                            <span className="mt-1 rounded-md bg-black/45 px-1.5 py-0.5 text-[11px] font-extrabold text-white backdrop-blur-[2px]">
                              {extractLastName(player)}
                            </span>

                            {/* Mini Live Price Chip: e.g. 16,400P ▲9.3% */}
                            <div className="mt-0.5 flex items-center gap-0.5 rounded-full bg-white/95 px-2 py-0.5 font-mono text-[9px] font-extrabold shadow-sm">
                              <span className="text-gray-900">
                                {player.currentPrice.toLocaleString()}P
                              </span>
                              <span
                                className={
                                  isUp
                                    ? "text-[#00985f]"
                                    : isDown
                                    ? "text-blue-600"
                                    : "text-gray-500"
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
                      const base = sub.basePrice ?? sub.initialPrice;
                      const diff = sub.currentPrice - base;
                      const pct = ((diff / base) * 100).toFixed(1);
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
                                    ? "text-[#00985f]"
                                    : isDown
                                    ? "text-blue-600"
                                    : "text-gray-400"
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
                              className="rounded-lg bg-[#00985f] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#007f4f]"
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
          )}
        </div>
      </div>
    </div>
  );
}
