"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  enrichIncomingCall,
  type EnrichedCall,
  type IncomingCallRow,
} from "@/lib/supabase/queries/incomingCalls";
import IncomingCallModal from "./IncomingCallModal";

type AllowedRole = "office" | "admin";

export default function IncomingCallProvider() {
  const [queue, setQueue] = useState<EnrichedCall[]>([]);

  // 같은 row가 INSERT 이벤트로 두 번 들어와도 한 번만 처리
  const seenIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    const enqueue = async (row: IncomingCallRow) => {
      if (seenIdsRef.current.has(row.id)) return;
      seenIdsRef.current.add(row.id);
      const enriched = await enrichIncomingCall(row);
      if (cancelled) return;
      setQueue((prev) => [...prev, enriched]);
    };

    const subscribeIfAllowed = async () => {
      // 동시 호출 가드: 이미 채널이 셋업 중/완료면 즉시 종료
      // (예: 마운트 직후 subscribeIfAllowed() + GoTrueClient._initialize 의 SIGNED_IN 이벤트로
      //  onAuthStateChange 콜백 안에서 또 호출되는 race condition 방지)
      if (channel) return;

      // 1) 세션 + 사용자 확인
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user || cancelled || channel) return;

      // 2) role 확인 — office / admin 만 구독
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single<{ role: string }>();
      if (cancelled || channel) return;
      if (!profile || !(["office", "admin"] as AllowedRole[]).includes(profile.role as AllowedRole)) {
        return;
      }

      // 3) realtime이 RLS를 사용자 권한으로 평가하도록 토큰 동기화 (subscribe 전 필수)
      if (session.access_token) {
        supabase.realtime.setAuth(session.access_token);
      }
      if (cancelled || channel) return;

      // 4) realtime 구독 (INSERT 만)
      //    channel 변수를 먼저 동기적으로 set 해서 다른 동시 호출이 가드에 걸리도록 한다.
      const newChannel = supabase.channel("incoming-calls-global");
      channel = newChannel;
      newChannel
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "incoming_calls" },
          (payload) => {
            const row = payload.new as IncomingCallRow;
            void enqueue(row);
          }
        )
        .subscribe();
    };

    void subscribeIfAllowed();

    // 로그인/로그아웃 시 재평가
    const { data: authSub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        if (channel) {
          supabase.removeChannel(channel);
          channel = null;
        }
        setQueue([]);
        seenIdsRef.current.clear();
      } else if (event === "SIGNED_IN" && !channel) {
        void subscribeIfAllowed();
      }
    });

    return () => {
      cancelled = true;
      authSub.subscription.unsubscribe();
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const current = queue[0];

  function dismissCurrent() {
    setQueue((prev) => prev.slice(1));
  }

  if (!current) return null;
  return <IncomingCallModal call={current} onClose={dismissCurrent} />;
}
