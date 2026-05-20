// =====================================================================
// PII 정책 (한국 개인정보보호법) — 2026-05-20 결정
// =====================================================================
// 이 모듈은 사용자 검색어를 OpenAI(미국 서버)로 송신한다.
// 패턴 라우터에서 못 잡은 자연어 입력 → 고객명·가게명·주소가 그대로 포함될 수 있음.
//
// 현재 정책: 비즈니스 리스크 수용. 다음 항목을 후속 처리해야 함:
//   [ ] 이용약관·개인정보처리방침에 "검색 편의를 위해 OpenAI API로 일부
//        텍스트가 전송될 수 있음" 명시 (국외 이전 동의 항목)
//   [ ] OpenAI Data Processing Addendum 검토 (zero data retention 옵션 가능)
//   [ ] 로그에 검색어 평문 저장 시 보존 기간 정책 수립
//
// 향후 대안 (현재 미적용):
//   - 입력 익명화: 패턴이 못 잡는 자연어는 LLM 본질상 어려움 (UX 타격)
//   - 국내 LLM: Naver HyperCLOVA X / Upstage Solar 전환 (Step 4~5에서 검토)
// =====================================================================

import {
  SEARCH_FUNCTIONS,
  type RouteDecision,
  type SearchFunction,
} from "./types";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL = "gpt-4o-mini";
const TIMEOUT_MS = 5000;
const MAX_TOKENS = 200;

// gpt-4o-mini 가격 (USD per 1M tokens)
const INPUT_COST_PER_M = 0.15;
const OUTPUT_COST_PER_M = 0.6;

const SYSTEM_PROMPT = `당신은 한국 주유소의 고객 검색 시스템 라우터입니다.
사용자 입력을 분석해 호출할 함수와 파라미터를 JSON으로만 반환하세요.

사용 가능한 함수:
- search_by_phone(query_digits: string)         // 전화번호로 검색
- search_by_name(query_name: string, fuzzy: bool) // 이름·가게명
- search_by_address(query_addr: string)         // 주소
- search_combined(query_name?: string, query_phone?: string, query_address?: string) // 복합

규칙:
- 출력은 반드시 다음 JSON 스키마. 다른 텍스트 금지.
  { "function": "...", "params": { ... }, "reasoning": "..." }
- 호출할 함수 1개만 선택
- params 키는 함수 시그니처와 정확히 일치
- 검색어가 모호하면 가장 가능성 높은 1개 선택
- reasoning은 한국어 한 문장

예제
입력: "두포1길에 사는 김씨들"
출력: { "function": "search_combined", "params": { "query_name": "김", "query_address": "두포1길" }, "reasoning": "주소와 성으로 복합 검색" }

입력: "큰들횟집 전화번호 좀"
출력: { "function": "search_by_name", "params": { "query_name": "큰들횟집", "fuzzy": false }, "reasoning": "가게 정확 명칭" }

입력: "010-4141 로 시작하는 번호"
출력: { "function": "search_by_phone", "params": { "query_digits": "0104141" }, "reasoning": "전화번호 부분일치" }`;

const VALID_FUNCTIONS: ReadonlyArray<SearchFunction> = [
  SEARCH_FUNCTIONS.BY_PHONE,
  SEARCH_FUNCTIONS.BY_NAME,
  SEARCH_FUNCTIONS.BY_ADDRESS,
  SEARCH_FUNCTIONS.COMBINED,
];

export class LlmTimeoutError extends Error {
  constructor() {
    super("OpenAI request timed out");
    this.name = "LlmTimeoutError";
  }
}

export class LlmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmError";
  }
}

export interface LlmResult {
  decision: RouteDecision;
  cost_usd: number;
  duration_ms: number;
  prompt_tokens: number;
  completion_tokens: number;
}

