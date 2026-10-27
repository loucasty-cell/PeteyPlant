# Petey Plant R3F — Visual Identity Redesign (Design Pivot, Oct 2026)

## Why

The user reviewed screenshots of the first R3F shell and judged it an
obvious Duolingo clone: winding dotted path with circular GO nodes,
bright lip palette, Fredoka rounded type, 5px bottom-lip buttons,
flame/XP counters, owl-like pot face. The redesign removes every one
of those tells and replaces them with a distinctive, botanical,
non-AI-slop identity. **Plumbing is untouched**: `biophysicsEngine`,
`usePeteyStore`, `api`, types, the single persistent `<Canvas>`,
reasoning-deep cards (ReAct traces, derivation chains, differential
evidence), check-in-only streaks, VWC-locked watering, offline fonts.

## Approaches considered

1. **Herbarium ledger (CHOSEN).** Archival paper, ink rules, folio
   headings, mono specimen data, pressed-leaf marks. Grounds directly
   in `~/workspace/petey-plant-research/design_system.md` (paper,
   ink, leaf, amber, danger, water, OKLCH) and in the product's own
   content: taxonomy, provenance, measurements. Tradeoff: quieter
   than a game UI — but the depth (traces, derivations, evidence)
   carries the excitement, and quiet is what makes it *not* Duolingo.
2. **Greenhouse glass / botanical brutalism.** Oversized grotesk
   type, raw grid lines, greenhouse-panel cards. Rejected: the heavy
   grid and loud type fight the small-screen (320px) layout and read
   as generic "designer portfolio" rather than plant-specific.
3. **Storybook watercolour.** Soft painted washes, hand-drawn
   vignettes. Rejected: washes need gradients and translucency, both
   banned (no glassmorphism, flat fills only), and softness hides
   the telemetry the judges need to see.

## Palette — refined herbarium (OKLCH source, hex computed)

| Token | Hex | Role |
|---|---|---|
| paper | `#F8F5EA` | App canvas (was Duolingo `#F7F9F4` mint) |
| parchment | `#EFEBDD` | Wells, unit headers, secondary surfaces |
| surface | `#FFFEF9` | Cards, modals, drawer |
| ink | `#181B1F` | Headlines, body, frames |
| inksoft | `#4A4D53` | Supporting prose, labels |
| inkfaint | `#777A80` | Metadata, captions |
| leaf | `#00A159` | Primary signal, healthy |
| leafdeep | `#007338` | Primary borders, deep accents, complete rings |
| leaftint | `#C0EACD` | Healthy tag wash |
| amber | `#DA950B` | Warning, sealed/locked |
| amberdeep | `#A75C00` | Warning text/borders |
| ambertint | `#FDE0B9` | Warning tag wash |
| danger | `#BE222A` | Alerts, destructive |
| dangerdeep | `#8E1A20` | Danger borders |
| dangersoft | `#FFDEDB` | Alert tag wash |
| water | `#2591C4` | Water actions, VPD |
| waterdeep | `#1B6E96` | Water text/borders |
| clay | `#A85F3C` | Muted terracotta (pot, small accents) |
| rule | `#D0CEC7` | 1px decorative hairlines |
| rulestrong | `#B0AEA7` | 1.5–2px structural rules |

Dark mode: moss-black paper `#1B211D`, surface `#28332A`,
parchment `#232C24`, ink `#F2EFE3`, rule `#3A443A`, rulestrong
`#4A554A`; signal colours unchanged. Flat fills only, never
gradients. Status is never colour-alone: every status also carries a
word, a glyph, or a number.

## Typography — editorial, not rounded

- **Display:** Fraunces 600/700 (+ 600 italic for the twist phrase
  only), tracking −0.02em, `text-wrap: balance`. No all-caps
  headlines; mono uppercase is reserved for meta overlines
  (SPECIMEN, UNIT, FOLIO) — a ledger convention, not a headline.
- **UI/body:** Archivo 400/500/700 (grotesk). Sentence case on
  buttons — the old uppercase bold buttons were a Duolingo tell.
- **Telemetry:** JetBrains Mono 600, tabular-nums, for every number
  that changes.
- **Scale (fixed ratio 1.25, base 16):** caption 12.8 · body 16 ·
  subhead 20 · title 25 · display 31.25 · hero 39.06 (px). No other
  font sizes exist in the UI.

## Modular system — ratios and geometries (strict)

