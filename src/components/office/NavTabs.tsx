"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/office", label: "배달 현황" },
  { href: "/office/customers", label: "고객 관리" },
];

export default function NavTabs() {
  const pathname = usePathname();

  return (
    <nav className="bg-white border-b border-gray-200 px-2 sm:px-6 flex gap-1">
      {TABS.map((tab) => {
        const active =
          tab.href === "/office"
            ? pathname === "/office"
            : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              active
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
