"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  getTransactionsByDate,
  updateTransaction,
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

function fmtAmount(val: string) {
  const num = val.replace(/[^0-9]/g, "");
  return num ? parseInt(num).toLocaleString("ko-KR") : "";
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

type EditData = {
  quantity_l: string;
  amount: string;
  payment_type: string;
  fuel_type: string;
  memo: string;
};

export default function SalesBoard() {
  const [date, setDate] = useState(todayStr());
  const [transactions, setTransactions] = useState<TransactionWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<EditData>({
    quantity_l: "", amount: "", payment_type: "", fuel_type: "", memo: "",
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    const { data } = await getTransactionsByDate(d);
    setTransactions(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(date); }, [date, load]);

  // 실시간 구독 (오늘 날짜)
  useEffect(() => {
    if (date !== todayStr()) return;
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
        .channel("sales-board")
        .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, () => {
          load(date);
        })
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [date, load]);

  function startEdit(t: TransactionWithDetails) {
    setEditingId(t.id);
    setEditData({
      quantity_l: t.quantity_l?.toString() ?? "",
      amount: t.amount ? t.amount.toLocaleString("ko-KR") : "",
      payment_type: t.payment_type,
      fuel_type: t.fuel_type ?? "",
      memo: t.memo ?? "",
    });
  }

  async function saveEdit() {
    if (!editingId) return;
    setSaving(true);
    const amountNum = parseInt(editData.amount.replace(/,/g, ""), 10);
    const { error } = await updateTransaction(editingId, {
      quantity_l: editData.quantity_l ? parseFloat(editData.quantity_l) : null,
      amount: isNaN(amountNum) ? 0 : amountNum,
      payment_type: editData.payment_type,
      fuel_type: editData.fuel_type || null,
      memo: editData.memo || null,
    });
    setSaving(false);
    if (!error) {
      setTransactions((prev) =>
        prev.map((t) =>
          t.id === editingId
            ? {
                ...t,
                quantity_l: editData.quantity_l ? parseFloat(editData.quantity_l) : null,
                amount: isNaN(amountNum) ? t.amount : amountNum,
                payment_type: editData.payment_type,
                fuel_type: editData.fuel_type || null,
                memo: editData.memo || null,
              }
            : t
        )
      );
      setEditingId(null);
    }
  }

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
          onChange={(e) => { setDate(e.target.value); setEditingId(null); }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {date !== todayStr() && (
          <button onClick={() => setDate(todayStr())} className="text-sm text-blue-600 hover:text-blue-700">
            오늘
          </button>
        )}
        <span className="text-sm text-gray-400 ml-auto">
          {loading ? "..." : `${transactions.length}건`}
        </span>
      </div>

      {/* 목록 */}
      <div className="overflow-y-auto lg:max-h-[calc(100vh-300px)]">
        {loading ? (
          <p className="text-center text-gray-400 py-12 text-sm">불러오는 중...</p>
        ) : transactions.length === 0 ? (
          <p className="text-center text-gray-400 py-12 text-sm">배달 내역이 없습니다</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[580px]">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-400 bg-gray-50">
                  <th className="text-left px-4 py-2.5 font-medium">고객</th>
                  <th className="text-left px-3 py-2.5 font-medium">주소</th>
                  <th className="text-center px-3 py-2.5 font-medium">유종</th>
                  <th className="text-right px-3 py-2.5 font-medium">판매량</th>
                  <th className="text-right px-3 py-2.5 font-medium">금액</th>
                  <th className="text-center px-3 py-2.5 font-medium">결제</th>
                  <th className="w-8 px-2 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {transactions.map((t) =>
                  editingId === t.id ? (
                    <tr key={t.id} className="bg-blue-50">
                      <td className="px-4 py-2 text-xs font-medium text-gray-700 whitespace-nowrap">
                        {t.customers?.name ?? "-"}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500 max-w-[100px] truncate">
                        {t.addresses?.address ?? "-"}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={editData.fuel_type}
                          onChange={(e) => setEditData((d) => ({ ...d, fuel_type: e.target.value }))}
                          className="w-full text-xs border border-gray-300 rounded px-1 py-1 text-gray-900 bg-white"
                        >
                          <option value="">-</option>
                          <option value="경유">경유</option>
                          <option value="등유">등유</option>
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          value={editData.quantity_l}
                          onChange={(e) => setEditData((d) => ({ ...d, quantity_l: e.target.value }))}
                          placeholder="L"
                          className="w-16 text-xs border border-gray-300 rounded px-1 py-1 text-gray-900 text-right"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={editData.amount}
                          onChange={(e) => setEditData((d) => ({ ...d, amount: fmtAmount(e.target.value) }))}
                          className="w-24 text-xs border border-gray-300 rounded px-1 py-1 text-gray-900 text-right"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={editData.payment_type}
                          onChange={(e) => setEditData((d) => ({ ...d, payment_type: e.target.value }))}
                          className="text-xs border border-gray-300 rounded px-1 py-1 text-gray-900 bg-white"
                        >
                          {Object.entries(PAYMENT_LABEL).map(([v, l]) => (
                            <option key={v} value={v}>{l}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        <button
                          onClick={saveEdit}
                          disabled={saving}
                          className="text-xs px-2 py-1 bg-blue-600 text-white rounded mr-1 disabled:opacity-50"
                        >
                          {saving ? "..." : "저장"}
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-xs px-2 py-1 border border-gray-300 rounded text-gray-600"
                        >
                          취소
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={t.id} className="hover:bg-gray-50 transition-colors group">
                      <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                        {t.customers?.name ?? "-"}
                      </td>
                      <td className="px-3 py-3 text-gray-600 max-w-[160px] truncate">
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
                      <td className="px-3 py-3 text-center">
                        <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${PAYMENT_BADGE[t.payment_type] ?? "bg-gray-100 text-gray-600"}`}>
                          {PAYMENT_LABEL[t.payment_type] ?? t.payment_type}
                        </span>
                      </td>
                      <td className="px-2 py-3 text-center">
                        <button
                          onClick={() => startEdit(t)}
                          className="text-gray-300 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity"
                          aria-label="수정"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
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
