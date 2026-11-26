import { type Ref, useId } from "react";
import { type Challenge, type StoryDomain, type StoryMission } from "./story-api";
import { PlanetComplete } from "./planet";
import { CheckGlyph, HouseGlyph, UsersGlyph } from "./story-icons";

// The screens of Figma "Child World · 6–8", section 5 "Lesson journey". Each screen's heading
// takes the focus when the screen opens (`headingRef`), so a screen reader hears the new step.
// The story's own text (the question, the options, the mission) comes in the story's language,
// whatever the page's language, so it takes its direction from itself (`dir="auto"`).

const GLASS = "border border-[var(--cw-glass-border)] bg-[var(--cw-glass-fill)]";

type HeadingProps = { headingRef: Ref<HTMLHeadingElement> };

/**
 * 1 · Story and 3 · Learning activity: the design's 16:9 story video and tracing pad. The API has
 * no story media or activity content yet, so the frame stays empty and only names the step.
 */
export function EmptyStage({
  name,
  shape,
  headingRef,
}: HeadingProps & { name: string; shape: "video" | "pad" }) {
  return (
    <>
      <h1 ref={headingRef} tabIndex={-1} className="sr-only">
        {name}
      </h1>
      <div
        className={`rounded-dialog ${
          shape === "video"
            ? "aspect-video w-full max-w-215 border border-[var(--cw-glass-border)] bg-surface-muted"
            : `aspect-[5/4] w-full max-w-120 ${GLASS}`
        }`}
      />
    </>
  );
}

type DecisionProps = HeadingProps & {
  challenge: Challenge;
  choice?: number;
  onChoose: (choice: number) => void;
};

/**
 * 2 · Decision challenge: the question and its options as cards. The options are the API's text
 * (the design's big letter in each card is content the API does not have). There is no correct
 * answer: any choice moves the journey on.
 */
export function DecisionStep({ challenge, choice, onChoose, headingRef }: DecisionProps) {
  const questionId = useId();
  return (
    <>
      <h1
        ref={headingRef}
        tabIndex={-1}
        id={questionId}
        dir="auto"
        className="max-w-[48rem] text-center text-xl leading-7 font-bold md:text-[2rem] md:leading-10 rtl:leading-8 md:rtl:leading-12"
      >
        {challenge.prompt}
      </h1>
      <div
        role="radiogroup"
        aria-labelledby={questionId}
        className="grid w-full grid-cols-2 gap-3 md:flex md:w-auto md:flex-wrap md:justify-center md:gap-8"
      >
        {challenge.options.map((option, index) => (
          <label
            key={index}
            className={`flex min-h-24 cursor-pointer items-center justify-center rounded-dialog px-3 py-4 text-center has-checked:border-3 has-checked:border-primary has-checked:bg-surface-muted has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus md:w-65 md:p-6 ${GLASS}`}
          >
            <input
              type="radio"
              name={questionId}
              className="sr-only"
              checked={choice === index}
              onChange={() => onChoose(index)}
            />
            <span
              dir="auto"
              className="text-base leading-6 font-bold text-ink-muted md:text-lg md:rtl:leading-7"
            >
              {option}
            </span>
          </label>
        ))}
      </div>
    </>
  );
}

type MissionProps = HeadingProps & {
  mission: StoryMission;
  labels: { atHome: string; askGrownUp: string };
};

/**
 * 4 · Real-life mission: the mission the child received, away from the screen. The design's
 * picture hints are content the API does not have yet.
 */
export function MissionCard({ mission, labels, headingRef }: MissionProps) {
  return (
    <div className="flex w-full max-w-180 flex-col items-center gap-5 rounded-dialog border-3 border-fun bg-surface px-6 py-8 text-center shadow-[0_0_40px_rgb(255_122_89/0.35)] md:px-10 md:py-9">
      <p className="inline-flex items-center gap-2 rounded-full bg-[var(--cw-glass-fill)] px-3.5 py-1.5 text-sm leading-5 font-bold rtl:leading-[22px]">
        <HouseGlyph className="size-[18px] shrink-0 text-fun" />
        {labels.atHome}
      </p>
      <h1
        ref={headingRef}
        tabIndex={-1}
        dir="auto"
        className="text-2xl leading-8 font-bold md:text-[2.5rem] md:leading-12 rtl:leading-9 md:rtl:leading-[3.75rem]"
      >
        {mission.title}
      </h1>
      <p className="flex items-center gap-2 text-base leading-6 text-ink-muted rtl:leading-7">
        <UsersGlyph className="size-5 shrink-0" />
        {labels.askGrownUp}
      </p>
    </div>
  );
}

// Rewards/Celebration burst around the planet: confetti in color/celebrate/a–d and reward glints.
// Purely decorative; the heading says the lesson is complete.
const BURST = [
  { at: "start-[8%] top-[12%]", piece: "size-[22px] rounded-full bg-[var(--cw-celebrate-b)]" },
  { at: "end-[6%] top-[20%]", piece: "h-4 w-8 rotate-12 rounded bg-[var(--cw-celebrate-a)]" },
  { at: "start-[2%] top-[52%]", piece: "h-4 w-8 -rotate-12 rounded bg-[var(--cw-celebrate-d)]" },
  { at: "end-[2%] top-[58%]", piece: "size-[22px] rounded-full bg-[var(--cw-celebrate-c)]" },
  { at: "start-[22%] bottom-[2%]", piece: "size-[18px] rounded-full bg-[var(--cw-celebrate-a)]" },
  { at: "end-[20%] bottom-[4%]", piece: "h-4 w-8 rotate-45 rounded bg-[var(--cw-celebrate-d)]" },
];
const GLINTS = ["start-[14%] top-[30%]", "end-[14%] top-[4%]", "start-[46%] bottom-[-4%]"];

function Glint({ className }: { className: string }) {
  return (
    <svg className={`cw-burst-piece absolute size-8 ${className}`} viewBox="0 0 24 24">
      <path
        d="M12 1c.6 5.6 4.4 9.4 11 11-6.6 1.6-10.4 5.4-11 11-.6-5.6-4.4-9.4-11-11 6.6-1.6 10.4-5.4 11-11z"
        fill="var(--cw-reward)"
      />
    </svg>
  );
}

type CompleteProps = HeadingProps & { domain?: StoryDomain; title: string };

/** 5 · Lesson complete: the planet's ring fills, the burst, the title and the four done steps. */
export function LessonComplete({ domain, title, headingRef }: CompleteProps) {
  return (
    <>
      <div className="relative grid size-[240px] place-items-center md:size-[340px]">
        <PlanetComplete domain={domain} />
        <div aria-hidden="true" className="absolute inset-0">
          {BURST.map(({ at, piece }) => (
            <span key={at} className={`cw-burst-piece ${at} ${piece}`} />
          ))}
          {GLINTS.map((at) => (
            <Glint key={at} className={at} />
          ))}
        </div>
      </div>
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="text-center text-4xl leading-11 font-extrabold md:text-[3.5rem] md:leading-16 rtl:leading-[3.375rem] md:rtl:leading-[5.25rem]"
      >
        {title}
      </h1>
      {/* Journey · all done: the heading already says it, so the dots are not read. */}
      <ol aria-hidden="true" className="flex gap-2">
        {[0, 1, 2, 3].map((step) => (
          <li
            key={step}
            className="grid size-12 place-items-center rounded-full bg-success-fill text-on-primary"
          >
            <CheckGlyph className="size-6" />
          </li>
        ))}
      </ol>
    </>
  );
}
