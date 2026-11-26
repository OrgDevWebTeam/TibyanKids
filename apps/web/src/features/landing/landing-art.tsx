import { type ReactNode, useId } from "react";

// Line icons and drawings from the designer's landing page. Decorative only: every control that
// shows one also has words or an aria-label.

function Icon({ children, className = "lp-icon" }: { children: ReactNode; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

type IconProps = { className?: string };

export const CheckIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 12.5l2.5 2.5L16 9.5" />
  </Icon>
);

export const ArrowIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
);

export const PrevIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M15 6l-6 6 6 6" />
  </Icon>
);

export const NextIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M9 6l6 6-6 6" />
  </Icon>
);

export const MenuIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Icon>
);

export const CloseIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

export const GlobeIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
  </Icon>
);

export const MoonIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
  </Icon>
);

export const SunIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
  </Icon>
);

/** The journey rail's rocket, from the designer's file. It points the way the page scrolls. */
export const Rocket = () => (
  <svg
    className="lp-rail-rocket"
    width="24"
    height="44"
    viewBox="0 0 48 96"
    aria-hidden="true"
    focusable="false"
  >
    <path
      d="M15 47 5 68l11-5m17-16 10 21-11-5"
      fill="var(--lp-violet-400)"
      stroke="var(--lp-violet-200)"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <path
      d="M24 4C14 16 12 31 13 51l3 17h16l3-17C36 31 34 16 24 4Z"
      fill="#fff"
      stroke="var(--lp-violet-400)"
      strokeWidth="2.5"
      strokeLinejoin="round"
    />
    <path
      d="M19 18c-3 9-4 19-3 27"
      fill="none"
      stroke="#e9e4ff"
      strokeWidth="3"
      strokeLinecap="round"
    />
    <circle
      cx="24"
      cy="35"
      r="6"
      fill="var(--lp-violet-500)"
      stroke="var(--lp-violet-200)"
      strokeWidth="2"
    />
    <path d="M18 59h12l-2 8h-8Z" fill="var(--lp-violet-200)" />
    <rect x="18" y="69" width="12" height="5" rx="2.5" fill="var(--lp-mint-500)" />
    <g className="lp-rail-flame">
      <path d="M17.5 76.5q6.5 21 13 0z" fill="var(--lp-mint-500)" opacity=".9" />
      <path d="M21 76.5q3 11 6 0z" fill="#e3faf0" opacity=".85" />
    </g>
  </svg>
);

export const LockIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <rect x="5" y="10" width="14" height="10" rx="3" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </Icon>
);

export const FlameIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M12 21c-3.9 0-7-2.7-7-6.4 0-3.4 2.5-5.4 3.8-8.1.4 1.7 1.3 2.7 2.3 3.3C11.6 6.5 13 4.4 15 3c-.2 3 1.2 4.6 2.4 6.2A7.2 7.2 0 0 1 19 14.6C19 18.3 15.9 21 12 21z" />
  </Icon>
);

export const EyeIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);

export const HeartIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z" />
  </Icon>
);

export const ShieldIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z" />
    <path d="M9 12l2 2 4-4" />
  </Icon>
);

/** The four-point star of the design, filled. */
export const Glint = () => (
  <svg className="lp-glint" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M12 0c.9 6.6 4.4 10.4 12 12-7.6 1.6-11.1 5.4-12 12-.9-6.6-4.4-10.4-12-12C7.6 10.4 11.1 6.6 12 0z" />
  </svg>
);

/** The learning pet: a small moon creature, fed by finished challenges. An illustration. */
export function Pet({ className }: { className?: string }) {
  const id = useId();
  const body = `${id}-body`;
  const glow = `${id}-glow`;
  return (
    <svg className={className} viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={body} cx=".38" cy=".3" r=".85">
          <stop offset="0" stopColor="#F5F2FF" />
          <stop offset=".42" stopColor="#C1BAFF" />
          <stop offset="1" stopColor="#7C5CFF" />
        </radialGradient>
        <radialGradient id={glow} cx=".4" cy=".35" r=".7">
          <stop offset="0" stopColor="#E3FAF0" />
          <stop offset=".55" stopColor="#3DDC97" />
          <stop offset="1" stopColor="#1F9968" />
        </radialGradient>
      </defs>
      <ellipse cx="60" cy="111" rx="32" ry="5" fill="#1A1238" opacity=".2" />
      <path
        d="M62 26c2-7 5-11 8-14"
        fill="none"
        stroke="#9C8EFF"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <circle cx="71" cy="11" r="7" fill={`url(#${glow})`} />
      <path d="M30 44c-7-12-3-22 6-20 5 2 6 8 5 14z" fill="#9C8EFF" />
      <path d="M90 44c7-12 3-22-6-20-5 2-6 8-5 14z" fill="#9C8EFF" />
      <ellipse cx="43" cy="104" rx="12" ry="7" fill="#5B2EFF" />
      <ellipse cx="77" cy="104" rx="12" ry="7" fill="#5B2EFF" />
      <path
        d="M60 26c28 0 44 21 44 47 0 22-18 33-44 33S16 95 16 73c0-26 16-47 44-47z"
        fill={`url(#${body})`}
      />
      <ellipse
        cx="41"
        cy="42"
        rx="13"
        ry="7"
        fill="#fff"
        opacity=".45"
        transform="rotate(-28 41 42)"
      />
      <ellipse cx="60" cy="88" rx="24" ry="15" fill="#F5F2FF" opacity=".5" />
      <ellipse cx="45" cy="65" rx="7.5" ry="9" fill="#1A1238" />
      <ellipse cx="75" cy="65" rx="7.5" ry="9" fill="#1A1238" />
      <circle cx="47.6" cy="61.4" r="2.9" fill="#fff" />
      <circle cx="77.6" cy="61.4" r="2.9" fill="#fff" />
      <ellipse cx="33" cy="77" rx="6.5" ry="3.8" fill="#FF8AD8" opacity=".75" />
      <ellipse cx="87" cy="77" rx="6.5" ry="3.8" fill="#FF8AD8" opacity=".75" />
      <path
        d="M53.5 77.5q6.5 6.5 13 0"
        fill="none"
        stroke="#1A1238"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** The navigator band's map of lessons: three done, the current one, two still locked. */
export function Constellation() {
  return (
    <svg
      className="lp-constellation"
      viewBox="0 0 320 170"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M24 140 L80 96 L138 118 L190 62"
        stroke="#C1BAFF"
        strokeWidth="2"
        opacity=".55"
        fill="none"
      />
      <path
        d="M190 62 L252 86 L296 30"
        stroke="#C1BAFF"
        strokeWidth="2"
        strokeDasharray="4 5"
        opacity=".3"
        fill="none"
      />
      <g fill="#3DDC97">
        <circle cx="24" cy="140" r="9" />
        <circle cx="80" cy="96" r="9" />
        <circle cx="138" cy="118" r="9" />
      </g>
      <g
        stroke="#1A1240"
        strokeWidth="2.4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20 140l3 3 5-6" />
        <path d="M76 96l3 3 5-6" />
        <path d="M134 118l3 3 5-6" />
      </g>
      <circle
        cx="190"
        cy="62"
        r="15"
        fill="none"
        stroke="#C1BAFF"
        strokeWidth="2.5"
        strokeDasharray="3 4"
      />
      <circle cx="190" cy="62" r="10" fill="#8B7CF6" />
      <g fill="#2A1F5C" stroke="#6C639C" strokeWidth="2">
        <circle cx="252" cy="86" r="9" />
        <circle cx="296" cy="30" r="9" />
      </g>
    </svg>
  );
}
