import { createClient } from "@/lib/supabase/client";

export type CustomerWithPhones = {
  id: string;
  name: string;
  type: string;
  memo: string | null;
  phone_numbers: { phone: string }[];
};

export type AddressRow = {
  id: string;
  address: string;
  fuel_type: string;
  memo: string | null;
};

export type PhoneRow = {
  id: string;
  phone: string;
};

export type CustomerDetail = {
  id: string;
  name: string;
  type: string;
  memo: string | null;
  phone_numbers: PhoneRow[];
  addresses: AddressRow[];
};

// 배달 등록용 검색 (이름 + 전화번호)
export async function searchCustomers(query: string): Promise<{
  data: CustomerWithPhones[];
  error: unknown;
}> {
  if (!query.trim()) return { data: [], error: null };

  const supabase = createClient();

  const [{ data: byName }, { data: byPhone }] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, type, memo, phone_numbers(phone)")
      .ilike("name", `%${query}%`)
      .limit(10)
      .returns<CustomerWithPhones[]>(),
    supabase
      .from("phone_numbers")
      .select("customer_id")
      .ilike("phone", `%${query}%`)
      .limit(10),
  ]);

  const phoneCustomerIds = (byPhone ?? []).map((p) => p.customer_id);
  let extraCustomers: CustomerWithPhones[] = [];

  if (phoneCustomerIds.length > 0) {
    const { data } = await supabase
      .from("customers")
      .select("id, name, type, memo, phone_numbers(phone)")
      .in("id", phoneCustomerIds)
      .returns<CustomerWithPhones[]>();
    extraCustomers = data ?? [];
  }

  const all = [...(byName ?? []), ...extraCustomers];
  const seen = new Set<string>();
  const unique = all.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });

  return { data: unique, error: null };
}

export async function getCustomerAddresses(customerId: string) {
  const supabase = createClient();
  return supabase
    .from("addresses")
    .select("id, address, fuel_type, memo")
    .eq("customer_id", customerId)
    .returns<AddressRow[]>();
}

// 단일 고객 조회 (배달 등록 폼 자동 선택용)
export async function getCustomerById(id: string) {
  const supabase = createClient();
  return supabase
    .from("customers")
    .select("id, name, type, memo, phone_numbers(phone)")
    .eq("id", id)
    .single<CustomerWithPhones>();
}

// 고객 목록 전체 조회
export async function getAllCustomers(search = "") {
  const supabase = createClient();
  let query = supabase
    .from("customers")
    .select("id, name, type, memo, phone_numbers(phone)")
    .order("name");

  if (search.trim()) {
    query = query.ilike("name", `%${search}%`);
  }

  return query.returns<CustomerWithPhones[]>();
}

// 고객 상세 (전화번호 + 주소 포함)
export async function getCustomerDetail(id: string) {
  const supabase = createClient();
  return supabase
    .from("customers")
    .select("id, name, type, memo, phone_numbers(id, phone), addresses(id, address, fuel_type, memo)")
    .eq("id", id)
    .single<CustomerDetail>();
}

// 고객 등록
export async function createCustomer(params: {
  name: string;
  type: string;
  memo: string | null;
  phone: string;
}) {
  const supabase = createClient();
  const { data: customer, error } = await supabase
    .from("customers")
    .insert({ name: params.name, type: params.type, memo: params.memo || null })
    .select("id, name, type, memo")
    .single();

  if (error || !customer) return { error };

  await supabase
    .from("phone_numbers")
    .insert({ customer_id: customer.id, phone: params.phone });

  return { data: customer, error: null };
}

// 고객 정보 수정
export async function updateCustomer(
  id: string,
  params: { name: string; type: string; memo: string | null }
) {
  const supabase = createClient();
  return supabase.from("customers").update(params).eq("id", id);
}

// 전화번호 추가/삭제
export async function addPhoneNumber(customerId: string, phone: string) {
  const supabase = createClient();
  return supabase.from("phone_numbers").insert({ customer_id: customerId, phone });
}

export async function deletePhoneNumber(id: string) {
  const supabase = createClient();
  return supabase.from("phone_numbers").delete().eq("id", id);
}

// 주소 추가/삭제
export async function addAddress(params: {
  customer_id: string;
  address: string;
  fuel_type: string;
  memo: string | null;
}) {
  const supabase = createClient();
  return supabase.from("addresses").insert(params);
}

export async function deleteAddress(id: string) {
  const supabase = createClient();
  return supabase.from("addresses").delete().eq("id", id);
}
