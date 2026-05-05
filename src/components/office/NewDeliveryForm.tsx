"use client";

import { useState, useEffect } from "react";
import {
  searchCustomers,
  getCustomerAddresses,
  type CustomerWithPhones,
  type AddressRow,
} from "@/lib/supabase/queries/customers";
import { createDelivery } from "@/lib/supabase/queries/deliveries";

export default function NewDeliveryForm() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerWithPhones[]>([]);
  const [selected, setSelected] = useState<CustomerWithPhones | null>(null);
  const [addresses, setAddresses] = useState<AddressRow[]>([]);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!query.trim() || selected) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const { data } = await searchCustomers(query);
      setResults(data);
    }, 300);
    return () => clearTimeout(t);
  }, [query, selected]);

  async function pickCustomer(c: CustomerWithPhones) {
    setSelected(c);
    setQuery(c.name);
    setResults([]);
    setAddressId(null);
    const { data } = await getCustomerAddresses(c.id);
    const list = data ?? [];
    setAddresses(list);
    if (list.length === 1) setAddressId(list[0].id);
  }

  function reset() {
    setQuery("");
    setResults([]);
    setSelected(null);
    setAddresses([]);
    setAddressId(null);
    setNote("");
    setDone(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setSubmitting(true);
    const { error } = await createDelivery({
      customer_id: selected.id,
      address_id: addressId,
      special_note: note || null,
    });
    setSubmitting(false);
    if (!error) {
      setDone(true);
      setTimeout(reset, 1500);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-base font-semibold text-gray-800 mb-4">새 배달 등록</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* 고객 검색 */}
        <div className="relative">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            고객 검색
          </label>
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (selected) setSelected(null);
            }}
            placeholder="이름 또는 전화번호"
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {results.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {results.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => pickCustomer(c)}
                  className="w-full text-left px-4 py-2.5 hover:bg-gray-50 border-b border-gray-100 last:border-0"
                >
                  <span className="font-medium text-sm">{c.name}</span>
                  <span className="text-xs text-gray-400 ml-2">
                    {c.phone_numbers.map((p) => p.phone).join(" · ")}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 주소 선택 */}
        {selected && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              배달 주소
            </label>
            {addresses.length === 0 ? (
              <p className="text-sm text-gray-400 py-2">등록된 주소가 없습니다</p>
            ) : (
              <div className="space-y-2">
                {addresses.map((a) => (
                  <label
                    key={a.id}
                    className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                      addressId === a.id
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="address"
                      value={a.id}
                      checked={addressId === a.id}
                      onChange={() => setAddressId(a.id)}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-800">{a.address}</p>
                      <p className="text-xs text-gray-500">
                        {a.fuel_type}
                        {a.memo && ` · ${a.memo}`}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 특이사항 */}
        {selected && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              특이사항
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="특이사항 입력 (선택)"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        )}

        <button
          type="submit"
          disabled={!selected || submitting || done}
          className={`w-full py-3 rounded-lg font-semibold text-sm transition-colors ${
            done
              ? "bg-green-600 text-white"
              : "bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          }`}
        >
          {done ? "등록 완료!" : submitting ? "등록 중..." : "배달 등록"}
        </button>

        {selected && !done && (
          <button
            type="button"
            onClick={reset}
            className="w-full py-2 text-sm text-gray-400 hover:text-gray-600"
          >
            초기화
          </button>
        )}
      </form>
    </div>
  );
}
