import { AlertBanner, Button, SelectField, TextField } from "@tibyan/ui";
import { type FormEvent, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Link, useNavigate, useRevalidator } from "react-router";
import { PageTitle } from "@/components/page-title";
import { fill } from "@/features/auth/auth-rules";
import { dateOfBirthRange } from "@/features/children/child-form";
import {
  addInterest,
  childAge,
  type ChildFormErrors,
  type ChildFormValues,
  EMPTY_CHILD_FORM,
  toNewChild,
  validateChildForm,
} from "@/features/children/child-profile";
import { createChild, type HomeLanguage } from "@/features/children/children-api";
import { ArrowBackIcon } from "@/features/dashboard/dashboard-icons";
import { InterestPicker } from "@/features/dashboard/interest-picker";
import { plural } from "@/i18n/format";
import { useI18n } from "@/i18n/locale-data";
import { getSession } from "@/lib/session/session-store";
import { useDashboard } from "./dashboard-context";

// Add Child (Figma "Parent Dashboard", section 6; O01): name, date of birth with the age worked
// out, home language and interests, sent to POST /api/v1/children. Children need no email or phone
// number (privacy rules). The design has no PIN field; its nickname and profile picture permission
// come with their APIs.

const FOCUS_RING =
  "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus";

export function Component() {
  const { dict, locale } = useI18n();
  const t = dict.addChild;
  const { kids, selectChild } = useDashboard();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [values, setValues] = useState<ChildFormValues>(EMPTY_CHILD_FORM);
  const [errors, setErrors] = useState<ChildFormErrors>({});
  const [state, setState] = useState<"idle" | "saving" | "failed">("idle");
  const form = useRef<HTMLFormElement>(null);
  const today = new Date();
  const range = dateOfBirthRange(today);
  const age = childAge(values.dateOfBirth, today);

  const errorText = (field: keyof ChildFormValues) => {
    const error = errors[field];
    return error && t.errors[error];
  };

  /** A changed field drops its old message; the whole form is checked again on submit. */
  function change<K extends keyof ChildFormValues>(field: K, value: ChildFormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function addTyped(typed: string): string | undefined {
    const result = addInterest(values.interests, typed);
    if ("error" in result) return t.errors[result.error];
    change("interests", result.interests);
    return undefined;
  }

  function remove(interest: string) {
    change(
      "interests",
      values.interests.filter((item) => item !== interest),
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const found = validateChildForm(values, new Date());
    // Drawn at once, so the first field with a problem can take focus and its message is read out.
    flushSync(() => setErrors(found));
    if (Object.keys(found).length > 0) {
      form.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus();
      return;
    }

    const session = getSession();
    if (session.status !== "signed-in") return;
    setState("saving");
    const result = await createChild(session.token, toNewChild(values));
    if (!result.ok) return setState("failed");

    // The new child joins the sidebar, chosen, and the dashboard opens on them.
    await revalidator.revalidate();
    selectChild(result.data.id);
    void navigate(`/${locale}/dashboard`);
  }

  return (
    <>
      <PageTitle title={dict.screens.addChild} />
      {/* A family's first child is added before there is a dashboard to go back to. */}
      {kids.length > 0 && (
        <Link
          to={`/${locale}/dashboard`}
          className={`inline-flex items-center gap-2 self-start rounded-control leading-6 font-bold text-link underline decoration-2 underline-offset-4 ${FOCUS_RING}`}
        >
          <ArrowBackIcon />
          {dict.dashboard.back}
        </Link>
      )}
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl leading-10 font-bold text-ink">{dict.screens.addChild}</h1>
        <p className="text-ink-muted">{t.intro}</p>
      </header>

      <form
        ref={form}
        noValidate
        aria-labelledby="child-details"
        onSubmit={(event) => void submit(event)}
        className="flex flex-col gap-6 rounded-button border border-line bg-surface p-6"
      >
        <h2 id="child-details" className="text-xl leading-7 font-bold text-ink">
          {t.details}
        </h2>
        {state === "failed" && <AlertBanner tone="danger">{t.saveFailed}</AlertBanner>}

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="child-name"
            label={t.nameLabel}
            hint={t.nameHint}
            error={errorText("name")}
            required
            autoComplete="off"
            value={values.name}
            onChange={(event) => change("name", event.target.value)}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="child-birth"
            type="date"
            dir="ltr"
            label={t.dateOfBirthLabel}
            hint={t.dateOfBirthHint}
            error={errorText("dateOfBirth")}
            required
            min={range.min}
            max={range.max}
            value={values.dateOfBirth}
            onChange={(event) => change("dateOfBirth", event.target.value)}
          />
          {/* Worked out from the date of birth; the parent does not type it. */}
          <TextField
            id="child-age"
            label={t.ageLabel}
            hint={t.ageHint}
            readOnly
            value={age === undefined ? "" : plural(locale, age, t.ageValue)}
            className="bg-surface-muted text-ink-muted"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            id="child-language"
            label={t.homeLanguageLabel}
            hint={t.homeLanguageHint}
            value={values.homeLanguage}
            options={(["ar", "en"] as const).map((value) => ({ value, label: t.languages[value] }))}
            onChange={(event) => change("homeLanguage", event.target.value as HomeLanguage)}
          />
        </div>

        <InterestPicker
          value={values.interests}
          suggestions={t.interests.suggested}
          error={errorText("interests")}
          onAdd={addTyped}
          onRemove={remove}
          text={{
            ...t.interests,
            add: (name) => fill(t.interests.add, { name }),
            remove: (name) => fill(t.interests.remove, { name }),
          }}
        />

        <hr className="border-line" />
        <div className="flex justify-end">
          <Button type="submit" loading={state === "saving"}>
            {t.submit}
          </Button>
        </div>
      </form>
    </>
  );
}
