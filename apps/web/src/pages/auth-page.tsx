import "@/features/auth/auth.css";
import { Button } from "@tibyan/ui";
import {
  type FocusEvent,
  type FormEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useLocation, useNavigate } from "react-router";
import logoArUrl from "@/assets/auth/logo-white-ar.png";
import logoEnUrl from "@/assets/auth/logo-white-en.png";
import { PageTitle } from "@/components/page-title";
import { AuthCheckbox, AuthField, AuthSelect } from "@/features/auth/auth-controls";
import {
  type AuthFieldError,
  confirmError,
  emailError,
  fill,
  nameError,
  nameFromEmail,
  newPasswordError,
  passwordError,
  passwordStrength,
  POLICY_VERSION,
} from "@/features/auth/auth-rules";
import { countryOptions } from "@/features/auth/countries";
import { type GreetingKind, playGreeting, stopGreeting } from "@/features/auth/greeting";
import { type GuideLine, type GuidePose, GuideScene } from "@/features/auth/guide-scene";
import {
  CheckIcon,
  CloseIcon,
  AlertIcon,
  GlobeIcon,
  MapPinIcon,
  PartyIcon,
  UserPlusIcon,
  VolumeIcon,
  VolumeOffIcon,
} from "@/features/auth/icons";
import { NightSky } from "@/features/auth/night-sky";
import {
  forgetAccount,
  mutedChoice,
  rememberChoice,
  saveAccount,
  savedAccounts,
  setMutedChoice,
  setRememberChoice,
  type SavedAccount,
} from "@/features/auth/saved-accounts";
import { burstAround } from "@/features/auth/star-burst";
import { LOCALES, LOCALE_NAMES } from "@/i18n/config";
import { type Dictionary, useI18n } from "@/i18n/locale-data";
import { localizedPath } from "@/i18n/paths";
import { rememberLocale } from "@/i18n/preferred-locale";
import { logIn, register, type SignedInAccount } from "@/lib/session/account";
import { signIn } from "@/lib/session/session-store";

// G06 and G03: log in and sign up for parents (FR-AUTH-001), from the designer's file. One page
// for both, so switching slides the two halves of the card instead of loading a new page. Not
// built yet, because their APIs do not exist: the email verification code, and the forgotten
// password screens.

type AuthText = Dictionary["auth"];
type Group = "login" | "signup";
type View = "accounts" | "password" | "form" | "signup" | "success";
type ButtonState = "idle" | "loading" | "success";
type Success = { kind: GreetingKind; name: string };

/** How long she waves after a successful log in or sign up, before the welcome screen. */
const WAVE_MS = 2000;

const prefersReducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Shakes a form after a failed submit, unless the visitor prefers less motion. */
function shake(element: HTMLElement | null) {
  if (!element || prefersReducedMotion()) return;
  element.animate(
    [
      { transform: "translateX(0)" },
      { transform: "translateX(-6px)" },
      { transform: "translateX(6px)" },
      { transform: "translateX(-4px)" },
      { transform: "translateX(4px)" },
      { transform: "translateX(0)" },
    ],
    { duration: 420, easing: "cubic-bezier(.36,.07,.19,.97)" },
  );
}

/** Puts the keyboard on a form's first field with an error. */
function focusFirstInvalid(form: HTMLFormElement | null) {
  form?.querySelector<HTMLInputElement>("[aria-invalid='true']")?.focus();
}

/**
 * When a field's message shows: after the visitor leaves the field or tries to send the form,
 * as in the design. The confirmation is checked as it is typed.
 */
function useFieldDisplay<Field extends string>() {
  const [touched, setTouched] = useState<Set<Field>>(new Set());
  const [blurred, setBlurred] = useState<Set<Field>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  return {
    submitted,
    setSubmitted,
    touch: (field: Field) => setTouched((current) => new Set(current).add(field)),
    blur: (field: Field) => {
      if (touched.has(field)) setBlurred((current) => new Set(current).add(field));
    },
    isTouched: (field: Field) => touched.has(field),
    shows: (field: Field, live = false) =>
      submitted || blurred.has(field) || (live && touched.has(field)),
  };
}

