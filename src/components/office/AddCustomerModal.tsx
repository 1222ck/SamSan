"use client";

import { useState } from "react";
import { createCustomer } from "@/lib/supabase/queries/customers";

type Props = {
  onClose: () => void;
  onCreated: (created?: { id: string; name: string }) => void;
  initialPhone?: string;
};

export default function AddCustomerModal({ onClose, onCreated, initialPhone }: Props) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"개인" | "업체">("개인");
  const [memo, setMemo] = useState("");
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      setError("이름과 전화번호는 필수입니다.");
      return;
    }
    setError("");
    setSubmitting(true);
    const { data, error: err } = await createCustomer({
      name: name.trim(),
      type,
      memo: memo.trim() || null,
      phone: phone.trim(),
    });
    setSubmitting(false);
    if (err || !data) {
      setError("등록 중 오류가 발생했습니다.");
      return;
    }
    onCreated({ id: data.id, name: data.name });
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white w-full max-w-md rounded-2xl p-6 space-y-4">
        <h2 className="text-lg font-bold text-gray-900">고객 등록</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="고객 이름"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">구분</label>
            <div className="flex gap-3">
              {(["개인", "업체"] as const).map((t) => (
                <label key={t} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value={t}
                    checked={type === t}
                    onChange={() => setType(t)}
                  />
                  <span className="text-sm text-gray-700">{t}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">전화번호</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="010-0000-0000"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">메모 (선택)</label>
            <input
              type="text"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="메모"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg text-sm hover:bg-gray-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-2.5 bg-blue-600 text-white font-medium rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "등록 중..." : "등록"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
