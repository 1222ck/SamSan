"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import CustomerCard from "./CustomerCard";
import type { SearchResponse } from "./types";

type State =
  | { kind: "idle" }
  | { kind: "loading"; query: string }
  | { kind: "ok"; query: string; data: SearchResponse }
  | { kind: "error"; query: string; message: string };

const BALANCE_LABEL: Record<string, string> = {
  credit: "외상",
  prepaid: "선입",
};

function routingLabel(data: SearchResponse): string {
  const { meta } = data;
  if (meta.routing === "pattern") return "pattern 라우팅";
  if (meta.routing === "balance") {
    const fn = meta.function ? ` (${BALANCE_LABEL[meta.function] ?? meta.function})` : "";
    return `잔액 라우팅${fn}`;
  }
  const fn = meta.function ? ` (${meta.function})` : "";
  return `AI 라우팅${fn}`;
}

function metaLine(data: SearchResponse): string {
  const parts: string[] = [
    `${data.meta.count}건`,
    routingLabel(data),
    `${data.meta.elapsed_ms}ms`,
  ];
  if (typeof data.meta.cost_usd === "number") {
    parts.push(`$${data.meta.cost_usd.toFixed(4)}`);
  }
  return parts.join(" · ");
}

export default function SearchPanel({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [input, setInput] = useState(initialQuery);
  const [state, setState] = useState<State>({ kind: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  const runSearch = useCallback(async (rawQuery: string) => {
    const query = rawQuery.trim();
    if (!query) return;

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setState({ kind: "loading", query });

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
        signal: ctrl.signal,
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        let message = `검색 실패 (HTTP ${res.status})`;
        const ct = res.headers.get("content-type") ?? "";
        if (ct.includes("application/json")) {
          try {
            const body = (await res.json()) as { error?: string };
            if (body.error) message = body.error;
          } catch {}
        }
        throw new Error(message);
      }
      const data = (await res.json()) as SearchResponse;
      setState({ kind: "ok", query, data });
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") return;
      const message = err instanceof Error ? err.message : "알 수 없는 오류";
      setState({ kind: "error", query, message });
    }
  }, []);

  useEffect(() => {
    if (initialQuery.trim()) {
      void runSearch(initialQuery);
    }
    // run-on-mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const q = searchParams.get("q") ?? "";
    if (!q.trim()) return;
    setInput((prev) => (prev === q ? prev : q));
    setState((prev) => {
      if (prev.kind === "loading" && prev.query === q) return prev;
      if (prev.kind === "ok" && prev.query === q) return prev;
      void runSearch(q);
      return prev;
    });
  }, [searchParams, runSearch]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = input.trim();
    if (!q) return;
    const next = `/search?q=${encodeURIComponent(q)}`;
    const current = `/search?q=${encodeURIComponent(searchParams.get("q") ?? "")}`;
    if (next === current) {
      void runSearch(q);
    } else {
      router.push(next);
    }
  };

  const disabled = !input.trim() || state.kind === "loading";

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 space-y-5">
      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          type="search"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="이름·전화번호·주소로 검색 (예: 김식백, 010-8331, 두포1길)"
          aria-label="검색어"
          autoComplete="off"
          className="flex-1 min-w-0 px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={disabled}
          className="px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
        >
          {state.kind === "loading" ? "검색 중…" : "검색"}
        </button>
      </form>

      {state.kind === "loading" && (
        <div
          role="status"
          className="flex items-center gap-2 text-sm text-gray-500"
        >
          <span
            aria-hidden
            className="inline-block w-3 h-3 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"
          />
          <span>&ldquo;{state.query}&rdquo; 검색 중…</span>
        </div>
      )}

      {state.kind === "error" && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-2">
          <p className="text-sm font-semibold text-red-700">검색 오류</p>
          <p className="text-sm text-red-700 break-words">{state.message}</p>
          <button
            type="button"
            onClick={() => runSearch(state.query)}
            className="text-sm font-medium text-red-700 underline hover:text-red-800"
          >
            다시 시도
          </button>
        </div>
      )}

      {state.kind === "ok" && (
        <>
          <p className="text-xs text-gray-500 tabular-nums">{metaLine(state.data)}</p>
          {state.data.results.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-10">
              검색 결과가 없습니다. 다른 키워드로 시도해보세요.
            </p>
          ) : (
            <ul className="space-y-3">
              {state.data.results.map((hit) => (
                <li key={hit.customer_id}>
                  <CustomerCard hit={hit} query={state.query} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
