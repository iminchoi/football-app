"use client";

import React from "react";
import { Player } from "@/types";

export interface PlayerAvatarProps {
  player: Pick<
    Player,
    "id" | "name" | "englishName" | "teamColor" | "backNumber" | "position"
  >;
  size?: number;
  teamColorOverride?: string;
  className?: string;
}

/**
 * Determine whether a hex color is bright enough to require dark ink for contrast.
 */
function isLightHex(hex: string): boolean {
  const clean = hex.replace("#", "").trim();
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  if (full.length !== 6) return false;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return false;
  // Perceived luminance (ITU-R BT.601)
  return (r * 299 + g * 587 + b * 114) / 1000 > 186;
}

const PlayerAvatar = React.memo(function PlayerAvatar({
  player,
  size = 36,
  teamColorOverride,
  className = "",
}: PlayerAvatarProps) {
  const kitColor = teamColorOverride || player.teamColor || "#00A878";
  const lightKit = isLightHex(kitColor);
  const inkColor = lightKit ? "#111827" : "#FFFFFF";
  const trimColor = lightKit ? "#1E293B" : "#FFFFFF";
  const strokeColor = lightKit ? "rgba(15,23,42,0.22)" : "rgba(15,23,42,0.1)";
  const numberText = String(player.backNumber ?? 0);
  const numFontSize = numberText.length >= 2 ? 17 : 19;

  return (
    <div
      style={{ width: size, height: size }}
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-gray-200/80 bg-[#F7F9F8] ${className}`}
      aria-label={`${player.name} #${numberText} 유니폼`}
    >
      <svg
        viewBox="0 0 64 64"
        width={size}
        height={size}
        className="block h-full w-full"
        role="img"
        aria-hidden="true"
      >
        {/* Minimal Football Jersey Silhouette */}
        <path
          d="M23 13 L12 18 L6 30 L15 35 L19 27 L19 52 C19 53.6 20.3 55 22 55 L42 55 C43.7 55 45 53.6 45 52 L45 27 L49 35 L58 30 L52 18 L41 13 C38.5 16.2 35.5 17.8 32 17.8 C28.5 17.8 25.5 16.2 23 13 Z"
          fill={kitColor}
          stroke={strokeColor}
          strokeWidth="1.2"
          strokeLinejoin="round"
        />

        {/* Subtle Right-Side Editorial Shading */}
        <path
          d="M32 17.8 C35.5 17.8 38.5 16.2 41 13 L52 18 L58 30 L49 35 L45 27 L45 52 C45 53.6 43.7 55 42 55 L32 55 Z"
          fill="#000000"
          opacity={lightKit ? 0.05 : 0.1}
        />

        {/* Crew/V-Neck Collar Trim */}
        <path
          d="M23 13 C25.5 16.8 28.5 18.6 32 18.6 C35.5 18.6 38.5 16.8 41 13"
          fill="none"
          stroke={trimColor}
          strokeWidth="2.4"
          strokeLinecap="round"
          opacity={0.92}
        />

        {/* Minimal Sleeve Cuff Accents */}
        <path
          d="M7.8 28.4 L15.4 33"
          stroke={trimColor}
          strokeWidth="2.1"
          strokeLinecap="round"
          opacity={0.75}
        />
        <path
          d="M56.2 28.4 L48.6 33"
          stroke={trimColor}
          strokeWidth="2.1"
          strokeLinecap="round"
          opacity={0.75}
        />

        {/* Centered Bold Jersey Number */}
        <text
          x="32"
          y="41.5"
          textAnchor="middle"
          fill={inkColor}
          fontSize={numFontSize}
          fontWeight={800}
          letterSpacing="-0.04em"
          className="font-sans tabular-nums"
        >
          {numberText}
        </text>
      </svg>
    </div>
  );
});

export default PlayerAvatar;
