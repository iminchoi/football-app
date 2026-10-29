"use client";

import React, { useMemo } from "react";
import {
  X,
  Trophy,
  Sparkles,
  Calendar,
  Award,
  Shield,
} from "lucide-react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Player } from "@/types";
import {
  PLAYER_DETAILED_PROFILES,
  PlayerDetailedProfile,
  CareerSeasonRow,
} from "@/data/dummyData";

interface PlayerDetailModalProps {
  player: Player | null;
  isOpen: boolean;
  onClose: () => void;
}

function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

// Coordinates on the mini pitch graphic (x: 0~100%, y: 0~100% from top)
function getRolePitchCoords(roleLabel: string): { x: number; y: number } {
  switch (roleLabel.toUpperCase()) {
    case "ST":
    case "CF":
      return { x: 50, y: 18 };
    case "LW":
    case "LF":
      return { x: 22, y: 24 };
    case "RW":
    case "RF":
      return { x: 78, y: 24 };
    case "CAM":
      return { x: 50, y: 38 };
    case "LM":
      return { x: 22, y: 46 };
    case "RM":
      return { x: 78, y: 46 };
    case "CM":
      return { x: 50, y: 52 };
    case "CDM":
      return { x: 50, y: 64 };
    case "LB":
      return { x: 20, y: 74 };
    case "RB":
      return { x: 80, y: 74 };
    case "LCB":
      return { x: 37, y: 76 };
    case "RCB":
      return { x: 63, y: 76 };
    case "CB":
      return { x: 50, y: 76 };
    case "GK":
      return { x: 50, y: 90 };
    default:
      return { x: 50, y: 50 };
  }
}

const NATIONALITY_BY_NAME: Record<string, string> = {
  손흥민: "🇰🇷 대한민국",
  김민재: "🇰🇷 대한민국",
  이강인: "🇰🇷 대한민국",
  황희찬: "🇰🇷 대한민국",
  "엘링 홀란드": "🇳🇴 노르웨이",
  홀란드: "🇳🇴 노르웨이",
  "주드 벨링엄": "🏴󠁧󠁢󠁥󠁮󠁧󠁿 잉글랜드",
  벨링엄: "🏴󠁧󠁢󠁥󠁮󠁧󠁿 잉글랜드",
  "해리 케인": "🏴󠁧󠁢󠁥󠁮󠁧󠁿 잉글랜드",
  케인: "🏴󠁧󠁢󠁥󠁮󠁧󠁿 잉글랜드",
  "콜 파머": "🏴󠁧󠁢󠁥󠁮󠁧󠁿 잉글랜드",
  파머: "🏴󠁧󠁢󠁥󠁮󠁧󠁿 잉글랜드",
  "부카요 사카": "🏴󠁧󠁢󠁥󠁮󠁧󠁿 잉글랜드",
  사카: "🏴󠁧󠁢󠁥󠁮󠁧󠁿 잉글랜드",
  "제임스 매디슨": "🏴󠁧󠁢󠁥󠁮󠁧󠁿 잉글랜드",
  매디슨: "🏴󠁧󠁢󠁥󠁮󠁧󠁿 잉글랜드",
  "모하메드 살라": "🇪🇬 이집트",
  살라: "🇪🇬 이집트",
  "케빈 더 브라위너": "🇧🇪 벨기에",
  더브라위너: "🇧🇪 벨기에",
  "버질 판 다이크": "🇳🇱 네덜란드",
  판다이크: "🇳🇱 네덜란드",
  "마르틴 외데고르": "🇳🇴 노르웨이",
  외데고르: "🇳🇴 노르웨이",
  "크리스티안 로메로": "🇦🇷 아르헨티나",
  로메로: "🇦🇷 아르헨티나",
  "브루노 페르난데스": "🇵🇹 포르투갈",
  브루노: "🇵🇹 포르투갈",
  "라민 야말": "🇪🇸 스페인",
  야말: "🇪🇸 스페인",
  음바페: "🇫🇷 프랑스",
  비니시우스: "🇧🇷 브라질",
  로드리: "🇪🇸 스페인",
  발베르데: "🇺🇾 우루과이",
  페드리: "🇪🇸 스페인",
  무시알라: "🇩🇪 독일",
  라우타로: "🇦🇷 아르헨티나",
  블라호비치: "🇷🇸 세르비아",
};

