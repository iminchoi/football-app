"use client";

import React from "react";
import { CalendarDays, Briefcase, LineChart } from "lucide-react";
import { BottomTab } from "@/types";
import { useTradeStore } from "@/store/useTradeStore";

export default function BottomTabBar() {
  const activeTab = useTradeStore((s) => s.activeTab);
  const setActiveTab = useTradeStore((s) => s.setActiveTab);
  const holdings = useTradeStore((s) => s.holdings);

  const totalHoldingsQty = Object.values(holdings).reduce(
    (sum, h) => sum + h.quantity,
    0
  );

  const tabs: {
    key: BottomTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }[] = [
    {
      key: "MATCHES",
      label: "경기",
      icon: CalendarDays,
    },
    {
      key: "PORTFOLIO",
      label: "마이 포트폴리오",
      icon: Briefcase,
      badge: totalHoldingsQty > 0 ? totalHoldingsQty : undefined,
    },
    {
      key: "MARKET",
      label: "시세/차트",
      icon: LineChart,
    },
  ];

  return (
    <nav className="fixed bottom-0 left-1/2 z-30 w-full max-w-[480px] -translate-x-1/2 border-t border-gray-200 bg-white/95 backdrop-blur-md">
      <div className="grid grid-cols-3 h-16">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`relative flex flex-col items-center justify-center gap-1 transition-colors ${
                isActive
                  ? "text-[#00985f] font-bold"
                  : "text-gray-400 font-medium hover:text-gray-600"
              }`}
            >
              {isActive && (
                <span className="absolute top-0 h-0.5 w-10 rounded-full bg-[#00985f]" />
              )}
              <div className="relative">
                <Icon className="h-5 w-5" />
                {tab.badge !== undefined && (
                  <span className="absolute -right-3.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#00985f] px-1 text-[10px] font-bold text-white shadow-sm">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className="text-[11px]">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
