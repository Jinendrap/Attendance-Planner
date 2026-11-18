# Design language

One look for the whole app. If you add a screen, use these rules and the existing classes in `src/styles.css`.
The colours and sizes live in one place: the `:root` and `:root[data-theme="dark"]` blocks at the top of `styles.css`.

**Feeling:** calm, editorial, tactile. A warm grey canvas, soft rounded cards, one slate-blue family, big quiet type.
It borrows from three portfolio templates: rounded bento tiles and a frosted header, slate stat tiles and expandable rows, and large editorial headings with thin rules.

## Colour
| Role | Light | Dark | Used for |
|---|---|---|---|
| Canvas | `#e5e4e2` | `#0b0b0c` | page background (with a soft blue glow in the corner) |
| Card | `#f5f5f5` | `#161617` | panels, windows |
| Soft surface | `#ebeae8` | `#1f1f21` | rows, inputs, month cells |
| Ink | `#0a0a0a` | `#f4f4f2` | text, selected tab, round buttons |
| Muted | `#5c5c5c` | `#a8a8a6` | secondary text |
| **Slate (primary)** | `#4a6e7e` | `#8fb0c2` | buttons, stat tiles, accents |
| Slate gradient | `#3e5e6c → #7fa3b6` | `#16242b → #3d5966` | the big attendance tile, ID card, logo |
| Live lime | `#7ecc00` | same | "happening now" only (the outline on a class that is running) |
| Good / watch / bad | `#1b7f4b` / `#a15c00` / `#c8264a` | `#5ee09a` / `#f0b04a` / `#ff6b86` | attendance state: on track, on the limit, below required |

Rules: slate is the only brand colour (the call-to-action block and the handwritten note use it too). Green, amber and red mean attendance state and nothing else. Subject colours are used only as a thin left edge or a dot.

## Type
- Font: **Host Grotesk** (falls back to the phone's system font offline). Handwritten note: **Reenie Beanie**.
- Big heading (`.display`): very large, weight 500, tight tracking. Section heading (`.sechead h3`): 1.5rem with a thin rule above.
- Small label (`.eyebrow`): uppercase, wide tracking, muted.
- Numbers that matter (percentages, counts) are large and light (weight 500).

## Shape and space
- Cards `28px` radius (`20px` on phones), rows `20px`, buttons and tabs fully round (pills), inputs `16px`. Gaps are `12-14px`.
- **Glass:** cards, windows, tiles, the header and the bottom bar are frosted glass (translucent fill, blur, a thin light edge) over soft coloured shapes in the background. Use `var(--glass)`, `var(--glass-edge)` and `var(--glass-blur)`. Do not put glass inside glass; rows inside a card use the plain `var(--paper)` surface. Windows and the menu use the more solid `var(--glass-solid)` so text behind them never shows through.
- The layout uses the whole width of the screen, with side padding that grows a little on large monitors.
- Windows open as bottom sheets on phones and centred cards on larger screens.

## Components
- **Header:** frosted round bar: logo, short name, date and time (no place name, no dots), theme toggle.
- **Navigation:** pill tabs on desktop; on phones a bottom bar (Overview, Calendar, Attendance, Tasks, Menu) and a full-screen menu with the rest.
- **Tiles (`.bento`, `.tile`):** slate tiles for numbers, one white tile for "Next up" with the circled time and handwritten note.
- **Rows (`.slot`, `.crow`, `.task`):** soft surface, coloured left edge, hairline separators.
- **Accordion (`.acc`):** subject cards on the Attendance tab; tap to open.
- **Buttons:** solid slate is the main action, outlined is secondary, underlined text (`.link`) is a quiet link, `.cta` has the arrow chip.
- **Calendar:** big title, round previous/next, segmented Day/Week/Month, today column tinted, floating "+ Extra class" on phones.
- **Pencil loop:** the hand-drawn circle from the Calendar-3 template (`src/Pencil.jsx`). It draws itself around a date, a week header, a month cell or a class when you hover it (`.hp` elements), and stays drawn around the time in "Happening now". It may reach past the thing it circles. Colour: `--pencil` (slate). Handwriting: `--hand-font` (Reenie Beanie).
- **Motion:** soft and slow-out (`--ease` / `--ease-io` at the top of `styles.css`): screens and tiles rise in, windows pop up, subject cards open smoothly, bars grow, the theme cross-fades, the day swipe slides. Everything respects "reduce motion".

## Logo
An ID badge on a lanyard with a tick and a small green "live" dot, on a slate tile. Source: `public/icons/logo.svg` (same artwork in `src/Logo.jsx`).
App icons: `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` and the white notification badge `badge-96.png`.

## Do and don't
- Do reuse the classes above and the colour variables. Don't type colour codes into components.
- Do keep `.topbar` (header) and `.bar` (progress bar) separate.
- Do test at 360px wide, in light and dark.
- Don't add new accent colours.
