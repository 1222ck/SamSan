export type SearchRouting = "pattern" | "llm" | "balance";

export type BalanceKind = "credit" | "prepaid";

export type SearchPhone = {
  id: string;
  phone: string;
  label: string | null;
};

export type SearchAddress = {
  id: string;
  address: string;
  memo: string | null;
  fuel_type: string | null;
};

export type SearchHit = {
  customer_id: string;
  name: string;
  type: string;
  memo: string | null;
  address: SearchAddress | null;
  phones: SearchPhone[];
  credit_balance?: number;
  prepaid_balance?: number;
};

export type SearchMeta = {
  count: number;
  routing: SearchRouting;
  function?: string;
  elapsed_ms: number;
  cost_usd?: number;
};

export type SearchResponse = {
  query: string;
  meta: SearchMeta;
  results: SearchHit[];
};

export type SearchErrorResponse = {
  error: string;
};

export type ExtractedIntent = {
  name?: string;
  phone?: string;
  label?: string;
  address?: string;
};
