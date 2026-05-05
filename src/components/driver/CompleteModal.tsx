"use client";

import { useState } from "react";
import { createTransaction } from "@/lib/supabase/queries/transactions";
import { updateDeliveryStatus } from "@/lib/supabase/queries/deliveries";
import type { DeliveryRow } from "@/lib/supabase/queries/deliveries";

const PAYMENT_TYPES: { value: string; label: string }[] = [
  { value: "CASH", label: "현금" },
  { value: "CARD", label: "카드" },
  { value: "CREDIT", label: "외상" },
  { value: "TRANSFER", label: "계좌이체" },
  { value: "CASH_RECEIPT", label: "현금영수증" },
  { value: "PREPAID", label: "선불" },
  { value: "LOCAL_CURRENCY", label: "지역화폐" },
  { value: "TAX_EXEMPT_NHCARD", label: "면세농협카드" },
  { value: "TAX_EXEMPT_UNION", label: "면세조합" },
];

type Props = {
  delivery: DeliveryRow;
  onClose: () => void;
};

export default function CompleteModal({ delivery, onClose }: Props) {
  const [quantityL, setQuantityL] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentType, setPaymentType] = useState("");
  const [memo, setMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!paymentType) {
      setError("결제 방식을 선택해주세요.");
      return;
    }
    if (!amount) {
      setError("금액을 입력해주세요.");
      return;
    }
    setError("");
    setSubmitting(true);

    const [txResult] = await Promise.all([
      createTransaction({
        customer_id: delivery.customers!.id,
        address_id: delivery.addresses?.id ?? null,
        quantity_l: quantityL ? parseFloat(quantityL) : null,
        amount: parseInt(amount.replace(/,/g, ""), 10),
        payment_type: paymentType,
        fuel_type: delivery.addresses?.fuel_type ?? null,
        memo: memo || null,
      }),
    ]);

    if (txResult.error) {
      setError("저장 중 오류가 발생했습니다.");
      setSubmitting(false);
      return;
    }

    await updateDeliveryStatus(delivery.id, "완료");
    onClose();
  }

  function formatAmount(val: string) {
    const num = val.replace(/[^0-9]/g, "");
    return num ? parseInt(num).toLocaleString("ko-KR") : "";
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-6 space-y-5">
        {/* 헤더 */}
        <div>
          <h2 className="text-xl font-bold text-gray-900">완료 입력</h2>
          <p className="text-base text-gray-500 mt-0.5">
            {delivery.customers?.name} · {delivery.addresses?.address ?? "주소 없음"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* 결제 방식 */}
          <div>
            <p className="text-base font-medium text-gray-700 mb-2">결제 방식</p>
            <div className="grid grid-cols-3 gap-2">
              {PAYMENT_TYPES.map((pt) => (
                <button
                  key={pt.value}
                  type="button"
                  onClick={() => setPaymentType(pt.value)}
                  className={`py-3 rounded-xl text-sm font-medium transition-colors border ${
                    paymentType === pt.value
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-700 border-gray-200 hover:border-gray-400"
                  }`}
                >
                  {pt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 수량 */}
          <div>
            <label className="block text-base font-medium text-gray-700 mb-1">
              수량 (L)
            </label>
            <input
              type="number"
              inputMode="decimal"
              value={quantityL}
              onChange={(e) => setQuantityL(e.target.value)}
              placeholder="예: 100"
              className="w-full px-4 py-3 text-lg text-gray-900 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 금액 */}
          <div>
            <label className="block text-base font-medium text-gray-700 mb-1">
              금액 (원)
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(formatAmount(e.target.value))}
              placeholder="예: 150,000"
              className="w-full px-4 py-3 text-lg text-gray-900 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 메모 */}
          <div>
            <label className="block text-base font-medium text-gray-700 mb-1">
              메모 (선택)
            </label>
            <input
              type="text"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="특이사항 입력"
              className="w-full px-4 py-3 text-base text-gray-900 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-4 border border-gray-300 text-gray-700 font-semibold rounded-xl text-base hover:bg-gray-50 transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-4 bg-green-600 text-white font-semibold rounded-xl text-base hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? "저장 중..." : "완료"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
