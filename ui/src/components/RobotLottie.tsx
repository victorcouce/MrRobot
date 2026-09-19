"use client";

import Image from "next/image";
import type { AnimationItem } from "lottie-web";
import { useEffect, useRef, useState } from "react";

const ZZZ = ["z", "Z", "Z", "z"];

export function RobotLottie({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [zzzVisible, setZzzVisible] = useState(false);

  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    const interval = setInterval(() => {
      setZzzVisible(true);
      hideTimer = setTimeout(() => setZzzVisible(false), 2500);
    }, 30_000);
    return () => {
      clearInterval(interval);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, []);

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
      {zzzVisible && (
        <div
          aria-hidden
          className="pointer-events-none absolute top-[10%] left-[58%] rotate-[16deg]"
        >
          <div className="flex items-end gap-[2px] font-display font-medium leading-none text-ink-2">
            {ZZZ.map((letter, index) => (
              <span
                key={index}
                className="animate-zzz motion-reduce:animate-none"
                style={{
                  animationDelay: `${index * 0.15}s`,
                  fontSize: `${0.55 + index * 0.09}rem`,
                }}
              >
                {letter}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
