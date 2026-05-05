"use client";

import { useEffect, useRef, useState } from "react";

const THRESHOLD = 70;

export default function PullToRefresh() {
  const [distance, setDistance] = useState(0);
  const startY = useRef(0);
  const active = useRef(false);

  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      if (window.scrollY > 0) return;
      startY.current = e.touches[0].clientY;
      active.current = true;
    }

    function onTouchMove(e: TouchEvent) {
      if (!active.current) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) {
        active.current = false;
        setDistance(0);
        return;
      }
      setDistance(Math.min(dy * 0.45, THRESHOLD + 12));
    }

    function onTouchEnd() {
      if (!active.current) return;
      active.current = false;
      setDistance((d) => {
        if (d >= THRESHOLD) window.location.reload();
        return 0;
      });
    }

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  if (distance === 0) return null;

  const ready = distance >= THRESHOLD;
  const opacity = Math.min(distance / (THRESHOLD * 0.5), 1);
  const rotation = Math.min((distance / THRESHOLD) * 360, 360);

  return (
    <div
      className="fixed top-3 left-0 right-0 z-50 pointer-events-none flex justify-center"
      style={{ opacity }}
    >
      <div
        className={`w-9 h-9 rounded-full shadow-lg flex items-center justify-center transition-colors duration-150 ${
          ready ? "bg-blue-600" : "bg-white border border-gray-200"
        }`}
      >
        <svg
          style={{ transform: `rotate(${rotation}deg)` }}
          className={`w-5 h-5 ${ready ? "text-white" : "text-gray-400"}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
      </div>
    </div>
  );
}
