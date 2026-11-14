import { AlertBanner, Button, Card, TextField } from "@noor/ui";
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router";
import { PageTitle } from "@/components/page-title";
import {
  CHILD_PIN_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
  EMPTY_CHILD_FORM,
  dateOfBirthRange,
  validateChildForm,
  type ChildFormErrors,
  type ChildFormValues,
} from "@/features/children/child-form";
import { createChild, setChildPin, type ChildProfile } from "@/features/children/children-api";
import { useI18n } from "@/i18n/locale-data";
import { getSession, setActiveChild } from "@/lib/session/session-store";

// O01 — add a child (FR-AUTH-002). A name or nickname, the date of birth the API needs, and a PIN
// only: no email or phone number for children (UI spec, privacy rules).

type SaveFailure = "saveFailed" | "pinFailed";

export function Component() {
  const { dict, locale } = useI18n();
  const navigate = useNavigate();
  const [values, setValues] = useState<ChildFormValues>(EMPTY_CHILD_FORM);
  const [errors, setErrors] = useState<ChildFormErrors>({});
  const [failure, setFailure] = useState<SaveFailure>();
  const [isSaving, setIsSaving] = useState(false);
  // Set once the child exists, so a failed PIN step retries the PIN only.
  const [created, setCreated] = useState<ChildProfile>();
  const [isDone, setIsDone] = useState(false);
  const today = new Date();

  function update(field: keyof ChildFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function save(token: string) {
    let child = created;
    if (!child) {
      const result = await createChild(token, {
        name: values.displayName.trim(),
        dateOfBirth: values.dateOfBirth,
      });
      if (!result.ok) {
        setFailure("saveFailed");
        return;
      }
      child = result.data;
      setCreated(child);
    }
    const pinResult = await setChildPin(token, child.id, values.pin);
    if (!pinResult.ok) {
      setFailure("pinFailed");
      return;
    }
    setIsDone(true);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const session = getSession();
    const found = validateChildForm(values, today);
    setErrors(found);
    setFailure(undefined);
    if (Object.keys(found).length > 0 || session.status !== "signed-in") return;
    setIsSaving(true);
    await save(session.token);
    setIsSaving(false);
  }

  function handleAddAnother() {
    setValues(EMPTY_CHILD_FORM);
    setErrors({});
    setCreated(undefined);
    setIsDone(false);
  }

  function handleContinue() {
    if (!created) return;
    // The parent has just set this child's PIN, so the child's home opens as this child.
    setActiveChild({ id: created.id, displayName: created.displayName });
    void navigate(`/${locale}/today`);
  }

  const errorText = (field: keyof ChildFormValues) => {
    const error = errors[field];
    return error && dict.addChild.errors[error];
  };

  const birthRange = dateOfBirthRange(today);

  return (
    <>
      <PageTitle title={dict.screens.addChild} />
      <h1 className="text-2xl font-bold">{dict.screens.addChild}</h1>
      {isDone ? (
        <Card
          role="status"
          title={dict.addChild.savedTitle}
          className="max-w-md"
          actions={
            <>
              <Button onClick={handleContinue}>{dict.addChild.continue}</Button>
              <Button variant="secondary" onClick={handleAddAnother}>
                {dict.addChild.addAnother}
              </Button>
            </>
          }
        >
          <p>{dict.addChild.savedBody}</p>
        </Card>
      ) : (
        <form
          noValidate
          onSubmit={(event) => void handleSubmit(event)}
          className="flex max-w-md flex-col gap-4"
        >
          <p className="text-ink-muted">{dict.addChild.intro}</p>
          {failure && <AlertBanner tone="danger">{dict.addChild[failure]}</AlertBanner>}
          <TextField
            id="child-name"
            label={dict.addChild.nameLabel}
            hint={dict.addChild.nameHint}
            error={errorText("displayName")}
            required
            autoComplete="off"
            maxLength={DISPLAY_NAME_MAX_LENGTH}
            disabled={created !== undefined}
            value={values.displayName}
            onChange={(event) => update("displayName", event.target.value)}
          />
          <TextField
            id="child-date-of-birth"
            type="date"
            label={dict.addChild.dateOfBirthLabel}
            error={errorText("dateOfBirth")}
            required
            min={birthRange.min}
            max={birthRange.max}
            disabled={created !== undefined}
            value={values.dateOfBirth}
            onChange={(event) => update("dateOfBirth", event.target.value)}
          />
          <TextField
            id="child-pin"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            dir="ltr"
            label={dict.addChild.pinLabel}
            hint={dict.addChild.pinHint}
            error={errorText("pin")}
            required
            maxLength={CHILD_PIN_LENGTH}
            value={values.pin}
            onChange={(event) => update("pin", event.target.value)}
          />
          <TextField
            id="child-pin-confirm"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            dir="ltr"
            label={dict.addChild.pinConfirmLabel}
            error={errorText("pinConfirm")}
            required
            maxLength={CHILD_PIN_LENGTH}
            value={values.pinConfirm}
            onChange={(event) => update("pinConfirm", event.target.value)}
          />
          <Button type="submit" loading={isSaving} className="self-start">
            {dict.addChild.submit}
          </Button>
        </form>
      )}
    </>
  );
}
