"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  getAllCustomers,
  type CustomerWithPhones,
} from "@/lib/supabase/queries/customers";
import {
  getCustomerTransactions,
  calcCreditBalance,
} from "@/lib/supabase/queries/transactions";
import AddCustomerModal from "./AddCustomerModal";

type CustomerWithBalance = CustomerWithPhones & { creditBalance: number };

export default function CustomerList() {
  const router = useRouter();
  const [customers, setCustomers] = useState<CustomerWithBalance[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async (q = "") => {
    setLoading(true);
    const { data } = await getAllCustomers(q);
    const list = data ?? [];

    const balances = await Promise.all(
      list.map(async (c) => {
        const { data: txs } = await getCustomerTransactions(c.id);
        return { id: c.id, balance: calcCreditBalance(txs ?? []) };
      })
    );
    const balanceMap = Object.fromEntries(balances.map((b) => [b.id, b.balance]));

    setCustomers(list.map((c) => ({ ...c, creditBalance: balanceMap[c.id] ?? 0 })));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => load(search), 300);
    return () => clearTimeout(t);
  }, [search, load]);

  return (
    <>
      <div className="space-y-4">
        {/* 검색 + 등록 */}
        <div className="flex gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="고객 이름 검색"
            className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => setShowAdd(true)}
            className="px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            + 고객 등록
          </button>
        </div>

        {/* 목록 */}
        {loading ? (
          <p className="text-center text-gray-400 py-12 text-sm">불러오는 중...</p>
        ) : customers.length === 0 ? (
          <p className="text-center text-gray-400 py-12 text-sm">고객이 없습니다</p>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {customers.map((c) => (
              <button
                key={c.id}
                onClick={() => router.push(`/office/customers/${c.id}`)}
                className="w-full text-left px-5 py-4 hover:bg-gray-50 transition-colors flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">{c.name}</span>
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                      {c.type}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {c.phone_numbers.map((p) => p.phone).join(" · ")}
                  </p>
                  {c.memo && (
                    <p className="text-xs text-gray-400 mt-0.5">{c.memo}</p>
                  )}
                </div>
                {c.creditBalance > 0 && (
                  <div className="text-right shrink-0">
                    <p className="text-xs text-red-500 font-medium">외상</p>
                    <p className="text-sm font-bold text-red-600">
                      {c.creditBalance.toLocaleString("ko-KR")}원
                    </p>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {showAdd && (
        <AddCustomerModal
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            setShowAdd(false);
            load(search);
          }}
        />
      )}
    </>
  );
}
