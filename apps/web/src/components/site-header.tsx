import { Link } from "react-router";
import logoUrl from "@/assets/tibyan-logo.svg";
import { useI18n } from "@/i18n/locale-data";
import { LanguageSwitcher } from "./language-switcher";

/** Top bar on every page: the logo as a home link, and the language switcher (X01). */
export function SiteHeader() {
  const { dict, locale } = useI18n();

  return (
    <header className="border-b border-line">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        {/* The logo from the design system; the product name is its text for screen readers. */}
        <Link to={`/${locale}`} className="inline-flex">
          <img
            src={logoUrl}
            alt={dict.meta.title}
            width={138}
            height={40}
            className="h-10 w-auto"
          />
        </Link>
        <LanguageSwitcher current={locale} label={dict.languageSwitcher.label} />
      </div>
    </header>
  );
}
