"use client";

import React, { useMemo } from "react";
import { Player } from "@/types";

export type SkinToneKey =
  | "light"
  | "ivory"
  | "warmBeige"
  | "olive"
  | "mediumBrown"
  | "darkBrown";

export type HairStyleKey =
  | "twoBlock"
  | "buzz"
  | "fade"
  | "wavePerm"
  | "dreads"
  | "ponytail"
  | "parted"
  | "slickBack"
  | "spiky"
  | "curtain";

export type HairColorKey =
  | "black"
  | "darkBrown"
  | "chestnut"
  | "blonde"
  | "platinum";

export type FacialHairKey = "none" | "stubble" | "beard" | "goatee" | "mustache";

export type AccessoryKey = "none" | "headband";

export interface AvatarAppearance {
  skinTone: SkinToneKey;
  hairStyle: HairStyleKey;
  hairColor: HairColorKey;
  facialHair: FacialHairKey;
  accessory?: AccessoryKey;
}

const SKIN_PALETTE: Record<SkinToneKey, { fill: string; shadow: string }> = {
  light: { fill: "#FCE4D2", shadow: "#E8C3A9" },
  ivory: { fill: "#F5D2B4", shadow: "#DDB08C" },
  warmBeige: { fill: "#E5B68F", shadow: "#C89268" },
  olive: { fill: "#D09A6E", shadow: "#B07A4F" },
  mediumBrown: { fill: "#A66E46", shadow: "#85522F" },
  darkBrown: { fill: "#75472B", shadow: "#57311A" },
};

const HAIR_PALETTE: Record<HairColorKey, string> = {
  black: "#1E242B",
  darkBrown: "#3D2A20",
  chestnut: "#6E4730",
  blonde: "#DFBA63",
  platinum: "#D5D2CA",
};

const SKIN_KEYS: SkinToneKey[] = [
  "light",
  "ivory",
  "warmBeige",
  "olive",
  "mediumBrown",
  "darkBrown",
];

const HAIR_STYLE_KEYS: HairStyleKey[] = [
  "twoBlock",
  "buzz",
  "fade",
  "wavePerm",
  "dreads",
  "ponytail",
  "parted",
  "slickBack",
  "spiky",
  "curtain",
];

const HAIR_COLOR_KEYS: HairColorKey[] = [
  "black",
  "darkBrown",
  "chestnut",
  "blonde",
  "platinum",
];

const FACIAL_HAIR_KEYS: FacialHairKey[] = [
  "none",
  "none",
  "none",
  "stubble",
  "beard",
  "goatee",
  "mustache",
];

/**
 * Explicit real-life visual presets for headline star players.
 * Keys match player.id or normalized lowercase substrings of player.name / englishName.
 */
