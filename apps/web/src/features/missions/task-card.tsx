import { AlertBanner, Button } from "@tibyan/ui";
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

// The design's family task (Figma "Parent Dashboard"): PD/Family task card on Family Tasks, and
// the shorter rows of Today's tasks and Pending observations on the dashboard home. Both carry
// PD/Observation (P03): "How did it go?" with three one-tap answers and an optional note.

type Text = Dictionary["familyTasks"];

function Glyph({ children, className = "size-4" }: { children: ReactNode; className?: string }) {
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
      className={`shrink-0 ${className}`}
    >
      {children}
    </svg>
  );
}

type GlyphProps = { className?: string };

const ClockGlyph = ({ className }: GlyphProps) => (
  <Glyph className={className}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </Glyph>
);

const SparklesGlyph = ({ className }: GlyphProps) => (
  <Glyph className={className}>
    <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
  </Glyph>
);

const BellGlyph = ({ className }: GlyphProps) => (
  <Glyph className={className}>
    <path d="M10.268 21a2 2 0 0 0 3.464 0" />
    <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
  </Glyph>
);

const PencilGlyph = ({ className }: GlyphProps) => (
  <Glyph className={className}>
    <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
  </Glyph>
);

const ZapGlyph = ({ className }: GlyphProps) => (
  <Glyph className={className}>
    <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
  </Glyph>
);

const CheckGlyph = ({ className }: GlyphProps) => (
  <Glyph className={className}>
    <path d="M20 6 9 17l-5-5" />
  </Glyph>
);

const CircleCheckGlyph = ({ className }: GlyphProps) => (
  <Glyph className={className}>
    <circle cx="12" cy="12" r="10" />
    <path d="m9 12 2 2 4-4" />
  </Glyph>
);

const CHOICE_GLYPHS: Record<Observation, (props: GlyphProps) => ReactNode> = {
  independent: SparklesGlyph,
  reminder: BellGlyph,
  not_observed: ClockGlyph,
};

// Tag text: Badge, 14/14 ExtraBold.
const CHIP =
  "inline-flex items-center gap-1 rounded-full px-3 py-1 text-caption leading-none font-extrabold";

/** The status tag: Open now (zap), Done (check, success) or Ended. */
function StatusChip({
  t,
  status,
  short,
}: {
  t: Text;
  status: FamilyMission["status"];
  short?: boolean;
}) {
  if (status === "pending") {
    return (
      <span className={`${CHIP} bg-secondary text-on-secondary`}>
        {!short && <ZapGlyph />}
        {short ? t.now : t.status.pending}
      </span>
    );
  }
  if (status === "completed") {
    return (
      <span className={`${CHIP} bg-success-tint text-success`}>
        <CheckGlyph />
        {t.status.completed}
      </span>
    );
  }
  return <span className={`${CHIP} bg-surface-muted text-ink-muted`}>{t.status.expired}</span>;
}

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
      {/* Option: 44px, 1px border/default; chosen, the selected border and a check. */}
      <span
        className={[
          "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 leading-6 font-bold",
          "transition-colors peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2",
          "peer-focus-visible:outline-focus",
          checked
            ? "border-primary bg-secondary text-on-secondary ring-1 ring-primary"
            : "border-[var(--tibyan-border)] bg-surface text-ink",
          disabled ? "" : "cursor-pointer hover:border-control-hover",
        ].join(" ")}
      >
        <Icon className={`size-5 ${checked ? "" : "text-ink-muted"}`} />
        {label}
        {checked && <CheckGlyph />}
      </span>
    </label>
  );
}

type Answer = { status: Observation; note?: string; clientObservationId: string };

type ObserveProps = {
  t: Text;
  mission: FamilyMission;
  /** Saves the observation; resolves to whether it was saved. */
  onObserve: (mission: FamilyMission, answer: Answer) => Promise<boolean>;
};