type SubmitButtonProps = { state: ButtonState; idle: string; loading: string; done: string };

/** The primary action with the design's three states: ready, working, and done. */
function SubmitButton({ state, idle, loading, done }: SubmitButtonProps) {
  return (
    <Button
      type="submit"
      fullWidth
      loading={state === "loading"}
      data-state={state === "success" ? "success" : undefined}
      className="auth-submit"
    >
      {state === "success" && <CheckIcon />}
      {state === "loading" ? loading : state === "success" ? done : idle}
    </Button>
  );
}

/** The account's first letter in a circle. Decorative: the name is written next to it. */
function Avatar({ account }: { account: SavedAccount }) {
  const initial = (account.name.trim()[0] ?? account.email[0] ?? "").toUpperCase();
  return (
    <span className="auth-avatar" aria-hidden="true">
      {initial}
    </span>
  );
}

type PasswordHandlers = {
  onPasswordFocus: () => void;
  onPasswordBlur: (event: FocusEvent<HTMLInputElement>) => void;
};

type LoginFormProps = PasswordHandlers & {
  t: AuthText;
  /** The saved account picked on this device, or none for the email field. */
  account?: SavedAccount;
  hasSavedAccounts: boolean;
  remember: boolean;
  onRememberChange: (remember: boolean) => void;
  onChangeAccount: () => void;
  onSignedIn: (signedIn: SignedInAccount, email: string, button: HTMLElement | null) => void;
};

/** Log in with email and password, or with the password only for a saved account. */
function LoginForm({
  t,
  account,
  hasSavedAccounts,
  remember,
  onRememberChange,
  onChangeAccount,
  onSignedIn,
  onPasswordFocus,
  onPasswordBlur,
}: LoginFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [email, setEmail] = useState(account?.email ?? "");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<ButtonState>("idle");
  const [problem, setProblem] = useState<string>();
  // "Please check the fields…" is for screen readers only; the fields show their own errors.
  const [fixAlert, setFixAlert] = useState("");
  const display = useFieldDisplay<"email" | "password">();

  const errors = {
    email: account ? undefined : emailError(email),
    password: passwordError(password),
  };
  const errorText = (field: "email" | "password") =>
    display.shows(field) && errors[field] ? t.errors[errors[field]!] : undefined;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (state !== "idle") return;
    display.setSubmitted(true);
    setProblem(undefined);
    setFixAlert("");
    if (errors.email || errors.password) {
      shake(formRef.current);
      requestAnimationFrame(() => focusFirstInvalid(formRef.current));
      setFixAlert("");
      requestAnimationFrame(() => setFixAlert(t.fixErrors));
      return;
    }
    setState("loading");
    const address = email.trim();
    const result = await logIn(address, password);
    if (!result.ok) {
      setState("idle");
      setProblem(result.error.kind === "unauthorized" ? t.wrongCredentials : t.serverError);
      return;
    }
    setState("success");
    onSignedIn(result.data, address, formRef.current?.querySelector(".auth-submit") ?? null);
  }

  return (
    <form
      ref={formRef}
      className="auth-form"
      noValidate
      onSubmit={(event) => void handleSubmit(event)}
    >
      {account ? (
        <>
          <div className="auth-chosen" role="group" aria-label={t.selectedAccount}>
            <Avatar account={account} />
            <span className="auth-account-text">
              <span className="auth-account-name">{account.name}</span>
              <span className="auth-account-email" dir="ltr">
                {account.email}
              </span>
            </span>
            <button
              type="button"
              className="auth-link"
              aria-label={t.changeLabel}
              onClick={onChangeAccount}
            >
              {t.change}
            </button>
          </div>
          {/* Lets password managers know which account this password belongs to. */}
          <input
            type="email"
            className="sr-only"
            autoComplete="username"
            value={account.email}
            readOnly
            tabIndex={-1}
            aria-hidden="true"
          />
        </>
      ) : (
        <AuthField
          id="login-email"
          label={t.email}
          type="email"
          value={email}
          onChange={(value) => {
            setEmail(value);
            display.touch("email");
          }}
          onBlur={() => display.blur("email")}
          placeholder={t.emailPlaceholder}
          autoComplete="username"
          error={errorText("email")}
        />
      )}
      <AuthField
        id="login-password"
        label={t.password}
        type="password"
        value={password}
        onChange={(value) => {
          setPassword(value);
          display.touch("password");
          onPasswordFocus();
        }}
        onFocus={onPasswordFocus}
        onBlur={(event) => {
          display.blur("password");
          onPasswordBlur(event);
        }}
        placeholder={t.passwordPlaceholder}
        autoComplete="current-password"
        error={errorText("password")}
        showLabel={t.showPassword}
        hideLabel={t.hidePassword}
      />
      <AuthCheckbox id="login-remember" checked={remember} onChange={onRememberChange} compact>
        {t.rememberMe}
      </AuthCheckbox>
      <p className="sr-only" role="alert">
        {fixAlert}
      </p>
      {problem && (
        <p className="auth-msg auth-form-problem" data-tone="error" role="alert">
          <AlertIcon />
          <span>{problem}</span>
        </p>
      )}
      <SubmitButton state={state} idle={t.loginButton} loading={t.loggingIn} done={t.done} />
      {!account && hasSavedAccounts && (
        <button type="button" className="auth-link auth-center" onClick={onChangeAccount}>
          {t.savedLink}
        </button>
      )}
    </form>
  );
}

