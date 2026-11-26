import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router";
import { LOGOS } from "@/components/brand-logos";
import { LOCALES, LOCALE_NAMES, textDirection } from "@/i18n/config";
import { useI18n } from "@/i18n/locale-data";
import { localizedPath } from "@/i18n/paths";
import { rememberLocale } from "@/i18n/preferred-locale";
import { signOut } from "@/lib/session/session-store";
import {
  ChevronDownIcon,
  CloseIcon,
  EyeIcon,
  GlobeIcon,
  LogOutIcon,
  MenuIcon,
  MoonIcon,
  PlusIcon,
  SunIcon,
  UsersIcon,
} from "./dashboard-icons";
import { type Theme } from "@/lib/theme";

// The frame of every dashboard page (Figma "Parent Dashboard", section 0: PD/Top bar and
// PD/Sidebar), in the design's sizes. Notifications, the QR code, the child interface and the
// sidebar's Sessions, Notifications, Content reporting, Subscription and Parent profile come with
// their APIs. The design system has no glass tokens yet, so the glass uses surface and sheen.

const FOCUS_RING =
  "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus";

// color/glass/fill, border and shadow: the pills of the top bar.
const GLASS =
  "border border-[color-mix(in_srgb,var(--tibyan-sheen)_60%,transparent)] bg-surface/70 shadow-[0_2px_8px_color-mix(in_srgb,var(--tibyan-shadow)_12%,transparent)] backdrop-blur-md";

/**
 * A child's first letter (PD/Sidebar), or the parent's initials (PD/Top bar: Avatar, Initials).
 * The design shows the approved photo when there is one, never a generated avatar; photos come
 * with their API. A zero-width non-joiner keeps two Arabic initials from joining into a word.
 */
export function initials(name: string, count: 1 | 2): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words
    .slice(0, count)
    .map((word) => Array.from(word)[0]?.toUpperCase() ?? "")
    .join("‌");
}

// Sidebar: 36px with a 15px letter. Child header: 56px, 24px. Child Profile: 64px. Top bar: 32px,
// Caption.
const AVATAR_SIZES = {
  sidebar: "size-9 text-[15px]",
  header: "size-14 text-2xl",
  profile: "size-16 text-2xl",
  top: "size-8 text-caption",
};

