import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { tryPatternRoute } from "@/lib/search/router";
import {
  routeWithLlm,
  LlmTimeoutError,
  LlmError,
} from "@/lib/search/openai";
import {
  ERROR_CODES,
  SEARCH_ALLOWED_ROLES,
  type RouteDecision,
  type SearchAllowedRole,
  type SearchPath,
  type SearchResultRow,
  type SearchSuccessResponse,
} from "@/lib/search/types";

export const runtime = "nodejs";

const MAX_QUERY_LENGTH = 200;

export async function POST(request: NextRequest) {
  const startTotal = Date.now();

  // 1) 인증 확인 (anon 키 + 쿠키로 세션 검증; service_role은 RPC 호출에만)
  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    }
  );
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: ERROR_CODES.UNAUTHORIZED, message: "로그인이 필요합니다." },
      { status: 401 }
    );
  }

  // 1-1) 역할(role) 검사 — office/admin 만 검색 허용
  //      service_role 키로 profiles 조회 (RLS 우회, 안정적)
  //      driver는 배달 목록 전용이라 고객 DB 전체 검색 불가
  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<{ role: string }>();

  if (
    profileError ||
    !profile ||
    !SEARCH_ALLOWED_ROLES.includes(profile.role as SearchAllowedRole)
  ) {
    if (profileError) {
      console.error("profiles 조회 실패:", profileError.message);
    }
    return NextResponse.json(
      { error: ERROR_CODES.FORBIDDEN, message: "검색 권한이 없습니다." },
      { status: 403 }
    );
  }

  // 2) 입력 파싱 + 검증
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: ERROR_CODES.VALIDATION_ERROR,
        message: "요청 본문이 JSON이 아닙니다.",
      },
      { status: 400 }
    );
  }

  const rawQuery =
    body && typeof body === "object"
      ? (body as Record<string, unknown>).query
      : undefined;

  if (typeof rawQuery !== "string") {
    return NextResponse.json(
      {
        error: ERROR_CODES.VALIDATION_ERROR,
        message: "query는 문자열이어야 합니다.",
      },
      { status: 400 }
    );
  }
  const trimmed = rawQuery.trim();
  if (!trimmed) {
    return NextResponse.json(
      {
        error: ERROR_CODES.VALIDATION_ERROR,
        message: "검색어가 비어 있습니다.",
      },
      { status: 400 }
    );
  }
  if (trimmed.length > MAX_QUERY_LENGTH) {
    return NextResponse.json(
      {
        error: ERROR_CODES.VALIDATION_ERROR,
        message: `검색어는 ${MAX_QUERY_LENGTH}자 이하여야 합니다.`,
      },
      { status: 400 }
    );
  }

  // 3) 라우팅: 패턴 → 실패 시 LLM
  let decision: RouteDecision;
  let path: SearchPath;
  let llmCost: number | undefined;

  const patternMatch = tryPatternRoute(trimmed);
  if (patternMatch) {
    decision = patternMatch;
    path = "pattern";
  } else {
    try {
      const llmResult = await routeWithLlm(trimmed);
      decision = llmResult.decision;
      llmCost = llmResult.cost_usd;
      path = "llm";
    } catch (err) {
      if (err instanceof LlmTimeoutError) {
        return NextResponse.json(
          {
            error: ERROR_CODES.LLM_ERROR,
            message: "OpenAI 응답 시간 초과 (5초)",
          },
          { status: 504 }
        );
      }
      console.error(
        "LLM 라우팅 실패:",
        err instanceof Error ? err.message : err
      );
      return NextResponse.json(
        {
          error: ERROR_CODES.LLM_ERROR,
          message:
            err instanceof LlmError
              ? err.message
              : "LLM 라우팅 중 오류가 발생했습니다.",
        },
        { status: 500 }
      );
    }
  }

  // 4) Supabase RPC 호출 (service_role, 위에서 만든 admin 재사용)
  const { data, error } = await admin.rpc(
    decision.function,
    decision.params as Record<string, unknown>
  );

  if (error) {
    console.error("Supabase RPC 실패:", decision.function, error.message);
    return NextResponse.json(
      { error: ERROR_CODES.DB_ERROR, message: error.message },
      { status: 500 }
    );
  }

  const response: SearchSuccessResponse = {
    results: Array.isArray(data) ? (data as SearchResultRow[]) : [],
    meta: {
      path,
      function: decision.function,
      params: decision.params as Record<string, unknown>,
      duration_ms: Date.now() - startTotal,
      ...(llmCost !== undefined ? { llm_cost_usd: llmCost } : {}),
    },
  };

  return NextResponse.json(response);
}