type SignupFormProps = PasswordHandlers & {
  t: AuthText;
  onSignedIn: (signedIn: SignedInAccount, email: string, button: HTMLElement | null) => void;
};

type SignupField = "name" | "email" | "password" | "confirm" | "policy";

/** Sign up: name, email, password twice, an optional country, and the parent's agreement. */
function SignupForm({ t, onSignedIn, onPasswordFocus, onPasswordBlur }: SignupFormProps) {
  const { locale } = useI18n();
  const countries = useMemo(() => countryOptions(locale), [locale]);
  const formRef = useRef<HTMLFormElement>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [country, setCountry] = useState("");
  const [policy, setPolicy] = useState(false);
  const [state, setState] = useState<ButtonState>("idle");
  const [problem, setProblem] = useState<string>();
  // "Please check the fields…" is for screen readers only; the fields show their own errors.
  const [fixAlert, setFixAlert] = useState("");
  const display = useFieldDisplay<SignupField>();

  const errors: Record<SignupField, AuthFieldError | undefined> = {
    name: nameError(name),
    email: emailError(email),
    password: newPasswordError(password),
    confirm: confirmError(confirm, password),
    policy: policy ? undefined : "policyRequired",
  };
  const errorText = (field: SignupField, live = false) =>
    display.shows(field, live) && errors[field] ? t.errors[errors[field]!] : undefined;
  // The meter rates a password that meets the rules; while a capital or a symbol is missing, the
  // field's own message says what to add instead.
  const missingKind =
    errors.password === "passwordNoCapital" || errors.password === "passwordNoSpecial";
  const strength = missingKind ? 0 : passwordStrength(password);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (state !== "idle") return;
    display.setSubmitted(true);
    setProblem(undefined);
    setFixAlert("");
    if (Object.values(errors).some(Boolean)) {
      shake(formRef.current);
      requestAnimationFrame(() => focusFirstInvalid(formRef.current));
      setFixAlert("");
      requestAnimationFrame(() => setFixAlert(t.fixErrors));
      return;
    }
    setState("loading");
    const address = email.trim();
    const result = await register({
      name: name.trim(),
      email: address,
      password,
      policyVersion: POLICY_VERSION,
      country: country || undefined,
    });
    if (!result.ok) {
      setState("idle");
      setProblem(result.error.kind === "conflict" ? t.emailTaken : t.serverError);
      return;
    }
    setState("success");
    onSignedIn(result.data, address, formRef.current?.querySelector(".auth-submit") ?? null);
  }

  return (
    <form
      ref={formRef}
      className="auth-form"
      noValidate
      onSubmit={(event) => void handleSubmit(event)}
    >
      <AuthField
        id="signup-name"
        label={t.name}
        type="text"
        value={name}
        onChange={(value) => {
          setName(value);
          display.touch("name");
        }}
        onBlur={() => display.blur("name")}
        placeholder={t.namePlaceholder}
        autoComplete="name"
        error={errorText("name")}
      />
      <AuthField
        id="signup-email"
        label={t.email}
        type="email"
        value={email}
        onChange={(value) => {
          setEmail(value);
          display.touch("email");
        }}
        onBlur={() => display.blur("email")}
        placeholder={t.emailPlaceholder}
        autoComplete="email"
        error={errorText("email")}
        ok={display.isTouched("email") && !errors.email ? t.emailOk : undefined}
      />
      <AuthField
        id="signup-password"
        label={t.password}
        type="password"
        value={password}
        onChange={(value) => {
          setPassword(value);
          display.touch("password");
          onPasswordFocus();
        }}
        onFocus={onPasswordFocus}
        onBlur={(event) => {
          display.blur("password");
          onPasswordBlur(event);
        }}
        placeholder={t.passwordPlaceholder}
        autoComplete="new-password"
        error={errorText("password")}
        showLabel={t.showPassword}
        hideLabel={t.hidePassword}
        extraDescriptionId="signup-strength"
      >
        <div id="signup-strength" className="auth-strength" data-level={strength}>
          {strength > 0 && (
            <>
              <span className="auth-bars" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span>
                {fill(t.strength, { level: t.strengthLevels[String(strength) as "1" | "2" | "3"] })}
                {strength < 3 && ` · ${t.strengthTip}`}
              </span>
            </>
          )}
        </div>
      </AuthField>
      <AuthField
        id="signup-confirm"
        label={t.confirm}
        type="password"
        value={confirm}
        onChange={(value) => {
          setConfirm(value);
          display.touch("confirm");
          onPasswordFocus();
        }}
        onFocus={onPasswordFocus}
        onBlur={(event) => {
          display.blur("confirm");
          onPasswordBlur(event);
        }}
        placeholder={t.confirmPlaceholder}
        autoComplete="new-password"
        error={errorText("confirm", true)}
        ok={display.isTouched("confirm") && !errors.confirm ? t.confirmOk : undefined}
        showLabel={t.showPassword}
        hideLabel={t.hidePassword}
      />
      <AuthSelect
        id="signup-country"
        label={t.country}
        value={country}
        onChange={setCountry}
        icon={<MapPinIcon className="auth-icon auth-lead" />}
        placeholder={t.countryPlaceholder}
        options={countries}
        autoComplete="country"
      />
      <AuthCheckbox
        id="signup-policy"
        checked={policy}
        onChange={(checked) => {
          setPolicy(checked);
          display.touch("policy");
        }}
        error={errorText("policy", true) ?? ""}
      >
        {t.policy}
      </AuthCheckbox>
      <p className="sr-only" role="alert">
        {fixAlert}
      </p>
      {problem && (
        <p className="auth-msg auth-form-problem" data-tone="error" role="alert">
          <AlertIcon />
          <span>{problem}</span>
        </p>
      )}
      <SubmitButton state={state} idle={t.signupButton} loading={t.signingUp} done={t.done} />
    </form>
  );
}