export function Avatar({
  name,
  size,
  letters = 1,
}: {
  name: string;
  size: keyof typeof AVATAR_SIZES;
  letters?: 1 | 2;
}) {
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full bg-secondary font-medium text-on-secondary ${AVATAR_SIZES[size]}`}
    >
      {initials(name, letters)}
    </span>
  );
}

/** Language switch: the globe and the other language, in a glass pill. */
function LanguagePill() {
  const { dict, locale } = useI18n();
  const { pathname, search } = useLocation();
  const other = LOCALES.find((item) => item !== locale) ?? locale;

  return (
    <nav aria-label={dict.languageSwitcher.label}>
      <Link
        to={localizedPath(pathname, other) + search}
        hrefLang={other}
        lang={other}
        dir={textDirection(other)}
        // The same page in the other language: keep the scroll position.
        preventScrollReset
        onClick={() => rememberLocale(other)}
        className={`inline-flex h-12 items-center gap-2 rounded-full px-4 leading-6 font-bold text-ink ${GLASS} ${FOCUS_RING}`}
      >
        <GlobeIcon className="size-5 shrink-0 text-primary" />
        {LOCALE_NAMES[other]}
      </Link>
    </nav>
  );
}

type ThemeProps = { theme: Theme; onThemeChange: (theme: Theme) => void };

/** Theme toggle: the moon in light mode, the sun in dark mode. */
function ThemeToggle({ theme, onThemeChange }: ThemeProps) {
  const { dict } = useI18n();
  const dark = theme === "dark";
  return (
    <button
      type="button"
      aria-pressed={dark}
      aria-label={dict.dashboard.darkMode}
      onClick={() => onThemeChange(dark ? "light" : "dark")}
      className={`grid size-12 shrink-0 place-items-center rounded-full text-primary ${GLASS} ${FOCUS_RING}`}
    >
      {dark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

type TopBarProps = ThemeProps & {
  parentName?: string;
  /** Opens the sidebar on phones. */
  onOpenMenu: () => void;
  menuId: string;
};

/**
 * PD/Top bar. Desktop: 72px, the logo (back to the dashboard home), the language switch, the
 * theme toggle and the profile menu. Phone: 64px, the menu button, the logo and the profile.
 */
export function ParentTopBar({
  parentName,
  theme,
  onThemeChange,
  onOpenMenu,
  menuId,
}: TopBarProps) {
  const { dict, locale } = useI18n();
  const logo = LOGOS[theme][locale];

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/80 backdrop-blur-xl">
      <div className="flex h-16 items-center gap-3 px-4 lg:h-18 lg:gap-2 lg:px-8">
        <button
          type="button"
          aria-label={dict.header.openMenu}
          aria-haspopup="dialog"
          aria-controls={menuId}
          onClick={onOpenMenu}
          className={`grid size-10 shrink-0 place-items-center rounded-full text-primary lg:hidden ${GLASS} ${FOCUS_RING}`}
        >
          <MenuIcon className="size-4" />
        </button>
        <Link to={`/${locale}/dashboard`} className={`inline-flex rounded-control ${FOCUS_RING}`}>
          <img
            src={logo.src}
            alt={dict.meta.title}
            width={logo.width}
            height={logo.height}
            className="h-8 w-auto"
          />
        </Link>
        <span className="flex-1" />
        <div className="hidden items-center gap-2 lg:flex">
          <LanguagePill />
          <ThemeToggle theme={theme} onThemeChange={onThemeChange} />
          <span aria-hidden="true" className="mx-2 h-8 w-px bg-line" />
        </div>
        <AccountMenu name={parentName} />
      </div>
    </header>
  );
}

/** The parent's menu. The design opens Parent Profile from here too; that comes with its API. */
function AccountMenu({ name }: { name?: string }) {
  const { dict, locale } = useI18n();
  const t = dict.dashboard;
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  // Escape or a click outside closes the menu; Escape puts focus back on its button.
  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function logOut() {
    signOut();
    void navigate(`/${locale}/sign-in`);
  }

  return (
    <div ref={wrapper} className="relative">
      {/* Profile menu: a 48px glass pill with the 32px avatar, the name and a chevron. */}
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex h-10 items-center gap-2 rounded-full p-1 lg:h-12 lg:pe-4 ${GLASS} ${FOCUS_RING}`}
      >
        {name ? (
          <Avatar name={name} size="top" letters={2} />
        ) : (
          <UsersIcon className="m-1.5 size-5 text-ink-muted" />
        )}
        <span className="sr-only">{t.accountMenu}</span>
        <bdi
          className={
            name ? "hidden max-w-40 truncate leading-6 font-bold text-ink lg:inline" : "sr-only"
          }
        >
          {name}
        </bdi>
        <ChevronDownIcon
          className={`hidden size-4 text-ink-muted transition-transform lg:block ${open ? "rotate-180" : ""}`}
        />
      </button>
      <div
        id={menuId}
        hidden={!open}
        className="absolute end-0 top-full z-40 mt-2 min-w-48 rounded-control border border-line bg-surface p-2 shadow-[0_8px_24px_color-mix(in_srgb,var(--tibyan-shadow)_18%,transparent)]"
      >
        <button
          type="button"
          onClick={logOut}
          className={`flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-start font-medium text-ink hover:bg-surface-muted ${FOCUS_RING}`}
        >
          <LogOutIcon />
          {t.logOut}
        </button>
      </div>
    </div>
  );
}

/** A child in the sidebar: the page works out the details line ("Age 7"). */
export type SidebarChild = { id: string; name: string; details: string };

type SidebarProps = {
  kids: SidebarChild[];
  selectedId?: string;
  onSelect: (childId: string) => void;
};

/**
 * PD/Sidebar's content: the children youngest first, the chosen child's menu open under its card,
 * and "Add child".
 */
