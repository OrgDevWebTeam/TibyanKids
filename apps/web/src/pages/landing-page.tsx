import "@/features/landing/landing.css";
import {
  type CSSProperties,
  type KeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link } from "react-router";
import asiaHeroUrl from "@/assets/landing/asia-hero.webp";
import asiaSmallUrl from "@/assets/landing/asia-small.webp";
import logoArDarkUrl from "@/assets/landing/logo-ar-on-dark.webp";
import logoArLightUrl from "@/assets/landing/logo-ar-on-light.webp";
import logoEnDarkUrl from "@/assets/landing/logo-en-on-dark.webp";
import logoEnLightUrl from "@/assets/landing/logo-en-on-light.webp";
import moonUrl from "@/assets/landing/moon.webp";
import planetAkhlaqUrl from "@/assets/landing/planet-akhlaq.webp";
import planetPurpleUrl from "@/assets/landing/planet-arabic.webp";
import planetFaithUrl from "@/assets/landing/planet-faith.webp";
import planetFutureUrl from "@/assets/landing/planet-future.webp";
import planetYellowUrl from "@/assets/landing/planet-quran.webp";
import shamHeroUrl from "@/assets/landing/sham-hero.webp";
import shamSmallUrl from "@/assets/landing/sham-300.webp";
import { fill } from "@/features/auth/auth-rules";
import { NightSky } from "@/features/auth/night-sky";
import {
  ArrowIcon,
  CheckIcon,
  CloseIcon,
  Constellation,
  EyeIcon,
  FlameIcon,
  Glint,
  HeartIcon,
  LockIcon,
  MoonIcon,
  MenuIcon,
  NextIcon,
  Pet,
  PrevIcon,
  ShieldIcon,
  Rocket,
  SunIcon,
} from "@/features/landing/landing-art";
import { LOCALES, LOCALE_NAMES, type Locale } from "@/i18n/config";
import { formatTemplate } from "@/i18n/format";
import { rememberLocale } from "@/i18n/preferred-locale";
import { type Dictionary, useI18n } from "@/i18n/locale-data";
import { type Theme, useTheme } from "@/lib/theme";

// G01, the public landing page, from the designer's file "landing page" (24/11). Not built from
// it, on purpose: the Basmala in the Quran world (no Quran text in this app's screens), the
// families' quotes (placeholders, not real), and footer links whose pages do not exist yet.

type Text = Dictionary["landing"];

/** The ages the platform serves, and each band's range. */
const AGES = { min: 6, max: 14 };
const BANDS = [
  { id: "explorer", min: 6, max: 8 },
  { id: "navigator", min: 9, max: 11 },
  { id: "captain", min: 12, max: 14 },
] as const;

/** An age range as the design writes it: "6–8", and in Arabic "من 6 إلى 8 سنوات". */
function ageRange(locale: Locale, t: Text, min: number, max: number): string {
  const form = new Intl.PluralRules(locale).select(max) === "few" ? "few" : "other";
  return formatTemplate(locale, t.rangeFormat[form], { min, max });
}
type BandId = (typeof BANDS)[number]["id"];

// The five worlds in the slider's order, each with its colour from the design system's ramps.
// The planet files are named the other way round in the design: the purple one is the Quran's.
const WORLDS = [
  { id: "quran", colour: "var(--lp-violet-500)", image: planetPurpleUrl },
  { id: "arabic", colour: "var(--lp-yellow-500)", image: planetYellowUrl },
  { id: "akhlaq", colour: "var(--lp-coral-500)", image: planetAkhlaqUrl },
  { id: "faith", colour: "var(--lp-pink-500)", image: planetFaithUrl },
  { id: "future", colour: "var(--lp-mint-500)", image: planetFutureUrl },
] as const;

const prefersReducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The logo goes home; already on the landing page, that is back to the top. */
function scrollToTop() {
  window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
}

/** Sections and cards rise in as they scroll into view (at once with reduced motion). */
function useReveal(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const items = root.current?.querySelectorAll<HTMLElement>(".lp-reveal") ?? [];
    if (prefersReducedMotion() || !("IntersectionObserver" in window)) {
      items.forEach((item) => item.setAttribute("data-in", ""));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute("data-in", "");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    items.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, [root]);
}

/** The page's sections, in order: the header's links and the journey rail follow them. */
const SECTIONS = ["lp-hero", "lp-worlds", "lp-preview", "lp-how", "lp-start"] as const;
type SectionId = (typeof SECTIONS)[number];

type HeaderProps = {
  t: Text;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  current?: SectionId;
};

/**
 * The header: over the hero it is clear, on the night sky; past the hero it turns solid in the
 * page's mode, and the logo follows (the design's is-solid header). The language switch shows "ع"
 * or "EN" on narrow screens and the full name from 640px.
 */
