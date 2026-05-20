import { Suspense } from "react";
import SearchPanel from "./SearchPanel";

export const metadata = {
  title: "삼산주유소 - 검색",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const params = await searchParams;
  const rawQ = params.q;
  const initialQuery = Array.isArray(rawQ) ? rawQ[0] ?? "" : rawQ ?? "";

  return (
    <main className="min-h-screen bg-gray-50">
      <Suspense
        fallback={
          <div className="mx-auto w-full max-w-2xl px-4 py-6">
            <div className="h-11 bg-gray-200 rounded-lg animate-pulse" />
          </div>
        }
      >
        <SearchPanel initialQuery={initialQuery} />
      </Suspense>
    </main>
  );
}
