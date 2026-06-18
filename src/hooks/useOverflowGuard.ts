import { useState, useRef, useEffect } from 'react';

/**
 * 监控容器内容是否溢出设置的固定高度。
 * 未溢出时应用 height（允许收缩），溢出时切换为 minHeight（防止覆盖下方元素）。
 * 比较基准为用户设定的目标高度数值，避免 clientHeight 变化导致的闪烁。
 */
export function useOverflowGuard(desiredHeight: string | undefined) {
  const ref = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || !desiredHeight) {
      setIsOverflowing(false);
      return;
    }

    const desiredPx = parseFloat(desiredHeight);
    if (isNaN(desiredPx)) return;

    const observer = new ResizeObserver(() => {
      const el = ref.current;
      if (!el) return;
      setIsOverflowing(el.scrollHeight > desiredPx);
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [desiredHeight]);

  const heightStyle: React.CSSProperties =
    desiredHeight
      ? isOverflowing
        ? { minHeight: desiredHeight }
        : { height: desiredHeight }
      : {};

  return { ref, heightStyle, isOverflowing };
}
