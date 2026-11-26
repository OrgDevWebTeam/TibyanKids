// The story the child opened. Like the chosen child on the dashboard, it stays in memory, so the
// address carries the language only (no ids in URLs). The way in (the Space home's planets,
// Figma "Child World · 6–8" sections 3 and 4) calls `openStory` before going to the lesson.
let chosen: string | undefined;

export function openStory(storyId: string) {
  chosen = storyId;
}

/** The story to show on the lesson page, if one was opened in this tab. */
export function chosenStory(): string | undefined {
  return chosen;
}
