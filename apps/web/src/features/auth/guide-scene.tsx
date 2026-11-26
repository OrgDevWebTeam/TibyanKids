import { useLayoutEffect, useRef } from "react";
import coveringUrl from "@/assets/auth/guide-covering.png";
import standingUrl from "@/assets/auth/guide-standing.png";
import waveLeftUrl from "@/assets/auth/guide-wave-left.png";
import waveRightUrl from "@/assets/auth/guide-wave-right.png";
import moonUrl from "@/assets/auth/moon.png";
import { HandIcon } from "./icons";

/** What the character is doing: standing, covering her eyes, or waving with one hand. */
export type GuidePose = "standing" | "covering" | "wave-right" | "wave-left";

/**
 * A short line in the speech bubble. A new `id` shows the bubble again, even with the same text.
 * `wave` adds the waving-hand icon, for the celebration lines after logging in or signing up.
 */
export type GuideLine = { id: number; text: string; wave?: boolean };

type GuideSceneProps = { pose: GuidePose; line?: GuideLine };

/**
 * Places the speech bubble beside her head, on the reading side (right in English, left in Arabic)
 * when there is room, as the design file does. Positions are relative to the character.
 */
function placeBubble(scene: HTMLElement, guide: HTMLElement, bubble: HTMLElement) {
  const width = scene.clientWidth;
  const guideWidth = guide.offsetWidth;
  if (!width || !guideWidth) return;
  const center = guide.offsetLeft + guideWidth / 2;
  const headHalf = guideWidth * 0.3;
  const edge = 10;
  const gap = 8;
  const room = {
    right: width - edge - center - headHalf - gap,
    left: center - headHalf - gap - edge,
  };
  const preferred = getComputedStyle(scene).direction === "rtl" ? "left" : "right";
  const other = preferred === "right" ? "left" : "right";
  const side = room[preferred] < 88 && room[other] > room[preferred] + 12 ? other : preferred;
  const bubbleWidth = Math.min(145, width - 2 * edge, Math.max(88, room[side]));
  const wanted = side === "right" ? center + headHalf + gap : center - headHalf - gap - bubbleWidth;
  const x = Math.max(edge, Math.min(width - edge - bubbleWidth, wanted));
  const y = Math.max(8, guide.offsetTop + guide.offsetHeight * 0.04 - 14);
  bubble.dataset.side = side;
  bubble.style.setProperty("--bubble-width", `${bubbleWidth.toFixed(2)}px`);
  bubble.style.setProperty("--bubble-x", `${(x - guide.offsetLeft).toFixed(2)}px`);
  bubble.style.setProperty("--bubble-y", `${(y - guide.offsetTop).toFixed(2)}px`);
}

/**
 * The welcome panel's scene: the astronaut guide floating above the moon, with her speech bubble.
 * Decorative: everything she says is also on the page or announced, so it is hidden from screen
 * readers. The images are the designer's files as they are; CSS frames them.
 */
export function GuideScene({ pose, line }: GuideSceneProps) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const guideRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const scene = sceneRef.current;
    const guide = guideRef.current;
    const bubble = bubbleRef.current;
    if (!scene || !guide || !bubble) return;
    const place = () => placeBubble(scene, guide, bubble);
    place();
    const observer = new ResizeObserver(place);
    observer.observe(scene);
    observer.observe(bubble);
    return () => observer.disconnect();
  }, [line]);

  return (
    <div ref={sceneRef} className="auth-scene" aria-hidden="true">
      <div className="auth-moon-clip">
        <div className="auth-moon">
          <img className="auth-moon-art" src={moonUrl} width={1254} height={1254} alt="" />
        </div>
      </div>
      <div ref={guideRef} className="auth-guide" data-pose={pose}>
        <div
          ref={bubbleRef}
          key={line?.id}
          className="auth-bubble"
          data-show={line ? "true" : "false"}
        >
          {line?.wave && <HandIcon className="auth-bubble-icon" />}
          <span>{line?.text}</span>
        </div>
        <div className="auth-guide-float">
          <div className="auth-pose auth-pose-standing">
            <img
              className="auth-pose-art auth-pose-art-standing"
              src={standingUrl}
              width={1680}
              height={944}
              alt=""
            />
          </div>
          {/* Covering her eyes: the hands slide down from just above, over the lower body. */}
          <div className="auth-pose auth-pose-covering">
            <span className="auth-cover-lower">
              <img className="auth-pose-art" src={coveringUrl} width={1376} height={768} alt="" />
            </span>
            <span className="auth-cover-upper">
              <img className="auth-pose-art" src={coveringUrl} width={1376} height={768} alt="" />
            </span>
          </div>
          <div className="auth-pose auth-pose-wave-right">
            <img className="auth-pose-art" src={waveRightUrl} width={1376} height={768} alt="" />
          </div>
          <div className="auth-pose auth-pose-wave-left">
            <img className="auth-pose-art" src={waveLeftUrl} width={1376} height={768} alt="" />
          </div>
        </div>
      </div>
    </div>
  );
}