type AccountListProps = {
  t: AuthText;
  accounts: SavedAccount[];
  onPick: (account: SavedAccount) => void;
  onForget: (account: SavedAccount, next?: SavedAccount) => void;
  onUseAnother: () => void;
};

/** The accounts saved on this device: pick one, or forget it. */
function AccountList({ t, accounts, onPick, onForget, onUseAnother }: AccountListProps) {
  return (
    <>
      <ul className="auth-accounts">
        {accounts.map((account, index) => (
          <li key={account.email} className="auth-tile">
            <button
              type="button"
              className="auth-tile-main"
              data-email={account.email}
              aria-label={fill(t.accountTile, account)}
              onClick={() => onPick(account)}
            >
              <Avatar account={account} />
              {/* The tile shows the name only, as in the design; its label also reads the email. */}
              <span className="auth-account-text">
                <span className="auth-account-name">{account.name}</span>
              </span>
            </button>
            <button
              type="button"
              className="auth-tile-forget"
              aria-label={fill(t.forgetAccount, account)}
              onClick={() => onForget(account, accounts[index + 1] ?? accounts[index - 1])}
            >
              <CloseIcon />
            </button>
          </li>
        ))}
      </ul>
      <Button variant="secondary" fullWidth onClick={onUseAnother}>
        <UserPlusIcon />
        {t.useAnother}
      </Button>
    </>
  );
}