// LLM 응답을 RouteDecision으로 검증·정규화.
// 함수별 파라미터 키가 정확히 맞는지 확인하고, 어긋나면 LlmError throw.
function validateDecision(raw: unknown): RouteDecision {
  if (!raw || typeof raw !== "object") {
    throw new LlmError("LLM 응답이 JSON 객체가 아님");
  }
  const obj = raw as Record<string, unknown>;
  const fn = obj.function;
  const params = obj.params;
  const reasoning =
    typeof obj.reasoning === "string" ? obj.reasoning : undefined;

  if (
    typeof fn !== "string" ||
    !VALID_FUNCTIONS.includes(fn as SearchFunction)
  ) {
    throw new LlmError(`알 수 없는 함수: ${String(fn)}`);
  }
  if (!params || typeof params !== "object") {
    throw new LlmError("params 누락");
  }
  const p = params as Record<string, unknown>;

  switch (fn as SearchFunction) {
    case SEARCH_FUNCTIONS.BY_PHONE: {
      if (typeof p.query_digits !== "string" || !p.query_digits) {
        throw new LlmError("search_by_phone: query_digits 필요");
      }
      return {
        function: SEARCH_FUNCTIONS.BY_PHONE,
        params: { query_digits: p.query_digits },
        reasoning,
      };
    }
    case SEARCH_FUNCTIONS.BY_NAME: {
      if (typeof p.query_name !== "string" || !p.query_name) {
        throw new LlmError("search_by_name: query_name 필요");
      }
      return {
        function: SEARCH_FUNCTIONS.BY_NAME,
        params: { query_name: p.query_name, fuzzy: p.fuzzy === true },
        reasoning,
      };
    }
    case SEARCH_FUNCTIONS.BY_ADDRESS: {
      if (typeof p.query_addr !== "string" || !p.query_addr) {
        throw new LlmError("search_by_address: query_addr 필요");
      }
      return {
        function: SEARCH_FUNCTIONS.BY_ADDRESS,
        params: { query_addr: p.query_addr },
        reasoning,
      };
    }
    case SEARCH_FUNCTIONS.COMBINED: {
      const out: {
        query_name?: string;
        query_phone?: string;
        query_address?: string;
      } = {};
      if (typeof p.query_name === "string" && p.query_name)
        out.query_name = p.query_name;
      if (typeof p.query_phone === "string" && p.query_phone)
        out.query_phone = p.query_phone;
      if (typeof p.query_address === "string" && p.query_address)
        out.query_address = p.query_address;
      if (Object.keys(out).length === 0) {
        throw new LlmError("search_combined: 최소 한 개 파라미터 필요");
      }
      return {
        function: SEARCH_FUNCTIONS.COMBINED,
        params: out,
        reasoning,
      };
    }
  }
  throw new LlmError("도달 불가");
}

interface RawCall {
  decision: RouteDecision;
  prompt_tokens: number;
  completion_tokens: number;
}

async function callOpenAIOnce(
  query: string,
  apiKey: string
): Promise<RawCall> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0,
        max_tokens: MAX_TOKENS,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: query },
        ],
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (
      err instanceof Error &&
      (err.name === "AbortError" || err.message.includes("aborted"))
    ) {
      throw new LlmTimeoutError();
    }
    throw new LlmError(
      `OpenAI 요청 실패: ${err instanceof Error ? err.message : String(err)}`
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new LlmError(
      `OpenAI HTTP ${response.status}: ${text.slice(0, 200)}`
    );
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const raw = payload.choices?.[0]?.message?.content;
  if (typeof raw !== "string") {
    throw new LlmError("OpenAI 응답에 content 없음");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new LlmError(`OpenAI JSON 파싱 실패: ${raw.slice(0, 200)}`);
  }
  const decision = validateDecision(parsed);

  return {
    decision,
    prompt_tokens: payload.usage?.prompt_tokens ?? 0,
    completion_tokens: payload.usage?.completion_tokens ?? 0,
  };
}

// 메인 엔트리. 검증 실패/일시적 오류 시 1회 재시도. 타임아웃은 즉시 전파.
export async function routeWithLlm(query: string): Promise<LlmResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new LlmError("OPENAI_API_KEY 환경변수 누락");
  }

  const start = Date.now();
  let result: RawCall;
  try {
    result = await callOpenAIOnce(query, apiKey);
  } catch (err) {
    if (err instanceof LlmTimeoutError) throw err;
    console.warn(
      "LLM 라우팅 1차 시도 실패, 재시도:",
      err instanceof Error ? err.message : err
    );
    result = await callOpenAIOnce(query, apiKey);
  }

  const cost_usd =
    (result.prompt_tokens * INPUT_COST_PER_M +
      result.completion_tokens * OUTPUT_COST_PER_M) /
    1_000_000;

  return {
    decision: result.decision,
    cost_usd,
    duration_ms: Date.now() - start,
    prompt_tokens: result.prompt_tokens,
    completion_tokens: result.completion_tokens,
  };
}
