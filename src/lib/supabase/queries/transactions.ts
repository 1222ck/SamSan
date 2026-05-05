import { createClient } from "@/lib/supabase/client";

export type TransactionRow = {
  id: string;
  customer_id: string;
  address_id: string | null;
  delivered_at: string;
  quantity_l: number | null;
  amount: number;
  payment_type: string;
  fuel_type: string | null;
  memo: string | null;
};

export type TransactionWithDetails = TransactionRow & {
  customers: { name: string } | null;
  addresses: { address: string } | null;
};

export const PAYMENT_LABEL: Record<string, string> = {
  CARD: "카드",
  CASH: "현금",
  CASH_RECEIPT: "현금영수증",
  CREDIT: "외상",
  TRANSFER: "계좌이체",
  LOCAL_CURRENCY: "지역화폐",
  PREPAID: "선불",
  TAX_EXEMPT_NHCARD: "면세농협카드",
  TAX_EXEMPT_UNION: "면세조합",
};

export async function createTransaction(params: {
  customer_id: string;
  address_id: string | null;
  quantity_l: number | null;
  amount: number;
  payment_type: string;
  fuel_type: string | null;
  memo: string | null;
}) {
  const supabase = createClient();
  return supabase.from("transactions").insert(params);
}

export async function getTransactionsByDate(date: string) {
  const supabase = createClient();
  const start = new Date(`${date}T00:00:00+09:00`).toISOString();
  const end = new Date(`${date}T23:59:59+09:00`).toISOString();
  return supabase
    .from("transactions")
    .select("*, customers(name), addresses(address)")
    .gte("delivered_at", start)
    .lte("delivered_at", end)
    .order("delivered_at", { ascending: true })
    .returns<TransactionWithDetails[]>();
}

export async function getCustomerTransactions(customerId: string) {
  const supabase = createClient();
  return supabase
    .from("transactions")
    .select("*")
    .eq("customer_id", customerId)
    .order("delivered_at", { ascending: false })
    .limit(100)
    .returns<TransactionRow[]>();
}

export function calcCreditBalance(transactions: TransactionRow[]) {
  return transactions
    .filter((t) => t.payment_type === "CREDIT")
    .reduce((sum, t) => sum + t.amount, 0);
}

export async function updateTransaction(
  id: string,
  updates: {
    quantity_l?: number | null;
    amount?: number;
    payment_type?: string;
    fuel_type?: string | null;
    memo?: string | null;
  }
) {
  const supabase = createClient();
  return supabase.from("transactions").update(updates).eq("id", id);
}

export function calcFuelSummary(transactions: TransactionWithDetails[]) {
  const map: Record<string, { quantity: number; amount: number }> = {};
  for (const t of transactions) {
    const ft = t.fuel_type ?? "기타";
    if (!map[ft]) map[ft] = { quantity: 0, amount: 0 };
    map[ft].quantity += t.quantity_l ?? 0;
    map[ft].amount += t.amount;
  }
  return map;
}