const FALLBACK_NATIONALITIES = [
  "🏴󠁧󠁢󠁥󠁮󠁧󠁿 잉글랜드",
  "🇪🇸 스페인",
  "🇫🇷 프랑스",
  "🇩🇪 독일",
  "🇮🇹 이탈리아",
  "🇧🇷 브라질",
  "🇦🇷 아르헨티나",
  "🇵🇹 포르투갈",
  "🇳🇱 네덜란드",
];

const PREVIOUS_CLUBS_POOL = [
  { name: "도르트문트", short: "BVB", color: "#eab308" },
  { name: "아약스", short: "AJA", color: "#dc2626" },
  { name: "AS 모나코", short: "MON", color: "#e11d48" },
  { name: "SL 벤피카", short: "BEN", color: "#b91c1c" },
  { name: "RB 라이프치히", short: "RBL", color: "#1d4ed8" },
  { name: "아탈란타 BC", short: "ATA", color: "#1e3a8a" },
  { name: "스포르팅 CP", short: "SCP", color: "#047857" },
];

function buildDetailedProfileForPlayer(player: Player): PlayerDetailedProfile {
  const preset = PLAYER_DETAILED_PROFILES[player.id];
  if (preset) {
    // Sync live match goals/assists/rating into preset's current season summary
    const liveRating = Number(
      ((preset.seasonSummary.avgRating * 3 + (player.stats?.rating ?? 7.5)) / 4).toFixed(2)
    );
    return {
      ...preset,
      seasonSummary: {
        ...preset.seasonSummary,
        goals: Math.max(preset.seasonSummary.goals, player.stats?.goals ?? 0),
        assists: Math.max(
          preset.seasonSummary.assists,
          player.stats?.assists ?? 0
        ),
        avgRating: liveRating,
      },
    };
  }

  const seed = hashSeed(`${player.id}-${player.name}`);
  const pos = player.position;
  const ratingBase = player.stats?.rating ?? 7.3;

  // Height, Age, Foot, Nationality, Contract
  const heightCm =
    pos === "GK"
      ? 188 + (seed % 9)
      : pos === "DF"
      ? 182 + (seed % 11)
      : pos === "MF"
      ? 175 + (seed % 11)
      : 176 + (seed % 13);

  const age = 21 + (seed % 11);
  const birthYear = 2026 - age;
  const birthMonth = String(1 + (seed % 12)).padStart(2, "0");
  const birthDay = String(1 + ((seed >> 3) % 28)).padStart(2, "0");

  const footOptions = ["오른발", "오른발", "왼발", "양발"];
  const preferredFoot = footOptions[seed % footOptions.length];

  const nationality =
    NATIONALITY_BY_NAME[player.name] ||
    FALLBACK_NATIONALITIES[seed % FALLBACK_NATIONALITIES.length];

  const contractYear = 2027 + (seed % 4);

  // Primary & Secondary Role Labels for Mini Pitch
  let primaryRoleLabel = "CM";
  let secondaryRoleLabels: string[] = ["CAM"];

  if (pos === "FW") {
    const fwRoles = [
      { primary: "ST", secondary: ["LW", "RW"] },
      { primary: "LW", secondary: ["ST", "LM"] },
      { primary: "RW", secondary: ["ST", "CAM"] },
    ];
    const picked = fwRoles[seed % fwRoles.length];
    primaryRoleLabel = picked.primary;
    secondaryRoleLabels = picked.secondary;
  } else if (pos === "MF") {
    const mfRoles = [
      { primary: "CAM", secondary: ["CM", "RW"] },
      { primary: "CM", secondary: ["CDM", "CAM"] },
      { primary: "CDM", secondary: ["CM"] },
    ];
    const picked = mfRoles[seed % mfRoles.length];
    primaryRoleLabel = picked.primary;
    secondaryRoleLabels = picked.secondary;
  } else if (pos === "DF") {
    const dfRoles = [
      { primary: "CB", secondary: ["LCB", "RCB"] },
      { primary: "RB", secondary: ["RM"] },
      { primary: "LB", secondary: ["LM"] },
    ];
    const picked = dfRoles[seed % dfRoles.length];
    primaryRoleLabel = picked.primary;
    secondaryRoleLabels = picked.secondary;
  } else {
    primaryRoleLabel = "GK";
    secondaryRoleLabels = [];
  }

  // Radar Chart Percentiles (0 ~ 100%)
  const radarStats =
    pos === "FW"
      ? {
          shotAttempts: 82 + (seed % 17),
          touches: 72 + (seed % 20),
          chancesCreated: 74 + (seed % 22),
          aerialDuels: 55 + (seed % 35),
          defensiveActions: 34 + (seed % 26),
          goals: 85 + (seed % 14),
        }
      : pos === "MF"
      ? {
          shotAttempts: 66 + (seed % 24),
          touches: 86 + (seed % 13),
          chancesCreated: 84 + (seed % 15),
          aerialDuels: 52 + (seed % 28),
          defensiveActions: 68 + (seed % 24),
          goals: 68 + (seed % 24),
        }
      : pos === "DF"
      ? {
          shotAttempts: 32 + (seed % 25),
          touches: 80 + (seed % 16),
          chancesCreated: 54 + (seed % 24),
          aerialDuels: 84 + (seed % 15),
          defensiveActions: 88 + (seed % 11),
          goals: 38 + (seed % 25),
        }
      : {
          shotAttempts: 15 + (seed % 15),
          touches: 68 + (seed % 20),
          chancesCreated: 42 + (seed % 25),
          aerialDuels: 86 + (seed % 12),
          defensiveActions: 90 + (seed % 9),
          goals: 12 + (seed % 10),
        };

  // Current Season Summary (8-grid)
  const starts = 21 + (seed % 8);
  const appearances = starts + (seed % 4);
  const minutesPlayed = starts * 84 + (seed % 90);
  const seasonGoals =
    pos === "FW"
      ? 11 + (seed % 12) + (player.stats?.goals ?? 0)
      : pos === "MF"
      ? 5 + (seed % 8) + (player.stats?.goals ?? 0)
      : pos === "DF"
      ? 1 + (seed % 3) + (player.stats?.goals ?? 0)
      : 0;
  const seasonAssists =
    pos === "MF"
      ? 7 + (seed % 8) + (player.stats?.assists ?? 0)
      : pos === "FW"
      ? 4 + (seed % 7) + (player.stats?.assists ?? 0)
      : pos === "DF"
      ? 1 + (seed % 4)
      : seed % 2;

  const avgRating = Number(
    Math.min(8.65, Math.max(6.85, ratingBase + ((seed % 7) - 3) * 0.06)).toFixed(
      2
    )
  );
  const yellowCards =
    pos === "DF" ? 3 + (seed % 4) : pos === "MF" ? 2 + (seed % 4) : seed % 3;
  const redCards = seed % 11 === 0 ? 1 : 0;

  // 5-Season Career History Table
  const prevClub = PREVIOUS_CLUBS_POOL[seed % PREVIOUS_CLUBS_POOL.length];
  const seasons = ["2026/2027", "2025/2026", "2024/2025", "2023/2024", "2022/2023"];

  const careerHistory: CareerSeasonRow[] = seasons.map((seasonLabel, idx) => {
    if (idx === 0) {
      return {
        season: seasonLabel,
        clubName: player.teamName,
        clubShort: player.teamShort,
        clubColor: player.teamColor,
        matches: appearances,
        goals: seasonGoals,
        assists: seasonAssists,
        rating: avgRating,
      };
    }

    const usePrevClub = idx >= 3;
    const mCount = 26 + ((seed + idx * 5) % 11);
    const gCount =
      pos === "FW"
        ? 10 + ((seed + idx * 7) % 14)
        : pos === "MF"
        ? 4 + ((seed + idx * 5) % 8)
        : pos === "DF"
        ? (seed + idx) % 4
        : 0;
    const aCount =
      pos === "MF"
        ? 6 + ((seed + idx * 3) % 9)
        : pos === "FW"
        ? 3 + ((seed + idx * 4) % 8)
        : pos === "DF"
        ? (seed + idx) % 4
        : 0;
    const rVal = Number(
      Math.max(
        6.72,
        Math.min(8.45, avgRating - idx * 0.08 + (((seed + idx) % 5) - 2) * 0.07)
      ).toFixed(2)
    );

    return {
      season: seasonLabel,
      clubName: usePrevClub ? prevClub.name : player.teamName,
      clubShort: usePrevClub ? prevClub.short : player.teamShort,
      clubColor: usePrevClub ? prevClub.color : player.teamColor,
      matches: mCount,
      goals: gCount,
      assists: aCount,
      rating: rVal,
    };
  });

  return {
    height: `${heightCm} cm`,
    ageText: `${age}세 (${birthYear}.${birthMonth}.${birthDay})`,
    preferredFoot,
    nationality,
    contractUntil: `${contractYear}년 6월`,
    primaryRoleLabel,
    secondaryRoleLabels,
    radarStats,
    seasonSummary: {
      goals: seasonGoals,
      assists: seasonAssists,
      starts,
      appearances,
      minutesPlayed,
      avgRating,
      yellowCards,
      redCards,
    },
    careerHistory,
  };
}

