import { NextRequest, NextResponse } from "next/server";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function initFirebaseAdmin() {
  if (getApps().length) return;
  initializeApp({
    credential: cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll() {},
        },
      }
    );

    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    initFirebaseAdmin();

    const { title, body } = await request.json();

    if (!title || typeof title !== "string" || title.length > 100) {
      return NextResponse.json({ error: "Invalid title" }, { status: 400 });
    }
    if (body !== undefined && (typeof body !== "string" || body.length > 200)) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: drivers } = await supabase
      .from("profiles")
      .select("fcm_token")
      .eq("role", "driver")
      .not("fcm_token", "is", null);

    if (!drivers?.length) {
      return NextResponse.json({ ok: true, sent: 0 });
    }

    const messaging = getMessaging();

    await Promise.allSettled(
      drivers
        .filter((d) => d.fcm_token)
        .map((d) =>
          messaging.send({
            token: d.fcm_token,
            notification: { title, body },
            android: { priority: "high" },
            apns: { payload: { aps: { sound: "default" } } },
          })
        )
    );

    return NextResponse.json({ ok: true, sent: drivers.length });
  } catch (error) {
    console.error("FCM notify error");
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
