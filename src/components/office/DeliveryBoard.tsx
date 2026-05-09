"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  getActiveDeliveries,
  getDeliveriesByDate,
  updateDeliveryStatus,
  type DeliveryRow,
} from "@/lib/supabase/queries/deliveries";

const FUEL_BADGE: Record<string, string> = {
  경유: "bg-gray-100 text-gray-700",
  등유: "bg-orange-100 text-orange-700",
};

const STATUS_BADGE: Record<string, string> = {
  대기: "bg-yellow-100 text-yellow-700",
  배달중: "bg-blue-100 text-blue-700",
  완료: "bg-green-100 text-green-700",
};

function todayStr() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

type Tab = "대기" | "배달중" | "날짜별";

export default function DeliveryBoard() {
  const [tab, setTab] = useState<Tab>("대기");

  // 실시간 탭 상태
  const [active, setActive] = useState<DeliveryRow[]>([]);
  const [activeLoading, setActiveLoading] = useState(true);

  // 날짜별 탭 상태
  const [date, setDate] = useState(todayStr());
  const [dated, setDated] = useState<DeliveryRow[]>([]);
  const [datedLoading, setDatedLoading] = useState(false);

  const loadActive = useCallback(async () => {
    const { data } = await getActiveDeliveries();
    if (data) setActive(data);
    setActiveLoading(false);
  }, []);

  const loadDated = useCallback(async (d: string) => {
    setDatedLoading(true);
    const { data } = await getDeliveriesByDate(d);
    setDated(data ?? []);
    setDatedLoading(false);
  }, []);

  // 실시간 구독
  useEffect(() => {
    loadActive();
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        supabase.realtime.setAuth(session.access_token);
      }
      if (cancelled) return;

      channel = supabase
        .channel("deliveries-board")
        .on("postgres_changes", { event: "*", schema: "public", table: "deliveries" }, () => {
          loadActive();
          if (tab === "날짜별") loadDated(date);
        })
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [loadActive, loadDated, tab, date]);

  // 날짜별 탭 진입 or 날짜 변경 시 조회
  useEffect(() => {
    if (tab === "날짜별") loadDated(date);
  }, [tab, date, loadDated]);

  const count = (s: string) => active.filter((d) => d.status === s).length;
  const filtered = active.filter((d) => d.status === tab);

  return (
    <div className="bg-white rounded-xl border border-gray-200 flex flex-col">
      {/* 탭 */}
      <div className="flex border-b border-gray-200 shrink-0">
        {(["대기", "배달중", "날짜별"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              tab === t
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t === "대기" || t === "배달중" ? (
              <>
                {t}
                <span className="ml-1.5 text-xs bg-gray-100 rounded-full px-2 py-0.5">
                  {count(t)}
                </span>
              </>
            ) : (
              t
            )}
          </button>
        ))}
      </div>

      {/* 날짜별 탭: 날짜 선택기 */}
      {tab === "날짜별" && (
        <div className="px-4 pt-3 pb-2 border-b border-gray-100">
          <input
            type="date"
            value={date}
            max={todayStr()}
            onChange={(e) => setDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="ml-3 text-sm text-gray-400">
            {dated.length}건
          </span>
        </div>
      )}

      {/* 배달 목록 */}
      <div className="overflow-y-auto p-4 space-y-3 max-h-[calc(100vh-220px)]">
        {/* 실시간 탭 (대기/배달중) */}
        {tab !== "날짜별" && (
          activeLoading ? (
            <p className="text-center text-gray-400 py-10 text-sm">불러오는 중...</p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-gray-400 py-10 text-sm">{tab} 건이 없습니다</p>
          ) : (
            filtered.map((d) => (
              <ActiveCard key={d.id} d={d} />
            ))
          )
        )}

        {/* 날짜별 탭 */}
        {tab === "날짜별" && (
          datedLoading ? (
            <p className="text-center text-gray-400 py-10 text-sm">불러오는 중...</p>
          ) : dated.length === 0 ? (
            <p className="text-center text-gray-400 py-10 text-sm">해당 날짜 배달 내역이 없습니다</p>
          ) : (
            dated.map((d) => (
              <DateCard key={d.id} d={d} />
            ))
          )
        )}
      </div>
    </div>
  );
}

function ActiveCard({ d }: { d: DeliveryRow }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 space-y-2 hover:border-gray-300 transition-colors">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-gray-900">{d.customers?.name ?? "-"}</span>
        <span className="text-xs text-gray-400">{formatTime(d.created_at)}</span>
      </div>
      {d.addresses && (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span>{d.addresses.address}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${FUEL_BADGE[d.addresses.fuel_type] ?? "bg-gray-100 text-gray-600"}`}>
            {d.addresses.fuel_type}
          </span>
        </div>
      )}
      {d.special_note && (
        <p className="text-sm text-red-600 font-medium">⚠ {d.special_note}</p>
      )}
      <div className="pt-1">
        {d.status === "대기" && (
          <button
            onClick={() => updateDeliveryStatus(d.id, "배달중")}
            className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            배달 시작
          </button>
        )}
        {d.status === "배달중" && (
          <button
            onClick={() => updateDeliveryStatus(d.id, "완료")}
            className="text-sm px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            완료 처리
          </button>
        )}
      </div>
    </div>
  );
}

function DateCard({ d }: { d: DeliveryRow }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-gray-900">{d.customers?.name ?? "-"}</span>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[d.status]}`}>
            {d.status}
          </span>
          <span className="text-xs text-gray-400">{formatTime(d.created_at)}</span>
        </div>
      </div>
      {d.addresses && (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span>{d.addresses.address}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${FUEL_BADGE[d.addresses.fuel_type] ?? "bg-gray-100 text-gray-600"}`}>
            {d.addresses.fuel_type}
          </span>
        </div>
      )}
      {d.special_note && (
        <p className="text-sm text-red-600 font-medium">⚠ {d.special_note}</p>
      )}
    </div>
  );
}
