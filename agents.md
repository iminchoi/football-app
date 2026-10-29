# AI Agent Development Guidelines (Pitch Trade)

본 문서는 Pitch Trade(가상 축구 선수 실시간 트레이딩 웹앱) 개발 시 AI 에이전트가 준수해야 할 핵심 아키텍처 규칙, 도메인 제약 및 코딩 컨벤션입니다.

---

## 1. 프로젝트 개요 & 기술 스택
- **목적**: 실시간 축구 경기 이벤트(FotMob 감성)와 연동되어 선수의 주가가 변동하는 가상 트레이딩 MVP
- **Framework**: Next.js 15 (App Router), React 19, TypeScript
- **Styling**: Tailwind CSS, Lucide-react (모바일 웹 뷰 중심, 라이트 테마)
- **State Management**: Zustand with `persist`
- **Charts**: Recharts (시세 틱 차트, 선수 특성 Radar 차트)

---

## 2. 상태 관리(Zustand) & 영속성(Persistence) 필수 규칙
1. **스토리지 오염 방지 (`partialize`)**:
   - `players`, `matches` 같은 경기 마스터 데이터는 절대 `localStorage`에 저장하지 않는다.
   - 오직 유저 세션 및 자산 데이터만 저장한다:
     ```ts
     partialize: (state) => ({
       cash: state.cash,
       holdings: state.holdings,
       transactions: state.transactions,
       realizedPnL: state.realizedPnL,
       user: state.user,
     })
     ```
2. **리렌더링 최적화 (Selector Pattern)**:
   - 컴포넌트에서 `const { ... } = useTradeStore()` 형태로 스토어 전체를 구독하지 않는다.
   - 반드시 `const cash = useTradeStore(s => s.cash)`와 같이 필요한 값만 셀렉터로 분리 구독한다.

---

## 3. 핵심 트레이딩 & 시세 경제 모델 규칙
1. **경기 상태 가드 (`isLive`)**:
   - `tickMarket()` 실행 시 경기가 진행 중(`match.status === 'IN_PLAY'`)인 선수만 시세를 변동시킨다. 종료(FT)나 예정 경기 선수의 시세는 고정한다.
2. **시세 우상향 쏠림(인플레이션) 방지**:
   - 일반 자연 변동률의 평균값은 반드시 0%여야 한다 (`Math.random() * 0.05 - 0.025`).
   - 상한가(+30%) 및 하한가(-30%) 제한 캡을 엄격히 유지한다.
3. **이벤트 주도(Event-Driven) 시세 산정**:
   - 가격을 먼저 뽑지 않는다. 반드시 `경기 이벤트 추첨 ➔ 해당 이벤트의 min/max 가중치 기반 변동률 산정 ➔ 시세 반영` 순서를 지킨다.
4. **체결 정확성 및 실현 손익 추적**:
   - `sellPlayer` 실행 시 `(매도가 - 평단가) * 수량`을 계산하여 `realizedPnL`에 누적 합산한다.
   - `buyPlayer`, `sellPlayer`는 실행 시점의 최종 체결가(`executedPrice`)를 리턴하여 UI 토스트 메시지에 정확히 일치시킨다.

---

## 4. UI/UX 디자인 가이드라인
1. **FotMob 라이트 모드 테마**:
   - 화이트 배경(`bg-white`), 서브 배경(`bg-gray-50`), 정갈한 테두리(`border-gray-100` ~ `border-gray-200`)를 일관되게 사용한다.
   - 성과 뱃지: 우수/상승 초록색(`bg-emerald-500` / `text-emerald-600`), 하락 파란색(`text-blue-600`), 경고/실책 빨간색(`text-rose-500`).
2. **모바일 사용성 (Safe Area)**:
   - 바텀시트나 모달의 최하단 확정 버튼에는 반드시 `pb-6` 이상의 Safe Area 패딩(`pb-[calc(1.5rem+env(safe-area-inset-bottom))]`)을 부여하여 기기 홈 바와의 간섭을 방지한다.
3. **스크롤 최소화**:
   - 모바일 바텀시트 내부에서 불필요한 세로 스크롤이 생기지 않도록 여백(`gap`, `space-y`)은 컴팩트하게(`space-y-2` 내외) 유지한다.