export default function PlayerDetailModal({
  player,
  isOpen,
  onClose,
}: PlayerDetailModalProps) {
  const profile = useMemo(
    () => (player ? buildDetailedProfileForPlayer(player) : null),
    [player]
  );

  if (!isOpen || !player || !profile) return null;

  const radarData = [
    {
      subject: "슛 시도",
      value: profile.radarStats.shotAttempts,
      fullMark: 100,
    },
    {
      subject: "터치",
      value: profile.radarStats.touches,
      fullMark: 100,
    },
    {
      subject: "기회 창출",
      value: profile.radarStats.chancesCreated,
      fullMark: 100,
    },
    {
      subject: "공중 볼 경합",
      value: profile.radarStats.aerialDuels,
      fullMark: 100,
    },
    {
      subject: "수비적 행동",
      value: profile.radarStats.defensiveActions,
      fullMark: 100,
    },
    {
      subject: "득점",
      value: profile.radarStats.goals,
      fullMark: 100,
    },
  ];

  const primaryCoords = getRolePitchCoords(profile.primaryRoleLabel);
  const secondaryCoordsList = profile.secondaryRoleLabels.map((role) => ({
    role,
    ...getRolePitchCoords(role),
  }));

  const careerTotals = profile.careerHistory.reduce(
    (acc, row) => ({
      matches: acc.matches + row.matches,
      goals: acc.goals + row.goals,
      assists: acc.assists + row.assists,
    }),
    { matches: 0, goals: 0, assists: 0 }
  );

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55 backdrop-blur-[2px] animate-fade-in"
      onClick={onClose}
    >
      {/* Fullscreen Bottom Sheet Container */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 flex h-[93vh] max-h-[95vh] w-full max-w-[480px] flex-col overflow-hidden rounded-t-3xl bg-[#f8f9fa] shadow-2xl"
      >
        {/* Top Grab Handle */}
        <div className="flex shrink-0 justify-center bg-white pt-2.5 pb-1">
          <div className="h-1.5 w-11 rounded-full bg-gray-300" />
        </div>

        {/* Sticky Top Navigation Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200/80 bg-white px-5 pb-3 pt-1">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-extrabold text-[#00985f]">
              FotMob 선수 리포트
            </span>
            <h2 className="text-sm font-extrabold text-gray-900">
              {player.name} 상세 프로필 & 시즌 통계
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-gray-100 p-2 text-gray-500 transition hover:bg-gray-200 hover:text-gray-900 active:scale-95"
            aria-label="선수 상세 모달 닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 pb-[calc(2rem+env(safe-area-inset-bottom))] space-y-4">
          {/* 1) 상단 바이오 카드 (Hero Card) */}
          <div className="overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-br from-[#f0f7ff] via-white to-[#f0fdf4] p-4 shadow-[0_1px_4px_rgba(0,0,0,0.03)]">
            <div className="flex items-start justify-between gap-3">
              {/* Left: Player Avatar + Name + Team Badge */}
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative shrink-0">
                  <div
                    style={{ backgroundColor: player.teamColor }}
                    className="flex h-16 w-16 flex-col items-center justify-center rounded-2xl border-2 border-white text-white shadow-md"
                  >
                    <span className="font-mono text-[10px] font-bold opacity-85">
                      {player.teamShort}
                    </span>
                    <span className="font-mono text-xl font-black leading-tight">
                      #{player.backNumber}
                    </span>
                  </div>
                  <span className="absolute -bottom-1 -right-1 rounded-md bg-gray-900 px-1.5 py-0.5 font-mono text-[10px] font-extrabold text-white shadow">
                    {profile.primaryRoleLabel}
                  </span>
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      style={{ backgroundColor: player.teamColor }}
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                    />
                    <span className="truncate text-xs font-bold text-gray-600">
                      {player.teamName}
                    </span>
                  </div>
                  <h3 className="mt-0.5 truncate text-xl font-black tracking-tight text-gray-900">
                    {player.name}
                  </h3>
                  <p className="truncate text-xs font-medium text-gray-400">
                    {player.englishName}
                  </p>
                </div>
              </div>

              {/* Right: Mini Pitch Graphic with Primary & Secondary Position Markers */}
              <div className="shrink-0 flex flex-col items-center">
                <div
                  className="relative h-24 w-16 overflow-hidden rounded-xl border border-emerald-700/30 shadow-inner"
                  style={{
                    background:
                      "repeating-linear-gradient(to bottom, #1e824c 0px, #1e824c 12px, #259659 12px, #259659 24px)",
                  }}
                >
                  {/* Mini Pitch Lines */}
                  <div className="pointer-events-none absolute inset-1 rounded border border-white/40">
                    <div className="mx-auto h-3 w-7 border-x border-b border-white/40" />
                    <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 border-t border-white/40" />
                    <div className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/40" />
                    <div className="absolute bottom-0 left-1/2 h-3 w-7 -translate-x-1/2 border-x border-t border-white/40" />
                  </div>

                  {/* Secondary Role Dots */}
                  {secondaryCoordsList.map((sec) => (
                    <div
                      key={sec.role}
                      style={{ left: `${sec.x}%`, top: `${sec.y}%` }}
                      className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80 px-1 py-0.2 font-mono text-[7px] font-bold text-gray-800 shadow-sm"
                    >
                      {sec.role}
                    </div>
                  ))}

                  {/* Primary Position Marker Badge */}
                  <div
                    style={{
                      left: `${primaryCoords.x}%`,
                      top: `${primaryCoords.y}%`,
                    }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 rounded-md bg-[#00985f] border border-white px-1.5 py-0.5 font-mono text-[9px] font-black text-white shadow-md"
                  >
                    {profile.primaryRoleLabel}
                  </div>
                </div>
                <span className="mt-1 text-[10px] font-bold text-gray-500">
                  주 포지션: {profile.primaryRoleLabel}
                </span>
              </div>
            </div>

            {/* Bio 6-Item Key Profile Grid */}
            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-blue-100/80 pt-3">
              <div className="rounded-xl bg-white/90 border border-gray-100 px-2.5 py-2">
                <span className="block text-[10px] font-semibold text-gray-400">
                  신장 (키)
                </span>
                <strong className="mt-0.5 block font-mono text-xs font-extrabold text-gray-900">
                  {profile.height}
                </strong>
              </div>

              <div className="rounded-xl bg-white/90 border border-gray-100 px-2.5 py-2">
                <span className="block text-[10px] font-semibold text-gray-400">
                  등번호
                </span>
                <strong className="mt-0.5 block font-mono text-xs font-extrabold text-gray-900">
                  #{player.backNumber} ({player.position})
                </strong>
              </div>

              <div className="rounded-xl bg-white/90 border border-gray-100 px-2.5 py-2">
                <span className="block text-[10px] font-semibold text-gray-400">
                  주발
                </span>
                <strong className="mt-0.5 block text-xs font-extrabold text-gray-900">
                  🦶 {profile.preferredFoot}
                </strong>
              </div>

              <div className="rounded-xl bg-white/90 border border-gray-100 px-2.5 py-2">
                <span className="block text-[10px] font-semibold text-gray-400">
                  나이 / 생년월일
                </span>
                <strong className="mt-0.5 block truncate font-mono text-[11px] font-extrabold text-gray-900">
                  {profile.ageText}
                </strong>
              </div>

              <div className="rounded-xl bg-white/90 border border-gray-100 px-2.5 py-2">
                <span className="block text-[10px] font-semibold text-gray-400">
                  국적
                </span>
                <strong className="mt-0.5 block truncate text-xs font-extrabold text-gray-900">
                  {profile.nationality}
                </strong>
              </div>

              <div className="rounded-xl bg-white/90 border border-gray-100 px-2.5 py-2">
                <span className="block text-[10px] font-semibold text-gray-400">
                  계약 만료
                </span>
                <strong className="mt-0.5 block font-mono text-xs font-extrabold text-gray-900">
                  {profile.contractUntil}
                </strong>
              </div>
            </div>
          </div>

          {/* 2) 선수 특성 육각형 레이더 차트 (Radar / Hexagon Chart) */}
          <div className="rounded-2xl border border-gray-200/90 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-[#00985f]" />
                <h3 className="text-xs font-extrabold text-gray-900">
                  선수 특성 육각형 레이더 (동일 포지션 백분위)
                </h3>
              </div>
              <span className="text-[10px] font-medium text-gray-400">
                유럽 5대 리그 기준 (0~100%)
              </span>
            </div>

            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart
                  cx="50%"
                  cy="50%"
                  outerRadius="74%"
                  data={radarData}
                >
                  <PolarGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                  <PolarAngleAxis
                    dataKey="subject"
                    tick={{
                      fill: "#334155",
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  />
                  <PolarRadiusAxis
                    angle={30}
                    domain={[0, 100]}
                    tick={{ fill: "#94a3b8", fontSize: 9 }}
                    tickCount={5}
                  />
                  <Radar
                    name="백분위(%)"
                    dataKey="value"
                    stroke="#00985f"
                    strokeWidth={2.2}
                    fill="#10b981"
                    fillOpacity={0.4}
                  />
                  <Tooltip
                    formatter={(val: unknown) => [`상위 ${100 - Number(val)}% (${val}점)`, "백분위"]}
                    contentStyle={{
                      borderRadius: "12px",
                      border: "1px solid #e2e8f0",
                      fontSize: "11px",
                      fontWeight: 700,
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            {/* 6 Radar Metric Badges */}
            <div className="mt-1 grid grid-cols-3 gap-1.5 border-t border-gray-100 pt-2.5">
              {radarData.map((item) => (
                <div
                  key={item.subject}
                  className="flex items-center justify-between rounded-lg bg-[#f8f9fa] px-2.5 py-1.5 text-[11px]"
                >
                  <span className="font-medium text-gray-600">
                    {item.subject}
                  </span>
                  <span
                    className={`font-mono font-extrabold ${
                      item.value >= 75
                        ? "text-[#00985f]"
                        : item.value >= 50
                        ? "text-amber-600"
                        : "text-gray-500"
                    }`}
                  >
                    {item.value}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 3) 현재 시즌 리그 성적 요약 그리드 (Season Stats - 8-Grid) */}
          <div className="rounded-2xl border border-gray-200/90 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5">
                <Award className="h-4 w-4 text-[#00985f]" />
                <h3 className="text-xs font-extrabold text-gray-900">
                  2026/2027 정규 시즌 성적 요약
                </h3>
              </div>
              <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-600">
                {player.teamName}
              </span>
            </div>

            {/* 8-Item Grid (2 rows x 4 cols) */}
            <div className="grid grid-cols-4 gap-2 text-center">
              {/* 1. 득점 */}
              <div className="rounded-xl bg-[#f8f9fa] border border-gray-100 p-2.5">
                <span className="block text-[10px] font-semibold text-gray-400">
                  득점
                </span>
                <strong className="mt-1 block font-mono text-base font-black text-gray-900">
                  {profile.seasonSummary.goals}
                </strong>
              </div>

              {/* 2. 어시스트 */}
              <div className="rounded-xl bg-[#f8f9fa] border border-gray-100 p-2.5">
                <span className="block text-[10px] font-semibold text-gray-400">
                  어시스트
                </span>
                <strong className="mt-1 block font-mono text-base font-black text-gray-900">
                  {profile.seasonSummary.assists}
                </strong>
              </div>

              {/* 3. 선발 */}
              <div className="rounded-xl bg-[#f8f9fa] border border-gray-100 p-2.5">
                <span className="block text-[10px] font-semibold text-gray-400">
                  선발 출전
                </span>
                <strong className="mt-1 block font-mono text-base font-black text-gray-900">
                  {profile.seasonSummary.starts}
                </strong>
              </div>

              {/* 4. 경기 수 */}
              <div className="rounded-xl bg-[#f8f9fa] border border-gray-100 p-2.5">
                <span className="block text-[10px] font-semibold text-gray-400">
                  총 경기 수
                </span>
                <strong className="mt-1 block font-mono text-base font-black text-gray-900">
                  {profile.seasonSummary.appearances}
                </strong>
              </div>

              {/* 5. 출전 시간 */}
              <div className="rounded-xl bg-[#f8f9fa] border border-gray-100 p-2.5">
                <span className="block text-[10px] font-semibold text-gray-400">
                  출전 시간
                </span>
                <strong className="mt-1 block font-mono text-xs font-black text-gray-900">
                  {profile.seasonSummary.minutesPlayed.toLocaleString()}&apos;
                </strong>
              </div>

              {/* 6. 시즌 평균 평점 (FotMob Green Badge) */}
              <div className="rounded-xl bg-[#f8f9fa] border border-gray-100 p-2.5 flex flex-col items-center justify-center">
                <span className="block text-[10px] font-semibold text-gray-400">
                  시즌 평점
                </span>
                <span className="mt-1 inline-flex items-center gap-0.5 rounded bg-emerald-500 px-2 py-0.5 font-mono text-xs font-bold text-white shadow-sm">
                  ★ {profile.seasonSummary.avgRating.toFixed(2)}
                </span>
              </div>

              {/* 7. 경고 */}
              <div className="rounded-xl bg-[#f8f9fa] border border-gray-100 p-2.5">
                <span className="block text-[10px] font-semibold text-gray-400">
                  경고 (옐로)
                </span>
                <strong className="mt-1 inline-flex items-center justify-center gap-1 font-mono text-sm font-black text-amber-600">
                  <span className="inline-block h-3 w-2 rounded-[2px] bg-amber-400" />
                  {profile.seasonSummary.yellowCards}
                </strong>
              </div>

              {/* 8. 퇴장 */}
              <div className="rounded-xl bg-[#f8f9fa] border border-gray-100 p-2.5">
                <span className="block text-[10px] font-semibold text-gray-400">
                  퇴장 (레드)
                </span>
                <strong className="mt-1 inline-flex items-center justify-center gap-1 font-mono text-sm font-black text-rose-600">
                  <span className="inline-block h-3 w-2 rounded-[2px] bg-rose-500" />
                  {profile.seasonSummary.redCards}
                </strong>
              </div>
            </div>
          </div>

          {/* 4) 통산/시즌별 경력 테이블 (Career Table) */}
          <div className="rounded-2xl border border-gray-200/90 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-[#00985f]" />
                <h3 className="text-xs font-extrabold text-gray-900">
                  통산 / 시즌별 커리어 기록
                </h3>
              </div>
              <span className="text-[10px] font-medium text-gray-400">
                최근 5시즌 정규 리그
              </span>
            </div>

            <div className="overflow-hidden rounded-xl border border-gray-100">
              {/* Table Header */}
              <div className="grid grid-cols-[1.15fr_1.6fr_0.7fr_0.7fr_0.7fr_0.9fr] items-center bg-[#f8f9fa] px-3 py-2 text-[10px] font-extrabold text-gray-500 border-b border-gray-100">
                <span>시즌</span>
                <span>소속 클럽</span>
                <span className="text-center">경기</span>
                <span className="text-center">골 ⚽</span>
                <span className="text-center">도움 👟</span>
                <span className="text-right">평점 ★</span>
              </div>

              {/* Table Rows */}
              <div className="divide-y divide-gray-100 text-xs">
                {profile.careerHistory.map((row) => {
                  const isHighRating = row.rating >= 7.0;
                  return (
                    <div
                      key={row.season}
                      className="grid grid-cols-[1.15fr_1.6fr_0.7fr_0.7fr_0.7fr_0.9fr] items-center px-3 py-2.5 hover:bg-gray-50/80 transition"
                    >
                      <span className="font-mono text-[11px] font-bold text-gray-700">
                        {row.season}
                      </span>

                      <div className="flex items-center gap-1.5 min-w-0 pr-1">
                        <span
                          style={{ backgroundColor: row.clubColor }}
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[8px] font-black text-white shadow-sm"
                        >
                          {row.clubShort}
                        </span>
                        <span className="truncate text-xs font-bold text-gray-900">
                          {row.clubName}
                        </span>
                      </div>

                      <span className="text-center font-mono text-xs font-semibold text-gray-600">
                        {row.matches}
                      </span>

                      <span className="text-center font-mono text-xs font-extrabold text-gray-900">
                        {row.goals}
                      </span>

                      <span className="text-center font-mono text-xs font-bold text-gray-700">
                        {row.assists}
                      </span>

                      <div className="flex justify-end">
                        <span
                          className={
                            isHighRating
                              ? "bg-emerald-500 text-white px-2 py-0.5 rounded font-bold text-xs font-mono"
                              : "bg-amber-500 text-white px-2 py-0.5 rounded font-bold text-xs font-mono"
                          }
                        >
                          {row.rating.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {/* Career Totals Summary Row */}
                <div className="grid grid-cols-[1.15fr_1.6fr_0.7fr_0.7fr_0.7fr_0.9fr] items-center bg-emerald-50/50 px-3 py-2.5 text-xs font-extrabold text-gray-900">
                  <span className="text-[11px] text-[#00985f]">통산 합계</span>
                  <span className="text-[11px] text-gray-500 flex items-center gap-1">
                    <Shield className="h-3 w-3 text-[#00985f]" />
                    최근 5시즌
                  </span>
                  <span className="text-center font-mono">
                    {careerTotals.matches}
                  </span>
                  <span className="text-center font-mono text-[#00985f]">
                    {careerTotals.goals}
                  </span>
                  <span className="text-center font-mono text-[#00985f]">
                    {careerTotals.assists}
                  </span>
                  <div className="flex justify-end">
                    <span className="bg-emerald-500 text-white px-2 py-0.5 rounded font-bold text-xs font-mono">
                      {profile.seasonSummary.avgRating.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Return to Trade Sheet CTA Button */}
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-2xl bg-gray-900 py-3.5 text-xs font-extrabold text-white shadow-md transition hover:bg-gray-800 active:scale-95 flex items-center justify-center gap-1.5"
          >
            <Trophy className="h-3.5 w-3.5 text-emerald-400" />
            <span>매수/매도 주문 화면으로 돌아가기</span>
          </button>
        </div>
      </div>
    </div>
  );
}
