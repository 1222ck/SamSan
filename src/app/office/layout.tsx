import type { Metadata } from "next";
import LogoutButton from "@/components/office/LogoutButton";
import NavTabs from "@/components/office/NavTabs";

export const metadata: Metadata = {
  title: "삼산주유소 - 사무실",
};

export default function OfficeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shrink-0">
        <h1 className="text-lg font-bold text-gray-800">삼산주유소 사무실</h1>
        <LogoutButton />
      </header>
      <NavTabs />
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
