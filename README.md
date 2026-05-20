# SamSan — 삼산주유소 배달관리 PWA

경남 고성 삼산주유소의 배달관리·고객관리·정산 자동화 PWA. 기존 **카톡 + 공책 + 엑셀** 3중 수기 입력을 앱 하나로 통합.

## 사용자

- **사무실** (어머니): 전화 수신 확인, 배달 지시, 고객·외상 관리, 검색
- **배달원** (아버지): 배달 목록 확인, 현장 완료 입력, 가구 정보 검색
- **관리자** (아들/개발자): 시스템 관리

## 주요 기능

### 배달 워크플로우
- 사무실에서 새 배달 등록 → 배달원 모바일에 즉시 표시 (Supabase Realtime)
- 배달원이 현장에서 결제수단·수량 입력 후 완료 → 거래 자동 기록
- 외상·선입 잔액 자동 계산 (transactions 합산, single source of truth)

### CTI 연동
- 사무실 PC의 Python CTI 브릿지가 전화 수신을 감지해 `incoming_calls` 테이블에 insert
- 웹 사무실 화면이 Realtime 구독으로 즉시 발신자·가구 정보 배너 표시
- 자세한 계약: [docs/cti-bridge.md](docs/cti-bridge.md)

### 통합 검색 (`/search`)
사무실·배달원 어느 화면에서든 헤더 검색 버튼으로 진입.

| 입력 예시 | 라우팅 | 동작 |
|---|---|---|
| `큰들`, `010-8331`, `김식백` | pattern | name·phone·label·address ILIKE |
| `최권 전화번호`, `김식백 주소` | pattern (stopword strip) | 후미어 제거 후 단일 키워드 검색 |
| `두포 1길 사는 김씨` | LLM (gpt-4o-mini) | 의도 추출 → 다중 필드 AND 검색 |
| `외상`, `선입`, `선불` | balance | transactions 합산 desc 정렬 |

모든 결과 카드에 외상(빨강)·선입(파랑) 잔액 자동 표시. 자세한 설계: [docs/architecture.md](docs/architecture.md#4-검색-시스템)

### PWA + 푸시
- 모바일·데스크탑 설치 가능, 오프라인 캐싱
- Firebase Cloud Messaging으로 신규 배달 푸시 (갤럭시 워치 미러링)

## 기술 스택

| 영역 | 기술 |
|---|---|
| Frontend / Backend | **Next.js 16** (App Router, RSC) + **TypeScript** + **Tailwind v4** |
| DB / Auth / Realtime | **Supabase** (PostgreSQL + RLS) |
| 푸시 알림 | **Firebase Cloud Messaging** |
| AI 검색 라우팅 | **OpenAI gpt-4o-mini** (function calling, 선택적) |
| CTI 브릿지 | **Python** (별도 Windows 상주 프로세스) |
| 배포 | **Vercel** |
| PWA | **next-pwa** |

## 시스템 구성도

```mermaid
flowchart LR
    Office[사무실]
    Driver[배달원]
    Watch[워치]

    Office -->|PWA| Vercel[Vercel<br/>Next.js 16]
    Driver -->|PWA| Vercel

    Vercel -->|RLS| Supabase[(Supabase)]
    Vercel -->|FCM| Firebase[Firebase]
    Vercel -.->|선택| OpenAI[OpenAI]

    CTI[CTI 브릿지<br/>Windows] -->|service_role| Supabase
    Supabase -->|Realtime| Vercel
    Firebase --> Watch
```

상세 다이어그램(컴포넌트·ERD·검색 시퀀스·라우팅 결정 등)은 [docs/architecture.md](docs/architecture.md) 참조.

## 폴더 구조

```
src/
├── app/                       # Next.js App Router
│   ├── login/                 # 로그인 페이지
│   ├── office/                # 사무실: 배달 보드, 고객 관리
│   ├── driver/                # 배달원: 배달 목록
│   ├── search/                # 통합 검색 페이지 + layout
│   └── api/
│       ├── search/            # 검색 라우터 (pattern/llm/balance)
│       └── notify/            # FCM 발송
├── components/                # 공유 UI
│   ├── office/                # 사무실 전용
│   ├── driver/                # 배달원 전용
│   ├── SearchLinkButton.tsx   # 헤더 검색 아이콘
│   └── ...
├── lib/
│   ├── supabase/              # Supabase client (browser/server) + 쿼리
│   │   ├── client.ts
│   │   ├── server.ts
│   │   └── queries/
│   └── search/                # 검색 모듈
│       ├── router.ts          # decideRoute (pattern/llm)
│       ├── pattern.ts         # ILIKE 검색 + intent 정규화
│       ├── llm.ts             # OpenAI gpt-4o-mini intent extraction
│       ├── balance.ts         # 외상/선입 + attachBalances
│       ├── noise.ts           # stopword stripping
│       └── types.ts
└── proxy.ts                   # 전역 미들웨어 (auth 가드)

supabase/migrations/           # DDL (Supabase Studio에서 수동 실행)
cti-bridge/                    # Windows Python CTI 브릿지
docs/
├── architecture.md            # 시스템 아키텍처 다이어그램
└── cti-bridge.md              # CTI 브릿지 ↔ 웹 API 계약
```

## 환경변수

`.env.local` (gitignored):

```bash
# Supabase (필수)
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-jwt>
SUPABASE_SERVICE_ROLE_KEY=<service-role-jwt>  # import 스크립트에서만

# Firebase FCM (푸시 사용 시)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_VAPID_KEY=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# OpenAI (자연어 검색 라우팅 활성화 시. 없으면 pattern fallback)
OPENAI_API_KEY=sk-...
```

운영(Vercel)에서는 Project Settings → Environment Variables에 동일하게 등록.

## 개발 시작

```bash
# 의존성
npm install

# 개발 서버
npm run dev
# http://localhost:3000

# 타입 체크
npx tsc --noEmit

# 빌드
npm run build
```

DB 마이그레이션은 **Supabase Studio SQL Editor에서 수동 실행** (자동 실행 금지 정책). `supabase/migrations/*.sql` 참조.

## 비즈니스 룰 (변경 금지)

- 외상(CREDIT) 한도 없음. 음수 진입 시 경고만, 막지 않음.
- 선입(PREPAID) 잔액 음수 허용. 경고만.
- 잔액은 `transactions` 합산으로 계산 (저장하지 않음).
- 배달원의 판단을 막는 UI 금지 (경고는 가능).
- 결제유형: `CARD / CASH / CASH_RECEIPT / CREDIT / TRANSFER / LOCAL_CURRENCY / PREPAID / TAX_EXEMPT_NHCARD / TAX_EXEMPT_UNION`

## 배포

- main 브랜치 push → Vercel 자동 빌드·배포
- env 변경 시 재배포 필요 (자동 반영 안 됨): Vercel Dashboard → Deployments → Redeploy

## License

Private — 삼산주유소 내부 사용.