/** The answer being given, its note and saving, shared by the card and the row. */
function useObservation({ mission, onObserve }: Omit<ObserveProps, "t">) {
  const [choice, setChoice] = useState<Observation | undefined>(mission.observation?.status);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "failed" | "missing">("idle");
  // One id per answer, kept across retries, so a repeated request saves only once.
  const answerId = useRef<string>(undefined);
  const noteTooLong = note.trim().length > NOTE_MAX_LENGTH;

  async function save(status: Observation | undefined) {
    if (state === "saving") return;
    if (!status) return setState("missing");
    if (noteTooLong) return;
    answerId.current ??= crypto.randomUUID();
    setState("saving");
    const saved = await onObserve(mission, {
      status,
      note: note.trim() || undefined,
      clientObservationId: answerId.current,
    });
    setState(saved ? "idle" : "failed");
  }

  return {
    choice,
    setChoice,
    noteOpen,
    setNoteOpen,
    note,
    setNote,
    state,
    setState,
    noteTooLong,
    save,
  };
}

type ObservationFieldsProps = {
  t: Text;
  id: string;
  isOpen: boolean;
  observation: ReturnType<typeof useObservation>;
  /** One tap saves (the dashboard's rows); otherwise "Confirm mission" does. */
  saveOnTap?: boolean;
};

function ObservationFields({ t, id, isOpen, observation: o, saveOnTap }: ObservationFieldsProps) {
  return (
    <>
      <fieldset className="flex flex-col gap-2">
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
              checked={o.choice === value}
              disabled={!isOpen || o.state === "saving"}
              onChange={(next) => {
                o.setChoice(next);
                if (saveOnTap) void o.save(next);
                else if (o.state === "missing") o.setState("idle");
              }}
            />
          ))}
        </div>
        {o.state === "missing" && (
          <p role="alert" className="text-caption font-medium text-danger">
            {t.chooseFirst}
          </p>
        )}
      </fieldset>

      {isOpen &&
        (o.noteOpen ? (
          <div className="flex flex-col gap-2">
            <label htmlFor={`${id}-note`} className="leading-6 font-bold text-ink">
              {t.noteLabel}
            </label>
            <textarea
              id={`${id}-note`}
              value={o.note}
              rows={3}
              dir="auto"
              placeholder={t.notePlaceholder}
              aria-invalid={o.noteTooLong || undefined}
              aria-describedby={o.noteTooLong ? `${id}-note-error` : undefined}
              onChange={(event) => o.setNote(event.target.value)}
              className="rounded-control border-2 border-control bg-surface px-4 py-3 leading-6 font-medium text-ink placeholder:text-ink-muted focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus aria-[invalid=true]:border-danger"
            />
            {o.noteTooLong && (
              <p id={`${id}-note-error`} className="text-caption font-medium text-danger">
                {t.noteTooLong}
              </p>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => o.setNoteOpen(true)}
            className="inline-flex min-h-8 items-center gap-2 self-start rounded-control leading-6 font-bold text-link underline decoration-2 underline-offset-[3px] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <PencilGlyph />
            {t.addNote}
          </button>
        ))}

      {o.state === "failed" && <AlertBanner tone="danger">{t.saveFailed}</AlertBanner>}
    </>
  );
}

type TaskCardProps = ObserveProps & {
  locale: Locale;
  /** The title's heading level, so the page outline stays correct (h3 by default). */
  headingLevel?: 3 | 4;
};