/** One of the form panel's screens, with its title, entering with a short slide. */
function ViewFrame({
  title,
  sub,
  titleFocus,
  badge,
  children,
}: {
  title: string;
  sub?: string;
  titleFocus?: boolean;
  badge?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="auth-view" aria-labelledby="auth-view-title">
      {badge}
      <h2 id="auth-view-title" className="auth-view-title" tabIndex={titleFocus ? -1 : undefined}>
        {title}
      </h2>
      {sub && <p className="auth-view-sub">{sub}</p>}
      {children}
    </section>
  );
}

/** The sign-in page: G06 at /sign-in and G03 at /sign-up. */
export function Component() {
  const { locale, dict } = useI18n();
  const t = dict.auth;
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const group: Group = pathname.endsWith("/sign-up") ? "signup" : "login";

  const [accounts, setAccounts] = useState<SavedAccount[]>(savedAccounts);
  const [view, setView] = useState<View>(() =>
    group === "signup" ? "signup" : savedAccounts().length > 0 ? "accounts" : "form",
  );
  const [selected, setSelected] = useState<SavedAccount>();
  const [success, setSuccess] = useState<Success>();
  const [opening, setOpening] = useState(false);
  const [remember, setRemember] = useState(rememberChoice);
  const [muted, setMuted] = useState(mutedChoice);
  const [pose, setPose] = useState<GuidePose>("standing");
  const [line, setLine] = useState<GuideLine>();
  const [announcement, setAnnouncement] = useState("");

  // After the language switch, screen readers hear that the language changed (as in the design).
  const shownLocale = useRef(locale);
  useEffect(() => {
    if (shownLocale.current === locale) return;
    shownLocale.current = locale;
    setAnnouncement(t.langChanged);
  }, [locale, t.langChanged]);

  const fxRef = useRef<HTMLDivElement>(null);
  const formPanelRef = useRef<HTMLDivElement>(null);
  const welcomeRef = useRef<HTMLDivElement>(null);
  const lineTimer = useRef<number>(undefined);
  const poseRef = useRef(pose);
  poseRef.current = pose;
  const firstView = useRef(true);
  const previousGroup = useRef(group);

  function say(text: string, ms?: number) {
    window.clearTimeout(lineTimer.current);
    setLine({ id: Date.now(), text });
    if (ms) lineTimer.current = window.setTimeout(() => setLine(undefined), ms);
  }

  // She greets the visitor shortly after the page opens.
  useEffect(() => {
    const timer = window.setTimeout(() => say(t.salam, 2600), prefersReducedMotion() ? 200 : 700);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(lineTimer.current);
      stopGreeting();
    };
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switching between log in and sign up: the card's halves slide, and she does a little hop.
  useEffect(() => {
    if (previousGroup.current === group) return;
    previousGroup.current = group;
    if (view === "success") return;
    setView(group === "signup" ? "signup" : accounts.length > 0 ? "accounts" : "form");
    setSelected(undefined);
    const timer = window.setTimeout(
      () =>
        burstAround(
          fxRef.current,
          welcomeRef.current?.querySelector(".auth-guide") ?? null,
          6,
          0.35,
        ),
      280,
    );
    return () => window.clearTimeout(timer);
  }, [group, view, accounts.length]);

  // A new screen: move the keyboard to it and tell screen readers, except on arrival.
  useLayoutEffect(() => {
    if (firstView.current) {
      firstView.current = false;
      return;
    }
    const panel = formPanelRef.current;
    const target =
      panel?.querySelector<HTMLElement>(".auth-view-title[tabindex='-1']") ??
      panel?.querySelector<HTMLElement>("input:not([readonly]):not([type='checkbox'])") ??
      panel?.querySelector<HTMLElement>(".auth-tile-main");
    target?.focus({ preventScroll: true });
    const message: Partial<Record<View, string>> = {
      accounts: t.announceAccounts,
      form: t.announceLogin,
      password: fill(t.announcePassword, { name: selected?.name ?? "" }),
      signup: t.announceSignup,
    };
    setAnnouncement(message[view] ?? "");
    // Announced when the screen changes, not when the language does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, selected]);

  function coverEyes() {
    if (poseRef.current !== "standing") return;
    setPose("covering");
    say(t.peek, 1600);
  }

  function uncoverEyes(event: FocusEvent<HTMLInputElement>) {
    const next = event.relatedTarget as Element | null;
    if (next?.closest("[data-password-field]")) return;
    setPose((current) => (current === "covering" ? "standing" : current));
  }

  function toggleMuted() {
    const next = !muted;
    setMuted(next);
    setMutedChoice(next);
    if (next) stopGreeting();
  }

  function changeRemember(next: boolean) {
    setRemember(next);
    setRememberChoice(next);
  }

  function handleSignedIn(kind: GreetingKind, remembered: boolean) {
    return (signedIn: SignedInAccount, email: string, button: HTMLElement | null) => {
      // The name the parent gave at sign-up, as the API returns it; older accounts may have none.
      const given = signedIn.name?.trim() || undefined;
      signIn(signedIn.token, signedIn.account, given);
      let name = given ?? nameFromEmail(email);
      if (remembered) name = saveAccount(email, given).name;
      else forgetAccount(email);
      setAccounts(savedAccounts());
      burstAround(fxRef.current, button, 12);
      window.clearTimeout(lineTimer.current);
      setPose(kind === "login" ? "wave-right" : "wave-left");
      setLine({ id: Date.now(), text: t.salam });
      if (!muted) playGreeting(locale, kind);
      // Then the welcome screen, as in the design: she keeps waving and says "Hooray!".
      window.setTimeout(() => {
        setLine({ id: Date.now(), text: t.hooray, wave: true });
        setSuccess({ kind, name });
        setView("success");
        setAnnouncement(fill(kind === "login" ? t.successLogin : t.successSignup, { name }));
      }, WAVE_MS);
    };
  }

  function forget(account: SavedAccount, next?: SavedAccount) {
    forgetAccount(account.email);
    const remaining = savedAccounts();
    setAccounts(remaining);
    setAnnouncement(fill(t.forgotten, account));
    if (remaining.length === 0) {
      setView("form");
      return;
    }
    requestAnimationFrame(() =>
      formPanelRef.current
        ?.querySelector<HTMLElement>(
          `.auth-tile-main[data-email="${CSS.escape(next?.email ?? remaining[0]!.email)}"]`,
        )
        ?.focus(),
    );
  }

  function openDashboard() {
    if (opening) return;
    setOpening(true);
    stopGreeting();
    setLine({ id: Date.now(), text: t.letsGo, wave: true });
    // As in the design: the parent dashboard (P01), which opens "Add a child" when the family has
    // none. The profile picker (G08) stays the way into child mode.
    window.setTimeout(() => void navigate(`/${locale}/dashboard`), 550);
  }

  const otherLocale = LOCALES.find((candidate) => candidate !== locale) ?? locale;
  const isSignup = group === "signup";
  const passwordHandlers = { onPasswordFocus: coverEyes, onPasswordBlur: uncoverEyes };

  let panel: ReactNode;
  if (view === "success" && success) {
    panel = (
      <ViewFrame
        title={fill(success.kind === "login" ? t.successLogin : t.successSignup, {
          // Isolated, so an Arabic name in an English sentence (or the reverse) keeps the
          // punctuation around it in place.
          name: `\u2068${success.name}\u2069`,
        })}
        sub={t.successBody}
        titleFocus
        badge={
          <span className="auth-badge" aria-hidden="true">
            <PartyIcon />
          </span>
        }
      >
        <Button fullWidth loading={opening} onClick={openDashboard}>
          {opening ? t.opening : t.continue}
        </Button>
      </ViewFrame>
    );
  } else if (view === "signup") {
    panel = (
      <ViewFrame title={t.signupTitle} sub={t.signupSub}>
        <SignupForm t={t} onSignedIn={handleSignedIn("signup", true)} {...passwordHandlers} />
      </ViewFrame>
    );
  } else if (view === "accounts" && accounts.length > 0) {
    panel = (
      <ViewFrame title={t.loginTitle} sub={t.chooseAccount}>
        <AccountList
          t={t}
          accounts={accounts}
          onPick={(account) => {
            setSelected(account);
            setView("password");
          }}
          onForget={forget}
          onUseAnother={() => {
            setSelected(undefined);
            setView("form");
          }}
        />
      </ViewFrame>
    );
  } else {
    const account = view === "password" ? selected : undefined;
    panel = (
      <ViewFrame title={t.loginTitle}>
        <LoginForm
          key={account?.email ?? "email"}
          t={t}
          account={account}
          hasSavedAccounts={accounts.length > 0}
          remember={remember}
          onRememberChange={changeRemember}
          onChangeAccount={() => setView("accounts")}
          onSignedIn={handleSignedIn("login", remember)}
          {...passwordHandlers}
        />
      </ViewFrame>
    );
  }

  return (
    <div className="auth-page" data-theme="dark">
      <PageTitle title={isSignup ? t.signupTitle : t.loginTitle} />
      <NightSky />
      <header className="auth-top">
        {/* The logo goes home (the landing page), as on every page. */}
        <Link to={`/${locale}`} className="auth-logo-link">
          <img
            className="auth-logo"
            src={locale === "ar" ? logoArUrl : logoEnUrl}
            alt={dict.meta.title}
            width={locale === "ar" ? 141 : 163}
            height={32}
          />
        </Link>
        <div className="auth-top-actions">
          <button
            type="button"
            className="auth-pill auth-pill-icon"
            aria-pressed={muted}
            aria-label={muted ? t.unmute : t.mute}
            onClick={toggleMuted}
          >
            {muted ? <VolumeOffIcon /> : <VolumeIcon />}
          </button>
          <Link
            to={localizedPath(pathname, otherLocale) + search}
            hrefLang={otherLocale}
            aria-label={t.langAria}
            className="auth-pill"
            // Same page in the other language: stay where the visitor is.
            preventScrollReset
            onClick={() => rememberLocale(otherLocale)}
          >
            <GlobeIcon />
            <span lang={otherLocale}>{LOCALE_NAMES[otherLocale]}</span>
          </Link>
        </div>
      </header>

      <main className="auth-stage">
        <h1 className="sr-only">{t.heading}</h1>
        <section className="auth-card" data-side={isSignup ? "b" : "a"}>
          <div ref={welcomeRef} className="auth-panel auth-panel-welcome">
            <div className="auth-welcome">
              <div className="auth-welcome-text">
                <p className="auth-welcome-title">
                  {isSignup ? t.welcomeSignupTitle : t.welcomeLoginTitle}
                </p>
                <p className="auth-welcome-body">
                  {isSignup ? t.welcomeSignupBody : t.welcomeLoginBody}
                </p>
              </div>
              <GuideScene pose={pose} line={line} />
            </div>
          </div>
          <div ref={formPanelRef} className="auth-panel auth-panel-form">
            <div key={view} className="auth-content">
              {panel}
              {view !== "success" && (
                <p className="auth-foot">
                  <span>{isSignup ? t.haveAccount : t.noAccount}</span>
                  <Link className="auth-link" to={`/${locale}/${isSignup ? "sign-in" : "sign-up"}`}>
                    {isSignup ? t.loginLink : t.signupLink}
                  </Link>
                </p>
              )}
            </div>
          </div>
        </section>
      </main>

      <div ref={fxRef} className="auth-fx" aria-hidden="true" />
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </div>
  );
}
