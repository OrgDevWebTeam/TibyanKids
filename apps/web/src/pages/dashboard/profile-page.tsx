import { AlertBanner, Button, SelectField, TextField } from "@tibyan/ui";
import { type FormEvent, type ReactNode, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Link, useRevalidator } from "react-router";
import { PageTitle } from "@/components/page-title";
import { fill } from "@/features/auth/auth-rules";
import { dateOfBirthRange, parseDate } from "@/features/children/child-form";
import {
  type ChildDetails,
  type HomeLanguage,
  updateChild,
} from "@/features/children/children-api";
import { ArrowBackIcon, PencilIcon, SparklesIcon } from "@/features/dashboard/dashboard-icons";
import { InterestPicker } from "@/features/dashboard/interest-picker";
import {
  addInterest,
  BAND_KEYS,
  childAge,
  childChanges,
  type ChildFormErrors,
  type ChildFormValues,
  toChildForm,
  validateChildForm,
} from "@/features/children/child-profile";
import { Avatar } from "@/features/dashboard/parent-frame";
import { formatDate, plural } from "@/i18n/format";
import { useI18n } from "@/i18n/locale-data";
import { getSession } from "@/lib/session/session-store";
import { useSelectedChild } from "./dashboard-context";

// Child Profile (Figma "Parent Dashboard", section 7): the child's details, which the parent can
// change (PATCH /api/v1/children/:id). The sign-in QR code, child PIN, profile picture, nickname
// and "Delete profile" come with their APIs.

const CARD = "rounded-button border border-line bg-surface p-6";
const FOCUS_RING =
  "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus";

export function Component() {
  const child = useSelectedChild();
  return <Profile key={child.id} child={child} />;
}

function Profile({ child }: { child: ChildDetails }) {
  const { dict, locale } = useI18n();
  const t = dict.dashboard;
  const p = t.profile;
  const revalidator = useRevalidator();
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);

  const age = childAge(child.dateOfBirth, new Date());
  const band = child.ageBand && dict.landing.preview[BAND_KEYS[child.ageBand]].name;
  const born = parseDate(child.dateOfBirth);

  function startEditing() {
    setSaved(false);
    setEditing(true);
  }

  function stopEditing(didSave: boolean) {
    setEditing(false);
    setSaved(didSave);
    // The sidebar and the header show the new name too.
    if (didSave) void revalidator.revalidate();
    // Back to where the parent was: the heading after saving, the edit button after cancelling.
    requestAnimationFrame(() => (didSave ? heading.current : editButton.current)?.focus());
  }

  return (
    <>
      <PageTitle title={dict.screens.childProfile} />
      <Link
        to={`/${locale}/dashboard`}
        className={`inline-flex items-center gap-2 self-start rounded-control leading-6 font-bold text-link underline decoration-2 underline-offset-4 ${FOCUS_RING}`}
      >
        <ArrowBackIcon />
        {t.back}
      </Link>

      <header className={`flex flex-wrap items-center gap-4 ${CARD}`}>
        <Avatar name={child.name} size="profile" />
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-3xl leading-10 font-bold text-ink">
            <bdi>{child.name}</bdi>
          </h1>
          {age !== undefined && <p className="text-ink-muted">{plural(locale, age, t.age)}</p>}
          {band && (
            <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-secondary px-3 py-1 text-caption font-bold text-on-secondary">
              <SparklesIcon className="size-4" />
              {band}
            </span>
          )}
        </div>
      </header>

      <section aria-labelledby="profile-info" className={`flex flex-col gap-5 ${CARD} max-w-3xl`}>
        <div className="flex items-center justify-between gap-3">
          <h2
            id="profile-info"
            ref={heading}
            tabIndex={-1}
            className="text-xl leading-7 font-bold text-ink focus:outline-none"
          >
            {p.info}
          </h2>
          {!editing && (
            <button
              ref={editButton}
              type="button"
              aria-label={p.edit}
              onClick={startEditing}
              className={`grid size-11 place-items-center rounded-control text-link hover:bg-surface-muted ${FOCUS_RING}`}
            >
              <PencilIcon />
            </button>
          )}
        </div>

        {/* Always there, so screen readers announce the message; empty, it takes no space. */}
        <div role="status" className="empty:-mt-5">
          {saved && <AlertBanner tone="success">{p.saved}</AlertBanner>}
        </div>

        {editing ? (
          <ProfileForm child={child} onDone={stopEditing} />
        ) : (
          <dl className="flex flex-col gap-4">
            <Detail label={p.name}>
              <bdi>{child.name}</bdi>
            </Detail>
            <Detail label={p.dateOfBirth}>
              {born ? formatDate(locale, born, { dateStyle: "long", timeZone: "UTC" }) : ""}
            </Detail>
            <Detail label={p.age}>{age === undefined ? "" : plural(locale, age, p.years)}</Detail>
            <Detail label={p.homeLanguage}>{dict.addChild.languages[child.homeLanguage]}</Detail>
            <Detail label={p.interests}>
              {child.interests.length === 0 ? (
                <span className="font-normal text-ink-muted">{p.noInterests}</span>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {child.interests.map((interest, index) => (
                    <li
                      key={`${index}-${interest}`}
                      dir="auto"
                      className="rounded-full bg-secondary px-3 py-1 text-caption font-bold text-on-secondary"
                    >
                      {interest}
                    </li>
                  ))}
                </ul>
              )}
            </Detail>
          </dl>
        )}
      </section>
    </>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-caption text-ink-muted">{label}</dt>
      <dd className="leading-6 font-bold text-ink">{children}</dd>
    </div>
  );
}