const STAR_PRESETS_BY_ID: Record<string, AvatarAppearance> = {
  "p-son": {
    skinTone: "ivory",
    hairStyle: "twoBlock",
    hairColor: "black",
    facialHair: "none",
  },
  "p-lee": {
    skinTone: "ivory",
    hairStyle: "curtain",
    hairColor: "black",
    facialHair: "none",
  },
  "p-kim": {
    skinTone: "warmBeige",
    hairStyle: "spiky",
    hairColor: "black",
    facialHair: "none",
  },
  "p-haaland": {
    skinTone: "light",
    hairStyle: "ponytail",
    hairColor: "blonde",
    facialHair: "none",
    accessory: "headband",
  },
  "p-mbappe": {
    skinTone: "mediumBrown",
    hairStyle: "buzz",
    hairColor: "black",
    facialHair: "stubble",
  },
  "p-bellingham": {
    skinTone: "mediumBrown",
    hairStyle: "fade",
    hairColor: "black",
    facialHair: "none",
  },
  "p-valverde": {
    skinTone: "warmBeige",
    hairStyle: "parted",
    hairColor: "darkBrown",
    facialHair: "stubble",
  },
  "p-salah": {
    skinTone: "olive",
    hairStyle: "wavePerm",
    hairColor: "black",
    facialHair: "beard",
  },
  "p-saka": {
    skinTone: "darkBrown",
    hairStyle: "fade",
    hairColor: "black",
    facialHair: "none",
  },
  "p-yamal": {
    skinTone: "mediumBrown",
    hairStyle: "dreads",
    hairColor: "black",
    facialHair: "none",
  },
  "p-kane": {
    skinTone: "light",
    hairStyle: "parted",
    hairColor: "chestnut",
    facialHair: "stubble",
  },
  "p-vandijk": {
    skinTone: "mediumBrown",
    hairStyle: "ponytail",
    hairColor: "black",
    facialHair: "beard",
  },
  "p-debruyne": {
    skinTone: "light",
    hairStyle: "parted",
    hairColor: "blonde",
    facialHair: "none",
  },
  "p-palmer": {
    skinTone: "light",
    hairStyle: "twoBlock",
    hairColor: "chestnut",
    facialHair: "none",
  },
  "p-foden": {
    skinTone: "light",
    hairStyle: "spiky",
    hairColor: "darkBrown",
    facialHair: "none",
  },
  "p-odegaard": {
    skinTone: "light",
    hairStyle: "slickBack",
    hairColor: "blonde",
    facialHair: "stubble",
  },
  "p-hwang": {
    skinTone: "ivory",
    hairStyle: "spiky",
    hairColor: "black",
    facialHair: "none",
  },
  "p-kubo": {
    skinTone: "ivory",
    hairStyle: "curtain",
    hairColor: "black",
    facialHair: "none",
  },
  "p-mitoma": {
    skinTone: "ivory",
    hairStyle: "twoBlock",
    hairColor: "black",
    facialHair: "none",
  },
  "p-rodri": {
    skinTone: "warmBeige",
    hairStyle: "slickBack",
    hairColor: "darkBrown",
    facialHair: "stubble",
  },
  "p-bruno": {
    skinTone: "olive",
    hairStyle: "parted",
    hairColor: "darkBrown",
    facialHair: "beard",
  },
  "p-jo-hyeonwoo": {
    skinTone: "ivory",
    hairStyle: "spiky",
    hairColor: "black",
    facialHair: "none",
  },
};

const STAR_PRESETS_BY_KEYWORD: { match: string[]; appearance: AvatarAppearance }[] = [
  {
    match: ["손흥민", "heung-min", "son"],
    appearance: STAR_PRESETS_BY_ID["p-son"],
  },
  {
    match: ["이강인", "kang-in"],
    appearance: STAR_PRESETS_BY_ID["p-lee"],
  },
  {
    match: ["김민재", "min-jae"],
    appearance: STAR_PRESETS_BY_ID["p-kim"],
  },
  {
    match: ["홀란드", "haaland"],
    appearance: STAR_PRESETS_BY_ID["p-haaland"],
  },
  {
    match: ["음바페", "mbappe", "mbappé"],
    appearance: STAR_PRESETS_BY_ID["p-mbappe"],
  },
  {
    match: ["벨링엄", "bellingham"],
    appearance: STAR_PRESETS_BY_ID["p-bellingham"],
  },
  {
    match: ["비니시우스", "vinicius", "vinícius"],
    appearance: {
      skinTone: "darkBrown",
      hairStyle: "dreads",
      hairColor: "black",
      facialHair: "stubble",
    },
  },
  {
    match: ["페드리", "pedri"],
    appearance: {
      skinTone: "olive",
      hairStyle: "wavePerm",
      hairColor: "darkBrown",
      facialHair: "none",
    },
  },
  {
    match: ["발베르데", "valverde"],
    appearance: STAR_PRESETS_BY_ID["p-valverde"],
  },
  {
    match: ["래시포드", "rashford"],
    appearance: {
      skinTone: "darkBrown",
      hairStyle: "fade",
      hairColor: "black",
      facialHair: "goatee",
    },
  },
  {
    match: ["하베르츠", "havertz"],
    appearance: {
      skinTone: "light",
      hairStyle: "parted",
      hairColor: "chestnut",
      facialHair: "none",
    },
  },
  {
    match: ["에데르송", "ederson"],
    appearance: {
      skinTone: "olive",
      hairStyle: "buzz",
      hairColor: "black",
      facialHair: "beard",
    },
  },
];

