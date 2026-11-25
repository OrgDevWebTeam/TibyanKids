import { useEffect, useId, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router";
import logoArUrl from "@/assets/tibyan-logo-ar.svg";
import logoEnUrl from "@/assets/tibyan-logo.svg";
import { LanguageSwitcher } from "@/components/language-switcher";
import { type Locale } from "@/i18n/config";
import { useI18n } from "@/i18n/locale-data";
import { signOut } from "@/lib/session/session-store";
import { ChevronDownIcon, EyeIcon, LogOutIcon, PlusIcon, UsersIcon } from "./dashboard-icons";

// The frame of every dashboard page (Figma "Parent Dashboard", section 0: PD/Top bar and
// PD/Sidebar). The design's theme toggle, notifications, QR code, child interface and the
// sidebar's Sessions, Notifications, Content reporting, Subscription and Parent profile come
// with their APIs.

const LOGOS: Record<Locale, { src: string; width: number }> = {
  ar: { src: logoArUrl, width: 173 },
  en: { src: logoEnUrl, width: 210 },
};

const FOCUS_RING =
  "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus";

/**
 * A child's or parent's first letter. The design shows the approved photo, otherwise the initial
 * (never a generated avatar); photos come with their API.
 */
export function Avatar({ name, size = "md" }: { name: string; size?: "md" | "lg" | "xl" }) {
  const sizes = { md: "size-10 text-base", lg: "size-12 text-lg", xl: "size-16 text-2xl" };
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full bg-secondary font-bold text-on-secondary ${sizes[size]}`}
    >
      {Array.from(name.trim())[0]?.toUpperCase()}
    </span>
  );
}

/** PD/Top bar: the logo (back to the dashboard home), the language switch and the account menu. */
export function ParentTopBar({ parentName }: { parentName?: string }) {
  const { dict, locale } = useI18n();
  const logo = LOGOS[locale];

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex w-full max-w-[90rem] items-center justify-between gap-4 px-4 py-3 lg:px-8">
        <Link to={`/${locale}/dashboard`} className={`inline-flex rounded-control ${FOCUS_RING}`}>
          <img
            src={logo.src}
            alt={dict.meta.title}
            width={logo.width}
            height={40}
            className="h-8 w-auto sm:h-10"
          />
        </Link>
        <div className="flex items-center gap-2 sm:gap-4">
          <LanguageSwitcher current={locale} label={dict.languageSwitcher.label} />
          <AccountMenu name={parentName} />
        </div>
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
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface ps-1 pe-3 font-medium text-ink hover:bg-surface-muted ${FOCUS_RING}`}
      >
        {name ? <Avatar name={name} /> : <UsersIcon className="ms-2 size-5" />}
        <span className="sr-only">{t.accountMenu}</span>
        <bdi className={name ? "hidden max-w-40 truncate sm:inline" : "sr-only"}>{name}</bdi>
        <ChevronDownIcon className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <div
        id={menuId}
        hidden={!open}
        className="absolute end-0 top-full z-20 mt-2 min-w-48 rounded-control border border-line bg-surface p-2 shadow-[0_8px_24px_color-mix(in_srgb,var(--tibyan-shadow)_18%,transparent)]"
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

/** PD/Sidebar: the children youngest first; the chosen child's menu is open under its card. */
export function ParentSidebar({ kids, selectedId, onSelect }: SidebarProps) {
  const { dict, locale } = useI18n();
  const t = dict.dashboard;
  return (
    <nav aria-label={t.childrenLabel} className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 px-1">
        <span className="inline-flex items-center gap-2 leading-6 font-bold text-ink">
          <UsersIcon />
          {t.children}
        </span>
        <span className="text-caption text-ink-muted">{t.byAge}</span>
      </div>

      <ul className="flex flex-col gap-2">
        {kids.map((child) => {
          const selected = child.id === selectedId;
          return (
            <li key={child.id} className="flex flex-col gap-1">
              <button
                type="button"
                aria-current={selected ? "true" : undefined}
                onClick={() => onSelect(child.id)}
                className={[
                  "flex min-h-14 w-full items-center gap-3 rounded-control border-2 px-3 py-2 text-start",
                  selected
                    ? "border-primary bg-secondary"
                    : "border-transparent hover:bg-surface-muted",
                  FOCUS_RING,
                ].join(" ")}
              >
                <Avatar name={child.name} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <bdi className="truncate leading-6 font-bold text-ink">{child.name}</bdi>
                  <span className="text-caption text-ink-muted">
                    {child.details}
                    {selected && ` · ${t.selected}`}
                  </span>
                </span>
                <ChevronDownIcon
                  className={`size-5 shrink-0 text-ink-muted ${selected ? "rotate-180" : ""}`}
                />
              </button>
              {selected && (
                <ul className="flex flex-col rounded-control bg-surface-muted p-1.5">
                  <li>
                    <NavLink
                      to={`/${locale}/dashboard/profile`}
                      className={({ isActive }) =>
                        [
                          "flex min-h-11 items-center gap-3 rounded-control px-3 font-medium",
                          isActive ? "bg-surface text-primary" : "text-ink hover:bg-surface",
                          FOCUS_RING,
                        ].join(" ")
                      }
                    >
                      <EyeIcon />
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
        className={`flex min-h-12 items-center gap-2 rounded-control border-2 border-dashed border-[var(--tibyan-border)] px-4 font-bold text-link hover:bg-surface-muted ${FOCUS_RING}`}
      >
        <PlusIcon />
        {t.addChild}
      </Link>
    </nav>
  );
}
