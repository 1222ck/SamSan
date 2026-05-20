import type { SupabaseClient } from "@supabase/supabase-js";
import type { BalanceKind, SearchHit } from "./types";

const RESULT_LIMIT = 50;
const PAYMENT_TYPE: Record<BalanceKind, string> = {
  credit: "CREDIT",
  prepaid: "PREPAID",
};

type CustomerRow = {
  id: string;
  name: string;
  type: string;
  memo: string | null;
  phone_numbers: { id: string; phone: string; label: string | null }[] | null;
  addresses:
    | { id: string; address: string; fuel_type: string | null; memo: string | null }[]
    | null;
};

export function detectBalanceQuery(query: string): BalanceKind | null {
  const normalized = query.replace(/\s/g, "");
  if (!normalized) return null;
  if (/^외상(있는|있는사람|손님|가구|리스트|목록)?$/.test(normalized)) return "credit";
  if (/^(선입|선불)(있는|있는사람|손님|가구|리스트|목록)?$/.test(normalized)) return "prepaid";
  return null;
}

async function sumByCustomer(
  sb: SupabaseClient,
  paymentType: string,
  filterIds?: string[],
): Promise<Record<string, number>> {
  let q = sb
    .from("transactions")
    .select("customer_id, amount")
    .eq("payment_type", paymentType);
  if (filterIds && filterIds.length > 0) q = q.in("customer_id", filterIds);

  const { data, error } = await q;
  if (error) throw error;

  const sums: Record<string, number> = {};
  for (const row of (data ?? []) as { customer_id: string; amount: number }[]) {
    sums[row.customer_id] = (sums[row.customer_id] ?? 0) + (row.amount ?? 0);
  }
  return sums;
}

export async function attachBalances(
  sb: SupabaseClient,
  hits: SearchHit[],
): Promise<SearchHit[]> {
  if (hits.length === 0) return hits;
  const ids = hits.map((h) => h.customer_id);
  const [credit, prepaid] = await Promise.all([
    sumByCustomer(sb, PAYMENT_TYPE.credit, ids),
    sumByCustomer(sb, PAYMENT_TYPE.prepaid, ids),
  ]);
  return hits.map((h) => {
    const c = credit[h.customer_id];
    const p = prepaid[h.customer_id];
    return {
      ...h,
      ...(c && c !== 0 ? { credit_balance: c } : {}),
      ...(p && p !== 0 ? { prepaid_balance: p } : {}),
    };
  });
}

export async function balanceSearch(
  sb: SupabaseClient,
  kind: BalanceKind,
): Promise<SearchHit[]> {
  const sums = await sumByCustomer(sb, PAYMENT_TYPE[kind]);
  const entries = Object.entries(sums)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, RESULT_LIMIT);
  if (entries.length === 0) return [];

  const ids = entries.map(([id]) => id);
  const { data, error } = await sb
    .from("customers")
    .select(
      "id, name, type, memo, phone_numbers(id, phone, label), addresses(id, address, fuel_type, memo)",
    )
    .in("id", ids)
    .returns<CustomerRow[]>();
  if (error) throw error;

  const order = new Map(entries.map(([id], i) => [id, i] as const));
  const sumMap = Object.fromEntries(entries);

  const hits: SearchHit[] = (data ?? []).map((c) => ({
    customer_id: c.id,
    name: c.name,
    type: c.type,
    memo: c.memo,
    address: c.addresses?.[0]
      ? {
          id: c.addresses[0].id,
          address: c.addresses[0].address,
          fuel_type: c.addresses[0].fuel_type,
          memo: c.addresses[0].memo,
        }
      : null,
    phones: (c.phone_numbers ?? []).map((p) => ({
      id: p.id,
      phone: p.phone,
      label: p.label,
    })),
    ...(kind === "credit"
      ? { credit_balance: sumMap[c.id] }
      : { prepaid_balance: sumMap[c.id] }),
  }));

  hits.sort(
    (a, b) =>
      (order.get(a.customer_id) ?? 999) - (order.get(b.customer_id) ?? 999),
  );
  return hits;
}
