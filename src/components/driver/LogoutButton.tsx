"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <button
      onClick={handleLogout}
      className="text-sm text-blue-200 hover:text-white px-3 py-1.5 rounded-lg hover:bg-blue-800 transition-colors"
    >
      로그아웃
    </button>
  );
}
