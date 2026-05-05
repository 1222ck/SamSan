"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  getTransactionsByDate,
  calcFuelSummary,
  PAYMENT_LABEL,
  type TransactionWithDetails,
} from "@/lib/supabase/queries/transactions";

function todayStr() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

function won(n: number) {
  return n.toLocaleString("ko-KR") + "원";
}

const PAYMENT_BADGE: Record<string, string> = {
  CREDIT: "bg-red-100 text-red-700",
  CASH: "bg-gray-100 text-gray-600",
  CARD: "bg-blue-100 text-blue-700",
  TRANSFER: "bg-purple-100 text-purple-700",
  PREPAID: "bg-yellow-100 text-yellow-700",
  CASH_RECEIPT: "bg-gray-100 text-gray-600",
  LOCAL_CURRENCY: "bg-green-100 text-green-700",
  TAX_EXEMPT_NHCARD: "bg-orange-100 text-orange-700",
  TAX_EXEMPT_UNION: "bg-orange-100 text-orange-700",
};

const FUEL_ORDER = ["경유", "등유", "기타"];

export default function SalesBoard() {
  const [date, setDate] = useState(todayStr());
  const [transactions, setTransactions] = useState<TransactionWithDetails[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    const { data } = await getTransactionsByDate(d);
    setTransactions(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load(date);
  }, [date, load]);

  // 오늘 날짜일 때 실시간 구독
  useEffect(() => {
    if (date !== todayStr()) return;
    const supabase = createClient();
    const channel = supabase
      .channel("sales-board")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "transactions" }, () => {
        load(date);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [date, load]);

  const summary = calcFuelSummary(transactions);
  const totalAmount = transactions.reduce((s, t) => s + t.amount, 0);
  const fuelKeys = FUEL_ORDER.filter((f) => summary[f]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 flex flex-col">
      {/* 날짜 선택 */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-200">
        <input
          type="date"
          value={date}
          max={todayStr()}
          onChange={(e) => setDate(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {date !== todayStr() && (
          <button
            onClick={() => setDate(todayStr())}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            오늘
          </button>
        )}
        <span className="text-sm text-gray-400 ml-auto">
          {loading ? "..." : `${transactions.length}건`}
        </span>
      </div>

      {/* 배달 목록 */}
      <div className="overflow-y-auto max-h-[calc(100vh-300px)]">
        {loading ? (
          <p className="text-center text-gray-400 py-12 text-sm">불러오는 중...</p>
        ) : transactions.length === 0 ? (
          <p className="text-center text-gray-400 py-12 text-sm">배달 내역이 없습니다</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-400 bg-gray-50">
                <th className="text-left px-5 py-2.5 font-medium">고객</th>
                <th className="text-left px-3 py-2.5 font-medium">주소</th>
                <th className="text-center px-3 py-2.5 font-medium">유종</th>
                <th className="text-right px-3 py-2.5 font-medium">판매량</th>
                <th className="text-right px-3 py-2.5 font-medium">금액</th>
                <th className="text-center px-4 py-2.5 font-medium">결제</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {transactions.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 font-medium text-gray-900 whitespace-nowrap">
                    {t.customers?.name ?? "-"}
                  </td>
                  <td className="px-3 py-3 text-gray-600 max-w-[180px] truncate">
                    {t.addresses?.address ?? "-"}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className="text-xs text-gray-600">{t.fuel_type ?? "-"}</span>
                  </td>
                  <td className="px-3 py-3 text-right text-gray-800 whitespace-nowrap">
                    {t.quantity_l != null ? `${t.quantity_l}L` : "-"}
                  </td>
                  <td className="px-3 py-3 text-right font-medium text-gray-900 whitespace-nowrap">
                    {won(t.amount)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${PAYMENT_BADGE[t.payment_type] ?? "bg-gray-100 text-gray-600"}`}>
                      {PAYMENT_LABEL[t.payment_type] ?? t.payment_type}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 유종별 합산 */}
      {fuelKeys.length > 0 && (
        <div className="border-t border-gray-200 px-5 py-4">
          <p className="text-xs font-semibold text-gray-500 mb-2">유종별 합산</p>
          <div className="flex flex-wrap gap-x-6 gap-y-1.5">
            {fuelKeys.map((ft) => (
              <div key={ft} className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">{ft}</span>
                <span className="text-sm text-gray-500">
                  {summary[ft].quantity > 0 && `${summary[ft].quantity}L · `}
                  {won(summary[ft].amount)}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">합계</span>
            <span className="text-base font-bold text-gray-900">{won(totalAmount)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
