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
import { PageTitle } from "@/components/page-title";
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
  GlobeIcon,
  HeartIcon,
  LockIcon,
  MenuIcon,
  NextIcon,
  Pet,
  PrevIcon,
  ShieldIcon,
} from "@/features/landing/landing-art";
import { LOCALES, LOCALE_NAMES } from "@/i18n/config";
import { formatTemplate } from "@/i18n/format";
import { rememberLocale } from "@/i18n/preferred-locale";
import { type Dictionary, useI18n } from "@/i18n/locale-data";

// G01, the public landing page, from the designer's file "landing page" (24/11). Not built from
// it, on purpose: the Basmala in the Quran world (no Quran text in this app's screens), the
// families' quotes (placeholders, not real), and footer links whose pages do not exist yet.

type Text = Dictionary["landing"];

/** The ages the platform serves, and each band's range. */
const AGE_RANGE = "6–14";
const BANDS = [
  { id: "explorer", range: "6–8" },
  { id: "navigator", range: "9–11" },
  { id: "captain", range: "12–14" },
] as const;
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

/** Keeps an age range ("6–8") left to right inside Arabic text, so it never reads "8–6". */
const ltr = (text: string) => `\u2066${text}\u2069`;

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

function Header({ t }: { t: Text }) {
  const { locale } = useI18n();
  const [open, setOpen] = useState(false);
  const other = LOCALES.find((candidate) => candidate !== locale) ?? locale;
  const logo = locale === "ar" ? logoArDarkUrl : logoEnDarkUrl;

  useEffect(() => {
    if (!open) return;
    const close = (event: globalThis.KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  const links = (
    <>
      <a href="#lp-worlds" onClick={() => setOpen(false)}>
        {t.nav.worlds}
      </a>
      <a href="#lp-preview" onClick={() => setOpen(false)}>
        {t.nav.preview}
      </a>
      <a href="#lp-how" onClick={() => setOpen(false)}>
        {t.nav.how}
      </a>
    </>
  );

  return (
    <header className="lp-header" data-theme="dark">
      <div className="lp-wrap lp-header-in">
        {/* Home: on this page it goes back to the top. */}
        <Link className="lp-logo" to={`/${locale}`} onClick={scrollToTop}>
          <img src={logo} width={locale === "ar" ? 833 : 1001} height={192} alt="Tibyan Kids" />
        </Link>
        <nav className="lp-nav" aria-label={t.navLabel}>
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
        <div className="lp-actions">
          {/* The same page in the other language, at the same place on the page. */}
          <Link
            className="lp-icon-btn lp-lang"
            to={`/${other}`}
            lang={other}
            hrefLang={other}
            preventScrollReset
            onClick={() => rememberLocale(other)}
          >
            <GlobeIcon />
            {LOCALE_NAMES[other]}
          </Link>
          <Link className="lp-btn lp-btn-fun lp-header-cta" to={`/${locale}/sign-up`}>
            {t.start}
          </Link>
          <button
            type="button"
            className="lp-icon-btn lp-menu-btn"
            aria-expanded={open}
            aria-controls="lp-mobile-nav"
            aria-label={t.menu}
            onClick={() => setOpen((current) => !current)}
          >
            {open ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>
      <nav id="lp-mobile-nav" className="lp-mobile-nav" aria-label={t.navLabel} hidden={!open}>
        {links}
        <Link className="lp-btn lp-btn-fun" to={`/${locale}/sign-up`}>
          {t.start}
        </Link>
      </nav>
    </header>
  );
}

function Hero({ t }: { t: Text }) {
  const { locale } = useI18n();
  const names = { asia: t.characters.asia, sham: t.characters.sham };
  return (
    <section className="lp-night lp-hero" data-theme="dark" aria-labelledby="lp-hero-title">
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

/** The five learning worlds: a swipeable row with buttons, dots and arrow keys. */
function Worlds({ t }: { t: Text }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const total = WORLDS.length;
  const nameOf = (index: number) => t.worlds[WORLDS[index]!.id].name;

  const goTo = useCallback((index: number) => {
    const slide = trackRef.current?.children[index] as HTMLElement | undefined;
    slide?.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      inline: "center",
      block: "nearest",
    });
  }, []);

  // The active world is the one nearest the middle of the row, in both directions.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const middle = track.getBoundingClientRect();
        const centre = middle.left + middle.width / 2;
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
        setActive(nearest);
      });
    };
    track.addEventListener("scroll", update, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      track.removeEventListener("scroll", update);
    };
  }, []);

  const values = (index: number) => ({
    n: String(index + 1),
    t: String(total),
    name: nameOf(index),
  });

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
        className="lp-slider lp-reveal"
        role="region"
        aria-roledescription={t.worlds.role}
        aria-label={t.worlds.label}
        style={{ "--c": WORLDS[active]!.colour } as CSSProperties}
      >
        {/* The row scrolls by swipe; with a keyboard, the buttons and dots below move it. */}
        <div ref={trackRef} className="lp-track">
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
                style={{ "--c": world.colour } as CSSProperties}
              >
                <div className="lp-planet">
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
            onClick={() => goTo(active + 1)}
          >
            <NextIcon className="lp-icon lp-flip" />
          </button>
        </div>
        <p className="sr-only" aria-live="polite">
          {fill(t.worlds.status, values(active))}
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
              <small>{fill(t.preview.range, { range: ltr(item.range) })}</small>
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
                aria-label={fill(copy.aria, { range: current.range })}
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
              {fill(t.preview.range, { range: ltr(current.range) })}
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
          <div className="lp-pet-visual" aria-hidden="true">
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

function Footer({ t }: { t: Text }) {
  const { locale } = useI18n();
  return (
    <footer className="lp-footer">
      <div className="lp-wrap">
        <div className="lp-foot-grid">
          <div className="lp-foot-brand">
            <Link className="lp-logo" to={`/${locale}`} onClick={scrollToTop}>
              <img
                src={locale === "ar" ? logoArLightUrl : logoEnLightUrl}
                width={locale === "ar" ? 833 : 1001}
                height={192}
                alt="Tibyan Kids"
                loading="lazy"
              />
            </Link>
            <p>{fill(t.footer.tag, { range: ltr(AGE_RANGE) })}</p>
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
  const { dict } = useI18n();
  const t = dict.landing;
  const rootRef = useRef<HTMLDivElement>(null);
  useReveal(rootRef);

  return (
    <div ref={rootRef} className="landing">
      <PageTitle />
      <a className="lp-skip" href="#lp-main">
        {t.skip}
      </a>
      <Header t={t} />
      <main id="lp-main">
        <Hero t={t} />
        <Worlds t={t} />
        <Preview t={t} />
        <HowItWorks t={t} />
        <FinalCall t={t} />
      </main>
      <Footer t={t} />
    </div>
  );
}
