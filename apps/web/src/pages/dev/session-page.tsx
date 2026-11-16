import { AlertBanner, Button, TextField } from "@noor/ui";
import { useState } from "react";
import { useNavigate } from "react-router";
import { PageTitle } from "@/components/page-title";
import { type Locale } from "@/i18n/config";
import { useI18n } from "@/i18n/locale-data";
import { fetchAccount } from "@/lib/session/account";
import { signIn, signOut, useSession } from "@/lib/session/session-store";

// Development only: starts a parent session with a token from the local test identity provider
// (apps/api/scripts/dev-idp.mjs, proxied at /dev-idp by the Vite dev server). Real sign-in (G06)
// waits for the identity provider decision. Production bundles do not contain this page.

const DEV_IDP_TOKEN_URL = "/dev-idp/token";

// The text lives here, not in the dictionaries, so it stays out of production bundles with the page.
const TEXT: Record<
  Locale,
  {
    pageTitle: string;
    heading: string;
    intro: string;
    noToken: string;
    refused: string;
    signedInAs: string;
    signOut: string;
    idLabel: string;
    idHint: string;
    start: string;
  }
> = {
  en: {
    pageTitle: "Dev session",
    heading: "Test parent session",
    intro:
      "Gets a signed test token from the local dev-idp and keeps it in memory only. A reload signs out. Use a different parent ID to test a second family.",
    noToken: "No token. Is dev-idp running?",
    refused: "The API refused the token. Is the API running with the dev-idp settings in .env?",
    signedInAs: "Signed in as",
    signOut: "Sign out",
    idLabel: "Test parent ID",
    idHint: "Any text. The same ID always opens the same family.",
    start: "Start session",
  },
  ar: {
    pageTitle: "جلسة تجريبية",
    heading: "جلسة ولي أمر تجريبية",
    intro:
      "تحصل على رمز تجريبي موقّع من مزوّد الهوية المحلي (dev-idp) وتحفظه في الذاكرة فقط. إعادة تحميل الصفحة تُنهي الجلسة. استخدم معرّفًا مختلفًا لتجربة عائلة ثانية.",
    noToken: "لم يصل رمز. هل dev-idp يعمل؟",
    refused: "رفض الـ API الرمز. هل يعمل الـ API بإعدادات dev-idp في ملف .env؟",
    signedInAs: "تم الدخول باسم",
    signOut: "تسجيل الخروج",
    idLabel: "معرّف ولي الأمر التجريبي",
    idHint: "أي نص. المعرّف نفسه يفتح العائلة نفسها دائمًا.",
    start: "ابدأ الجلسة",
  },
};

const DEV_IDP_COMMAND = "pnpm --filter @noor/api dev:idp";

async function requestTestToken(subject: string): Promise<string | undefined> {
  try {
    const response = await fetch(`${DEV_IDP_TOKEN_URL}?sub=${encodeURIComponent(subject)}`);
    return response.ok ? (await response.text()).trim() : undefined;
  } catch {
    return undefined;
  }
}

export function Component() {
  const { locale } = useI18n();
  const text = TEXT[locale];
  const navigate = useNavigate();
  const session = useSession();
  const [subject, setSubject] = useState("dev-parent-1");
  const [problem, setProblem] = useState<"noToken" | "refused">();
  const [isWorking, setIsWorking] = useState(false);

  async function handleStart() {
    setIsWorking(true);
    setProblem(undefined);
    const token = await requestTestToken(subject);
    const account = token ? await fetchAccount(token) : undefined;
    setIsWorking(false);
    if (!token) {
      setProblem("noToken");
      return;
    }
    if (!account?.ok) {
      setProblem("refused");
      return;
    }
    signIn(token, account.data);
    void navigate(`/${locale}/profiles`);
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-8 sm:px-6">
      <PageTitle title={text.pageTitle} />
      <h1 className="text-2xl font-bold">{text.heading}</h1>
      <p className="max-w-xl text-ink-muted">{text.intro}</p>
      {problem && (
        <AlertBanner tone="danger">
          {text[problem]}
          {problem === "noToken" && (
            <>
              {" "}
              <code dir="ltr">{DEV_IDP_COMMAND}</code>
            </>
          )}
        </AlertBanner>
      )}
      {session.status === "signed-in" ? (
        <div className="flex flex-col items-start gap-3">
          <p>
            {text.signedInAs} <bdi dir="ltr">{session.account.userId}</bdi> (
            <bdi dir="ltr">{session.account.roles.join(", ")}</bdi>)
          </p>
          <Button variant="secondary" onClick={signOut}>
            {text.signOut}
          </Button>
        </div>
      ) : (
        <form
          className="flex max-w-md flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void handleStart();
          }}
        >
          <TextField
            id="dev-subject"
            label={text.idLabel}
            hint={text.idHint}
            dir="ltr"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
          />
          <Button type="submit" loading={isWorking} className="self-start">
            {text.start}
          </Button>
        </form>
      )}
    </main>
  );
}
