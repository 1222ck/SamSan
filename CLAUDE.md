# SamSan - 삼산주유소 배달관리 PWA

## 프로젝트 개요
경남 고성 삼산주유소의 배달관리, 고객관리, 정산 자동화 PWA.
기존 카톡+공책+엑셀 3중 수기 입력을 앱 하나로 통합.

## 사용자
- 사무실 (어머니): 전화 수신 확인, 배달 지시, 고객/외상 관리
- 배달원 (아버지): 배달 목록 확인, 현장 완료 입력
- 관리자 (아들/개발자): 시스템 관리

## 기술 스택
- Frontend/Backend: Next.js 15 + TypeScript + Tailwind CSS
- DB + Auth + Realtime: Supabase (PostgreSQL)
- 푸시 알림: Firebase FCM (갤럭시 워치 미러링)
- 배포: Vercel
- CTI 브릿지: Python (별도 repo, 사무실 PC Windows 상주)

## 핵심 비즈니스 룰
- 외상 한도 없음. 음수 진입 시 경고만, 막지 않음
- 선입(선불) 잔액 음수 허용. 경고만.
- 잔액은 transactions 합산으로 계산 (저장하지 않음)
- 아버지의 판단을 막는 UI 금지 (경고는 가능)
- 결제유형: CARD / CASH / CASH_RECEIPT / CREDIT / TRANSFER / LOCAL_CURRENCY / PREPAID / TAX_EXEMPT_NHCARD / TAX_EXEMPT_UNION

## DB 핵심 테이블
- customers: id, name, memo, type(개인/업체)
- phone_numbers: id, customer_id, phone
- addresses: id, customer_id, address, fuel_type, memo
- transactions: id, customer_id, address_id, delivered_at, quantity_l, amount, payment_type, fuel_type, memo
- deliveries: id, customer_id, address_id, status(대기/배달중/완료), special_note, created_at
- incoming_calls: id, phone, received_at (CTI 브릿지가 insert)

## 역할별 접근 권한 (Supabase RLS)
- office: 모든 화면 접근
- driver: 배달 목록 + 완료 입력만
- admin: 전체 + 설정

## UI 원칙
- 배달원 화면: 글자 크게, 버튼 최소 48px, 장갑 낀 손으로도 탭 가능
- 사무실 화면: PC 브라우저 기준 레이아웃
- 에러 시 사용자 친화적 한국어 메시지
- 로딩 상태 항상 표시

## 개발 원칙
- 컴포넌트는 src/components/ 에
- Supabase 쿼리는 src/lib/supabase/ 에 분리
- 환경변수는 .env.local (절대 하드코딩 금지)
- 커밋 메시지: feat/fix/chore prefix 사용
