"use client";

import { useEffect, useRef, useState } from "react";

type CountUpProps = {
  value: number;
  duration?: number;
  formatter?: (n: number) => string;
  className?: string;
};

/** KPI kartlarında sayının 0'dan (veya önceki değerden) hedefe doğru kısa,
 * sakin bir şekilde sayarak gelmesi için — dış kütüphane gerektirmez,
 * `requestAnimationFrame` ile. `prefers-reduced-motion` açıkken doğrudan
 * hedef değeri gösterir, sayma yapmaz. */
export function CountUp({ value, duration = 700, formatter, className }: CountUpProps) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const reduceMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || !Number.isFinite(value)) {
      setDisplay(value);
      return;
    }
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    const start = performance.now();
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    function tick(now: number) {
      const t = Math.min(1, (now - start) / duration);
      const current = from + (to - from) * ease(t);
      setDisplay(current);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const rounded = Math.round(display);
  const text = formatter ? formatter(rounded) : rounded.toLocaleString("tr-TR");
  return <span className={`ui-count-up ${className || ""}`}>{text}</span>;
}
