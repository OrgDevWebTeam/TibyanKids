import { buttonClasses, CloseIcon, MenuIcon } from "@tibyan/ui";
import { useEffect, useId, useState } from "react";
import { Link, useLocation } from "react-router";
import { useI18n } from "@/i18n/locale-data";
import { useSession } from "@/lib/session/session-store";
import { type Theme } from "@/lib/theme";
import { LOGOS } from "./brand-logos";
import { LanguageSwitcher } from "./language-switcher";

/**
 * Top bar on every page (Navigation/Website header): the logo as a home link, the language
 * switcher (X01) and, for a visitor without a session, "Log in" and "Start free". On phones the
 * switcher and the actions sit behind a menu button. The design's page links (Programs, How it
 * works, Pricing, About) come with their pages. The logo follows the page's colour mode.
 */
export function SiteHeader({ theme }: { theme: Theme }) {
  const { dict, locale } = useI18n();
  const session = useSession();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const logo = LOGOS[theme][locale];

  // A new page closes the phone menu.
  useEffect(() => setMenuOpen(false), [pathname]);

  const switcher = <LanguageSwitcher current={locale} label={dict.languageSwitcher.label} />;
  const actions = session.status !== "signed-in" && (
    <>
      <Link to={`/${locale}/sign-in`} className={buttonClasses("ghost")}>
        {dict.header.logIn}
      </Link>
      <Link to={`/${locale}/sign-up`} className={buttonClasses("primary")}>
        {dict.header.startFree}
      </Link>
    </>
  );

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex w-full max-w-[73.75rem] items-center justify-between gap-4 px-4 py-3 sm:px-6">
        {/* The product name is the logo's text for screen readers. */}
        <Link to={`/${locale}`} className="inline-flex">
          <img
            src={logo.src}
            alt={dict.meta.title}
            width={logo.width}
            height={logo.height}
            className="h-10 w-auto"
          />
        </Link>
        <div className="hidden items-center gap-4 md:flex">
          {switcher}
          {actions}
        </div>
        <button
          type="button"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          aria-label={menuOpen ? dict.header.closeMenu : dict.header.openMenu}
          onClick={() => setMenuOpen((open) => !open)}
          className="grid size-11 place-items-center rounded-control text-on-secondary hover:bg-background focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus md:hidden"
        >
          {menuOpen ? <CloseIcon className="size-6" /> : <MenuIcon className="size-6" />}
        </button>
      </div>
      <div
        id={menuId}
        hidden={!menuOpen}
        className="flex flex-col gap-3 border-t border-line px-4 py-4 md:hidden"
      >
        {switcher}
        {actions}
      </div>
    </header>
  );
}
