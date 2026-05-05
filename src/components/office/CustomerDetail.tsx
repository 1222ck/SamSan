"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  getCustomerDetail,
  updateCustomer,
  addPhoneNumber,
  deletePhoneNumber,
  addAddress,
  deleteAddress,
  type CustomerDetail,
} from "@/lib/supabase/queries/customers";
import {
  getCustomerTransactions,
  createTransaction,
  calcCreditBalance,
  PAYMENT_LABEL,
  type TransactionRow,
} from "@/lib/supabase/queries/transactions";

const FUEL_TYPES = ["경유", "등유"] as const;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
  });
}

export default function CustomerDetail({ id }: { id: string }) {
  const router = useRouter();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);

  // 편집 상태
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<"개인" | "업체">("개인");
  const [editMemo, setEditMemo] = useState("");

  // 전화번호 추가
  const [newPhone, setNewPhone] = useState("");
  const [addingPhone, setAddingPhone] = useState(false);

  // 주소 추가
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [newAddress, setNewAddress] = useState("");
  const [newFuelType, setNewFuelType] = useState<string>("경유");
  const [newAddressMemo, setNewAddressMemo] = useState("");

  // 외상 상환
  const [showRepay, setShowRepay] = useState(false);
  const [repayAmount, setRepayAmount] = useState("");
  const [repayMethod, setRepayMethod] = useState("CASH");
  const [repaying, setRepaying] = useState(false);

  const load = useCallback(async () => {
    const [{ data: c }, { data: txs }] = await Promise.all([
      getCustomerDetail(id),
      getCustomerTransactions(id),
    ]);
    if (c) {
      setCustomer(c);
      setEditName(c.name);
      setEditType(c.type as "개인" | "업체");
      setEditMemo(c.memo ?? "");
    }
    setTransactions(txs ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function saveEdit() {
    if (!customer) return;
    await updateCustomer(customer.id, {
      name: editName.trim(),
      type: editType,
      memo: editMemo.trim() || null,
    });
    setEditing(false);
    load();
  }

  async function handleAddPhone() {
    if (!newPhone.trim() || !customer) return;
    setAddingPhone(true);
    await addPhoneNumber(customer.id, newPhone.trim());
    setNewPhone("");
    setAddingPhone(false);
    load();
  }

  async function handleDeletePhone(phoneId: string) {
    await deletePhoneNumber(phoneId);
    load();
  }

  async function handleAddAddress() {
    if (!newAddress.trim() || !customer) return;
    await addAddress({
      customer_id: customer.id,
      address: newAddress.trim(),
      fuel_type: newFuelType,
      memo: newAddressMemo.trim() || null,
    });
    setNewAddress("");
    setNewAddressMemo("");
    setNewFuelType("경유");
    setShowAddAddress(false);
    load();
  }

  async function handleDeleteAddress(addrId: string) {
    await deleteAddress(addrId);
    load();
  }

  async function handleRepay(e: React.FormEvent) {
    e.preventDefault();
    if (!customer || !repayAmount) return;
    setRepaying(true);
    await createTransaction({
      customer_id: customer.id,
      address_id: null,
      quantity_l: null,
      amount: -Math.abs(parseInt(repayAmount.replace(/,/g, ""), 10)),
      payment_type: "CREDIT",
      fuel_type: null,
      memo: `상환 (${PAYMENT_LABEL[repayMethod]})`,
    });
    setRepaying(false);
    setShowRepay(false);
    setRepayAmount("");
    setRepayMethod("CASH");
    load();
  }

  function formatAmount(val: string) {
    const num = val.replace(/[^0-9]/g, "");
    return num ? parseInt(num).toLocaleString("ko-KR") : "";
  }

  const creditBalance = calcCreditBalance(transactions);

  if (loading) {
    return <p className="text-center text-gray-400 py-12 text-sm">불러오는 중...</p>;
  }

  if (!customer) {
    return <p className="text-center text-gray-400 py-12 text-sm">고객을 찾을 수 없습니다.</p>;
  }

  return (
    <div className="max-w-2xl space-y-4">
      {/* 뒤로 */}
      <button
        onClick={() => router.push("/office/customers")}
        className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
      >
        ← 고객 목록
      </button>

      {/* 기본 정보 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        {editing ? (
          <div className="space-y-3">
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex gap-4">
              {(["개인", "업체"] as const).map((t) => (
                <label key={t} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={editType === t}
                    onChange={() => setEditType(t)}
                  />
                  <span className="text-sm text-gray-700">{t}</span>
                </label>
              ))}
            </div>
            <input
              value={editMemo}
              onChange={(e) => setEditMemo(e.target.value)}
              placeholder="메모 (선택)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex gap-2">
              <button
                onClick={saveEdit}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
              >
                저장
              </button>
              <button
                onClick={() => setEditing(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50"
              >
                취소
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-gray-900">{customer.name}</h2>
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                  {customer.type}
                </span>
              </div>
              {customer.memo && (
                <p className="text-sm text-gray-500 mt-1">{customer.memo}</p>
              )}
            </div>
            <button
              onClick={() => setEditing(true)}
              className="text-sm text-gray-400 hover:text-gray-600 px-2 py-1"
            >
              수정
            </button>
          </div>
        )}
      </div>

      {/* 외상 잔액 */}
      {creditBalance > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-red-700">외상 잔액</span>
            <div className="flex items-center gap-3">
              <span className="text-lg font-bold text-red-700">
                {creditBalance.toLocaleString("ko-KR")}원
              </span>
              <button
                onClick={() => setShowRepay(!showRepay)}
                className="text-sm px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                상환 입력
              </button>
            </div>
          </div>

          {showRepay && (
            <form onSubmit={handleRepay} className="border-t border-red-200 pt-3 space-y-3">
              <div className="flex gap-2">
                {[
                  { value: "CASH", label: "현금" },
                  { value: "CARD", label: "카드" },
                  { value: "TRANSFER", label: "계좌이체" },
                ].map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setRepayMethod(m.value)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      repayMethod === m.value
                        ? "bg-red-600 text-white border-red-600"
                        : "bg-white text-gray-700 border-gray-300 hover:border-gray-400"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={repayAmount}
                  onChange={(e) => setRepayAmount(formatAmount(e.target.value))}
                  placeholder="상환 금액 입력"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-400"
                />
                <button
                  type="submit"
                  disabled={repaying || !repayAmount}
                  className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  {repaying ? "저장 중..." : "확인"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowRepay(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-600 text-sm rounded-lg hover:bg-gray-50"
                >
                  취소
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* 전화번호 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">전화번호</h3>
        <div className="space-y-2">
          {customer.phone_numbers.map((p) => (
            <div key={p.id} className="flex items-center justify-between">
              <span className="text-sm text-gray-800">{p.phone}</span>
              <button
                onClick={() => handleDeletePhone(p.id)}
                className="text-xs text-gray-400 hover:text-red-500 transition-colors"
              >
                삭제
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-3">
          <input
            type="tel"
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            placeholder="전화번호 추가"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleAddPhone}
            disabled={addingPhone}
            className="px-3 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 disabled:opacity-50"
          >
            추가
          </button>
        </div>
      </div>

      {/* 주소 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">배달 주소</h3>
        <div className="space-y-2">
          {customer.addresses.map((a) => (
            <div key={a.id} className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm text-gray-800">{a.address}</p>
                <p className="text-xs text-gray-400">
                  {a.fuel_type}{a.memo && ` · ${a.memo}`}
                </p>
              </div>
              <button
                onClick={() => handleDeleteAddress(a.id)}
                className="text-xs text-gray-400 hover:text-red-500 transition-colors shrink-0 mt-0.5"
              >
                삭제
              </button>
            </div>
          ))}
        </div>

        {showAddAddress ? (
          <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
            <input
              value={newAddress}
              onChange={(e) => setNewAddress(e.target.value)}
              placeholder="주소 입력"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex gap-2">
              {FUEL_TYPES.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setNewFuelType(f)}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                    newFuelType === f
                      ? "bg-blue-600 text-white border-blue-600"
                      : "border-gray-200 text-gray-600 hover:border-gray-400"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
            <input
              value={newAddressMemo}
              onChange={(e) => setNewAddressMemo(e.target.value)}
              placeholder="메모 (선택)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex gap-2">
              <button
                onClick={handleAddAddress}
                className="px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
              >
                저장
              </button>
              <button
                onClick={() => setShowAddAddress(false)}
                className="px-3 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50"
              >
                취소
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAddAddress(true)}
            className="mt-3 text-sm text-blue-600 hover:text-blue-700"
          >
            + 주소 추가
          </button>
        )}
      </div>

      {/* 거래 내역 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          거래 내역 ({transactions.length}건)
        </h3>
        {transactions.length === 0 ? (
          <p className="text-sm text-gray-400">거래 내역이 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {transactions.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-800">
                      {formatDate(t.delivered_at)}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        t.payment_type === "CREDIT"
                          ? "bg-red-100 text-red-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {PAYMENT_LABEL[t.payment_type] ?? t.payment_type}
                    </span>
                    {t.fuel_type && (
                      <span className="text-xs text-gray-400">{t.fuel_type}</span>
                    )}
                  </div>
                  {(t.quantity_l || t.memo) && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {t.quantity_l && `${t.quantity_l}L`}
                      {t.quantity_l && t.memo && " · "}
                      {t.memo}
                    </p>
                  )}
                </div>
                <span
                  className={`text-sm font-semibold ${
                    t.amount < 0 ? "text-blue-600" : "text-gray-900"
                  }`}
                >
                  {t.amount < 0 ? "-" : ""}
                  {Math.abs(t.amount).toLocaleString("ko-KR")}원
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
