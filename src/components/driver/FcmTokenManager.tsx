"use client";

import { useEffect } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getMessaging, getToken } from "firebase/messaging";
import { createClient } from "@/lib/supabase/client";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export default function FcmTokenManager() {
  useEffect(() => {
    async function setup() {
      if (!("Notification" in window) || !("serviceWorker" in navigator)) return;

      try {
        const registration = await navigator.serviceWorker.register(
          "/firebase-messaging-sw.js"
        );

        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;

        const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
        const messaging = getMessaging(app);

        const token = await getToken(messaging, {
          vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
          serviceWorkerRegistration: registration,
        });

        if (!token) return;

        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        await supabase
          .from("profiles")
          .update({ fcm_token: token })
          .eq("id", user.id);
      } catch (err) {
        console.error("FCM setup:", err);
      }
    }

    setup();
  }, []);

  return null;
}