type FormProps = { child: ChildDetails; onDone: (didSave: boolean) => void };

/** The same fields as Add Child, filled with the saved details; only changed fields are sent. */
function ProfileForm({ child, onDone }: FormProps) {
  const { dict } = useI18n();
  const t = dict.addChild;
  const p = dict.dashboard.profile;
  const [values, setValues] = useState<ChildFormValues>(() => toChildForm(child));
  const [errors, setErrors] = useState<ChildFormErrors>({});
  const [state, setState] = useState<"idle" | "saving" | "failed">("idle");
  const form = useRef<HTMLFormElement>(null);
  const range = dateOfBirthRange(new Date());

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

  async function submit(event: FormEvent) {
    event.preventDefault();
    const found = validateChildForm(values, new Date());
    // Drawn at once, so the first field with a problem can take focus and its message is read out.
    flushSync(() => setErrors(found));
    if (Object.keys(found).length > 0) {
      form.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus();
      return;
    }

    const changes = childChanges(child, values);
    if (Object.keys(changes).length === 0) return onDone(false);

    const session = getSession();
    if (session.status !== "signed-in") return;
    setState("saving");
    const result = await updateChild(session.token, child.id, changes);
    if (!result.ok) return setState("failed");
    onDone(true);
  }

  return (
    <form
      ref={form}
      noValidate
      onSubmit={(event) => void submit(event)}
      className="flex flex-col gap-5"
    >
      {state === "failed" && <AlertBanner tone="danger">{t.saveFailed}</AlertBanner>}
      <TextField
        id="profile-name"
        label={t.nameLabel}
        hint={t.nameHint}
        required
        autoComplete="off"
        value={values.name}
        error={errorText("name")}
        onChange={(event) => change("name", event.target.value)}
      />
      <TextField
        id="profile-birth"
        label={t.dateOfBirthLabel}
        hint={t.dateOfBirthHint}
        type="date"
        dir="ltr"
        required
        min={range.min}
        max={range.max}
        value={values.dateOfBirth}
        error={errorText("dateOfBirth")}
        onChange={(event) => change("dateOfBirth", event.target.value)}
      />
      <SelectField
        id="profile-language"
        label={t.homeLanguageLabel}
        hint={t.homeLanguageHint}
        value={values.homeLanguage}
        options={(["ar", "en"] as const).map((value) => ({ value, label: t.languages[value] }))}
        onChange={(event) => change("homeLanguage", event.target.value as HomeLanguage)}
      />
      <InterestPicker
        value={values.interests}
        suggestions={t.interests.suggested}
        error={errorText("interests")}
        onAdd={addTyped}
        onRemove={(interest) =>
          change(
            "interests",
            values.interests.filter((item) => item !== interest),
          )
        }
        text={{
          ...t.interests,
          add: (name) => fill(t.interests.add, { name }),
          remove: (name) => fill(t.interests.remove, { name }),
        }}
      />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={state === "saving"}>
          {state === "saving" ? p.saving : p.save}
        </Button>
        <Button variant="ghost" onClick={() => onDone(false)} disabled={state === "saving"}>
          {p.cancel}
        </Button>
      </div>
    </form>
  );
}
