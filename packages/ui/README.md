# @tibyan/ui

Design tokens and UI primitives shared by the Tibyan Kids apps. Every primitive works in Arabic
(RTL) and English (LTR) without changes.

Sources: Architecture v1.0 section 5.2; UI Screens Spec v0.1; CRS NFR-A11Y-001 and NFR-I18N-001.

## Use

The package is consumed as TypeScript source: Vite compiles it with the app, so it has no build
step of its own. In the app's main stylesheet:

```css
/* The tokens, plus the classes the primitives use */
@import "tailwindcss";
@import "@tibyan/ui/styles.css";
@source "../../../packages/ui/src";
```

And in a component:

```tsx
import { Button, TextField } from "@tibyan/ui";
```

## Contents

| Export                                   | What it is                                                                               |
| ---------------------------------------- | ---------------------------------------------------------------------------------------- |
| `styles.css`                             | Tokens: colours, radius, text size and control height                                    |
| `Button`, `buttonClasses`                | Button, and the same look for links (`<Link className={buttonClasses()}>`)               |
| `TextField`, `SelectField`               | Labelled inputs with hint and error, linked for screen readers                           |
| `Card`                                   | Content container                                                                        |
| `StatusBadge`                            | Status tag: tint, deep text and an icon, never colour alone                              |
| `AlertBanner`                            | Page message with an icon per tone; warnings and errors are announced at once            |
| `EmptyState`                             | Calm centred message when there is nothing to show, with an optional icon                |
| `Skeleton`, `SkeletonText`               | Loading placeholders; the shimmer stops when the user prefers less motion                |
| `Dialog`                                 | Modal on the native `<dialog>`: focus stays inside, Escape and the close button close it |
| `CloseIcon`, `MenuIcon`, `LanguagesIcon` | Icons the app's header uses                                                              |
| `PinPad`, `pressPinKey`                  | Number pad for the child PIN; always left to right, keyboard friendly                    |
| `eslint/base-config`                     | Shared lint rules, including one that rejects `ml-*`, `left-*`, `text-left`…             |

Primitives take all their text as props, so the app passes it from its dictionaries.

## Rules

1. Logical CSS only (`ms-*`, `ps-*`, `start-*`, `text-start`); the lint rule enforces it.
2. Colours come from the tokens, never raw hex values. The tokens follow the design system
   (Figma "Tibyan kids"). `tokens.test.ts` checks every text and control colour pair against
   WCAG AA (4.5:1 text, 3:1 controls and focus).
   - **Dark scene:** `data-theme="dark"` on a page's outer element gives everything inside the
     dark values (the sign-in pages' night sky). The same test checks them.
3. Meaning is never carried by colour alone (NFR-A11Y-001).
4. Number pads, media controls, logos and Quran text are never mirrored.

## Commands

```bash
pnpm --filter @tibyan/ui lint
pnpm --filter @tibyan/ui typecheck
pnpm --filter @tibyan/ui test
```
