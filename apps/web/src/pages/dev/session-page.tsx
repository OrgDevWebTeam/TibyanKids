import { AlertBanner, Button, TextField } from "@noor/ui";
import { useState } from "react";
import { useNavigate } from "react-router";
import { PageTitle } from "@/components/page-title";
import { type Locale } from "@/i18n/config";
import { useI18n } from "@/i18n/locale-data";
import { logIn, register, type SignedInAccount } from "@/lib/session/account";
import { signIn, signOut, useSession } from "@/lib/session/session-store";
import { type ApiResult } from "@/lib/api/client";

// Development only: signs in a test parent on the local API (apps/api), creating the account the
// first time. Real sign-in (G06) comes with its task. Production bundles do not contain this page.

// Local test accounts only: the test ID becomes the email, and every test account shares this
// password. The `.test` domain is reserved, so no real address can match.
const TEST_EMAIL_DOMAIN = "noor.test";
const TEST_PASSWORD = "local-test-password";

// The text lives here, not in the dictionaries, so it stays out of production bundles with the page.
const TEXT: Record<
  Locale,
  {
    pageTitle: string;
    heading: string;
    intro: string;
    noApi: string;
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
      "Signs in a test parent on the local API, creating the account the first time, and keeps the token in memory only. A reload signs out. Use a different parent ID to test a second family.",
    noApi: "The API did not answer. Is it running?",
    refused: "The API refused the test account.",
    signedInAs: "Signed in as",
    signOut: "Sign out",
    idLabel: "Test parent ID",
    idHint: "Letters, digits and dashes. The same ID always opens the same family.",
    start: "Start session",
  },
  ar: {
    pageTitle: "جلسة تجريبية",
    heading: "جلسة ولي أمر تجريبية",
    intro:
      "تسجّل دخول ولي أمر تجريبي على الـ API المحلي، وتنشئ الحساب في المرة الأولى، وتحفظ الرمز في الذاكرة فقط. إعادة تحميل الصفحة تُنهي الجلسة. استخدم معرّفًا مختلفًا لتجربة عائلة ثانية.",
    noApi: "لم يردّ الـ API. هل هو يعمل؟",
    refused: "رفض الـ API الحساب التجريبي.",
    signedInAs: "تم الدخول باسم",
    signOut: "تسجيل الخروج",
    idLabel: "معرّف ولي الأمر التجريبي",
    idHint: "حروف إنجليزية وأرقام وشرطات. المعرّف نفسه يفتح العائلة نفسها دائمًا.",
    start: "ابدأ الجلسة",
  },
};

const API_COMMAND = "pnpm --filter @noor/api dev";

/** Logs the test parent in, and registers it first if the account does not exist yet. */
async function startTestSession(subject: string): Promise<ApiResult<SignedInAccount>> {
  const email = `${subject}@${TEST_EMAIL_DOMAIN}`;
  const loggedIn = await logIn(email, TEST_PASSWORD);
  if (loggedIn.ok || loggedIn.error.kind !== "unauthorized") return loggedIn;
  return register(subject, email, TEST_PASSWORD);
}

export function Component() {
  const { locale } = useI18n();
  const text = TEXT[locale];
  const navigate = useNavigate();
  const session = useSession();
  const [subject, setSubject] = useState("dev-parent-1");
  const [problem, setProblem] = useState<"noApi" | "refused">();
  const [isWorking, setIsWorking] = useState(false);

  async function handleStart() {
    setIsWorking(true);
    setProblem(undefined);
    const result = await startTestSession(subject.trim());
    setIsWorking(false);
    if (!result.ok) {
      const noAnswer = result.error.kind === "network" || result.error.kind === "server";
      setProblem(noAnswer ? "noApi" : "refused");
      return;
    }
    signIn(result.data.token, result.data.account);
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
          {problem === "noApi" && (
            <>
              {" "}
              <code dir="ltr">{API_COMMAND}</code>
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
