import { Button, CloseIcon, TextField } from "@tibyan/ui";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { PlusIcon } from "./dashboard-icons";

// The interests block of Add Child (Figma "Parent Dashboard", section 6): the picked interests,
// suggestions to pick from, and a field for the parent's own. Picked chips use the design's
// Selected state (secondary fill, 2px selected border); suggestions its Default state.

export type InterestPickerText = {
  heading: string;
  intro: string;
  picked: string;
  suggestions: string;
  ownLabel: string;
  ownPlaceholder: string;
  ownHint: string;
  ownButton: string;
  /** "Add {name}" and "Remove {name}", for screen readers. */
  add: (name: string) => string;
  remove: (name: string) => string;
};

type InterestPickerProps = {
  value: string[];
  /** The design's suggestions, in the page language. Picked ones are not shown again. */
  suggestions: string[];
  text: InterestPickerText;
  /** Adds the typed interest; returns an error message when it cannot be added. */
  onAdd: (typed: string) => string | undefined;
  onRemove: (interest: string) => void;
  /** A problem with the list as a whole, from the form's check. */
  error?: string;
};

const CHIP =
  "inline-flex min-h-11 items-center gap-2 rounded-full px-4 font-medium focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus";

export function InterestPicker({
  value,
  suggestions,
  text,
  onAdd,
  onRemove,
  error,
}: InterestPickerProps) {
  const id = useId();
  const [typed, setTyped] = useState("");
  const [typedError, setTypedError] = useState<string>();
  const group = useRef<HTMLDivElement>(null);
  // After a chip is picked or removed it leaves its list, so focus moves to a stable place.
  const [focusTarget, setFocusTarget] = useState<"picked" | "suggestions" | "own">();
  const ownField = `${id}-own`;
  const open = suggestions.filter(
    (item) => !value.some((picked) => picked.toLowerCase() === item.toLowerCase()),
  );

  useEffect(() => {
    if (!focusTarget) return;
    const root = group.current;
    const next =
      focusTarget === "own"
        ? root?.querySelector<HTMLElement>(`#${CSS.escape(ownField)}`)
        : root?.querySelector<HTMLElement>(`[data-list="${focusTarget}"] button`);
    (next ?? root?.querySelector<HTMLElement>(`#${CSS.escape(ownField)}`))?.focus();
    setFocusTarget(undefined);
  }, [focusTarget, ownField]);

  function addTyped() {
    const problem = onAdd(typed);
    setTypedError(problem);
    if (!problem) setTyped("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Enter adds the interest instead of sending the whole form.
    if (event.key !== "Enter") return;
    event.preventDefault();
    addTyped();
  }

  return (
    <div ref={group} role="group" aria-labelledby={`${id}-heading`} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 id={`${id}-heading`} className="text-lg leading-7 font-bold text-ink">
          {text.heading}
        </h3>
        <p className="text-ink-muted">{text.intro}</p>
      </div>

      {value.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-caption font-bold text-ink-muted">{text.picked}</p>
          <ul data-list="picked" className="flex flex-wrap gap-2">
            {value.map((interest, index) => (
              <li key={`${index}-${interest}`}>
                <button
                  type="button"
                  aria-label={text.remove(interest)}
                  onClick={() => {
                    onRemove(interest);
                    setFocusTarget(value.length > 1 ? "picked" : "suggestions");
                  }}
                  className={`${CHIP} border-2 border-primary bg-secondary text-on-secondary`}
                >
                  <bdi>{interest}</bdi>
                  <CloseIcon className="size-4 shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {open.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-caption font-bold text-ink-muted">{text.suggestions}</p>
          <ul data-list="suggestions" className="flex flex-wrap gap-2">
            {open.map((interest) => (
              <li key={interest}>
                <button
                  type="button"
                  aria-label={text.add(interest)}
                  onClick={() => {
                    const problem = onAdd(interest);
                    setTypedError(problem);
                    if (!problem) setFocusTarget(open.length > 1 ? "suggestions" : "own");
                  }}
                  className={`${CHIP} border border-[var(--tibyan-border)] bg-surface text-ink hover:bg-surface-muted`}
                >
                  <PlusIcon className="size-4 shrink-0" />
                  {interest}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1 sm:max-w-sm">
          <TextField
            id={ownField}
            label={text.ownLabel}
            placeholder={text.ownPlaceholder}
            hint={text.ownHint}
            error={typedError ?? error}
            autoComplete="off"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
        {/* Lines up with the field, under its label. */}
        <Button variant="secondary" className="sm:mt-8" onClick={addTyped}>
          {text.ownButton}
        </Button>
      </div>
    </div>
  );
}
