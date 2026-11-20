# ⚽ PitchTrade

> **실시간 축구 경기 이벤트가 주가가 되는 스포츠 트레이딩 웹 애플리케이션**

경기 중 발생하는 득점·어시스트·카드·실점 등 공식 이벤트 데이터를 기반으로 선수 시세를 실시간 산출하고, 가상 포인트로 매수·매도하는 축구 주식 거래 플랫폼입니다.

---

## ✨ 주요 기능

- **실시간 이벤트 기반 주가 엔진 (`v2.5`)**
  - 경기 이벤트(`PlayerEvent[]`) 단일 소스(SSOT)에서 선수 주가, 캔들/라인 차트, 개인 스탯, 타임라인 마커를 결정론적으로 파생
  - 선발 출전 분(`onPitchMinutes`) 기반 기대치 차감 모델로 팀 전력 차이에 따른 무위험 차익 거래 방지
- **공정한 거래 안전장치**
  - **상·하한가 제한 (`±15%`)**: 상한가 도달 시 매수 잠금, 하한가 도달 시 매도 잠금
  - **서킷 브레이커 (`30s`)**: 득점·퇴장 등 주요 이벤트 발생 직후 30초간 주문 일시 정지
  - **경기 상태별 거래 분기**: 장전(`PRE`) 기준가 거래 → 경기 중(`LIVE`) 실시간 변동 거래 → 종료(`FT`) 즉시 거래 마감
- **3단 반응형 트레이딩 워크스페이스**
  - 실시간 경기 일정 및 선발 포메이션 피치 뷰, 핫 플레이어 스포트라이트, 도킹형 주문 패널 및 포트폴리오 자산 관리

---

## 🛠 기술 스택

| 구분 | 기술 |
| :--- | :--- |
| **Framework** | Next.js (App Router), React, TypeScript |
| **Styling** | Tailwind CSS (`Soft Ivory Green` 테마) |
| **State & Chart** | Zustand, Lightweight Charts |
| **Data & Validation** | `football-data.org` API, Node.js Test Runner, Monte Carlo Balance Simulator |

---

## 📂 프로젝트 구조

```text
src/
├── app/              # Next.js App Router 페이지 및 API 라우트
├── components/       # 피치 뷰, 실시간 차트, 거래 패널, 포트폴리오 UI
├── lib/
│   ├── weights.ts    # 이벤트 가중치 및 기대 발생률 상수 (SSOT)
│   ├── priceEngine.ts# 결정론적 시세·차트·스탯 파생 엔진
│   └── orderGate.ts  # FT 잠금, ±15% 상하한, 서킷 브레이커 주문 검증
└── store/            # Zustand 전역 거래 및 포트폴리오 상태 관리
scripts/
└── simulateBalance.ts # 50,000경기 몬테카를로 경제 밸런스 검증 시뮬레이터
tests/                 # 가격 엔진 및 주문 가드 단위 테스트

🚀 시작하기
# 1. 저장소 클론 및 패키지 설치
git clone [https://github.com/iminchoi/pitchtrade.git](https://github.com/iminchoi/pitchtrade.git)
cd pitchtrade
npm install

# 2. 환경 변수 설정 (.env.local)
echo "FOOTBALL_DATA_API_KEY=your_api_key_here" > .env.local

# 3. 개발 서버 실행
npm run dev

🧪 테스트 및 밸런스 시뮬레이션 실행
# 단위 테스트 실행
node --test tests/*.test.ts

# 경제 밸런스 시뮬레이터 실행 (기본 1,000경기 × 5시드)
npx tsx scripts/simulateBalance.ts
