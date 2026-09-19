"use client";

import Image from "next/image";
import type { AnimationItem } from "lottie-web";
import { useEffect, useRef, useState } from "react";

export function RobotLottie({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let animation: AnimationItem | undefined;
    let cancelled = false;

    void (async () => {
      const lottie = (await import("lottie-web")).default;
      if (cancelled || !containerRef.current) return;
      const instance = lottie.loadAnimation({
        container: containerRef.current,
        renderer: "svg",
        loop: true,
        autoplay: true,
        path: "/robot-lottie.json",
      });
      animation = instance;
      instance.addEventListener("DOMLoaded", () => {
        if (!cancelled) setReady(true);
      });
    })();

    return () => {
      cancelled = true;
      animation?.destroy();
    };
  }, []);

  return (
    <div className={`relative ${className ?? ""}`}>
      <Image
        src="/robot-frame.png"
        alt=""
        aria-hidden
        fill
        priority
        sizes="160px"
        className={`object-contain ${ready ? "opacity-0" : "opacity-100"}`}
      />
      <div
        ref={containerRef}
        className={`h-full w-full ${ready ? "opacity-100" : "opacity-0"}`}
        role="img"
        aria-label="MrRobot"
      />
    </div>
  );
}
