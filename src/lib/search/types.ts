// 검색 함수명 enum (문자열 하드코딩 금지)
export const SEARCH_FUNCTIONS = {
  BY_PHONE: "search_by_phone",
  BY_NAME: "search_by_name",
  BY_ADDRESS: "search_by_address",
  COMBINED: "search_combined",
} as const;

export type SearchFunction =
  (typeof SEARCH_FUNCTIONS)[keyof typeof SEARCH_FUNCTIONS];

export const ERROR_CODES = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  LLM_ERROR: "LLM_ERROR",
  DB_ERROR: "DB_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED", // 미인증 (401)
  FORBIDDEN: "FORBIDDEN", // 권한 부족 (403, 예: driver 계정)
} as const;

// 검색 API 접근 허용 role 화이트리스트
// driver는 배달 목록만 보이는 게 원칙이므로 고객 DB 검색 불가
export const SEARCH_ALLOWED_ROLES = ["office", "admin"] as const;
export type SearchAllowedRole = (typeof SEARCH_ALLOWED_ROLES)[number];

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

// 함수별 파라미터 타입 (RPC 시그니처와 정확히 일치)
export type ByPhoneParams = { query_digits: string };
export type ByNameParams = { query_name: string; fuzzy: boolean };
export type ByAddressParams = { query_addr: string };
export type CombinedParams = {
  query_name?: string;
  query_phone?: string;
  query_address?: string;
};

// 라우터(패턴/LLM)가 결정한 호출 의도
export type RouteDecision =
  | {
      function: typeof SEARCH_FUNCTIONS.BY_PHONE;
      params: ByPhoneParams;
      reasoning?: string;
    }
  | {
      function: typeof SEARCH_FUNCTIONS.BY_NAME;
      params: ByNameParams;
      reasoning?: string;
    }
  | {
      function: typeof SEARCH_FUNCTIONS.BY_ADDRESS;
      params: ByAddressParams;
      reasoning?: string;
    }
  | {
      function: typeof SEARCH_FUNCTIONS.COMBINED;
      params: CombinedParams;
      reasoning?: string;
    };

export type SearchPath = "pattern" | "llm";

// RPC 응답 행 (Step 1에서 정의된 4개 RPC가 공통으로 반환하는 모양)
export interface SearchResultRow {
  customer_id: string;
  name: string;
  type: string;
  memo: string | null;
  raw_row_no: number | null;
  phones: unknown;
  addresses: unknown;
  match_score: number | null;
}

export interface SearchSuccessResponse {
  results: SearchResultRow[];
  meta: {
    path: SearchPath;
    function: SearchFunction;
    params: Record<string, unknown>;
    duration_ms: number;
    llm_cost_usd?: number;
  };
}

export interface SearchErrorResponse {
  error: ErrorCode;
  message: string;
}