- **Spacing:** 4pt base. Every spacing value is a multiple of 4px
  (Tailwind's 0.25rem ladder: `p-1`…`p-24` etc.); canonical steps
  are 4, 8, 12, 16, 24, 32, 48, 64, 96, and the shell uses 80 (rail),
  420 (right column), 1440 (max width) — all multiples of 4. The
  only sub-4px values are the stroke widths (1 / 1.5 / 2) and 2px
  half-steps for hairline dots and gaps.
- **Shell:** max width 1440, left rail 80, right column 420, gaps
  16 (mobile) / 24 (desktop), card padding 16/24. All on the 4pt grid.
- **Radii (from the same scale):** 4 (tags) · 8 (buttons, thumbs) ·
  12 (cards, modals) · 16 (terrarium frame, drawer top) · 24
  (only large panels). No `rounded-full`, no `rounded-3xl`.
- **Strokes:** hairline 1 (decorative only) · rule 1.5 (cards,
  buttons) · frame 2 (modals, drawer, focal frames). No 4–5px lips.
- **Shadows (tactile language):** hard offset press shadows only —
  2px / 4px / 8px, no blur — on buttons, collapsing to 0 on press
  (letterpress, not a bottom lip). Cards are flat + framed, never
  shadowed. No glow, no blur stacks.
- **Motion:** transform/opacity only, `cubic-bezier(0.22,1,0.36,1)`
  expo-out; slow idle sway only; no infinite pulsing, no bounce
  eases. Reduced-motion collapses everything to instant state.

## Tactile language — pressed specimen / seed packet

Buttons are seed packets: flat paper/leaf/water fills, 1.5px
deep-colour frame, 4px hard offset shadow; pressing pushes the
packet *into* the paper (translate 4px, shadow gone). Cards are
herbarium mounts: flat surface, 1.5px rulestrong frame, square-ish
corners. Sliders are ledger rules: 4px track, 20px *square* thumb
with a 1.5px frame (round thumbs were the old Duolingo slider).
Tags are specimen labels: 4px radius, tint wash, deep-colour text,
mono caption.

## Progression — growth ledger (replaces the winding path)

A vertical **ledger**, not a path: a solid 2px vine stem down a
40px left rail, with small pressed-leaf marks at each entry, and
rectangular ledger rows to the right (glyph tile + title + blurb +
status tag: `Pressed` / `Open` / `Sealed` / `Alert`). No dotted
line, no alternating zigzag, no circular nodes, no GO labels, no
pulsing. The boss entry is a static danger frame + `Alert` tag.
All quest logic (check-ins, irrigation lock, triage) is unchanged;
only the presentation changed. Component renamed
`BotanicalQuestPath` → `GrowthLedger`.

## Streaks & points — growth rings (replaces flame + XP)

- **Growth rings:** an SVG of three concentric 2px rings. Complete
  rings = full 7-day weeks in the streak; a partial arc = the
  current week's remainder; centre = mono streak-day count. Tree
  rings, not flames. Caption states plainly that watering never
  extends a streak.
- **Growth points:** the old "XP" counter becomes "growth points"
  with a Sprout glyph and a mono number. The store field is still
  `xp` internally; the word XP never appears on screen.

## Mascot — plant spirit, not owl

The pot face loses the owl tells: no large white sclera discs, no
big round pupils. New face: small dark **seed eyes** (vertical
ovals, no white), tiny cream highlights, a thin carved mouth line,
and faint amber blush discs. Wilt still narrows the eyes (Y-scale)
and the mouth droops. Pot clay muted to `#A85F3C`; foliage base
`#0E7A4B` (between leaf and leaf-deep); chlorotic tint now amber
`#DA950B`. The face, droop, and colour still change together with
telemetry, as before.

## Before / after (each removed tell)

| Tell | Before | After |
|---|---|---|
| Winding dotted path + GO circles | Duolingo home screen | Growth ledger: solid vine stem + rectangular rows + status tags |
| Bright lip palette | `#58CC02` / `#1CB0F6` / `#FF9600` / coral / violet | Herbarium paper/ink/leaf/amber/danger/water above |
| Fredoka rounded type | Rounded display + Nunito body | Fraunces serif display + Archivo grotesk + JetBrains Mono |
| 5px bottom-lip buttons | Chunky rounded pills with dark bottom band | Seed-packet buttons: 1.5px frame + 4px hard offset shadow, press into paper |
| Flame + XP | Flame icon, "N-day streak", "N XP" | Growth-ring SVG + "growth points" with Sprout glyph |
| Owl pot face | Big white eyes + pupils + smile | Seed eyes, carved mouth line, blush discs |

## Verification

`verification/audit-identity.mjs` (TDD gate, written before the
redesign) bans the old tells and enforces the scale; `npm run
verify:screenshots` re-captures shell / ledger / terrarium /
diagnostics / locked irrigation at 320/768/1440 and must pass
30/30-equivalent checks before this is called done.
