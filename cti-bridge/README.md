# SamSan CTI Bridge

콜사인(CallScreen)이 갱신하는 `C:\excelnote\전화수신목록.XL` 파일을 1초 간격으로 모니터링하여, 신규 발신번호를 Supabase `incoming_calls` 테이블에 INSERT한다. PWA 사무실 화면이 Realtime 구독으로 모달을 자동 표시.

## 구조

```
cti-bridge/
├── main.py                # 진입점, 모니터링 루프
├── config.py              # .env 로드 + 검증
├── logger_setup.py        # 콘솔 + 일자별 회전 파일 로깅
├── phone_parser.py        # cp949 디코드 + 정규식 + 블랙리스트
├── state.py               # state.json 영속화 (재시작 시 중복 방지)
├── supabase_client.py     # Supabase INSERT wrapper
├── requirements.txt
├── .env.example
└── README.md
```

## 발신/수신 분리 방식

콜사인은 **발신·수신을 쌍으로** 한 파일에 적는다. 짝수/홀수 인덱스로 가르면 콜사인이 포맷을 바꿀 때 깨지므로, 주유소 자기 회선(수신번호)을 `BLACKLIST_PHONES`에 명시해 두고 그 외 번호만 발신으로 간주한다.

블랙리스트 비교 시 하이픈/공백을 모두 제거한 뒤 비교한다.

## 설치

```powershell
cd C:\claude\samsan\SamSan\cti-bridge
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
notepad .env
```

`.env`에 채워야 하는 값:

| 키 | 값 |
|---|---|
| `SUPABASE_URL` | Supabase 대시보드 → Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | 같은 화면의 service_role secret |
| `CALLSCREEN_FILE_PATH` | 기본 `C:\excelnote\전화수신목록.XL` |
| `BLACKLIST_PHONES` | 주유소 자체 회선 (콤마 구분) |
| `POLL_INTERVAL_SECONDS` | 기본 1 |
| `LOG_LEVEL` | 기본 `INFO`. 디버깅 땐 `DEBUG` |

## 수동 실행 (테스트)

```powershell
.\venv\Scripts\activate
python main.py
```

`Ctrl+C`로 종료. 정상 종료 시 state.json이 마지막 인덱스로 갱신된다.

## Windows 작업 스케줄러 등록 (자동 시작)

부팅 시 백그라운드 실행되도록 GUI로 등록한다.

1. `Win + R` → `taskschd.msc` 실행
2. 우측 패널 **작업 만들기** 클릭 (단순 만들기 아님)
3. **일반** 탭
   - 이름: `SamSan CTI Bridge`
   - "사용자가 로그온 여부에 관계없이 실행" 선택
   - "가장 높은 수준의 권한으로 실행" 체크
   - 구성: Windows 10
4. **트리거** 탭 → 새로 만들기
   - 작업 시작: **시스템 시작 시**
   - 활성화 체크
5. **동작** 탭 → 새로 만들기
   - 동작: 프로그램 시작
   - 프로그램/스크립트: `C:\claude\samsan\SamSan\cti-bridge\venv\Scripts\pythonw.exe`
   - 인수 추가(옵션): `main.py`
   - 시작 위치(옵션): `C:\claude\samsan\SamSan\cti-bridge`
   - **`pythonw.exe` 사용 이유**: 콘솔 창이 안 뜨는 백그라운드 실행
6. **조건** 탭
   - "AC 전원에서만 실행" 체크 해제 (PC라 무관하지만 안전 측면)
7. **설정** 탭
   - "작업이 실패하는 경우 다시 시작 간격": **1분**
   - "다시 시작 시도 횟수": **999**
   - "요청 시 작업이 실행되도록 허용" 체크
   - "예약된 시간이 지난 후 가능한 한 빨리 작업 시작" 체크
8. 확인 → 사용자 비밀번호 입력 (로그온 비밀번호)

등록 후 **PC 재부팅**해서 자동 실행 확인.

### 동작 확인

- 작업 관리자 → **세부 정보** 탭 → `pythonw.exe` 프로세스 확인
- 로그: `C:\claude\samsan\SamSan\cti-bridge\logs\cti-bridge.log`

## 트러블슈팅

| 증상 | 점검 |
|---|---|
| 전화 와도 INSERT 안 됨 | `logs/cti-bridge.log` 확인 → 파일 경로, .env 값, 인터넷 연결 |
| 블랙리스트 번호가 INSERT됨 | `BLACKLIST_PHONES`에 해당 번호가 있는지, 정규화(하이픈 무시) 비교라 형식은 무관 |
| 재시작했더니 옛날 번호가 다 INSERT됨 | `state.json`이 디렉토리에 생성됐는지, 권한 문제로 쓰기 실패하는지 확인 |
| 작업 스케줄러가 등록은 됐는데 실행 안 됨 | "사용자 로그온 여부 관계없이" 체크했는지, pythonw.exe 절대경로 정확한지 |
| 콘솔 창이 계속 뜸 | 작업 스케줄러 동작에서 `python.exe`가 아니라 `pythonw.exe` 사용했는지 |
| 인터넷 끊김 후 누락분 복구 | 의도적으로 복구 안 함. 누락 + 로그만 |

## 로그 회전

`logs/cti-bridge.log`는 매일 자정에 회전, 7일치 보관 (`cti-bridge.log.2026-05-09` 형식).

## 종료 코드

| 코드 | 의미 |
|---|---|
| 0 | Ctrl+C로 정상 종료 |
| 1 | 예상치 못한 예외 (작업 스케줄러가 1분 후 재시작) |