function fnv1aHash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function resolveAvatarAppearance(
  player: Pick<Player, "id" | "name" | "englishName">
): AvatarAppearance {
  if (STAR_PRESETS_BY_ID[player.id]) {
    return STAR_PRESETS_BY_ID[player.id];
  }

  const combined = `${player.name ?? ""} ${player.englishName ?? ""}`
    .trim()
    .toLowerCase();
  for (const entry of STAR_PRESETS_BY_KEYWORD) {
    if (entry.match.some((kw) => combined.includes(kw))) {
      return entry.appearance;
    }
  }

  // Deterministic multi-salted hash from player id + name
  const seed = player.id || player.name || "pitchtrade-player";
  const h1 = fnv1aHash(`${seed}:skin`);
  const h2 = fnv1aHash(`${seed}:hairStyle`);
  const h3 = fnv1aHash(`${seed}:hairColor`);
  const h4 = fnv1aHash(`${seed}:facial`);
  const h5 = fnv1aHash(`${seed}:acc`);

  const skinTone = SKIN_KEYS[h1 % SKIN_KEYS.length];
  const hairStyle = HAIR_STYLE_KEYS[h2 % HAIR_STYLE_KEYS.length];
  // Keep darker skin tones biased toward dark hair for natural realism
  const hairColor =
    skinTone === "darkBrown" || skinTone === "mediumBrown"
      ? h3 % 4 === 0
        ? "darkBrown"
        : "black"
      : HAIR_COLOR_KEYS[h3 % HAIR_COLOR_KEYS.length];
  const facialHair = FACIAL_HAIR_KEYS[h4 % FACIAL_HAIR_KEYS.length];
  const accessory: AccessoryKey = h5 % 11 === 0 ? "headband" : "none";

  return { skinTone, hairStyle, hairColor, facialHair, accessory };
}

function renderHairBack(style: HairStyleKey, color: string) {
  if (style === "ponytail") {
    return (
      <g>
        <ellipse cx="44" cy="24" rx="6.5" ry="9" fill={color} transform="rotate(16 44 24)" />
        <rect x="40" y="18" width="4" height="5" rx="2" fill="#FFFFFF" opacity={0.85} />
      </g>
    );
  }
  if (style === "dreads") {
    return (
      <g fill={color}>
        <rect x="15" y="21" width="4.2" height="15" rx="2.1" />
        <rect x="44.8" y="21" width="4.2" height="15" rx="2.1" />
      </g>
    );
  }
  return null;
}

