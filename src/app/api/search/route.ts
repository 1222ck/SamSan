import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decideRoute } from "@/lib/search/router";
import {
  deriveFunctionName,
  intentSearch,
  patternSearch,
} from "@/lib/search/pattern";
import {
  attachBalances,
  balanceSearch,
  detectBalanceQuery,
} from "@/lib/search/balance";
import { extractIntent, LlmUnavailableError } from "@/lib/search/llm";
import type { SearchResponse, SearchHit } from "@/lib/search/types";

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (!q) {
    return NextResponse.json({ error: "검색어가 비어있습니다" }, { status: 400 });
  }

  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  let routing = decideRoute(q);
  let functionName: string | undefined;
  let cost_usd: number | undefined;
  let results: SearchHit[];

  const balanceKind = detectBalanceQuery(q);
  if (balanceKind) {
    routing = "balance";
    functionName = balanceKind;
  }

  try {
    if (routing === "balance" && balanceKind) {
      results = await balanceSearch(sb, balanceKind);
    } else if (routing === "llm") {
      try {
        const { intent, cost_usd: c } = await extractIntent(q);
        cost_usd = c;
        functionName = deriveFunctionName(intent);
        results =
          Object.keys(intent).length === 0
            ? await patternSearch(sb, q)
            : await intentSearch(sb, intent);
      } catch (err) {
        if (err instanceof LlmUnavailableError) {
          routing = "pattern";
          results = await patternSearch(sb, q);
        } else {
          throw err;
        }
      }
    } else {
      results = await patternSearch(sb, q);
    }

    results = await attachBalances(sb, results);

    const response: SearchResponse = {
      query: q,
      meta: {
        count: results.length,
        routing,
        elapsed_ms: Date.now() - started,
        ...(functionName ? { function: functionName } : {}),
        ...(typeof cost_usd === "number" ? { cost_usd } : {}),
      },
      results,
    };
    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