export function ParentSidebar({ kids, selectedId, onSelect }: SidebarProps) {
  const { dict, locale } = useI18n();
  const t = dict.dashboard;

  return (
    <nav aria-label={t.childrenLabel} className="flex flex-col gap-1">
      <div className="flex h-10 items-center gap-2 px-3 text-ink-muted">
        <UsersIcon />
        <span className="flex-1 leading-6 font-bold">{t.children}</span>
        <span className="text-caption">{t.byAge}</span>
      </div>

      <ul className="flex flex-col gap-1">
        {kids.map((child) => {
          const selected = child.id === selectedId;
          return (
            <li key={child.id} className="flex flex-col gap-1">
              <button
                type="button"
                aria-current={selected ? "true" : undefined}
                onClick={() => onSelect(child.id)}
                className={[
                  "flex h-15 w-full items-center gap-3 rounded-2xl border-[1.5px] px-3 py-2 text-start",
                  selected
                    ? "border-primary bg-secondary"
                    : "border-transparent hover:bg-surface-muted",
                  FOCUS_RING,
                ].join(" ")}
              >
                <Avatar name={child.name} size="sidebar" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <bdi
                    className={`truncate leading-6 font-bold ${selected ? "text-link" : "text-ink"}`}
                  >
                    {child.name}
                  </bdi>
                  <span className="text-caption text-ink-muted">
                    {child.details}
                    {selected && ` · ${t.selected}`}
                  </span>
                </span>
                <ChevronDownIcon
                  className={`size-4 shrink-0 text-ink-muted ${selected ? "rotate-180" : ""}`}
                />
              </button>
              {selected && (
                <ul className="flex flex-col gap-1 rounded-2xl border border-line bg-background p-1">
                  <li>
                    <NavLink
                      to={`/${locale}/dashboard/profile`}
                      className={({ isActive }) =>
                        [
                          "relative flex h-11 items-center gap-3 rounded-control px-3 text-sm leading-[22px] font-medium text-ink hover:bg-surface",
                          // The active item's 3px primary indicator, at its start.
                          isActive
                            ? "bg-surface before:absolute before:start-0 before:h-5 before:w-[3px] before:rounded-[2px] before:bg-primary"
                            : "",
                          FOCUS_RING,
                        ].join(" ")
                      }
                    >
                      <EyeIcon className="size-5 shrink-0 text-ink-muted" />
                      {t.viewProfile}
                    </NavLink>
                  </li>
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      <Link
        to={`/${locale}/dashboard/add-child`}
        className={`flex h-12 items-center gap-2 rounded-2xl border-[1.5px] border-dashed border-[var(--tibyan-border)] px-3 leading-6 font-bold text-link hover:bg-surface-muted ${FOCUS_RING}`}
      >
        <PlusIcon />
        {t.addChild}
      </Link>
    </nav>
  );
}

type DrawerProps = ThemeProps & {
  id: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
};

/**
 * The sidebar on phones, opened from the top bar's menu button. A modal dialog, so focus stays
 * inside and Escape closes it. The language switch and theme toggle live here on phones, where
 * the design's top bar has no room for them.
 */
export function SidebarDrawer({ id, open, onClose, theme, onThemeChange, children }: DrawerProps) {
  const { dict } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      id={id}
      aria-label={dict.dashboard.childrenLabel}
      onClose={onClose}
      className="m-0 h-dvh max-h-none w-72 max-w-[85vw] bg-surface p-0 text-ink backdrop:bg-[color-mix(in_srgb,var(--tibyan-overlay)_60%,transparent)] lg:hidden"
    >
      <div className="flex h-full flex-col gap-4 px-4 py-6">
        <div className="flex items-center justify-between gap-2">
          <LanguagePill />
          <div className="flex items-center gap-2">
            <ThemeToggle theme={theme} onThemeChange={onThemeChange} />
            <button
              type="button"
              aria-label={dict.header.closeMenu}
              onClick={onClose}
              className={`grid size-12 place-items-center rounded-full text-ink-muted hover:bg-surface-muted ${FOCUS_RING}`}
            >
              <CloseIcon />
            </button>
          </div>
        </div>
        {children}
      </div>
    </dialog>
  );
}
