import type { Metadata } from "next";
import LogoutButton from "@/components/driver/LogoutButton";
import FcmTokenManager from "@/components/driver/FcmTokenManager";

export const metadata: Metadata = {
  title: "삼산주유소 - 배달원",
};

export default function DriverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-blue-700 text-white px-4 py-4 flex items-center justify-between shrink-0">
        <h1 className="text-xl font-bold">삼산주유소 배달</h1>
        <LogoutButton />
      </header>
      <FcmTokenManager />
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}
