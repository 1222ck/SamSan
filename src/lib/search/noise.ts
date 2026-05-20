export const TRAILING_NOISE_RE =
  /\s*(전화번호|연락처|번호|주소|위치|메모|핸드폰|휴대폰|자택|대표전화)$/;

export function stripNoise(query: string): string {
  let s = query.trim();
  for (let i = 0; i < 3; i++) {
    const next = s.replace(TRAILING_NOISE_RE, "").trim();
    if (next === s) break;
    s = next;
  }
  return s || query.trim();
}
