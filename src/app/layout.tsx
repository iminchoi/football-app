import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PitchTrade | 풋몹 스타일 실시간 축구 선수 트레이딩",
  description:
    "풋몹(FotMob) 감성의 깔끔한 라이트 모드로 즐기는 축구 경기 라인업 및 실시간 선수 시세 트레이딩 프로토타입",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-[#eef0f3] text-gray-900 antialiased selection:bg-[#00985f] selection:text-white">
        {children}
      </body>
    </html>
  );
}
