import { LanguagesIcon } from "@tibyan/ui";
import { Link, useLocation } from "react-router";
import { LOCALES, LOCALE_NAMES, textDirection, type Locale } from "@/i18n/config";
import { localizedPath } from "@/i18n/paths";
import { rememberLocale } from "@/i18n/preferred-locale";

type LanguageSwitcherProps = {
  current: Locale;
  /** Accessible name for the control, in the current page language. */
  label: string;
};

/**
 * X01: opens the same page in the other language and remembers the choice. As in the design
 * system's website header, it shows the other language in its own script with the languages icon.
 */
export function LanguageSwitcher({ current, label }: LanguageSwitcherProps) {
  const { pathname, search } = useLocation();
  const others = LOCALES.filter((locale) => locale !== current);

  return (
    <nav aria-label={label}>
      <ul className="flex gap-3">
        {others.map((locale) => (
          <li key={locale}>
            <Link
              to={localizedPath(pathname, locale) + search}
              hrefLang={locale}
              lang={locale}
              dir={textDirection(locale)}
              // The same page in the other language: keep the scroll position.
              preventScrollReset
              onClick={() => rememberLocale(locale)}
              className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 font-medium underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <LanguagesIcon className="size-5" />
              {LOCALE_NAMES[locale]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
