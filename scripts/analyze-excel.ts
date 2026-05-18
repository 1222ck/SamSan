/**
 * Excel 진단 스크립트 (산출물 1 보조)
 *
 * 사용법:
 *   npx tsx scripts/analyze-excel.ts <xlsx-path> [--sheet <name>] [--rows <n>]
 *
 * 출력:
 *   - 시트 목록
 *   - 시트별 헤더(다단계 헤더면 상위 3행 raw 출력)
 *   - 컬럼별 추정 타입 / 비어있음 비율 / 샘플값 5개
 *   - 이상치 후보(개행 포함, 다중값 추정, 숫자/문자 혼재)
 *
 * Phase 1 진단용 임시 스크립트. import-excel.ts와는 분리.
 */
import * as XLSX from "xlsx";
import { argv } from "node:process";

type CellVal = string | number | boolean | Date | null;

function isMultiValue(v: string): boolean {
  // 한 셀에 여러 값이 들어있을 가능성: 줄바꿈, 콤마+공백, 슬래시, 세미콜론
  return /\n|,\s|\/|;/.test(v) && v.length > 3;
}

function inferType(values: CellVal[]): string {
  const non = values.filter((v) => v !== null && v !== "" && v !== undefined);
  if (non.length === 0) return "empty";
  const types = new Set(
    non.map((v) => {
      if (v instanceof Date) return "date";
      if (typeof v === "number") return "number";
      if (typeof v === "boolean") return "boolean";
      // 숫자 형태 문자열
      if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim())) return "numeric-string";
      // 전화번호 형태
      if (typeof v === "string" && /^[\d\-() ]{8,}$/.test(v.trim())) return "phone-like";
      return "string";
    }),
  );
  return [...types].join("|");
}

function analyze(filePath: string, opts: { sheet?: string; rows: number }) {
  console.log(`\n=== 파일: ${filePath} ===\n`);
  const wb = XLSX.readFile(filePath, { cellDates: true, cellNF: false });
  console.log(`시트 ${wb.SheetNames.length}개: ${wb.SheetNames.join(", ")}\n`);

  const targets = opts.sheet ? [opts.sheet] : wb.SheetNames;

  for (const name of targets) {
    const ws = wb.Sheets[name];
    if (!ws) {
      console.log(`[!] 시트 없음: ${name}`);
      continue;
    }
    const ref = ws["!ref"];
    console.log(`\n--- 시트: "${name}" (range: ${ref}) ---`);

    // 헤더 추정용 상위 5행 raw 출력
    const rawRows = XLSX.utils.sheet_to_json<CellVal[]>(ws, {
      header: 1,
      raw: false,
      defval: null,
      blankrows: false,
    });
    console.log(`전체 행 수(빈행 제외): ${rawRows.length}`);
    console.log(`상위 5행 raw:`);
    rawRows.slice(0, 5).forEach((row, i) => {
      console.log(`  [${i}] ${JSON.stringify(row).slice(0, 300)}`);
    });

    // 헤더가 0행이라 가정한 컬럼별 분석
    if (rawRows.length < 2) {
      console.log(`  (데이터 행 부족, 분석 건너뜀)`);
      continue;
    }
    const header = rawRows[0] as (string | null)[];
    const body = rawRows.slice(1);
    console.log(`\n컬럼별 분석 (헤더=0행 가정, 본문 ${body.length}행):`);

    header.forEach((colName, idx) => {
      const col = body.map((r) => (r as CellVal[])[idx] ?? null);
      const nonEmpty = col.filter((v) => v !== null && v !== "");
      const emptyRate = ((1 - nonEmpty.length / col.length) * 100).toFixed(1);
      const type = inferType(col);
      const samples = nonEmpty.slice(0, 5).map((v) => String(v).slice(0, 60));

      // 이상치
      const anomalies: string[] = [];
      const strVals = nonEmpty.filter((v): v is string => typeof v === "string");
      const multiCount = strVals.filter(isMultiValue).length;
      if (multiCount > 0) anomalies.push(`다중값:${multiCount}`);
      const newlineCount = strVals.filter((v) => /\n/.test(v)).length;
      if (newlineCount > 0) anomalies.push(`개행:${newlineCount}`);
      const nanCount = col.filter(
        (v) => typeof v === "number" && Number.isNaN(v),
      ).length;
      if (nanCount > 0) anomalies.push(`NaN:${nanCount}`);

      const label =
        colName === null || colName === ""
          ? `(컬럼${idx}/무명)`
          : `"${colName}"`;
      console.log(
        `  [${idx}] ${label} | type=${type} | empty=${emptyRate}% | samples=${JSON.stringify(samples)}${anomalies.length ? ` | !${anomalies.join(",")}` : ""}`,
      );
    });
  }
}

// CLI
const args = argv.slice(2);
const filePath = args[0];
if (!filePath) {
  console.error("usage: tsx scripts/analyze-excel.ts <xlsx-path> [--sheet <name>] [--rows <n>]");
  process.exit(1);
}
const sheetIdx = args.indexOf("--sheet");
const rowsIdx = args.indexOf("--rows");
analyze(filePath, {
  sheet: sheetIdx >= 0 ? args[sheetIdx + 1] : undefined,
  rows: rowsIdx >= 0 ? Number(args[rowsIdx + 1]) : 5,
});
