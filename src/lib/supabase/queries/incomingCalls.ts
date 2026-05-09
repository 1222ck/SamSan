import { createClient } from "@/lib/supabase/client";

export type IncomingCallRow = {
  id: string;
  phone: string;
  received_at: string;
};

export type CallCustomer = {
  id: string;
  name: string;
  type: string;
  memo: string | null;
  addresses: {
    id: string;
    address: string;
    fuel_type: string;
    memo: string | null;
  }[];
  recent_transactions: {
    id: string;
    delivered_at: string;
    quantity_l: number | null;
    amount: number;
    payment_type: string;
    fuel_type: string | null;
  }[];
  credit_balance: number;
};

export type EnrichedCall = IncomingCallRow & {
  customer: CallCustomer | null;
};

// 전화번호 정규화 매칭.
// CTI는 "010-4141-3239" / "01041413239" / "+821041413239" 등 다양한 포맷으로 보낼 수 있고
// DB의 phone_numbers.phone 도 입력 시점에 따라 포맷이 다를 수 있어
// last 4 digits로 1차 좁힌 뒤 클라이언트에서 last 8 digits 정확 비교를 한다.
async function findCustomerIdByPhone(phone: string): Promise<string | null> {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return null;
  const last4 = digits.slice(-4);
  const last8 = digits.slice(-8);

  const supabase = createClient();
  const { data } = await supabase
    .from("phone_numbers")
    .select("customer_id, phone")
    .ilike("phone", `%${last4}%`);

  const hit = (data ?? []).find(
    (p) => p.phone.replace(/\D/g, "").endsWith(last8)
  );
  return hit?.customer_id ?? null;
}

// INSERT payload(또는 row)를 모달이 표시할 enriched 형태로 변환.
export async function enrichIncomingCall(
  row: IncomingCallRow
): Promise<EnrichedCall> {
  const customerId = await findCustomerIdByPhone(row.phone);
  if (!customerId) return { ...row, customer: null };

  const supabase = createClient();

  const [{ data: customer }, { data: addresses }, { data: recent }, { data: creditTxs }] =
    await Promise.all([
      supabase
        .from("customers")
        .select("id, name, type, memo")
        .eq("id", customerId)
        .single<{ id: string; name: string; type: string; memo: string | null }>(),
      supabase
        .from("addresses")
        .select("id, address, fuel_type, memo")
        .eq("customer_id", customerId)
        .returns<CallCustomer["addresses"]>(),
      supabase
        .from("transactions")
        .select("id, delivered_at, quantity_l, amount, payment_type, fuel_type")
        .eq("customer_id", customerId)
        .order("delivered_at", { ascending: false })
        .limit(5)
        .returns<CallCustomer["recent_transactions"]>(),
      supabase
        .from("transactions")
        .select("amount")
        .eq("customer_id", customerId)
        .eq("payment_type", "CREDIT")
        .returns<{ amount: number }[]>(),
    ]);

  if (!customer) return { ...row, customer: null };

  const credit_balance = (creditTxs ?? []).reduce((s, t) => s + t.amount, 0);

  return {
    ...row,
    customer: {
      ...customer,
      addresses: addresses ?? [],
      recent_transactions: recent ?? [],
      credit_balance,
    },
  };
}
