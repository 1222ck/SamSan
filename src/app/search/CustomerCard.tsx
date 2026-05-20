"use client";

import { useState } from "react";
import type { SearchHit } from "./types";

function normalize(s: string): string {
  return s.replace(/[-\s]/g, "").toLowerCase();
}

function isMatched(query: string, phone: string, label: string | null): boolean {
  const q = query.trim();
  if (!q) return false;
  const qNorm = normalize(q);
  if (!qNorm) return false;
  if (normalize(phone).includes(qNorm)) return true;
  if (label && label.toLowerCase().includes(q.toLowerCase())) return true;
  return false;
}

function telHref(phone: string): string {
  const digits = phone.replace(/[^0-9+]/g, "");
  return `tel:${digits}`;
}

export default function CustomerCard({
  hit,
  query,
}: {
  hit: SearchHit;
  query: string;
}) {
  const [memoOpen, setMemoOpen] = useState(false);
  const memoLines = hit.memo ? hit.memo.split("|").map((s) => s.trim()).filter(Boolean) : [];
  const addressNote = hit.address?.memo?.trim();
  const credit = hit.credit_balance ?? 0;
  const prepaid = hit.prepaid_balance ?? 0;
  const hasBalance = credit !== 0 || prepaid !== 0;

  return (
    <article className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      <header className="px-4 py-3 flex items-start justify-between gap-3 border-b border-gray-100">
        <h3 className="font-semibold text-gray-900 text-base">{hit.name}</h3>
        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full shrink-0">
          {hit.type}
        </span>
      </header>

      {hit.address && (
        <div className="px-4 py-3 text-sm text-gray-700 border-b border-gray-100">
          <span>{hit.address.address}</span>
          {addressNote && (
            <span className="text-gray-500"> ({addressNote})</span>
          )}
          {hit.address.fuel_type && (
            <span className="ml-2 text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
              {hit.address.fuel_type}
            </span>
          )}
        </div>
      )}

      {hasBalance && (
        <div className="px-4 py-2.5 flex flex-wrap gap-x-4 gap-y-1 text-sm border-b border-gray-100">
          {credit !== 0 && (
            <span className={credit > 0 ? "text-red-600 font-semibold" : "text-gray-600"}>
              외상 {credit.toLocaleString("ko-KR")}원
            </span>
          )}
          {prepaid !== 0 && (
            <span className={prepaid > 0 ? "text-blue-700 font-semibold" : "text-gray-600"}>
              선입 {prepaid.toLocaleString("ko-KR")}원
            </span>
          )}
        </div>
      )}

      {hit.phones.length > 0 && (
        <ul className="divide-y divide-gray-100">
          {hit.phones.map((p) => {
            const matched = isMatched(query, p.phone, p.label);
            return (
              <li key={p.id} className="px-4 py-2.5 flex items-center gap-3">
                <span aria-hidden className="text-gray-400">📞</span>
                <a
                  href={telHref(p.phone)}
                  className="text-blue-700 hover:underline font-medium tabular-nums"
                >
                  {p.phone}
                </a>
                {p.label && (
                  <span className="text-sm text-gray-500 truncate">{p.label}</span>
                )}
                {matched && (
                  <span
                    aria-label="검색어와 일치"
                    className="ml-auto text-yellow-500 text-sm"
                  >
                    ★
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {memoLines.length > 0 && (
        <div className="border-t border-gray-100">
          <button
            type="button"
            onClick={() => setMemoOpen((v) => !v)}
            className="w-full px-4 py-2.5 text-left text-sm text-gray-600 hover:bg-gray-50 flex items-center gap-2"
            aria-expanded={memoOpen}
          >
            <span aria-hidden>{memoOpen ? "▲" : "▽"}</span>
            <span>{memoOpen ? "메모 접기" : "메모 펼치기"}</span>
          </button>
          {memoOpen && (
            <div className="px-4 pb-3 text-sm text-gray-700 space-y-1">
              {memoLines.map((line, i) => (
                <p key={i} className="whitespace-pre-wrap break-words">
                  {line}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
