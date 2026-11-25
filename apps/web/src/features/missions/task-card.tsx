import { AlertBanner, Button, StatusBadge } from "@tibyan/ui";
import { type ReactNode, useId, useRef, useState } from "react";
import { type Locale } from "@/i18n/config";
import { formatTemplate } from "@/i18n/format";
import { type Dictionary } from "@/i18n/locale-data";
import {
  type FamilyMission,
  NOTE_MAX_LENGTH,
  type Observation,
  OBSERVATIONS,
} from "./missions-api";

// PD/Family task card from the design (Figma "Parent Dashboard", Family Tasks): the task, and the
// parent's observation (P03): "How did it go?" with three one-tap choices and an optional note.

type Text = Dictionary["familyTasks"];

function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="size-4 shrink-0"
    >
      {children}
    </svg>
  );
}

const ClockGlyph = () => (
  <Glyph>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </Glyph>
);

const SparklesGlyph = () => (
  <Glyph>
    <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
  </Glyph>
);

const BellGlyph = () => (
  <Glyph>
    <path d="M10.268 21a2 2 0 0 0 3.464 0" />
    <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
  </Glyph>
);

const PencilGlyph = () => (
  <Glyph>
    <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
  </Glyph>
);

const CHOICE_GLYPHS: Record<Observation, () => ReactNode> = {
  independent: SparklesGlyph,
  reminder: BellGlyph,
  not_observed: ClockGlyph,
};

const STATUS_TONES = { pending: "info", completed: "success", expired: "neutral" } as const;

/** One answer of "How did it go?", as a pill; a radio button underneath, for keyboards. */
function Choice({
  name,
  value,
  label,
  checked,
  disabled,
  onChange,
}: {
  name: string;
  value: Observation;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (value: Observation) => void;
}) {
  const Icon = CHOICE_GLYPHS[value];
  return (
    <label className="relative inline-flex">
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange?.(value)}
        className="peer sr-only"
      />
      <span
        className={[
          "inline-flex min-h-11 items-center gap-2 rounded-full border-2 px-4 leading-6 font-bold",
          "transition-colors peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2",
          "peer-focus-visible:outline-focus",
          checked
            ? "border-primary bg-secondary text-on-secondary"
            : "border-line bg-surface text-ink",
          disabled ? "" : "cursor-pointer hover:border-control-hover",
        ].join(" ")}
      >
        <Icon />
        {label}
      </span>
    </label>
  );
}

type TaskCardProps = {
  t: Text;
  locale: Locale;
  mission: FamilyMission;
  /** Saves the observation; resolves to whether it was saved. */
  onObserve: (
    mission: FamilyMission,
    answer: { status: Observation; note?: string; clientObservationId: string },
  ) => Promise<boolean>;
  /** The title's heading level, so the page outline stays correct (h3 by default). */
  headingLevel?: 3 | 4;
};

/** A family task with its status, and the parent's observation while it is open. */
export function TaskCard({ t, locale, mission, onObserve, headingLevel = 3 }: TaskCardProps) {
  const id = useId();
  const Heading = `h${headingLevel}` as const;
  const [choice, setChoice] = useState<Observation | undefined>(mission.observation?.status);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "failed" | "missing">("idle");
  // One id per answer, kept across retries, so a repeated request saves only once.
  const answerId = useRef<string>(undefined);
  const isOpen = mission.status === "pending";
  const noteTooLong = note.trim().length > NOTE_MAX_LENGTH;

  async function confirm() {
    if (state === "saving") return;
    if (!choice) {
      setState("missing");
      return;
    }
    if (noteTooLong) return;
    answerId.current ??= crypto.randomUUID();
    setState("saving");
    const saved = await onObserve(mission, {
      status: choice,
      note: note.trim() || undefined,
      clientObservationId: answerId.current,
    });
    setState(saved ? "idle" : "failed");
  }

  return (
    <article
      aria-labelledby={`${id}-title`}
      className={[
        "flex flex-col gap-4 rounded-button border-2 bg-surface p-5",
        isOpen ? "border-primary" : "border-line",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        {mission.estimatedMinutes ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-3 py-1 text-caption font-bold text-ink-muted">
            <ClockGlyph />
            {formatTemplate(locale, t.minutes, { minutes: mission.estimatedMinutes })}
          </span>
        ) : (
          <span />
        )}
        <StatusBadge tone={STATUS_TONES[mission.status]}>{t.status[mission.status]}</StatusBadge>
      </div>

      {/* The task's own words may be in another language than the page, so they keep theirs. */}
      <Heading
        id={`${id}-title`}
        dir="auto"
        className="text-start text-lg leading-7 font-bold text-ink"
      >
        {mission.title}
      </Heading>
      {mission.description && (
        <p dir="auto" className="rounded-control bg-background px-4 py-3 text-start text-ink-muted">
          {mission.description}
        </p>
      )}

      {mission.status === "expired" && !mission.observation ? (
        <p className="text-ink-muted">{t.endedBody}</p>
      ) : (
        <fieldset className="flex flex-col gap-3">
          {/* Floated, so the legend lays out like any row: the question, and the hint across. */}
          <legend className="float-start flex w-full items-center justify-between gap-2">
            <span className="leading-6 font-bold text-ink">{t.howDidItGo}</span>
            {isOpen && <span className="text-caption text-ink-muted">{t.oneTap}</span>}
          </legend>
          <div className="clear-both flex flex-wrap gap-2">
            {OBSERVATIONS.map((value) => (
              <Choice
                key={value}
                name={`${id}-observation`}
                value={value}
                label={t.choices[value]}
                checked={choice === value}
                disabled={!isOpen || state === "saving"}
                onChange={(next) => {
                  setChoice(next);
                  if (state === "missing") setState("idle");
                }}
              />
            ))}
          </div>
          {state === "missing" && (
            <p role="alert" className="text-caption font-medium text-danger">
              {t.chooseFirst}
            </p>
          )}
        </fieldset>
      )}

      {!isOpen && mission.observation?.note && (
        <div className="flex flex-col gap-1">
          <span className="text-caption font-bold text-ink-muted">{t.yourNote}</span>
          <p className="text-ink">{mission.observation.note}</p>
        </div>
      )}

      {isOpen && (
        <>
          {noteOpen ? (
            <div className="flex flex-col gap-2">
              <label htmlFor={`${id}-note`} className="leading-6 font-bold text-ink">
                {t.noteLabel}
              </label>
              <textarea
                id={`${id}-note`}
                value={note}
                rows={3}
                dir="auto"
                placeholder={t.notePlaceholder}
                aria-invalid={noteTooLong || undefined}
                aria-describedby={noteTooLong ? `${id}-note-error` : undefined}
                onChange={(event) => setNote(event.target.value)}
                className="rounded-control border-2 border-control bg-surface px-4 py-3 leading-6 font-medium text-ink placeholder:text-ink-muted focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus aria-[invalid=true]:border-danger"
              />
              {noteTooLong && (
                <p id={`${id}-note-error`} className="text-caption font-medium text-danger">
                  {t.noteTooLong}
                </p>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setNoteOpen(true)}
              className="inline-flex min-h-11 items-center gap-2 self-start leading-6 font-bold text-link underline decoration-2 underline-offset-2"
            >
              <PencilGlyph />
              {t.addNote}
            </button>
          )}
          {state === "failed" && <AlertBanner tone="danger">{t.saveFailed}</AlertBanner>}
          <Button
            className="self-start"
            loading={state === "saving"}
            onClick={() => void confirm()}
          >
            {state === "saving" ? t.saving : t.confirm}
          </Button>
        </>
      )}
    </article>
  );
}
