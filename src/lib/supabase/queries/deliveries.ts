import { createClient } from "@/lib/supabase/client";

export type DeliveryRow = {
  id: string;
  status: "대기" | "배달중" | "완료";
  special_note: string | null;
  created_at: string;
  customers: { id: string; name: string } | null;
  addresses: { id: string; address: string; fuel_type: string } | null;
};

export async function getActiveDeliveries() {
  const supabase = createClient();
  return supabase
    .from("deliveries")
    .select(
      "id, status, special_note, created_at, customers(id, name), addresses(id, address, fuel_type)"
    )
    .in("status", ["대기", "배달중"])
    .order("created_at", { ascending: true })
    .returns<DeliveryRow[]>();
}

export async function updateDeliveryStatus(
  id: string,
  status: "배달중" | "완료"
) {
  const supabase = createClient();
  return supabase.from("deliveries").update({ status }).eq("id", id);
}

export async function getDeliveriesByDate(date: string) {
  const supabase = createClient();
  const start = new Date(`${date}T00:00:00+09:00`).toISOString();
  const end = new Date(`${date}T23:59:59+09:00`).toISOString();
  return supabase
    .from("deliveries")
    .select(
      "id, status, special_note, created_at, customers(id, name), addresses(id, address, fuel_type)"
    )
    .gte("created_at", start)
    .lte("created_at", end)
    .order("created_at", { ascending: true })
    .returns<DeliveryRow[]>();
}

export async function createDelivery(params: {
  customer_id: string;
  address_id: string | null;
  special_note: string | null;
}) {
  const supabase = createClient();
  return supabase.from("deliveries").insert(params).select().single();
}
