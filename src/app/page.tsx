"use client";

import React, { useEffect, useState } from "react";
import { useTradeStore } from "@/store/useTradeStore";
import { ActiveMatchContext, Player, TradeType } from "@/types";
import TopAssetHeader from "@/components/TopAssetHeader";
import BottomTabBar from "@/components/BottomTabBar";
import MatchesTabView from "@/components/matches/MatchesTabView";
import PortfolioTabView from "@/components/portfolio/PortfolioTabView";
import MarketChartTabView from "@/components/market/MarketChartTabView";
import TradeBottomSheet from "@/components/TradeBottomSheet";
import RightTradeDockPanel from "@/components/RightTradeDockPanel";
import RightQuickRail from "@/components/RightQuickRail";
import AuthModal from "@/components/AuthModal";
import AdminPanel from "@/components/AdminPanel";

export default function HomePage() {
  const activeTab = useTradeStore((state) => state.activeTab);
  const selectPlayer = useTradeStore((state) => state.selectPlayer);
  const fetchTodayMatches = useTradeStore((state) => state.fetchTodayMatches);

  const [mounted, setMounted] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Selected player for Right Docked Trading Panel (PC lg:) & Bottom Sheet (Mobile < lg)
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [modalTradeType, setModalTradeType] = useState<TradeType>("BUY");
  const [recentPlayerIds, setRecentPlayerIds] = useState<string[]>([]);

  useEffect(() => {
    setMounted(true);
    void fetchTodayMatches();
  }, [fetchTodayMatches]);

  const handleOpenTradeSheet = (
    player: Player,
    type: TradeType = "BUY",
    matchContext?: ActiveMatchContext | null
  ) => {
    selectPlayer(player, matchContext ?? null);
    setSelectedPlayerId(player.id);
    setModalTradeType(type);
    setRecentPlayerIds((prev) =>
      [player.id, ...prev.filter((id) => id !== player.id)].slice(0, 10)
    );
  };

  const handleCloseTradeSheet = () => {
    setSelectedPlayerId(null);
  };

  if (!mounted) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-[#F7F9F8]">
        <div className="flex flex-col items-center gap-2.5">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#00A878] border-t-transparent" />
          <p className="text-xs font-semibold text-gray-500">
            PitchTrade 불러오는 중...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-[#F7F9F8]">
      {/* 1. Integrated 1-Line Global Top Header */}
      <TopAssetHeader
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        onSelectSearchPlayer={(player) => handleOpenTradeSheet(player, "BUY")}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
      />

      {/* 2. Responsive 3-Column Adaptive Workspace (Document Scroll, No Double-Nested Scroll) */}
      <div className="mx-auto flex w-full max-w-[1380px]">
        {/* Left/Center Main Content */}
        <main className="min-w-0 flex-1 pb-20 lg:pb-8">
          {activeTab === "MATCHES" && (
            <MatchesTabView onSelectPlayerTrade={handleOpenTradeSheet} />
          )}
          {activeTab === "PORTFOLIO" && (
            <PortfolioTabView
              onSelectPlayerTrade={handleOpenTradeSheet}
              onOpenAuthModal={() => setIsAuthModalOpen(true)}
            />
          )}
          {activeTab === "MARKET" && (
            <MarketChartTabView
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              selectedPlayerId={selectedPlayerId}
              onSelectPlayerTrade={handleOpenTradeSheet}
            />
          )}
        </main>

        {/* PC (lg+) Docked Right Trading Panel */}
        <RightTradeDockPanel
          playerId={selectedPlayerId}
          tradeType={modalTradeType}
          onChangeTradeType={setModalTradeType}
          onClose={handleCloseTradeSheet}
          onRequireAuth={() => setIsAuthModalOpen(true)}
        />

        {/* PC (lg+) Rightmost Slim Vertical Quick Rail (w-16) */}
        <RightQuickRail
          recentPlayerIds={recentPlayerIds}
          onSelectPlayer={(player) => handleOpenTradeSheet(player, "BUY")}
          onOpenAuthModal={() => setIsAuthModalOpen(true)}
        />
      </div>

      {/* 3. Mobile (< lg) Trade Bottom Sheet Modal */}
      <div className="lg:hidden">
        <TradeBottomSheet
          playerId={selectedPlayerId}
          initialTradeType={modalTradeType}
          onClose={handleCloseTradeSheet}
          onRequireAuth={() => setIsAuthModalOpen(true)}
        />
      </div>

      {/* 4. Auth Login / Signup Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />

      {/* 5. Floating Admin Debug Toolbar (visible only when user.role === 'admin') */}
      <AdminPanel />

      {/* 6. Mobile (< lg) Fixed Bottom 3-Tab Navigation Bar */}
      <BottomTabBar />
    </div>
  );
}
