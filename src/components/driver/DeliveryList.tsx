"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  getActiveDeliveries,
  updateDeliveryStatus,
  type DeliveryRow,
} from "@/lib/supabase/queries/deliveries";
import CompleteModal from "./CompleteModal";

const FUEL_BADGE: Record<string, string> = {
  경유: "bg-gray-100 text-gray-700",
  등유: "bg-orange-100 text-orange-700",
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function DeliveryList() {
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState<DeliveryRow | null>(null);

  const load = useCallback(async () => {
    const { data } = await getActiveDeliveries();
    if (data) setDeliveries(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const supabase = createClient();
    const channel = supabase
      .channel("driver-deliveries")
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  function startDelivery(d: DeliveryRow) {
    // 즉시 UI 업데이트
    setDeliveries((prev) =>
      prev.map((item) => item.id === d.id ? { ...item, status: "배달중" } : item)
    );
    updateDeliveryStatus(d.id, "배달중").catch(() => load());
  }

  const waiting = deliveries.filter((d) => d.status === "대기");
  const delivering = deliveries.filter((d) => d.status === "배달중");

  function DeliveryCard({ d }: { d: DeliveryRow }) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <span className="text-2xl font-bold text-gray-900">
            {d.customers?.name ?? "-"}
          </span>
          <span className="text-sm text-gray-400 mt-1 shrink-0">
            {formatTime(d.created_at)}
          </span>
        </div>

        {d.addresses && (
          <div className="space-y-1">
            <p className="text-lg text-gray-700">{d.addresses.address}</p>
            <span
              className={`inline-block text-sm px-3 py-1 rounded-full font-medium ${
                FUEL_BADGE[d.addresses.fuel_type] ?? "bg-gray-100 text-gray-600"
              }`}
            >
              {d.addresses.fuel_type}
            </span>
          </div>
        )}

        {d.special_note && (
          <p className="text-base text-red-600 font-semibold bg-red-50 px-3 py-2 rounded-xl">
            ⚠ {d.special_note}
          </p>
        )}

        <div className="pt-1">
          {d.status === "대기" && (
            <button
              onClick={() => startDelivery(d)}
              className="w-full py-4 bg-blue-600 text-white text-lg font-bold rounded-xl hover:bg-blue-700 active:bg-blue-800 transition-colors"
            >
              배달 시작
            </button>
          )}
          {d.status === "배달중" && (
            <button
              onClick={() => setCompleting(d)}
              className="w-full py-4 bg-green-600 text-white text-lg font-bold rounded-xl hover:bg-green-700 active:bg-green-800 transition-colors"
            >
              완료 입력
            </button>
          )}
        </div>
      </div>
    );
  }

  if (loading) {
    return <p className="text-center text-gray-400 py-16 text-lg">불러오는 중...</p>;
  }

  if (deliveries.length === 0) {
    return <p className="text-center text-gray-400 py-16 text-xl">배달 건이 없습니다</p>;
  }

  return (
    <>
      <div className="space-y-6">
        {delivering.length > 0 && (
          <section>
            <h2 className="text-base font-semibold text-blue-600 mb-3 px-1">
              배달중 {delivering.length}건
            </h2>
            <div className="space-y-3">
              {delivering.map((d) => <DeliveryCard key={d.id} d={d} />)}
            </div>
          </section>
        )}

        {waiting.length > 0 && (
          <section>
            <h2 className="text-base font-semibold text-gray-500 mb-3 px-1">
              대기 {waiting.length}건
            </h2>
            <div className="space-y-3">
              {waiting.map((d) => <DeliveryCard key={d.id} d={d} />)}
            </div>
          </section>
        )}
      </div>

      {completing && (
        <CompleteModal
          delivery={completing}
          onClose={() => {
            setCompleting(null);
            load();
          }}
        />
      )}
    </>
  );
}
