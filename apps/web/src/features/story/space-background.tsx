import { useEffect, useRef } from "react";

type Star = {
  x: number;
  y: number;
  radius: number;
  drift: number;
  phase: number;
  twinkle: boolean;
};

// CW/Space background's motion, as its layer names give it: twinkling stars (opacity 0.3 to 1
// every 2.4s, staggered), near stars that drift at 0.6× and far stars at 0.2×. The base drift is
// a slow 8px a second, so the sky moves without pulling the eye.
const TWINKLE_MS = 2400;
const BASE_DRIFT = 8 / 1000;
const LAYERS = [
  { share: 0.15, drift: 0, radius: [1, 1.8], twinkle: true },
  { share: 0.3, drift: 0.6, radius: [0.8, 1.4], twinkle: false },
  { share: 0.55, drift: 0.2, radius: [0.4, 0.9], twinkle: false },
] as const;

/**
 * The night sky behind every Child World screen: stars on a canvas and a nebula that drifts. With
 * reduced motion it draws one still frame. Decorative only.
 */
export function SpaceBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0;
    let height = 0;
    let stars: Star[] = [];
    let frame = 0;
    let last = 0;

    function draw(now: number, dt: number) {
      const still = motion.matches;
      ctx!.clearRect(0, 0, width, height);
      for (const star of stars) {
        star.x -= star.drift * BASE_DRIFT * dt;
        if (star.x < -2) star.x = width + 2;
        const wave = 0.5 + 0.5 * Math.sin((now / TWINKLE_MS) * Math.PI * 2 + star.phase);
        const alpha = star.twinkle && !still ? 0.3 + 0.7 * wave : 0.8;
        ctx!.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx!.beginPath();
        ctx!.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        ctx!.fill();
      }
    }

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      const ratio = Math.min(devicePixelRatio || 1, 1.5);
      width = rect.width;
      height = rect.height;
      canvas!.width = Math.round(width * ratio);
      canvas!.height = Math.round(height * ratio);
      ctx!.setTransform(ratio, 0, 0, ratio, 0, 0);
      const count = Math.min(160, Math.round((width * height) / 9000));
      stars = LAYERS.flatMap((layer) =>
        Array.from({ length: Math.round(count * layer.share) }, () => ({
          x: Math.random() * width,
          y: Math.random() * height,
          radius: layer.radius[0] + Math.random() * (layer.radius[1] - layer.radius[0]),
          drift: layer.drift,
          phase: Math.random() * Math.PI * 2,
          twinkle: layer.twinkle,
        })),
      );
      draw(performance.now(), 0);
    }

    // About 20 frames a second is enough for a slow sky, and lighter on phones.
    function loop(now: number) {
      if (document.hidden || motion.matches) {
        frame = 0;
        return;
      }
      if (now - last >= 50) {
        draw(now, Math.min(80, now - last));
        last = now;
      }
      frame = requestAnimationFrame(loop);
    }

    function start() {
      if (frame !== 0 || motion.matches || document.hidden) return;
      last = performance.now();
      frame = requestAnimationFrame(loop);
    }

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    const onChange = () => {
      draw(performance.now(), 0);
      start();
    };
    document.addEventListener("visibilitychange", onChange);
    motion.addEventListener("change", onChange);
    resize();
    start();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onChange);
      motion.removeEventListener("change", onChange);
    };
  }, []);

  return (
    <div className="cw-space" aria-hidden="true">
      <div className="cw-nebula">
        <span />
        <span />
        <span />
        <span />
      </div>
      <canvas ref={canvasRef} />
    </div>
  );
}
