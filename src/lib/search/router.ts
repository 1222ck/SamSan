import { SEARCH_FUNCTIONS, type RouteDecision } from "./types";

const ADDRESS_KEYWORDS = ["길", "로", "동", "리", "면", "아파트", "빌라"];

// 전화번호: 숫자/하이픈/공백 7~15자
const PHONE_RE = /^[\d\-\s]{7,15}$/;

// 한글 이름: 한글 2~5자
const NAME_RE = /^[가-힣]{2,5}$/;

// LLM 호출 전 단순 패턴으로 결정 가능한 경우만 라우팅.
// 매칭 없으면 null 반환 → 호출 측이 LLM 경로로 폴백.
export function tryPatternRoute(rawQuery: string): RouteDecision | null {
  const query = rawQuery.trim();

  // 1) 전화번호
  if (PHONE_RE.test(query)) {
    const digits = query.replace(/[\s-]/g, "");
    return {
      function: SEARCH_FUNCTIONS.BY_PHONE,
      params: { query_digits: digits },
      reasoning: "전화번호 패턴",
    };
  }

  // 2) 한글 이름 (가게명/사람명 모두 fuzzy로 잡음)
  if (NAME_RE.test(query)) {
    return {
      function: SEARCH_FUNCTIONS.BY_NAME,
      params: { query_name: query, fuzzy: true },
      reasoning: "한글 이름 패턴",
    };
  }

  // 3) 주소 키워드 포함 + 단일 토큰(공백 없음) + 길이 ≥ 3
  //    문장형 입력("두포1길 사는 사람들")은 공백 때문에 여기서 빠지고 LLM으로 넘어감
  const hasSpace = /\s/.test(query);
  const hasAddressKeyword = ADDRESS_KEYWORDS.some((kw) => query.includes(kw));
  if (!hasSpace && query.length >= 3 && hasAddressKeyword) {
    return {
      function: SEARCH_FUNCTIONS.BY_ADDRESS,
      params: { query_addr: query },
      reasoning: "주소 키워드 패턴",
    };
  }

  return null;
}
