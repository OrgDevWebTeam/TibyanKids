import { useEffect, useRef } from "react";

type Star = {
  x: number;
  y: number;
  depth: number;
  radius: number;
  phase: number;
  speed: number;
  colour: string;
  glint: boolean;
};

type ShootingStar = { x: number; y: number; vx: number; vy: number; life: number };

/** "#rrggbb" as "r,g,b" for canvas colours, white if the token is missing. */
function channels(hex: string): string {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  return match
    ? match
        .slice(1, 4)
        .map((part) => parseInt(part, 16))
        .join(",")
    : "255,255,255";
}

/**
 * The night sky behind the sign-in pages, as in the design file: stars that twinkle and drift
 * slowly (deeper stars drift faster), and a shooting star every 7 to 16 seconds. With reduced
 * motion it draws one still frame. Decorative only.
 */
export function NightSky() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const styles = getComputedStyle(canvas);
    const white = channels(styles.getPropertyValue("--tibyan-sheen"));
    const lilac = channels(styles.getPropertyValue("--tibyan-link"));

    let width = 0;
    let height = 0;
    let stars: Star[] = [];
    let shooters: ShootingStar[] = [];
    let nextShot = performance.now() + 3000 + Math.random() * 5000;
    let frame = 0;
    let last = 0;

    function draw(now: number, dt: number) {
      const still = motion.matches;
      ctx!.clearRect(0, 0, width, height);
      for (const star of stars) {
        star.x -= star.depth * 0.005 * dt;
        if (star.x < -4) star.x = width + 4;
        const alpha = still
          ? 0.75
          : 0.45 + 0.55 * (0.5 + 0.5 * Math.sin((now / 1000) * star.speed + star.phase));
        ctx!.fillStyle = `rgba(${star.colour},${alpha})`;
        ctx!.beginPath();
        if (star.glint) {
          const r = star.radius * 3;
          ctx!.moveTo(star.x, star.y - r);
          ctx!.quadraticCurveTo(star.x, star.y, star.x + r, star.y);
          ctx!.quadraticCurveTo(star.x, star.y, star.x, star.y + r);
          ctx!.quadraticCurveTo(star.x, star.y, star.x - r, star.y);
          ctx!.quadraticCurveTo(star.x, star.y, star.x, star.y - r);
        } else {
          ctx!.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        }
        ctx!.fill();
      }
      if (still) return;

      if (now > nextShot) {
        const fromStart = Math.random() < 0.5;
        shooters.push({
          x: fromStart ? Math.random() * width * 0.5 : width * 0.5 + Math.random() * width * 0.5,
          y: Math.random() * height * 0.35,
          vx: (fromStart ? 1 : -1) * (0.5 + Math.random() * 0.3),
          vy: 0.2 + Math.random() * 0.1,
          life: 0,
        });
        nextShot = now + 7000 + Math.random() * 9000;
      }
      shooters = shooters.filter((shooter) => shooter.life < 1);
      for (const shooter of shooters) {
        shooter.life += dt / 1100;
        shooter.x += shooter.vx * dt;
        shooter.y += shooter.vy * dt;
        const alpha = Math.sin(Math.PI * shooter.life);
        const tailX = shooter.x - shooter.vx * 90;
        const tailY = shooter.y - shooter.vy * 90;
        const tail = ctx!.createLinearGradient(shooter.x, shooter.y, tailX, tailY);
        tail.addColorStop(0, `rgba(${white},${alpha})`);
        tail.addColorStop(1, `rgba(${white},0)`);
        ctx!.strokeStyle = tail;
        ctx!.lineWidth = 2;
        ctx!.lineCap = "round";
        ctx!.beginPath();
        ctx!.moveTo(shooter.x, shooter.y);
        ctx!.lineTo(tailX, tailY);
        ctx!.stroke();
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
      const count = Math.min(100, Math.round(((width * height) / 10000) * 0.8));
      stars = Array.from({ length: count }, () => {
        const depth = Math.random();
        return {
          x: Math.random() * width,
          y: Math.random() * height,
          depth,
          radius: 0.4 + depth * 1.2,
          phase: Math.random() * Math.PI * 2,
          speed: 0.6 + Math.random() * 1.5,
          colour: Math.random() < 0.35 ? lilac : white,
          glint: depth > 0.94,
        };
      });
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

  return <canvas ref={canvasRef} className="auth-sky" aria-hidden="true" />;
}
