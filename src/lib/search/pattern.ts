import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExtractedIntent, SearchHit } from "./types";
import { stripNoise } from "./noise";

const RESULT_LIMIT = 50;

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

function escapeIlike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function like(s: string): string {
  return `%${escapeIlike(s.trim())}%`;
}

async function customerIdsByName(
  sb: SupabaseClient,
  q: string,
): Promise<Set<string>> {
  const { data, error } = await sb
    .from("customers")
    .select("id")
    .ilike("name", like(q))
    .limit(RESULT_LIMIT * 2);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.id as string));
}

async function customerIdsByPhoneOrLabel(
  sb: SupabaseClient,
  opts: { phone?: string; label?: string },
): Promise<Set<string>> {
  const filters: string[] = [];
  if (opts.phone) filters.push(`phone.ilike.${like(opts.phone)}`);
  if (opts.label) filters.push(`label.ilike.${like(opts.label)}`);
  if (filters.length === 0) return new Set();
  const { data, error } = await sb
    .from("phone_numbers")
    .select("customer_id")
    .or(filters.join(","))
    .limit(RESULT_LIMIT * 4);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.customer_id as string));
}

async function customerIdsByAddress(
  sb: SupabaseClient,
  q: string,
): Promise<Set<string>> {
  const { data, error } = await sb
    .from("addresses")
    .select("customer_id")
    .ilike("address", like(q))
    .limit(RESULT_LIMIT * 4);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.customer_id as string));
}

function pickAddress(
  addresses: CustomerRow["addresses"],
  matchHint?: string,
): SearchHit["address"] {
  if (!addresses || addresses.length === 0) return null;
  if (matchHint) {
    const hit = addresses.find((a) =>
      a.address.toLowerCase().includes(matchHint.toLowerCase()),
    );
    if (hit) {
      return {
        id: hit.id,
        address: hit.address,
        fuel_type: hit.fuel_type,
        memo: hit.memo,
      };
    }
  }
  const first = addresses[0];
  return {
    id: first.id,
    address: first.address,
    fuel_type: first.fuel_type,
    memo: first.memo,
  };
}

async function fetchCustomers(
  sb: SupabaseClient,
  ids: string[],
  addressHint?: string,
): Promise<SearchHit[]> {
  if (ids.length === 0) return [];
  const { data, error } = await sb
    .from("customers")
    .select(
      "id, name, type, memo, phone_numbers(id, phone, label), addresses(id, address, fuel_type, memo)",
    )
    .in("id", ids)
    .returns<CustomerRow[]>();
  if (error) throw error;
  return (data ?? []).map((c) => ({
    customer_id: c.id,
    name: c.name,
    type: c.type,
    memo: c.memo,
    address: pickAddress(c.addresses, addressHint),
    phones: (c.phone_numbers ?? []).map((p) => ({
      id: p.id,
      phone: p.phone,
      label: p.label,
    })),
  }));
}

export async function patternSearch(
  sb: SupabaseClient,
  query: string,
): Promise<SearchHit[]> {
  const q = stripNoise(query);
  if (!q) return [];

  const [byName, byPhone, byAddr] = await Promise.all([
    customerIdsByName(sb, q),
    customerIdsByPhoneOrLabel(sb, { phone: q, label: q }),
    customerIdsByAddress(sb, q),
  ]);

  const ids = new Set([...byName, ...byPhone, ...byAddr]);
  if (ids.size === 0) return [];

  return fetchCustomers(sb, Array.from(ids).slice(0, RESULT_LIMIT), q);
}

export async function intentSearch(
  sb: SupabaseClient,
  intent: ExtractedIntent,
): Promise<SearchHit[]> {
  const tasks: Promise<Set<string>>[] = [];
  if (intent.name) tasks.push(customerIdsByName(sb, intent.name));
  if (intent.phone || intent.label) {
    tasks.push(
      customerIdsByPhoneOrLabel(sb, { phone: intent.phone, label: intent.label }),
    );
  }
  if (intent.address) tasks.push(customerIdsByAddress(sb, intent.address));

  if (tasks.length === 0) return [];

  const sets = await Promise.all(tasks);
  const ids =
    sets.length === 1
      ? sets[0]
      : sets.reduce((acc, s) => new Set([...acc].filter((x) => s.has(x))));

  if (ids.size === 0) return [];
  return fetchCustomers(sb, Array.from(ids).slice(0, RESULT_LIMIT), intent.address);
}

export function deriveFunctionName(intent: ExtractedIntent): string {
  const parts: string[] = [];
  if (intent.name) parts.push("name");
  if (intent.address) parts.push("address");
  if (intent.phone) parts.push("phone");
  if (intent.label) parts.push("label");
  if (parts.length === 0) return "search_empty";
  return `search_by_${parts.join("_and_")}`;
}
