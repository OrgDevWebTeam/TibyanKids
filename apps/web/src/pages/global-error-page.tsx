import { Button } from "@tibyan/ui";
import { LOCALES, textDirection } from "@/i18n/config";
import { pageLocale, savedLocale } from "@/i18n/preferred-locale";
import { ALL_SHELL_TEXT } from "@/i18n/shell-text";

// X06 — the page frame or the language file failed, so the header may be unavailable. The message
// uses the page's language from the address or the saved choice; when neither is known, it shows
// both languages.
export function GlobalErrorPage() {
  const locale = pageLocale(window.location.pathname, savedLocale());
  const shown = locale ? [locale] : LOCALES;

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 p-6">
      {shown.map((language) => (
        <section
          key={language}
          lang={language}
          dir={textDirection(language)}
          className="flex max-w-md flex-col gap-3"
        >
          <h1 className="text-2xl font-semibold">{ALL_SHELL_TEXT[language].error.title}</h1>
          <p className="text-ink-muted">{ALL_SHELL_TEXT[language].error.body}</p>
          <div>
            <Button onClick={() => window.location.reload()}>
              {ALL_SHELL_TEXT[language].error.retry}
            </Button>
          </div>
        </section>
      ))}
    </main>
  );
}
