import type { ExtractedIntent } from "./types";

const MODEL = "gpt-4o-mini";

const INPUT_USD_PER_TOKEN = 0.15 / 1_000_000;
const OUTPUT_USD_PER_TOKEN = 0.60 / 1_000_000;

const SYSTEM_PROMPT = [
  "한국어 자연어 고객 검색 질의에서 검색 조건을 추출합니다.",
  "다음 4가지 필드 중 추출 가능한 것만 채우고, 추출할 수 없는 필드는 비워두세요:",
  "- name: 사람 이름의 성(姓) 또는 핵심 이름, 가구명/업체명. 호칭(\"씨\", \"네\", \"님\")은 반드시 제거.",
  "  예) \"김씨\" → \"김\", \"박형\" → \"박\", \"큰들횟집\" → \"큰들횟집\"",
  "- address: 주소 키워드. 공백 없이 붙여서 추출하세요.",
  "  예) \"두포 1길\" → \"두포1길\", \"포교 마을\" → \"포교\"",
  "- phone: 전화번호 일부 (숫자/하이픈)",
  "- label: 전화 분류 라벨. 예) \"휴대폰\", \"자택\", \"대표\"",
  "조사(\"~에 사는\", \"~의\", \"~한테\")는 제거하고 핵심 키워드만 추출하세요.",
  "한 번만 search_customers 도구를 호출하세요.",
].join("\n");

const TOOL_DEF = {
  type: "function" as const,
  function: {
    name: "search_customers",
    description: "추출된 키워드로 고객을 검색합니다.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "이름이나 가구명 (예: 큰들횟집, 김식백)" },
        address: { type: "string", description: "주소 키워드 (예: 두포1길, 포교)" },
        phone: { type: "string", description: "전화번호 일부" },
        label: { type: "string", description: "전화 라벨 (예: 휴대폰, 자택)" },
      },
      additionalProperties: false,
    },
  },
};

type OpenAIToolCall = {
  function: { name: string; arguments: string };
};

type OpenAIResponse = {
  choices: Array<{ message: { tool_calls?: OpenAIToolCall[] } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

export type LlmExtractionResult = {
  intent: ExtractedIntent;
  cost_usd: number;
};

export class LlmUnavailableError extends Error {
  constructor() {
    super("OPENAI_API_KEY 미설정 — LLM 라우팅 불가");
  }
}

export async function extractIntent(query: string): Promise<LlmExtractionResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new LlmUnavailableError();

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: query },
      ],
      tools: [TOOL_DEF],
      tool_choice: { type: "function", function: { name: "search_customers" } },
      temperature: 0,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as OpenAIResponse;
  const call = data.choices[0]?.message?.tool_calls?.[0];
  const usage = data.usage ?? {};
  const cost_usd =
    (usage.prompt_tokens ?? 0) * INPUT_USD_PER_TOKEN +
    (usage.completion_tokens ?? 0) * OUTPUT_USD_PER_TOKEN;

  if (!call) return { intent: {}, cost_usd };

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(call.function.arguments);
  } catch {
    return { intent: {}, cost_usd };
  }

  const intent: ExtractedIntent = {};
  for (const k of ["name", "address", "phone", "label"] as const) {
    const v = parsed[k];
    if (typeof v === "string" && v.trim()) intent[k] = v.trim();
  }
  return { intent, cost_usd };
}