function renderHairFront(style: HairStyleKey, color: string) {
  switch (style) {
    case "twoBlock":
      return (
        <path
          d="M17 26 C17 15 23 11 32 11 C41 11 47 15 47 26 C44 22 40 20 35 20 C29 20 24 23 17 26 Z"
          fill={color}
        />
      );
    case "buzz":
      return (
        <path
          d="M18.5 25 C19 16 24 12.5 32 12.5 C40 12.5 45 16 45.5 25 C42 21.5 38 19.5 32 19.5 C26 19.5 22 21.5 18.5 25 Z"
          fill={color}
        />
      );
    case "fade":
      return (
        <path
          d="M19.5 23.5 C19.5 15 23.5 12 32 12 C40.5 12 44.5 15 44.5 23.5 L42.5 20.5 C39.5 19 36 18.5 32 18.5 C28 18.5 24.5 19 21.5 20.5 Z"
          fill={color}
        />
      );
    case "wavePerm":
      return (
        <g fill={color}>
          <circle cx="23" cy="17" r="6.2" />
          <circle cx="32" cy="14.5" r="7" />
          <circle cx="41" cy="17" r="6.2" />
          <circle cx="19" cy="22" r="4.2" />
          <circle cx="45" cy="22" r="4.2" />
        </g>
      );
    case "dreads":
      return (
        <g fill={color}>
          <ellipse cx="32" cy="15.5" rx="14.5" ry="6.2" />
          <rect x="18" y="16" width="4" height="11" rx="2" />
          <rect x="23.5" y="15" width="4" height="9.5" rx="2" />
          <rect x="29.5" y="14.5" width="4.5" height="9" rx="2.2" />
          <rect x="36" y="15" width="4" height="9.5" rx="2" />
          <rect x="42" y="16" width="4" height="11" rx="2" />
        </g>
      );
    case "ponytail":
      return (
        <path
          d="M17.5 25 C17.5 15 23.5 11.5 32 11.5 C40.5 11.5 46.5 15 46.5 25 C43.5 21 38.5 19 32 19 C25.5 19 20.5 21 17.5 25 Z"
          fill={color}
        />
      );
    case "parted":
      return (
        <path
          d="M17.5 26 C17.5 15.5 23 11.5 32 11.5 C41 11.5 46.5 15.5 46.5 26 C43 22 38 19.5 27 19.5 L24 22.5 C21.5 23 19.5 24.5 17.5 26 Z"
          fill={color}
        />
      );
    case "slickBack":
      return (
        <path
          d="M18 24.5 C17.5 14 23 10.5 32 10.5 C41 10.5 46.5 14 46 24.5 C43 20 38.5 17.5 32 17.5 C25.5 17.5 21 20 18 24.5 Z"
          fill={color}
        />
      );
    case "spiky":
      return (
        <path
          d="M18 25 L19 16 L24 18 L27 11 L32 15 L36 11 L40 17.5 L45 15.5 L46 25 C42 21 37.5 19.5 32 19.5 C26.5 19.5 22 21 18 25 Z"
          fill={color}
        />
      );
    case "curtain":
      return (
        <path
          d="M17 27 C17 15 23 11 32 11 C41 11 47 15 47 27 C43.5 23.5 38.5 22 33 19.5 L32 23 L31 19.5 C25.5 22 20.5 23.5 17 27 Z"
          fill={color}
        />
      );
  }
}

function renderFacialHair(
  facialHair: FacialHairKey,
  color: string,
  skinShadow: string
) {
  switch (facialHair) {
    case "stubble":
      return (
        <path
          d="M21 35 C21 41.5 25.5 44.5 32 44.5 C38.5 44.5 43 41.5 43 35 L41.5 37.5 C39.5 40.5 36.5 41.8 32 41.8 C27.5 41.8 24.5 40.5 22.5 37.5 Z"
          fill={color}
          opacity={0.28}
        />
      );
    case "beard":
      return (
        <path
          d="M19.5 33.5 C19.5 42 24.8 46 32 46 C39.2 46 44.5 42 44.5 33.5 L42 35.5 C40.5 39.5 37 41.5 32 41.5 C27 41.5 23.5 39.5 22 35.5 Z"
          fill={color}
          opacity={0.92}
        />
      );
    case "goatee":
      return (
        <path
          d="M27.5 39.5 C28 43.2 29.8 44.8 32 44.8 C34.2 44.8 36 43.2 36.5 39.5 C34.8 40.5 29.2 40.5 27.5 39.5 Z"
          fill={color}
          opacity={0.9}
        />
      );
    case "mustache":
      return (
        <path
          d="M26.5 36.8 Q32 34.8 37.5 36.8 Q32 38.4 26.5 36.8 Z"
          fill={color}
          opacity={0.92}
        />
      );
    default:
      return (
        <path
          d="M28.5 38.2 Q32 40.2 35.5 38.2"
          fill="none"
          stroke={skinShadow}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      );
  }
}

