# SamSan 아키텍처

경남 고성 삼산주유소의 배달관리·고객관리·정산 자동화 PWA. 카톡+공책+엑셀 3중 수기를 한 앱으로 통합.

## 1. 시스템 컨텍스트

```mermaid
flowchart LR
    Office[👩 사무실<br/>어머니]
    Driver[🧑 배달원<br/>아버지]
    Watch[⌚ 갤럭시 워치]

    Office -->|브라우저 PWA| Vercel
    Driver -->|모바일 PWA| Vercel

    Vercel[Vercel<br/>Next.js 16]
    CTI[🪟 CTI 브릿지<br/>Windows Python]

    Vercel -->|쿠키 세션·RLS<br/>Postgres/Realtime| Supabase[(Supabase<br/>PostgreSQL + Auth)]
    Vercel -->|FCM Admin SDK| Firebase[Firebase<br/>Cloud Messaging]
    Vercel -->|gpt-4o-mini<br/>tool calling| OpenAI[OpenAI API]

    CTI -->|service_role<br/>incoming_calls INSERT| Supabase
    Supabase -->|Realtime websocket| Vercel
    Firebase -->|푸시 알림| Watch
```

**역할 분담**
- **사무실**: 전화 수신 확인, 배달 지시, 고객/외상 관리, 검색
- **배달원**: 배달 목록 확인, 현장 완료 입력, 가구 정보 검색
- **CTI 브릿지**: 사무실 PC 상주, 전화 수신 → `incoming_calls` 테이블 insert만 담당
- **OpenAI**: 자연어 검색 의도 추출 (선택적, 키 없으면 graceful fallback)

## 2. 페이지 / 컴포넌트 구조

```mermaid
flowchart TD
    subgraph app["src/app"]
        Root["/  → /login redirect"]
        Login["/login"]
        Office["/office<br/>배달 보드 + 새 배달 등록"]
        Customers["/office/customers<br/>고객 CRUD"]
        Driver["/driver<br/>배달 리스트"]
        Search["/search<br/>통합 검색"]
        APISearch["/api/search<br/>검색 라우터"]
        APINotify["/api/notify<br/>FCM 발송"]
    end

    subgraph search["src/lib/search"]
        Router2[router.ts<br/>decideRoute]
        Pattern2[pattern.ts<br/>patternSearch<br/>intentSearch]
        LLM2[llm.ts<br/>extractIntent]
        Balance2[balance.ts<br/>balanceSearch<br/>attachBalances]
        Noise2[noise.ts<br/>stripNoise]
    end

    subgraph supabase["src/lib/supabase"]
        ClientSb[client.ts<br/>browser]
        ServerSb[server.ts<br/>server cookies]
        QueriesSb[queries/*]
    end

    Search -->|fetch| APISearch
    APISearch --> Router2
    APISearch --> Pattern2
    APISearch --> LLM2
    APISearch --> Balance2
    Pattern2 --> Noise2

    APISearch --> ServerSb
    Office --> ClientSb
    Driver --> ClientSb
    Customers --> ClientSb
```

전역 미들웨어 `src/proxy.ts`가 모든 라우트 인증을 가로채서 비로그인 → `/login` 강제 리다이렉트.

## 3. 데이터 모델

```mermaid
erDiagram
    customers ||--o{ phone_numbers : has
    customers ||--o{ addresses : has
    customers ||--o{ transactions : "거래 기록"
    customers ||--o{ deliveries : "배달 요청"
    addresses ||--o{ transactions : "배달지"
    addresses ||--o{ deliveries : "배달지"
    profiles ||--o{ deliveries : "처리자"

    customers {
        uuid id PK
        text name
        text type "개인/업체"
        text memo
    }
    phone_numbers {
        uuid id PK
        uuid customer_id FK
        text phone
        text label "대표전화/자택전화/휴대폰"
    }
    addresses {
        uuid id PK
        uuid customer_id FK
        text address
        text fuel_type "등유/경유"
        text memo
    }
    transactions {
        uuid id PK
        uuid customer_id FK
        uuid address_id FK
        timestamptz delivered_at
        numeric quantity_l
        numeric amount
        text payment_type "CARD/CASH/CREDIT/PREPAID/..."
        text fuel_type
        text memo
    }
    deliveries {
        uuid id PK
        uuid customer_id FK
        uuid address_id FK
        text status "대기/배달중/완료"
        text special_note
        timestamptz created_at
    }
    incoming_calls {
        uuid id PK
        text phone
        timestamptz received_at
        timestamptz handled_at
        uuid handled_by FK
    }
    profiles {
        uuid id PK
        text role "office/driver/admin"
    }
```

**핵심 비즈니스 룰** (CLAUDE.md):
- 잔액은 transactions 합산으로 계산 (저장 안 함, single source of truth)
- 외상(CREDIT) 한도 없음 — 음수 진입 시 경고만, 막지 않음
- 선입(PREPAID) 잔액 음수 허용 — 경고만

## 4. 검색 시스템

### 4.1 라우팅 결정

