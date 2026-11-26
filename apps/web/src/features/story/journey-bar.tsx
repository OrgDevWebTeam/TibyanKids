import { type ComponentType } from "react";
import { JOURNEY_STEPS, type JourneyScreen, type JourneyStep, stepState } from "./journey-state";
import { CheckGlyph, PlayGlyph, RocketGlyph, SparklesGlyph, TargetGlyph } from "./story-icons";

const GLYPHS: Record<JourneyStep, ComponentType<{ className?: string }>> = {
  story: PlayGlyph,
  decision: TargetGlyph,
  activity: SparklesGlyph,
  mission: RocketGlyph,
};

// CW/Journey steps: the current step is a 64px violet circle, the others 52px glass circles, and a
// done step turns green with a dark check, as does the line after it. On phones the bar is 72% of
// that.
const DOT = {
  current: "size-[46px] md:size-16 bg-primary text-[var(--tibyan-sheen)]",
  done: "size-[37px] md:size-13 border border-[var(--cw-glass-border)] bg-success-fill text-on-primary",
  next: "size-[37px] md:size-13 border border-[var(--cw-glass-border)] bg-[var(--cw-glass-fill)] text-ink",
};
const GLYPH = {
  current: "size-[22px] md:size-[30px]",
  done: "size-[19px] md:size-[26px]",
  next: "size-[17px] md:size-6",
};

type JourneyBarProps = {
  screen: JourneyScreen;
  labels: {
    list: string;
    steps: Record<JourneyStep, string>;
    /** "{step}, done" and the like: the step name goes in {step}. */
    status: Record<"done" | "current" | "next", string>;
  };
};

/** The four steps of the lesson journey, with where the child is. Read as a list of steps. */
export function JourneyBar({ screen, labels }: JourneyBarProps) {
  return (
    <ol aria-label={labels.list} className="flex items-center">
      {JOURNEY_STEPS.map((step, index) => {
        const state = stepState(step, screen);
        const Glyph = state === "done" ? CheckGlyph : GLYPHS[step];
        const spoken = labels.status[state].replace("{step}", labels.steps[step]);
        return (
          <li key={step} className="flex items-center">
            {index > 0 && (
              <span
                aria-hidden="true"
                className={`h-1 w-[29px] rounded-full md:h-1.5 md:w-10 ${
                  stepState(JOURNEY_STEPS[index - 1]!, screen) === "done"
                    ? "bg-success-fill"
                    : "bg-[var(--cw-step-link)]"
                }`}
              />
            )}
            <span
              aria-current={state === "current" ? "step" : undefined}
              className={`grid shrink-0 place-items-center rounded-full ${DOT[state]}`}
            >
              <Glyph className={GLYPH[state]} />
              <span className="sr-only">{spoken}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
