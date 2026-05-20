import type { SearchRouting } from "./types";
import { TRAILING_NOISE_RE } from "./noise";

const PHONE_ONLY = /^[\d\s\-+()]+$/;

function tokenCount(q: string): number {
  return q.split(/\s+/).filter(Boolean).length;
}

export function decideRoute(query: string): SearchRouting {
  const q = query.trim();
  if (!q) return "pattern";

  if (PHONE_ONLY.test(q)) return "pattern";

  if (tokenCount(q) === 1) return "pattern";

  const stripped = q.replace(TRAILING_NOISE_RE, "").trim();
  if (tokenCount(stripped) <= 1) return "pattern";

  return "llm";
}