/** PD/Family task card: the time chip, status, title, the parent tip and the observation. */
export function TaskCard({ t, locale, mission, onObserve, headingLevel = 3 }: TaskCardProps) {
  const id = useId();
  const Heading = `h${headingLevel}` as const;
  const observation = useObservation({ mission, onObserve });
  const isOpen = mission.status === "pending";

  return (
    <article
      aria-labelledby={`${id}-title`}
      className={[
        "flex flex-col gap-4 rounded-button bg-surface p-6",
        // Open: border/selected and Elevation/2; otherwise border/subtle and Elevation/1.
        isOpen
          ? "border-2 border-primary shadow-[0_4px_12px_-2px_color-mix(in_srgb,var(--tibyan-shadow)_10%,transparent)]"
          : "border border-line shadow-[0_1px_3px_color-mix(in_srgb,var(--tibyan-shadow)_10%,transparent)]",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        {mission.estimatedMinutes ? (
          <span className={`${CHIP} gap-2 bg-secondary/60 text-ink-muted`}>
            <ClockGlyph />
            {formatTemplate(locale, t.minutes, { minutes: mission.estimatedMinutes })}
          </span>
        ) : (
          <span />
        )}
        <StatusChip t={t} status={mission.status} />
      </div>

      {/* The task's own words may be in another language than the page, so they keep theirs. */}
      <Heading
        id={`${id}-title`}
        dir="auto"
        className="text-start text-lg leading-6 font-bold text-ink"
      >
        {mission.title}
      </Heading>
      {mission.description && (
        <div className="flex gap-2 rounded-2xl bg-secondary/60 p-3">
          <SparklesGlyph className="mt-1 size-4 text-link" />
          <div className="flex min-w-0 flex-col">
            <span className="leading-6 font-bold text-link">{t.parentTip}</span>
            <p dir="auto" className="text-start text-sm leading-[22px] font-medium text-ink">
              {mission.description}
            </p>
          </div>
        </div>
      )}

      {mission.status === "expired" && !mission.observation ? (
        <p className="text-ink-muted">{t.endedBody}</p>
      ) : (
        <ObservationFields t={t} id={id} isOpen={isOpen} observation={observation} />
      )}

      {!isOpen && mission.observation?.note && (
        <div className="flex flex-col gap-1">
          <span className="text-caption font-bold text-ink-muted">{t.yourNote}</span>
          <p dir="auto" className="text-start text-ink">
            {mission.observation.note}
          </p>
        </div>
      )}

      {isOpen && (
        <Button
          className="self-start"
          loading={observation.state === "saving"}
          onClick={() => void observation.save(observation.choice)}
        >
          {observation.state === "saving" ? t.saving : t.confirm}
        </Button>
      )}
    </article>
  );
}

type TaskRowProps = ObserveProps & {
  /** The line under the title: the domain, and for a done task the answer, or the day. */
  meta: string;
  headingLevel?: 3 | 4;
};

/**
 * A task on the dashboard home (Today's tasks and Pending observations): a short row when done,
 * and the open task with its tip and the one-tap observation (no confirm button in the design).
 */
export function TaskRow({ t, mission, onObserve, meta, headingLevel = 4 }: TaskRowProps) {
  const id = useId();
  const Heading = `h${headingLevel}` as const;
  const observation = useObservation({ mission, onObserve });
  const isOpen = mission.status === "pending";

  const title = (
    <div className="flex min-w-0 flex-1 flex-col">
      <Heading id={`${id}-title`} dir="auto" className="text-start leading-6 font-bold text-ink">
        {mission.title}
      </Heading>
      <span className="text-caption text-ink-muted">{meta}</span>
    </div>
  );

  if (!isOpen) {
    return (
      <article aria-labelledby={`${id}-title`} className="flex items-center gap-3 rounded-2xl p-3">
        <CircleCheckGlyph
          className={`size-5 ${mission.status === "completed" ? "text-success" : "text-ink-muted"}`}
        />
        {title}
        <StatusChip t={t} status={mission.status} />
      </article>
    );
  }

  return (
    <article
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-3 rounded-2xl border-2 border-primary bg-background p-4"
    >
      <div className="flex items-start gap-2">
        <ZapGlyph className="mt-0.5 size-5 text-link" />
        {title}
        <StatusChip t={t} status={mission.status} short />
      </div>
      {mission.description && (
        <p className="flex gap-2 text-caption text-ink-muted">
          <SparklesGlyph className="mt-0.5 size-4 text-link" />
          <span dir="auto" className="text-start">
            {formatTip(t.tip, mission.description)}
          </span>
        </p>
      )}
      <ObservationFields t={t} id={id} isOpen observation={observation} saveOnTap />
    </article>
  );
}

/** "Tip: {tip}", with the tip's own words. */
function formatTip(template: string, tip: string): string {
  return template.replace("{tip}", tip);
}