function Header({ t, theme, onThemeChange, current }: HeaderProps) {
  const { dict, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [pastHero, setPastHero] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const header = useRef<HTMLElement>(null);
  const other = LOCALES.find((candidate) => candidate !== locale) ?? locale;
  const solid = pastHero || open;
  const dark = theme === "dark" || !solid;
  const logo = dark
    ? { src: locale === "ar" ? logoArDarkUrl : logoEnDarkUrl }
    : { src: locale === "ar" ? logoArLightUrl : logoEnLightUrl };

  useEffect(() => {
    const update = () => {
      const hero = document.getElementById("lp-hero");
      const height = header.current?.offsetHeight ?? 0;
      setPastHero(hero ? window.scrollY > hero.offsetHeight - height : false);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      menuButton.current?.focus();
    };
    // The menu belongs to narrow screens: it closes when the full navigation shows.
    const wide = matchMedia("(min-width: 1100px)");
    const onWide = (event: MediaQueryListEvent) => event.matches && setOpen(false);
    window.addEventListener("keydown", onKey);
    wide.addEventListener("change", onWide);
    return () => {
      window.removeEventListener("keydown", onKey);
      wide.removeEventListener("change", onWide);
    };
  }, [open]);

  const navLink = (id: SectionId, label: string) => (
    <a
      href={`#${id}`}
      aria-current={current === id ? "true" : "false"}
      onClick={() => setOpen(false)}
    >
      {label}
    </a>
  );

  return (
    <header
      ref={header}
      className={solid ? "lp-header lp-is-solid" : "lp-header"}
      data-theme={dark ? "dark" : undefined}
    >
      <div className="lp-wrap lp-header-in">
        {/* Home: on this page it goes back to the top. */}
        <Link className="lp-logo" to={`/${locale}`} onClick={scrollToTop}>
          <img
            src={logo.src}
            width={locale === "ar" ? 833 : 1001}
            height={192}
            alt={dict.meta.title}
          />
        </Link>
        <nav className="lp-nav" aria-label={t.navLabel}>
          <ul>
            <li>{navLink("lp-worlds", t.nav.worlds)}</li>
            <li>{navLink("lp-preview", t.nav.preview)}</li>
            <li>{navLink("lp-how", t.nav.how)}</li>
          </ul>
        </nav>
        <div className="lp-actions">
          {/* The same page in the other language, at the same place on the page. */}
          <Link
            className="lp-icon-btn lp-lang"
            to={`/${other}`}
            lang={other}
            hrefLang={other}
            aria-label={t.langAria}
            preventScrollReset
            onClick={() => rememberLocale(other)}
          >
            <span className="lp-lang-short" aria-hidden="true">
              {t.langShort}
            </span>
            <span className="lp-lang-long" aria-hidden="true">
              {LOCALE_NAMES[other]}
            </span>
          </Link>
          <button
            type="button"
            className="lp-icon-btn"
            aria-pressed={theme === "dark"}
            aria-label={t.themeAria}
            onClick={() => onThemeChange(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>
          <Link className="lp-btn lp-btn-fun lp-header-cta" to={`/${locale}/sign-up`}>
            {t.start}
          </Link>
          <button
            ref={menuButton}
            type="button"
            className="lp-icon-btn lp-menu-btn"
            aria-expanded={open}
            aria-controls="lp-mobile-nav"
            aria-label={t.menu}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>
      <nav
        id="lp-mobile-nav"
        className={open ? "lp-mobile-nav lp-open" : "lp-mobile-nav"}
        aria-label={t.navLabel}
      >
        <a href="#lp-worlds" onClick={() => setOpen(false)}>
          {t.nav.worlds}
        </a>
        <a href="#lp-preview" onClick={() => setOpen(false)}>
          {t.nav.preview}
        </a>
        <a href="#lp-how" onClick={() => setOpen(false)}>
          {t.nav.how}
        </a>
        <Link className="lp-btn lp-btn-fun" to={`/${locale}/sign-up`}>
          {t.start}
        </Link>
      </nav>
    </header>
  );
}

/**
 * How far down the page the visitor is (0 to 1), as --lp-progress on the page, for the progress
 * bar and the rail; the direction of the last scroll; and the section in the middle of the screen.
 * Written straight to the style, so scrolling never re-renders the page.
 */
function useScrollState(root: RefObject<HTMLElement | null>) {
  const [current, setCurrent] = useState<SectionId>();
  const [goingUp, setGoingUp] = useState(false);
  const [scrolling, setScrolling] = useState(false);

  useEffect(() => {
    let frame = 0;
    let lastY = window.scrollY;
    let rest = 0;
    const onFrame = () => {
      frame = 0;
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const progress = Math.min(1, Math.max(0, window.scrollY / max));
      root.current?.style.setProperty("--lp-progress", progress.toFixed(4));
      if (Math.abs(window.scrollY - lastY) > 2) {
        setGoingUp(window.scrollY < lastY);
        lastY = window.scrollY;
      }
      setScrolling(true);
      window.clearTimeout(rest);
      rest = window.setTimeout(() => setScrolling(false), 180);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(onFrame);
    };
    onFrame();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(rest);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [root]);

  // The section crossing the middle of the screen is the current one.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setCurrent(entry.target.id as SectionId);
        }
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    for (const id of SECTIONS) {
      const section = document.getElementById(id);
      if (section) observer.observe(section);
    }
    return () => observer.disconnect();
  }, []);

  return { current, goingUp, scrolling };
}

/**
 * The journey rail (from 1240px wide): a glass line with a dot per section and a rocket that
 * travels down the page with the visitor. Each dot sits where its section reaches the top.
 */
function Rail({
  t,
  current,
  goingUp,
  scrolling,
}: {
  t: Text;
  current?: SectionId;
  goingUp: boolean;
  scrolling: boolean;
}) {
  const rail = useRef<HTMLElement>(null);
  const [positions, setPositions] = useState<number[]>([]);
  const labels: Record<SectionId, string> = {
    "lp-hero": t.rail.hero,
    "lp-worlds": t.nav.worlds,
    "lp-preview": t.nav.preview,
    "lp-how": t.nav.how,
    "lp-start": t.start,
  };

  useEffect(() => {
    const layout = () => {
      const element = rail.current;
      if (!element || window.innerWidth < 1240) return;
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const header = document.querySelector<HTMLElement>(".lp-header")?.offsetHeight ?? 0;
      const height = element.clientHeight;
      const pixels = SECTIONS.map((id) => {
        const section = document.getElementById(id);
        const top = section ? section.getBoundingClientRect().top + window.scrollY - header : 0;
        return Math.min(1, Math.max(0, top / max)) * height;
      });
      // Keep the dots at least one touch target apart.
      if (height >= (pixels.length - 1) * 44) {
        for (let i = 1; i < pixels.length; i++)
          pixels[i] = Math.max(pixels[i]!, pixels[i - 1]! + 44);
        pixels[pixels.length - 1] = Math.min(height, pixels[pixels.length - 1]!);
        for (let i = pixels.length - 2; i >= 0; i--)
          pixels[i] = Math.min(pixels[i]!, pixels[i + 1]! - 44);
      }
      setPositions(pixels.map((pixel) => pixel / height));
    };
    layout();
    const observer = new ResizeObserver(layout);
    observer.observe(document.body);
    return () => observer.disconnect();
  }, []);

  const classes = ["lp-rail", goingUp ? "lp-up" : "", scrolling ? "lp-is-scrolling" : ""];

  return (
    <nav ref={rail} className={classes.join(" ")} aria-label={t.rail.label}>
      <div className="lp-rail-line" aria-hidden="true" />
      <div className="lp-rail-track" aria-hidden="true">
        <span className="lp-rail-trail" />
        <span className="lp-rail-vehicle">
          <Rocket />
        </span>
      </div>
      <ol>
        {SECTIONS.map((id, index) => (
          <li key={id} style={{ "--pos": positions[index] ?? 0 } as CSSProperties}>
            <a href={`#${id}`} aria-current={current === id ? "true" : "false"}>
              <span className="lp-rail-tip">{labels[id]}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function Hero({ t }: { t: Text }) {
  const { locale } = useI18n();
  const names = { asia: t.characters.asia, sham: t.characters.sham };
  return (
    <section
      id="lp-hero"
      className="lp-night lp-hero"
      data-theme="dark"
      aria-labelledby="lp-hero-title"
    >
      <NightSky />
      <div className="lp-wrap">
        <div className="lp-hero-grid">
          <div className="lp-hero-copy">
            <h1 id="lp-hero-title">
              {t.hero.titleStart}
              <em>{t.hero.titleEm}</em>
              {t.hero.titleEnd}
            </h1>
            <p className="lp-hero-sub">{t.hero.sub}</p>
            <div className="lp-hero-ctas">
              <Link className="lp-btn lp-btn-fun" to={`/${locale}/sign-up`}>
                {t.start}
                <ArrowIcon className="lp-icon lp-flip" />
              </Link>
              <a className="lp-btn lp-btn-secondary" href="#lp-how">
                {t.hero.seeHow}
              </a>
            </div>
          </div>
          <div className="lp-stage">
            <div className="lp-glow" aria-hidden="true" />
            <div className="lp-moon" aria-hidden="true">
              <img src={moonUrl} width={1249} height={1254} alt="" />
            </div>
            <figure className="lp-char lp-asia">
              <div className="lp-bob">
                <img
                  src={asiaHeroUrl}
                  width={289}
                  height={860}
                  fetchPriority="high"
                  alt={fill(t.hero.altAsia, names)}
                />
              </div>
            </figure>
            <figure className="lp-char lp-sham">
              <div className="lp-bob">
                <img
                  src={shamHeroUrl}
                  width={392}
                  height={1175}
                  fetchPriority="high"
                  alt={fill(t.hero.altSham, names)}
                />
              </div>
            </figure>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * The five learning worlds: a swipeable row with buttons, dots, arrow keys and mouse drag. As in
 * the design, once the row is on screen it moves on by itself every 2 seconds and lifts the world
 * it reaches; hovering, focus, a drag, a hidden tab or reduced motion pause it, and "Next" stops it
 * until the page is opened again. Screen readers hear the world only when the visitor moves it.
 */
const AUTO_MS = 2000;
const SCROLL_MS = 600;
const WRAP_SCROLL_MS = 750;
const PULSE_MS = 500;
const AUTO_START_RATIO = 0.35;

function Worlds({ t }: { t: Text }) {
  const { locale } = useI18n();
  const trackRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const [lifted, setLifted] = useState<number>();
  const activeRef = useRef(0);
  const total = WORLDS.length;
  const nameOf = (index: number) => t.worlds[WORLDS[index]!.id].name;
  const values = (index: number) => ({
    n: formatTemplate(locale, "{n}", { n: index + 1 }),
    t: formatTemplate(locale, "{n}", { n: total }),
    name: nameOf(index),
  });

  // The slide's offset from the middle of the row.
  const offsetOf = (index: number) => {
    const track = trackRef.current;
    const slide = track?.children[index] as HTMLElement | undefined;
    if (!track || !slide) return 0;
    const row = track.getBoundingClientRect();
    const box = slide.getBoundingClientRect();
    return box.left + box.width / 2 - (row.left + row.width / 2);
  };

  const choose = useCallback((index: number) => {
    activeRef.current = index;
    setActive(index);
  }, []);

  /** A move the visitor asked for: scroll there and say which world it is. */
  const goTo = (index: number) => {
    const next = Math.max(0, Math.min(total - 1, index));
    trackRef.current?.scrollBy({
      left: offsetOf(next),
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
    choose(next);
    setAnnouncement(fill(t.worlds.status, values(next)));
  };

  // The active world is the one nearest the middle of the row, in both directions.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const row = track.getBoundingClientRect();
        const centre = row.left + row.width / 2;
        let nearest = 0;
        let distance = Infinity;
        Array.from(track.children).forEach((child, index) => {
          const rect = child.getBoundingClientRect();
          const gap = Math.abs(rect.left + rect.width / 2 - centre);
          if (gap < distance) {
            distance = gap;
            nearest = index;
          }
        });
        choose(nearest);
      });
    };
    track.addEventListener("scroll", update, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      track.removeEventListener("scroll", update);
    };
  }, [choose]);

  // The automatic tour of the worlds.
  const stopped = useRef(false);
  useEffect(() => {
    const track = trackRef.current;
    const slider = sliderRef.current;
    if (!track || !slider) return;
    let visible = false;
    let hovered = false;
    let focused = false;
    let pressed = false;
    let timer = 0;
    let pulse = 0;
    let pulseEnd = 0;
    let animation = 0;

    const canMove = () =>
      visible &&
      !stopped.current &&
      !hovered &&
      !focused &&
      !pressed &&
      !document.hidden &&
      !prefersReducedMotion();

    const stop = () => {
      window.clearTimeout(timer);
      window.clearTimeout(pulse);
      window.clearTimeout(pulseEnd);
      cancelAnimationFrame(animation);
      track.removeAttribute("data-auto");
      setLifted(undefined);
    };

    const lift = (index: number) => {
      setLifted(index);
      pulseEnd = window.setTimeout(() => setLifted(undefined), PULSE_MS + 20);
    };

    // A move with a set duration (the browser's smooth scroll has none).
    const slide = (index: number, ms: number) => {
      const from = track.scrollLeft;
      const delta = offsetOf(index);
      choose(index);
      if (Math.abs(delta) < 1) return;
      track.setAttribute("data-auto", "");
      const startTime = performance.now();
      const step = (now: number) => {
        const p = Math.min(1, (now - startTime) / ms);
        track.scrollLeft = from + delta * (1 - Math.pow(1 - p, 3));
        if (p < 1) animation = requestAnimationFrame(step);
        else track.removeAttribute("data-auto");
      };
      animation = requestAnimationFrame(step);
    };

    const advance = () => {
      if (!canMove()) return;
      const next = (activeRef.current + 1) % total;
      const ms = next === 0 ? WRAP_SCROLL_MS : SCROLL_MS;
      slide(next, ms);
      pulse = window.setTimeout(() => canMove() && lift(next), ms - 40);
      timer = window.setTimeout(advance, AUTO_MS);
    };

    // On reaching the row the first move starts at once; after a pause, lift now and move in 2s.
    const schedule = (now = false) => {
      stop();
      if (!canMove()) return;
      if (now) return advance();
      lift(activeRef.current);
      timer = window.setTimeout(advance, AUTO_MS);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        const seen = !!entry && entry.isIntersecting && entry.intersectionRatio >= AUTO_START_RATIO;
        if (seen !== visible) {
          visible = seen;
          schedule(seen);
        }
      },
      { threshold: [0, AUTO_START_RATIO] },
    );
    observer.observe(slider);

    const onEnter = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      hovered = true;
      stop();
    };
    const onLeave = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      hovered = false;
      schedule();
    };
    const onFocusIn = () => {
      focused = true;
      stop();
    };
    const onFocusOut = (event: FocusEvent) => {
      if (slider.contains(event.relatedTarget as Node | null)) return;
      focused = false;
      schedule();
    };
    const onDown = () => {
      pressed = true;
      stop();
    };
    const onUp = () => {
      if (!pressed) return;
      pressed = false;
      schedule();
    };
    const onVisibility = () => schedule();

    slider.addEventListener("pointerenter", onEnter);
    slider.addEventListener("pointerleave", onLeave);
    slider.addEventListener("focusin", onFocusIn);
    slider.addEventListener("focusout", onFocusOut);
    slider.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      observer.disconnect();
      slider.removeEventListener("pointerenter", onEnter);
      slider.removeEventListener("pointerleave", onLeave);
      slider.removeEventListener("focusin", onFocusIn);
      slider.removeEventListener("focusout", onFocusOut);
      slider.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [choose, total]);

  // Mouse drag (touch and trackpads scroll natively).
  const drag = useRef<{ x: number; left: number; moved: boolean }>(undefined);
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const onDown = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      drag.current = { x: event.clientX, left: track.scrollLeft, moved: false };
    };
    const onMove = (event: PointerEvent) => {
      const current = drag.current;
      if (!current) return;
      const dx = event.clientX - current.x;
      if (!current.moved && Math.abs(dx) > 5) {
        current.moved = true;
        track.setPointerCapture(event.pointerId);
        track.setAttribute("data-dragging", "");
      }
      if (current.moved) track.scrollLeft = current.left - dx;
    };
    const onUp = () => {
      const current = drag.current;
      drag.current = undefined;
      if (!current?.moved) return;
      track.removeAttribute("data-dragging");
      // Settle on the nearest world.
      track.scrollBy({ left: offsetOf(activeRef.current), behavior: "smooth" });
    };
    track.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    track.addEventListener("pointercancel", onUp);
    return () => {
      track.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      track.removeEventListener("pointercancel", onUp);
    };
  }, []);

  // Arrow keys move in the reading direction; Home and End go to the ends.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const rtl = document.documentElement.dir === "rtl";
    const forward = rtl ? "ArrowLeft" : "ArrowRight";
    const back = rtl ? "ArrowRight" : "ArrowLeft";
    let next: number | undefined;
    if (event.key === forward) next = active + 1;
    else if (event.key === back) next = active - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = total - 1;
    if (next === undefined) return;
    event.preventDefault();
    goTo(next);
  };

  return (
    <section
      id="lp-worlds"
      className="lp-sec lp-worlds"
      aria-labelledby="lp-worlds-title"
      style={{ "--world-c": WORLDS[active]!.colour } as CSSProperties}
    >
      <div className="lp-wrap">
        <div className="lp-head">
          <h2 id="lp-worlds-title" className="lp-worlds-title lp-reveal">
            {t.worlds.titleStart}
            <span>
              {t.worlds.titleLine}
              <em>{t.worlds.titleEm}</em>
            </span>
          </h2>
        </div>
      </div>
      <div
        ref={sliderRef}
        className="lp-slider lp-reveal"
        role="region"
        aria-roledescription={t.worlds.role}
        aria-label={t.worlds.label}
        style={{ "--c": WORLDS[active]!.colour } as CSSProperties}
      >
        {/* A scrolling row must be reachable by keyboard (WCAG 2.1.1): it takes focus and the
            arrow keys move it, as in the design. The linter only expects that of widget roles. */}
        {/* eslint-disable jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-static-element-interactions */}
        <div
          ref={trackRef}
          className="lp-track"
          tabIndex={0}
          aria-label={t.worlds.keys}
          onKeyDown={onKeyDown}
        >
          {WORLDS.map((world, index) => {
            const copy = t.worlds[world.id];
            return (
              <article
                key={world.id}
                className="lp-slide"
                role="group"
                aria-roledescription={t.worlds.roleSlide}
                aria-label={fill(t.worlds.slide, values(index))}
                data-active={index === active ? "" : undefined}
                data-lifted={index === lifted ? "" : undefined}
                style={{ "--c": world.colour } as CSSProperties}
              >
                {/* The planet drifts a little as the page scrolls (the design's parallax). */}
                <div className="lp-planet lp-px">
                  <img
                    src={world.image}
                    width={640}
                    height={395}
                    alt=""
                    draggable={false}
                    loading="lazy"
                  />
                </div>
                <div>
                  <span className="lp-kicker">{copy.subject}</span>
                  <h3>{copy.name}</h3>
                  <p>{copy.desc}</p>
                  <ul className="lp-ticks">
                    {[copy.b1, copy.b2, copy.b3].map((line) => (
                      <li key={line}>
                        <CheckIcon />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            );
          })}
        </div>
        {/* eslint-enable jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-static-element-interactions */}
        <div className="lp-slider-ctrl">
          <button
            type="button"
            className="lp-icon-btn"
            aria-label={t.worlds.prev}
            disabled={active === 0}
            onClick={() => goTo(active - 1)}
          >
            <PrevIcon className="lp-icon lp-flip" />
          </button>
          <div className="lp-dots">
            {WORLDS.map((world, index) => (
              <button
                key={world.id}
                type="button"
                className="lp-dot"
                aria-label={fill(t.worlds.goto, values(index))}
                aria-current={index === active ? "true" : undefined}
                onClick={() => goTo(index)}
              />
            ))}
          </div>
          <button
            type="button"
            className="lp-icon-btn"
            aria-label={t.worlds.next}
            disabled={active === total - 1}
            onClick={() => {
              stopped.current = true;
              goTo(active + 1);
            }}
          >
            <NextIcon className="lp-icon lp-flip" />
          </button>
        </div>
        <p className="lp-slider-count" aria-hidden="true">
          {fill(t.worlds.status, values(active))}
        </p>
        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>
      </div>
    </section>
  );
}

/** What the child sees, by age band: three app screens drawn as pictures, and what changes. */
function Preview({ t }: { t: Text }) {
  const { locale } = useI18n();
  const [band, setBand] = useState<BandId>("explorer");
  const tabsRef = useRef<HTMLDivElement>(null);
  const number = (text: string, values: Record<string, number>) =>
    formatTemplate(locale, text, values);
  const current = BANDS.find((item) => item.id === band)!;
  const copy = t.preview[band];

  // Arrow keys move between the tabs (mirrored in Arabic); Home and End go to the ends.
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
    const index = BANDS.findIndex((item) => item.id === band);
    const step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 } as Record<string, number>;
    let next = index;
    if (event.key in step) next = (index + step[event.key]! + BANDS.length) % BANDS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = BANDS.length - 1;
    else return;
    event.preventDefault();
    setBand(BANDS[next]!.id);
    tabsRef.current?.querySelectorAll<HTMLButtonElement>("[role=tab]")[next]?.focus();
  }

  return (
    <section
      id="lp-preview"
      className="lp-sec lp-night"
      data-theme="dark"
      aria-labelledby="lp-preview-title"
    >
      <NightSky />
      <div className="lp-wrap">
        <div className="lp-head">
          <h2 id="lp-preview-title" className="lp-reveal">
            {t.preview.title}
          </h2>
          <p className="lp-reveal" style={{ "--i": 1 } as CSSProperties}>
            {t.preview.sub}
          </p>
        </div>
        <div ref={tabsRef} className="lp-tabs" role="tablist" aria-label={t.preview.agesLabel}>
          {BANDS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`lp-tab-${item.id}`}
              className="lp-tab"
              aria-selected={item.id === band}
              aria-controls="lp-band"
              tabIndex={item.id === band ? 0 : -1}
              onClick={() => setBand(item.id)}
              onKeyDown={onKeyDown}
            >
              <b>{t.preview[item.id].name}</b>
              <small>
                {fill(t.preview.range, { range: ageRange(locale, t, item.min, item.max) })}
              </small>
            </button>
          ))}
        </div>
        <div
          id="lp-band"
          className="lp-preview-grid"
          role="tabpanel"
          aria-labelledby={`lp-tab-${band}`}
        >
          <figure>
            <div className="lp-tablet">
              <div
                className="lp-screen"
                role="img"
                aria-label={fill(copy.aria, {
                  range: ageRange(locale, t, current.min, current.max),
                })}
              >
                <NightSky />
                {band === "explorer" && <ExplorerScreen t={t} number={number} />}
                {band === "navigator" && <NavigatorScreen t={t} number={number} />}
                {band === "captain" && <CaptainScreen t={t} number={number} />}
              </div>
            </div>
            <figcaption className="lp-caption">
              <EyeIcon />
              <span>{t.preview.caption}</span>
            </figcaption>
          </figure>
          <div key={band} className="lp-band-panel">
            <span className="lp-band-age">
              {fill(t.preview.range, { range: ageRange(locale, t, current.min, current.max) })}
            </span>
            <h3>{copy.name}</h3>
            <p>{copy.text}</p>
            <span className="lp-band-label">{t.preview.changes}</span>
            <ul className="lp-ticks">
              {[copy.b1, copy.b2, copy.b3].map((line) => (
                <li key={line}>
                  <CheckIcon />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

type ScreenProps = { t: Text; number: (text: string, values: Record<string, number>) => string };

function ExplorerScreen({ t, number }: ScreenProps) {
  return (
    <div className="lp-band" aria-hidden="true">
      <div className="lp-m-top">
        <span className="lp-pill">
          <span className="lp-avatar">
            <img src={asiaSmallUrl} alt="" width={144} height={430} loading="lazy" />
          </span>
          <span>
            {t.characters.asia}
            <small>{number(t.mock.level, { n: 4 })}</small>
          </span>
        </span>
        <span className="lp-pill lp-m-end">
          <Glint />
          {number("{n}", { n: 120 })}
        </span>
      </div>
      <div className="lp-orbit" />
      {[
        {
          world: "arabic",
          image: planetYellowUrl,
          x: "5%",
          y: "20%",
          w: "22%",
          xm: "3%",
          ym: "15%",
          wm: "38%",
        },
        {
          world: "quran",
          image: planetPurpleUrl,
          x: "41%",
          y: "62%",
          w: "18%",
          xm: "36%",
          ym: "58%",
          wm: "20%",
        },
        {
          world: "akhlaq",
          image: planetAkhlaqUrl,
          x: "72%",
          y: "17%",
          w: "23%",
          xm: "61%",
          ym: "29.8%",
          wm: "28%",
        },
      ].map((planet) => (
        <span
          key={planet.world}
          className={planet.world === "quran" ? "lp-k-planet lp-k-front" : "lp-k-planet"}
          style={
            {
              "--x": planet.x,
              "--y": planet.y,
              "--w": planet.w,
              "--xm": planet.xm,
              "--ym": planet.ym,
              "--wm": planet.wm,
            } as CSSProperties
          }
        >
          <img src={planet.image} alt="" loading="lazy" width={640} height={397} />
          <span className="lp-k-label">
            {t.worlds[planet.world as "arabic" | "quran" | "akhlaq"].name}
          </span>
        </span>
      ))}
      <span
        className="lp-k-planet lp-k-locked"
        style={
          {
            "--x": "74%",
            "--y": "54%",
            "--w": "18%",
            "--xm": "60%",
            "--ym": "60%",
            "--wm": "30%",
          } as CSSProperties
        }
      >
        <img src={planetFutureUrl} alt="" loading="lazy" width={640} height={395} />
        <span className="lp-k-label">
          <LockIcon />
          {t.mock.locked}
        </span>
      </span>
      <div className="lp-goal">
        <Pet />
        <span>{t.mock.pet}</span>
        <span className="lp-goal-track">
          <i />
        </span>
        <span>{number(t.mock.meals, { a: 3, b: 4 })}</span>
      </div>
    </div>
  );
}

function NavigatorScreen({ t, number }: ScreenProps) {
  const teams = [
    { name: t.mock.team1, points: 980 },
    { name: t.mock.team2, points: 860, me: true },
    { name: t.mock.team3, points: 720 },
  ];
  return (
    <div className="lp-band" aria-hidden="true">
      <div className="lp-m-top">
        <span className="lp-pill">
          <span className="lp-avatar">
            <img src={shamSmallUrl} alt="" width={217} height={650} loading="lazy" />
          </span>
          <span>
            {t.characters.sham}
            <small>{number(t.mock.level, { n: 9 })}</small>
          </span>
        </span>
        <span className="lp-pill lp-streak lp-m-end">
          <FlameIcon />
          {number(t.mock.streak, { n: 5 })}
        </span>
        <span className="lp-pill">
          <Glint />
          {number("{n}", { n: 860 })}
        </span>
      </div>
      <div className="lp-nav-body">
        <div className="lp-m-card">
          <h4>{t.mock.map}</h4>
          <Constellation />
        </div>
        <div className="lp-m-card">
          <h4>{t.mock.league}</h4>
          <ol className="lp-league">
            {teams.map((team, index) => (
              <li key={team.name} className={team.me ? "lp-me" : undefined}>
                <span>{number("{n}", { n: index + 1 })}</span>
                <span>{team.name}</span>
                <span className="lp-pts">{number("{n}", { n: team.points })}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

function CaptainScreen({ t, number }: ScreenProps) {
  const subjects = [
    { name: t.worlds.arabic.subject, value: 82 },
    { name: t.worlds.quran.subject, value: 64 },
    { name: t.worlds.future.subject, value: 71 },
  ];
  return (
    <div className="lp-band" aria-hidden="true">
      <div className="lp-m-top">
        <span className="lp-pill">{t.mock.goals}</span>
        <span className="lp-pill lp-m-end">{t.mock.week}</span>
      </div>
      <div className="lp-cap-body">
        <div className="lp-m-card lp-cap-ring">
          <svg viewBox="0 0 36 36" aria-hidden="true" focusable="false">
            <circle cx="18" cy="18" r="15" fill="none" stroke="#2A1F5C" strokeWidth="4" />
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              stroke="#3DDC97"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray="64 94.2"
            />
          </svg>
          <div>
            <b>{number(t.mock.hours, { a: 4, b: 6 })}</b>
            <small>{t.mock.focus}</small>
          </div>
        </div>
        <div className="lp-m-card">
          <span className="lp-cap-sub">{number(t.mock.trend, { n: 7 })}</span>
          <div className="lp-chart">
            {[40, 58, 46, 72, 64, 90, 78].map((height, index) => (
              <span
                key={index}
                className={index === 5 ? "lp-hi" : undefined}
                style={{ "--h": `${height}%` } as CSSProperties}
              />
            ))}
          </div>
        </div>
        <div className="lp-m-card lp-cap-mastery">
          <h4>{t.mock.mastery}</h4>
          <ul className="lp-mastery">
            {subjects.map((subject) => (
              <li key={subject.name}>
                <div className="lp-row">
                  <span>{subject.name}</span>
                  <span>{number("{n}%", { n: subject.value })}</span>
                </div>
                <div className="lp-bar">
                  <i style={{ "--v": `${subject.value}%` } as CSSProperties} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function HowItWorks({ t }: { t: Text }) {
  const { locale } = useI18n();
  const steps = [
    [t.how.s1, t.how.s1t],
    [t.how.s2, t.how.s2t],
    [t.how.s3, t.how.s3t],
    [t.how.s4, t.how.s4t],
  ] as const;
  return (
    <section id="lp-how" className="lp-sec" aria-labelledby="lp-how-title">
      <div className="lp-wrap">
        <div className="lp-head">
          <span className="lp-eyebrow lp-reveal">
            <Glint />
            {t.how.eyebrow}
          </span>
          <h2 id="lp-how-title" className="lp-reveal" style={{ "--i": 1 } as CSSProperties}>
            {t.how.title}
          </h2>
        </div>
        <ol className="lp-steps" aria-label={t.how.title}>
          {steps.map(([title, text], index) => (
            <li key={title} className="lp-step lp-reveal" style={{ "--i": index } as CSSProperties}>
              <span className="lp-step-num" aria-hidden="true">
                {formatTemplate(locale, "{n}", { n: index + 1 })}
              </span>
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>
        <div className="lp-pet-card lp-reveal">
          <div className="lp-pet-visual" role="img" aria-label={t.petAlt}>
            <span className="lp-pet-orbit" />
            <Pet className="lp-pet-svg" />
          </div>
          <div className="lp-pet-copy">
            <span className="lp-eyebrow">
              <HeartIcon />
              {t.pet.eyebrow}
            </span>
            <h3>{t.pet.title}</h3>
            <p>{t.pet.text}</p>
            <div
              className="lp-pet-meter"
              role="img"
              aria-label={formatTemplate(locale, t.pet.meterAria, { a: 2, b: 3 })}
            >
              <span className="lp-meal">
                <i />
              </span>
              <span className="lp-meal">
                <i />
              </span>
              <span className="lp-meal lp-meal-next" />
              <b>{formatTemplate(locale, t.pet.meter, { a: 2, b: 3 })}</b>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FinalCall({ t }: { t: Text }) {
  const { locale } = useI18n();
  return (
    <section id="lp-start" className="lp-sec lp-final" aria-labelledby="lp-final-title">
      <div className="lp-wrap">
        <div className="lp-final-copy">
          <h2 id="lp-final-title" className="lp-reveal">
            {t.final.title}
          </h2>
          <p className="lp-reveal" style={{ "--i": 1 } as CSSProperties}>
            {t.final.sub}
          </p>
          <Link
            className="lp-btn lp-btn-fun lp-reveal"
            style={{ "--i": 2 } as CSSProperties}
            to={`/${locale}/sign-up`}
          >
            {t.signup}
            <ArrowIcon className="lp-icon lp-flip" />
          </Link>
        </div>
        <div className="lp-final-stage lp-reveal" aria-hidden="true">
          <figure className="lp-char lp-sham">
            <div className="lp-bob">
              <img src={shamHeroUrl} width={392} height={1175} alt="" loading="lazy" />
            </div>
          </figure>
        </div>
      </div>
    </section>
  );
}

function Footer({ t, theme }: { t: Text; theme: Theme }) {
  const { dict, locale } = useI18n();
  const dark = theme === "dark";
  return (
    <footer className="lp-footer">
      <div className="lp-wrap">
        <div className="lp-foot-grid">
          <div className="lp-foot-brand">
            <Link className="lp-logo" to={`/${locale}`} onClick={scrollToTop}>
              <img
                src={
                  locale === "ar"
                    ? dark
                      ? logoArDarkUrl
                      : logoArLightUrl
                    : dark
                      ? logoEnDarkUrl
                      : logoEnLightUrl
                }
                width={locale === "ar" ? 833 : 1001}
                height={192}
                alt={dict.meta.title}
                loading="lazy"
              />
            </Link>
            <p>{fill(t.footer.tag, { range: ageRange(locale, t, AGES.min, AGES.max) })}</p>
          </div>
          <nav aria-label={t.footer.explore}>
            <h3>{t.footer.explore}</h3>
            <ul>
              <li>
                <a href="#lp-worlds">{t.nav.worlds}</a>
              </li>
              <li>
                <a href="#lp-preview">{t.nav.preview}</a>
              </li>
              <li>
                <a href="#lp-how">{t.nav.how}</a>
              </li>
            </ul>
          </nav>
        </div>
        <div className="lp-safety">
          <p>
            <ShieldIcon />
            <span>{t.footer.note}</span>
          </p>
          <p>{fill(t.footer.copy, { year: String(new Date().getFullYear()) })}</p>
        </div>
      </div>
    </footer>
  );
}

export function Component() {
  const { dict, locale } = useI18n();
  const t = dict.landing;
  const rootRef = useRef<HTMLDivElement>(null);
  const [theme, setTheme] = useTheme();
  const { current, goingUp, scrolling } = useScrollState(rootRef);
  useReveal(rootRef);
  const range = ageRange(locale, t, AGES.min, AGES.max);

  return (
    // The whole page follows the mode; the night sections stay dark in both.
    <div ref={rootRef} className="landing" data-theme={theme === "dark" ? "dark" : undefined}>
      <title>{fill(t.metaTitle, { brand: dict.meta.title, range })}</title>
      <meta name="description" content={fill(t.metaDesc, { range })} />
      <div className="lp-top-progress" aria-hidden="true">
        <span />
      </div>
      <a className="lp-skip" href="#lp-main">
        {t.skip}
      </a>
      <Header t={t} theme={theme} onThemeChange={setTheme} current={current} />
      <Rail t={t} current={current} goingUp={goingUp} scrolling={scrolling} />
      <main id="lp-main">
        <Hero t={t} />
        <Worlds t={t} />
        <Preview t={t} />
        <HowItWorks t={t} />
        <FinalCall t={t} />
      </main>
      <Footer t={t} theme={theme} />
    </div>
  );
}