```mermaid
flowchart TD
    Q["검색어 q"] --> Balance{detectBalanceQuery<br/>외상·선입·선불?}
    Balance -->|매치| RB["routing = balance"]
    Balance -->|미매치| Phone{PHONE_ONLY 정규식<br/>숫자·하이픈만?}
    Phone -->|예| RP["routing = pattern"]
    Phone -->|아니오| Token{tokenCount == 1?}
    Token -->|예| RP
    Token -->|아니오| Strip{stripNoise 후<br/>token ≤ 1?<br/>예: 최권 전화번호}
    Strip -->|예| RP
    Strip -->|아니오| RL["routing = llm"]

    RL -->|OPENAI_API_KEY 없음| RP

    RB --> Out([실행])
    RP --> Out
    RL --> Out
```

### 4.2 자연어 쿼리 전체 시퀀스

```mermaid
sequenceDiagram
    actor U as 사용자
    participant SP as SearchPanel
    participant API as /api/search
    participant MW as proxy.ts 미들웨어
    participant SB as Supabase Auth
    participant LLM as OpenAI gpt-4o-mini
    participant DB as Supabase Postgres

    U->>SP: "두포 1길 사는 김씨" + Enter
    SP->>SP: router.push(?q=...)
    SP->>SP: AbortController로 이전 요청 취소
    SP->>API: GET /api/search?q=...
    API->>MW: middleware 통과
    MW->>SB: getUser (쿠키)
    SB-->>MW: user
    API->>API: decideRoute → "llm"
    API->>LLM: chat.completions<br/>tool_choice: search_customers
    LLM-->>API: {name:"김씨", address:"두포 1길"}
    Note over API: normalizeIntent<br/>씨 제거, 공백 제거<br/>→ {name:"김", address:"두포1길"}
    par AND 검색 (Promise.all)
        API->>DB: customers ILIKE %김% LIMIT 5000
        API->>DB: addresses ILIKE %두포1길% LIMIT 5000
    end
    DB-->>API: customer_id Set A, Set B
    API->>API: Set 교집합 → top 50
    API->>DB: SELECT customers + phones + addresses
    API->>DB: SELECT transactions WHERE customer_id IN (...)
    DB-->>API: 거래 row들
    API->>API: customer_id별 SUM(amount) 집계<br/>credit_balance, prepaid_balance 부착
    API-->>SP: SearchResponse JSON
    Note over SP: { count, routing:"llm",<br/>function:"search_by_name_and_address",<br/>cost_usd: 0.0001, results: [...] }
    SP-->>U: 카드 렌더 + 잔액 표시
```

### 4.3 3가지 라우팅별 동작 차이

| 라우팅 | 트리거 예시 | DB 동작 | 비용 | 지연 |
|---|---|---|---|---|
| **pattern** | `큰들`, `010-8331`, `김식백`, `최권 전화번호` | name·phone·label·address 4컬럼 OR ILIKE | $0 | ~600ms |
| **llm** | `두포 1길 사는 김씨`, `포교에 있는 외상` | LLM 의도 추출 → 추출 필드 AND ILIKE | ~$0.0001/쿼리 | ~1.5s |
| **balance** | `외상`, `선입`, `선불`, `외상 있는` | transactions SUM > 0 desc 정렬 | $0 | ~300ms |

모든 라우팅 결과는 `attachBalances`로 외상·선입 잔액 자동 부착 → 카드에 색 표시.

## 5. 인증·권한

```mermaid
flowchart LR
    Req[요청] --> MW{middleware<br/>proxy.ts}
    MW -->|user 없음| Redir["/login 리다이렉트"]
    MW -->|user 있음| Route[페이지/API 핸들러]
    Route --> RLS[(Postgres RLS<br/>profiles.role 기반)]
    RLS -->|office/admin| AllRows[전체 row]
    RLS -->|driver| LimitedRows[배달 관련만]
```

- **인증**: Supabase Auth (이메일·비밀번호). 쿠키 세션.
- **인가**: `profiles.role`(office/driver/admin) 기반 RLS 정책으로 DB 측에서 enforce.
- **API 라우트**: 미들웨어 통과 후 라우트 핸들러에서 `auth.getUser()` 한 번 더 확인 → 없으면 401.
- **CTI 브릿지**: service_role 키로 RLS 우회 (사무실 PC 로컬에만 보관).

## 6. 외부 의존성 / 환경변수

| 변수 | 용도 | 필수 | 위치 |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | ✅ | client+server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon 키 (RLS 적용) | ✅ | client+server |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role (RLS 우회, 서버 전용) | ⭕ import 시 | server only |
| `NEXT_PUBLIC_FIREBASE_*` | FCM 클라이언트 설정 | ⭕ 푸시 시 | client |
| `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Firebase Admin SDK | ⭕ 푸시 시 | server only |
| `OPENAI_API_KEY` | gpt-4o-mini 호출 | ❌ 없으면 LLM→pattern fallback | server only |

## 7. 배포

- **Vercel**: main 브랜치 push → 자동 빌드 + 배포
- **Supabase**: 별도 호스팅, 마이그레이션은 Supabase Studio SQL Editor에서 수동 실행 (DDL 자동 실행 금지 정책)
- **CTI 브릿지**: 사무실 PC에 1회 설치 후 Windows 자동 시작 등록 (`cti-bridge/setup-autostart.ps1`)
