# CTI 브릿지 ↔ SamSan 웹 API 계약

사무실 PC(Windows)에서 상주하는 Python 브릿지가 전화 수신을 감지하면 Supabase의 `incoming_calls` 테이블에 row 1개를 insert 한다. 웹 사무실 화면이 realtime 구독으로 즉시 배너를 띄운다.

## 1. 브릿지 책임 범위
- 발신자 번호 캡처 (CTI 장비/모뎀/녹취 장비 등에서)
- Supabase에 row 1개 insert
- 실패 시 자체 재시도/큐잉 (네트워크 끊김 대비)

브릿지는 **삽입만** 한다. 매칭, UI, 상태 변경은 웹이 담당.

## 2. 인증
- **Supabase service_role 키 사용**. anon 키로는 RLS에 막힘.
- 키는 사무실 PC 로컬 환경변수(또는 `secrets.json` 등 OS 권한으로 보호되는 위치)에 저장. 절대 git에 커밋 금지.

```bash
# Windows: setx 또는 .env 파일
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-jwt>
```

## 3. Insert payload

테이블: `public.incoming_calls`

| 컬럼 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `id` | uuid | x | 자동 (default `gen_random_uuid()`) |
| `phone` | text | **o** | 발신자 번호. 포맷 자유 (예: `01012345678`, `010-1234-5678`, `+821012345678`). 웹이 끝 8자리로 매칭 |
| `received_at` | timestamptz | x | 자동 (default `now()`). 브릿지가 명시 가능 |
| `handled_at` | timestamptz | x | 웹에서만 설정. 브릿지는 건드리지 않음 |
| `handled_by` | uuid | x | 웹에서만 설정 |

### Python 예시 (supabase-py)

```python
from supabase import create_client
import os

sb = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_SERVICE_ROLE_KEY"],
)

def on_incoming_call(phone: str):
    sb.table("incoming_calls").insert({"phone": phone}).execute()
```

### 순수 REST 예시

```http
POST https://<project>.supabase.co/rest/v1/incoming_calls
apikey: <service_role_key>
Authorization: Bearer <service_role_key>
Content-Type: application/json
Prefer: return=minimal

{"phone": "01012345678"}
```

## 4. 전화번호 포맷
- 웹은 매칭 시 모든 비숫자 제거 후 **끝 8자리** 일치를 사용 (`phone_numbers.phone ILIKE '%<tail8>%'`).
- 따라서 브릿지는 별도 정규화 없이 받은 그대로 보내도 됨.
- 단, 너무 짧은 번호(8자리 미만)는 매칭이 부정확할 수 있음.

## 5. 재시도/장애 처리
- Supabase 호출 실패 시 브릿지가 로컬 큐(파일/SQLite)에 적재 후 재시도.
- 1분 이상 인서트 지연되면 사무실 화면에서 의미 없음 → 너무 오래된 큐 항목은 폐기 권장.

## 6. 웹 측 동작 요약
- `incoming_calls` realtime INSERT 구독 (`src/components/office/IncomingCallBanner.tsx`)
- 전화번호 → `phone_numbers` 매칭으로 고객 찾기
- 매칭 시 "새 배달" 버튼 → `/office?customer_id=<id>` 로 이동, 폼에 자동 선택
- 미등록 시 "고객 등록" 버튼 → `/office?phone=<phone>` 로 이동, AddCustomerModal 자동 오픈
- 처리/닫기 시 `handled_at = now()` 마킹 (재진입 시 재표시 방지)

## 7. 개발/테스트
브릿지 없이 수동 insert 로 테스트:

```sql
insert into public.incoming_calls (phone) values ('01012345678');
```

→ 사무실 화면 상단에 즉시 배너가 떠야 함.