export interface PlayerAvatarProps {
  player: Pick<
    Player,
    "id" | "name" | "englishName" | "teamColor" | "backNumber" | "position"
  >;
  size?: number;
  teamColorOverride?: string;
  className?: string;
}

const PlayerAvatar = React.memo(function PlayerAvatar({
  player,
  size = 36,
  teamColorOverride,
  className = "",
}: PlayerAvatarProps) {
  const appearance = useMemo(
    () =>
      resolveAvatarAppearance({
        id: player.id,
        name: player.name,
        englishName: player.englishName,
      }),
    [player.id, player.name, player.englishName]
  );

  const skin = SKIN_PALETTE[appearance.skinTone];
  const hairColor = HAIR_PALETTE[appearance.hairColor];
  const jerseyColor = teamColorOverride || player.teamColor || "#00A878";

  return (
    <div
      style={{ width: size, height: size }}
      className={`relative shrink-0 overflow-hidden rounded-full border border-[#00A878]/20 bg-[#E8F5EF] ${className}`}
      aria-label={`${player.name} 아바타`}
    >
      <svg
        viewBox="0 0 64 64"
        width={size}
        height={size}
        className="block h-full w-full"
        role="img"
        aria-hidden="true"
      >
        {/* Layer 1: Soft Ivory Green Backdrop & Club Jersey Shoulders */}
        <rect width="64" height="64" fill="#E8F5EF" />
        <circle cx="48" cy="14" r="18" fill="#FFFFFF" opacity={0.45} />

        {/* Hair Back Layer (for Ponytail / Dreads) */}
        {renderHairBack(appearance.hairStyle, hairColor)}

        {/* Jersey Shoulders Silhouette */}
        <path
          d="M8 64 C9 52 17 47 32 47 C47 47 55 52 56 64 Z"
          fill={jerseyColor}
        />
        {/* Jersey Shoulder Stripes Accent */}
        <path
          d="M15 53 L19 64 M49 53 L45 64"
          stroke="#FFFFFF"
          strokeWidth="1.5"
          opacity={0.28}
        />
        {/* White Round-Neck Collar */}
        <path
          d="M24 47.5 Q32 54.5 40 47.5"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="2.4"
          strokeLinecap="round"
        />

        {/* Layer 2: Neck, Ears & Head */}
        <rect x="27" y="40" width="10" height="10" rx="4" fill={skin.shadow} />
        <circle cx="18.5" cy="31" r="3.4" fill={skin.shadow} />
        <circle cx="45.5" cy="31" r="3.4" fill={skin.shadow} />
        <rect x="19" y="16" width="26" height="28.5" rx="12.5" fill={skin.fill} />

        {/* Minimalist Facial Features */}
        <circle cx="26.5" cy="30" r="1.7" fill="#1F2937" />
        <circle cx="37.5" cy="30" r="1.7" fill="#1F2937" />
        <path
          d="M23.8 26.8 Q26.5 25.6 29.2 26.6"
          fill="none"
          stroke={hairColor}
          strokeWidth="1.4"
          strokeLinecap="round"
          opacity={0.85}
        />
        <path
          d="M34.8 26.6 Q37.5 25.6 40.2 26.8"
          fill="none"
          stroke={hairColor}
          strokeWidth="1.4"
          strokeLinecap="round"
          opacity={0.85}
        />

        {/* Layer 4: Facial Hair / Smile */}
        {renderFacialHair(appearance.facialHair, hairColor, skin.shadow)}
        {appearance.facialHair !== "none" && (
          <path
            d="M29 38.4 Q32 39.8 35 38.4"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="1.1"
            strokeLinecap="round"
            opacity={0.55}
          />
        )}

        {/* Layer 3: Hair Front */}
        {renderHairFront(appearance.hairStyle, hairColor)}

        {/* Optional Headband Accessory */}
        {appearance.accessory === "headband" && (
          <path
            d="M18.8 21.8 Q32 19 45.2 21.8"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        )}
      </svg>
    </div>
  );
});

export default PlayerAvatar;
