const SVG_NS = "http://www.w3.org/2000/svg";
const GLINT_PATH = "M12 0C13 8 16 11 24 12C16 13 13 16 12 24C11 16 8 13 0 12C8 11 11 8 12 0Z";
const TONES = 6;

/**
 * A small burst of stars around an element, as in the design file (a success, or switching between
 * log in and sign up). The stars go into `layer`, a fixed full-page element inside the dark scene,
 * and remove themselves. With reduced motion they only fade.
 */
export function burstAround(
  layer: HTMLElement | null,
  target: Element | null,
  count = 10,
  yAt = 0.5,
) {
  if (!layer || !target || typeof target.getBoundingClientRect !== "function") return;
  const rect = target.getBoundingClientRect();
  if (!rect.width) return;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height * yAt;
  const radius = Math.min(rect.width, rect.height) / 2;

  for (let index = 0; index < count; index++) {
    const size = 10 + Math.random() * 10;
    const star = document.createElementNS(SVG_NS, "svg");
    star.setAttribute("viewBox", "0 0 24 24");
    star.setAttribute("width", String(size));
    star.setAttribute("height", String(size));
    star.setAttribute("class", `auth-star auth-star-${index % TONES}`);
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", GLINT_PATH);
    star.append(path);
    layer.append(star);

    const angle = (index / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
    const distance = radius + 16 + Math.random() * 40;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance;
    const base = `translate(${centerX - size / 2}px, ${centerY - size / 2}px)`;
    const away = `${base} translate(${dx}px, ${dy}px)`;
    const animation = reduced
      ? star.animate(
          [
            { opacity: 0, transform: away },
            { opacity: 1, offset: 0.3 },
            { opacity: 0, transform: away },
          ],
          { duration: 900 },
        )
      : star.animate(
          [
            { opacity: 1, transform: `${base} scale(0.2)` },
            { opacity: 1, offset: 0.6 },
            {
              opacity: 0,
              transform: `${away} scale(1) rotate(${Math.round(Math.random() * 120 - 60)}deg)`,
            },
          ],
          { duration: 650 + Math.random() * 250, easing: "cubic-bezier(.2,.8,.2,1)" },
        );
    animation.finished.catch(() => undefined).finally(() => star.remove());
  }
}
