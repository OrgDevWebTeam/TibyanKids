import { type Locale } from "@/i18n/config";

/** Which greeting the character says: after logging in, or after signing up. */
export type GreetingKind = "login" | "signup";

// The designer's recordings ("As-salamu alaykum, welcome..."), one per language and moment, named
// greeting-<locale>-<kind>.mp3. They are not in the repository (the public repo keeps no audio), so
// each one is used only if it is in the folder: without it the speech bubble alone greets, and the
// build still works. The mute button stays, ready for when the voice is published.
const RECORDINGS = import.meta.glob<string>("../../assets/auth/greeting-*.mp3", {
  eager: true,
  query: "?url",
  import: "default",
});

function recording(locale: Locale, kind: GreetingKind): string | undefined {
  return RECORDINGS[`../../assets/auth/greeting-${locale}-${kind}.mp3`];
}

let playing: HTMLAudioElement | undefined;

/** Stops the greeting if one is playing. */
export function stopGreeting() {
  playing?.pause();
  playing = undefined;
}

/**
 * Plays the character's greeting. If the recording is missing, or the browser blocks or cannot
 * play the sound, the speech bubble alone carries the greeting, so nothing else depends on it.
 */
export function playGreeting(locale: Locale, kind: GreetingKind) {
  stopGreeting();
  const url = recording(locale, kind);
  if (!url) return;
  const audio = new Audio(url);
  playing = audio;
  audio.play().catch(() => {
    if (playing === audio) playing = undefined;
  });
}
