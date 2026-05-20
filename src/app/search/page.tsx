import { Suspense } from "react";
import SearchPanel from "./SearchPanel";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const params = await searchParams;
  const rawQ = params.q;
  const initialQuery = Array.isArray(rawQ) ? rawQ[0] ?? "" : rawQ ?? "";

  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-2xl px-4 py-6">
          <div className="h-11 bg-gray-200 rounded-lg animate-pulse" />
        </div>
      }
    >
      <SearchPanel initialQuery={initialQuery} />
    </Suspense>
  );
}
