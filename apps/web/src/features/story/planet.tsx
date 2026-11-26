import { type StoryDomain } from "./story-api";
import { CheckGlyph } from "./story-icons";

// CW/Planet of Figma "Child World · 6–8". Each subject has its planet colour (Read me: Quran =
// mint, Arabic = yellow, Faith = pink, Future skills = Violet 400). Arabic and Quran are the
// collection's ring colours; Faith has no ring in the file yet, so it takes the design system's
// pink. Character has no planet in Child World, so it keeps the brand violet.
const PLANET_COLOUR: Record<StoryDomain, string> = {
  arabic: "var(--cw-planet-arabic)",
  quran: "var(--cw-planet-quran)",
  faith: "var(--tibyan-rare)",
  future_skills: "var(--cw-planet-future-skills)",
  character: "var(--tibyan-primary)",
};

export const planetColour = (domain?: StoryDomain) =>
  PLANET_COLOUR[domain ?? "arabic"] ?? PLANET_COLOUR.arabic;

/**
 * The planet itself. The file's planets are pictures that are not in the repository yet, so until
 * they are exported this draws a ringed globe in the subject's colour. Decorative.
 */
function Globe({ colour, className }: { colour: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <ellipse
        cx="50"
        cy="52"
        rx="47"
        ry="13"
        transform="rotate(-14 50 52)"
        fill="none"
        stroke={colour}
        strokeOpacity="0.55"
        strokeWidth="5"
      />
      <circle cx="50" cy="50" r="31" fill={colour} />
      <path
        d="M24 42c10 5 30 6 52-2M21 56c14 6 38 6 58-3"
        fill="none"
        stroke="#120c2b"
        strokeOpacity="0.14"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <circle cx="40" cy="38" r="9" fill="#ffffff" fillOpacity="0.28" />
      <path
        d="M4.6 63.6C14 70 40 70 64 62s34-20 31-26"
        fill="none"
        stroke={colour}
        strokeWidth="5"
        strokeLinecap="round"
        transform="rotate(-2 50 52)"
      />
    </svg>
  );
}

/** "Arabic planet" in the lesson header: 56px, 44px on phones. */
export function PlanetBadge({ domain }: { domain?: StoryDomain }) {
  return <Globe colour={planetColour(domain)} className="size-11 shrink-0 md:size-14" />;
}

// Planet complete (ring fills · glow): a 272px CW/Planet whose daily ring fills, with a glow and
// the green done badge. On phones it is 70% of that.
const RING_RADIUS = 130;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

export function PlanetComplete({ domain }: { domain?: StoryDomain }) {
  const colour = planetColour(domain);
  return (
    // The art is the same in both languages (the badge sits bottom right), so it is laid out LTR.
    <div dir="ltr" className="relative size-[190px] md:size-[272px]" aria-hidden="true">
      <div
        className="absolute inset-[6%] rounded-full opacity-28 blur-2xl"
        style={{ background: colour }}
      />
      <svg className="absolute inset-0 size-full -rotate-90" viewBox="0 0 272 272">
        <circle
          cx="136"
          cy="136"
          r={RING_RADIUS}
          fill="none"
          stroke="var(--cw-step-link)"
          strokeWidth="12"
        />
        <circle
          className="cw-ring-fill"
          cx="136"
          cy="136"
          r={RING_RADIUS}
          fill="none"
          stroke={colour}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={RING_LENGTH}
          style={{ ["--cw-ring-length" as string]: `${RING_LENGTH}` }}
        />
      </svg>
      <Globe colour={colour} className="absolute inset-[12%] size-[76%]" />
      <span className="absolute end-[4%] bottom-[10%] grid size-[26%] place-items-center rounded-full border-4 border-background bg-success-fill text-on-primary">
        <CheckGlyph className="size-[54%]" />
      </span>
    </div>
  );
}
