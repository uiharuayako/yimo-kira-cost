# YIMO / KIRA LAB

Chinese probability calculator with an editorial, calm scientific character. Use cream surfaces, dark ink, restrained lavender, teal and warm orange. A custom geometric cube is the primary illustration. Avoid dark neon, glow, broad purple gradients and generic SaaS chrome.

## Tokens and layout

- Background `#f7f6f0`; white paper `#fffefa`; ink `#29322c`; secondary ink `#67706a`; neutral lines `#dedfd5`.
- Cube categories: purple `#725c9f`, teal `#357c72`, orange `#b36c34`. Pair colors with full names and labels.
- Source categories: official, user given, simulation, assumption; each receives explicit text, not only a color.
- System Chinese sans-serif body; Georgia for small editorial Latin numerals. Tabular numerals for changing values.
- Content width 1184px, adaptive 24–48px gutters. Hero 2 columns, calculator 450px + flexible results, method is one readable vertical narrative. Stack below 900px; support 320px without whole-page horizontal scrolling.
- Body copy 14–16px with generous line height; headings scale with clamp. Native number, radio and select controls; visible labels, focus rings and errors.

## Interaction and accessibility

- Recalculate on every weight change; weights normalize internally. Distinguish target mix per throw from composition of successful catches.
- An integer essence count defaults to zero; show 480n energy progress, the remaining target and the explicit scope of cube expenses only. Look up stopping times for each remaining target rather than scaling the baseline linearly.
- At 22 or more essence uses, show the reached target, zero required catches and zero cube expenses. Handle this independently of empty weights, and never divide bar widths by zero.
- All-zero and invalid weights clear computed values, show a local alert and preserve input editing.
- Restore defaults resets essence count, weighting mode and weights; clear only removes weights and preserves the essence count.
- Store essence count, weights and mode locally with guarded storage calls; unavailable or corrupt storage never blocks calculation.
- Local KaTeX produces math with MathML accessibility output. Dynamic substitutions update with inputs and selected explanation target/cube.
- Motion is limited to brief bar transitions; honor reduced-motion preferences. No decorative continuous motion.
- Source rules and modeling assumptions remain readable without JavaScript.

## Skill application

Consulted `ui-ux-pro-max` design-system and accessibility search. Adopted minimal/direct structure, native input types, visible labels and validation, contrast and responsive checks. Its generated dark/neon/neumorphic palette conflicts with the explicit brief, so the user-directed cream editorial palette takes precedence.
