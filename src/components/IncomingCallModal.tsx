"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { EnrichedCall } from "@/lib/supabase/queries/incomingCalls";
import { PAYMENT_LABEL } from "@/lib/supabase/queries/transactions";

type Props = {
  call: EnrichedCall;
  onClose: () => void;
};

function formatPhone(phone: string) {
  const d = phone.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("010")) {
    return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  }
  if (d.length === 10 && d.startsWith("02")) {
    return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}`;
  }
  if (d.length === 10) {
    return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return phone;
}

function formatHHmm(iso: string) {
  return new Date(iso).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMD(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
  });
}

function won(n: number) {
  return n.toLocaleString("ko-KR") + "원";
}

export default function IncomingCallModal({ call, onClose }: Props) {
  const router = useRouter();

  // ESC 키 닫기
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function confirmDelivery() {
    if (call.customer) {
      router.push(`/office?customer_id=${call.customer.id}`);
    } else {
      router.push(`/office?phone=${encodeURIComponent(call.phone)}`);
    }
    onClose();
  }

  const c = call.customer;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="incoming-call-title"
    >
      <div className="bg-white w-full max-w-md rounded-2xl overflow-hidden shadow-xl flex flex-col max-h-[90vh]">
        {/* 헤더 */}
        <div className="bg-amber-50 border-b border-amber-200 px-5 py-4 flex items-center gap-3">
          <span className="text-2xl" aria-hidden>📞</span>
          <div className="flex-1 min-w-0">
            <p id="incoming-call-title" className="font-bold text-gray-900">
              {formatPhone(call.phone)}
            </p>
            <p className="text-xs text-gray-500">
              {formatHHmm(call.received_at)} 수신
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="text-gray-400 hover:text-gray-700 text-xl leading-none px-2"
          >
            ✕
          </button>
        </div>

        {/* 본문 */}
        <div className="overflow-y-auto px-5 py-4 space-y-4">
          {c ? (
            <>
              {/* 고객 기본 정보 */}
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-gray-900">{c.name}</h3>
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                    {c.type}
                  </span>
                </div>
                {c.memo && (
                  <p className="text-sm text-gray-600 mt-1">{c.memo}</p>
                )}
              </div>

              {/* 외상 잔액 */}
              {c.credit_balance !== 0 && (
                <div
                  className={`rounded-lg px-3 py-2 flex items-center justify-between ${
                    c.credit_balance > 0
                      ? "bg-red-50 border border-red-200"
                      : "bg-blue-50 border border-blue-200"
                  }`}
                >
                  <span
                    className={`text-sm font-medium ${
                      c.credit_balance > 0 ? "text-red-700" : "text-blue-700"
                    }`}
                  >
                    {c.credit_balance > 0 ? "외상 잔액" : "선입(선불) 잔액"}
                  </span>
                  <span
                    className={`text-base font-bold ${
                      c.credit_balance > 0 ? "text-red-700" : "text-blue-700"
                    }`}
                  >
                    {won(Math.abs(c.credit_balance))}
                  </span>
                </div>
              )}

              {/* 주소 */}
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1.5">
                  배달 주소 ({c.addresses.length})
                </p>
                {c.addresses.length === 0 ? (
                  <p className="text-sm text-gray-400">등록된 주소 없음</p>
                ) : (
                  <ul className="space-y-1.5">
                    {c.addresses.map((a) => (
                      <li key={a.id} className="text-sm">
                        <span className="text-gray-800">{a.address}</span>
                        <span className="text-xs text-gray-500 ml-2">
                          {a.fuel_type}
                          {a.memo && ` · ${a.memo}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* 최근 거래 */}
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1.5">
                  최근 거래
                </p>
                {c.recent_transactions.length === 0 ? (
                  <p className="text-sm text-gray-400">거래 내역 없음</p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {c.recent_transactions.map((t) => (
                      <li
                        key={t.id}
                        className="py-1.5 flex items-center justify-between text-sm"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-gray-800 whitespace-nowrap">
                            {formatMD(t.delivered_at)}
                          </span>
                          {t.fuel_type && (
                            <span className="text-xs text-gray-500">
                              {t.fuel_type}
                            </span>
                          )}
                          {t.quantity_l != null && (
                            <span className="text-xs text-gray-500">
                              {t.quantity_l}L
                            </span>
                          )}
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded ${
                              t.payment_type === "CREDIT"
                                ? "bg-red-100 text-red-700"
                                : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {PAYMENT_LABEL[t.payment_type] ?? t.payment_type}
                          </span>
                        </div>
                        <span
                          className={`font-medium whitespace-nowrap ${
                            t.amount < 0 ? "text-blue-600" : "text-gray-900"
                          }`}
                        >
                          {t.amount < 0 ? "-" : ""}
                          {won(Math.abs(t.amount))}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : (
            <div className="py-8 text-center">
              <p className="text-base text-gray-700 font-medium">
                미등록 번호입니다.
              </p>
              <p className="text-xs text-gray-400 mt-1">
                고객 등록 후 다시 시도해주세요.
              </p>
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="border-t border-gray-100 px-5 py-3 flex gap-2">
          {c && (
            <button
              onClick={confirmDelivery}
              className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700"
            >
              배달 확정
            </button>
          )}
          <button
            onClick={onClose}
            className={`${c ? "flex-1" : "w-full"} py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50`}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
