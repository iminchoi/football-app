⚽ PitchTrade

실시간 축구 경기 이벤트가 주가가 되는 스포츠 트레이딩 플랫폼

📌 프로젝트 소개

PitchTrade는 축구 경기 중 발생하는 골, 어시스트, 유효슈팅, 실점, 카드 등의 이벤트를 실시간 시세와 차트에 반영해 선수를 매수·매도할 수 있는 실시간 축구 모의 트레이딩 웹 애플리케이션입니다.

직관적인 트레이딩 UX: 토스증권 스타일의 3단 반응형 워크스페이스와 포메이션 피치 뷰를 결합해 경기 흐름을 보며 즉시 주문할 수 있습니다.

투명한 단일 진실 공급원(SSOT): 모든 스탯, 차트 시계열, 이벤트 타임라인이 단일 PlayerEvent[] 데이터에서 결정론적으로 파생됩니다.

검증된 경제 밸런스 엔진 (v2.5): 50,000경기 몬테카를로 시뮬레이션으로 포지션 간 기대수익 편차와 무위험 차익 거래(강팀 몰빵 등)를 제거했습니다.

✨ 주요 기능

📅 경기 일정 & 인라인 포메이션 피치 뷰

경기 상태(PRE 예정 · LIVE 진행 중 · FT 종료)에 따라 실시간 라인업, 스코어, 선수별 등락률을 한눈에 확인

📈 실시간 이벤트 연동 시세 차트

경기 중 주요 이벤트 발생 시점 마커와 함께 시가 대비 변동률을 직관적인 차트로 제공

🛡️ 공정 거래 안전장치 (Order Guard)

±15% 상·하한가 제한: 상한가 도달 시 매수 잠금, 하한가 도달 시 매도 잠금

서킷 브레이커: 골·퇴장 등 대형 이벤트 직후 30초간 주문을 보호해 중계 지연 차익 거래 방지

경기 종료(FT) 자동 마감: 휘슬 종료 즉시 거래를 잠그고 최종 종가 확정

💼 마이 포트폴리오

보유 선수 평가액, 평단가, 실현/평가 손익 및 거래 내역 실시간 집계

🏗️ 경제 엔진 & 아키텍처

Match Events (골 · 도움 · 키액션 · 실점 · 카드)
       │
       ▼
  priceEngine.ts  ──▶  P(t) = Base × (1 + 누적 이벤트 - 기대치 차감 E × t/90)
       │
       ├──▶ 실시간 주가 & 차트 시계열 (±15% Clamped)
       ├──▶ 선수 스탯 집계 (골 · 도움 · 카드 1:1 일치)
       └──▶ orderGate.ts (FT 마감 · 상하한가 · 30s 서킷 브레이커 검증)


🛠️ 기술 스택

Frontend: Next.js (App Router), React, TypeScript, Tailwind CSS

State Management: Zustand

Chart & Visualization: Lightweight Charts, Custom SVG Pitch & Uniform Avatars

Testing & Simulation: Node.js Native Test Runner (node:test), Monte Carlo Balance Simulator

🚀 시작하기

# 1. 저장소 클론
git clone https://github.com/your-username/pitchtrade.git
cd pitchtrade

# 2. 패키지 설치
npm install

# 3. 개발 서버 실행
npm run dev


🧪 테스트 및 밸런스 시뮬레이션 실행

# 단위 테스트 실행 (가격 엔진 · 주문 가드 · 스토어 검증)
node --test tests/*.test.ts

# 5,000경기 × 5시드 경제 밸런스 시뮬레이터 실행
npx tsx scripts/simulateBalance.ts
