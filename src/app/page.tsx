"use client";

import React, { useEffect, useState } from "react";
import { useTradeStore } from "@/store/useTradeStore";
import { Player, TradeType } from "@/types";
import TopAssetHeader from "@/components/TopAssetHeader";
import BottomTabBar from "@/components/BottomTabBar";
import MatchesTabView from "@/components/matches/MatchesTabView";
import PortfolioTabView from "@/components/portfolio/PortfolioTabView";
import MarketChartTabView from "@/components/market/MarketChartTabView";
import TradeBottomSheet from "@/components/TradeBottomSheet";
import AuthModal from "@/components/AuthModal";
import AdminPanel from "@/components/AdminPanel";

export default function HomePage() {
  const activeTab = useTradeStore((state) => state.activeTab);
  const ensurePlayerInStore = useTradeStore(
    (state) => state.ensurePlayerInStore
  );

  const [mounted, setMounted] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);

  // Bottom sheet modal state
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [modalTradeType, setModalTradeType] = useState<TradeType>("BUY");

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleOpenTradeSheet = (player: Player, type: TradeType = "BUY") => {
    ensurePlayerInStore(player);
    setSelectedPlayerId(player.id);
    setModalTradeType(type);
  };

  const handleCloseTradeSheet = () => {
    setSelectedPlayerId(null);
  };

  if (!mounted) {
    return (
      <div className="mx-auto flex min-h-screen max-w-[480px] items-center justify-center bg-[#f8f9fa] shadow-xl">
        <div className="flex flex-col items-center gap-2.5">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#00985f] border-t-transparent" />
          <p className="text-xs font-semibold text-gray-500">
            PitchTrade 불러오는 중...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-[480px] bg-[#f8f9fa] pb-20 shadow-[0_0_40px_rgba(0,0,0,0.06)] border-x border-gray-200/70">
      {/* 1. Top Navigation & My Asset Summary Header */}
      <TopAssetHeader onOpenAuthModal={() => setIsAuthModalOpen(true)} />

      {/* 2. Main Tab Content */}
      <main>
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
          <MarketChartTabView onSelectPlayerTrade={handleOpenTradeSheet} />
        )}
      </main>

      {/* 3. Trade Bottom Sheet Modal */}
      <TradeBottomSheet
        playerId={selectedPlayerId}
        initialTradeType={modalTradeType}
        onClose={handleCloseTradeSheet}
        onRequireAuth={() => setIsAuthModalOpen(true)}
      />

      {/* 4. Auth Login / Signup Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />

      {/* 5. Floating Admin Debug Toolbar (visible only when user.role === 'admin') */}
      <AdminPanel />

      {/* 6. Fixed Bottom 3-Tab Navigation Bar */}
      <BottomTabBar />
    </div>
  );
}
