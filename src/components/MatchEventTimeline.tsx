"use client";

import React from "react";
import { Zap } from "lucide-react";
import { MatchEvent } from "@/types";
import { EVENT_TYPE_META, formatMinuteLabel } from "@/lib/priceEngine";

export interface MatchEventTimelineProps {
  events: MatchEvent[];
  selectedMinute?: number | null;
  onSelectEvent?: (event: MatchEvent) => void;
  variant?: "FEED" | "CHIPS" | "BOTH";
  theme?: "light" | "dark";
  title?: string;
  subtitle?: string;
  emptyText?: string;
}

export default function MatchEventTimeline({
  events,
  selectedMinute = null,
  onSelectEvent,
  variant = "FEED",
  theme = "light",
  title = "실시간 경기 이벤트 타임라인 (0'~90')",
  subtitle,
  emptyText = "현재까지 기록된 주요 경기 이벤트 마커가 없습니다.",
}: MatchEventTimelineProps) {
  const isDark = theme === "dark";
  const sortedAsc = [...(events ?? [])].sort((a, b) => a.minute - b.minute);
  const sortedDesc = [...sortedAsc].reverse();

  const resolvedSubtitle =
    subtitle ??
    (onSelectEvent ? "터치 시 해당 시점 시세 포커스" : "단일 이벤트 배열(SSOT) 연동");

  return (
    <div
      className={`rounded-xl border p-2.5 ${
        isDark
          ? "border-[#1E293B] bg-[#131A26]"
          : "border-gray-100 bg-gray-50"
      }`}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Zap className="h-3.5 w-3.5 text-[#00A878]" />
          <span
            className={`text-xs font-semibold ${
              isDark ? "text-slate-100" : "text-gray-800"
            }`}
          >
            {title}
          </span>
          {sortedAsc.length > 0 && (
            <span className="rounded-full bg-[#00A878]/15 px-1.5 py-0.2 font-sans tabular-nums text-[10px] font-semibold text-[#00A878]">
              {sortedAsc.length}건
            </span>
          )}
        </div>
        {resolvedSubtitle !== "" && (
          <span
            className={`text-[10px] font-medium ${
              isDark ? "text-slate-400" : "text-gray-400"
            }`}
          >
            {resolvedSubtitle}
          </span>
        )}
      </div>

      {sortedAsc.length === 0 ? (
        <p
          className={`py-1.5 text-[11px] ${
            isDark ? "text-slate-500" : "text-gray-400"
          }`}
        >
          {emptyText}
        </p>
      ) : (
        <div className="space-y-2">
          {(variant === "CHIPS" || variant === "BOTH") && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
              {sortedAsc.map((ev) => {
                const cfg = EVENT_TYPE_META[ev.type] ?? EVENT_TYPE_META.GOAL;
                const isSelected = selectedMinute === ev.minute;
                const impact = ev.priceImpactPercent;

                return (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => onSelectEvent?.(ev)}
                    className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                      isSelected
                        ? isDark
                          ? "border-[#00A878] bg-[#00A878]/20 text-white shadow-xs"
                          : "border-gray-900 bg-gray-900 text-white shadow-xs scale-[1.02]"
                        : isDark
                        ? "border-[#1E293B] bg-[#0B0F17] text-slate-300 hover:border-slate-600"
                        : `${cfg.chipBg} ${cfg.chipText} ${cfg.chipBorder} hover:opacity-90`
                    }`}
                  >
                    <span className="font-sans tabular-nums text-[10px] opacity-85">
                      {formatMinuteLabel(ev.minute)}
                    </span>
                    <span>{cfg.icon}</span>
                    <span>{cfg.shortTitle}</span>
                    <span
                      className={`font-sans tabular-nums text-[10px] ${
                        isSelected || isDark
                          ? impact > 0
                            ? "text-[#00A878]"
                            : impact < 0
                            ? "text-[#F07868]"
                            : "text-[#64748B]"
                          : ""
                      }`}
                    >
                      {impact > 0 ? "+" : ""}
                      {impact.toFixed(1)}%
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {(variant === "FEED" || variant === "BOTH") && (
            <div className="space-y-1">
              {sortedDesc.map((ev) => {
                const cfg = EVENT_TYPE_META[ev.type] ?? EVENT_TYPE_META.GOAL;
                const isSelected = selectedMinute === ev.minute;
                const impact = ev.priceImpactPercent;

                return (
                  <div
                    key={`row-${ev.id}`}
                    role={onSelectEvent ? "button" : undefined}
                    tabIndex={onSelectEvent ? 0 : undefined}
                    onClick={() => onSelectEvent?.(ev)}
                    onKeyDown={(e) => {
                      if (
                        onSelectEvent &&
                        (e.key === "Enter" || e.key === " ")
                      ) {
                        e.preventDefault();
                        onSelectEvent(ev);
                      }
                    }}
                    className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition ${
                      onSelectEvent ? "cursor-pointer" : ""
                    } ${
                      isSelected
                        ? "border-[#00A878] bg-emerald-50/60"
                        : "border-gray-100 bg-white hover:border-gray-200"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-8 shrink-0 font-mono text-[11px] font-bold text-[#00A878]">
                        {formatMinuteLabel(ev.minute)}
                      </span>
                      <span className="shrink-0 text-xs">{cfg.icon}</span>
                      <span className="truncate text-xs font-semibold text-gray-800">
                        {ev.description}
                      </span>
                    </div>
                    <span
                      className={`shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-extrabold ${cfg.badgeStyle}`}
                    >
                      {impact > 0 ? "+" : ""}
                      {impact.toFixed(1)}%
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
