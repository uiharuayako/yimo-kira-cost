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
- Target mode defaults to the 15-class official matrix; an alternative single-base-rate mode accepts a user-supplied 0–100% base probability (default 16%). Hide irrelevant weight controls and the target picker, preserve their state for switching back, and directly use the corrected single-target rate as the aggregate probability.
- Capture bonus defaults to additive 1% (one final percentage point). Allow switching to the official relative multiplier and editing the percentage; update the hero tag, branch calculations, definitions and numerical substitutions together. A zero success probability produces a clear unavailable-target message rather than an infinite cost.
- The goal is a rainbow weather event, reached through essence 3% direct weather, lucky-event 0.6% direct weather, or 10,500 energy guarantee. Stop immediately on any completion path.
- An integer essence limit defaults to zero. Show effective maximum a=min(n,22), survival probability .97^a, direct weather probability, conditional energy progress and conditional capture mean, plus the final unconditional capture mean. Use the weather lookup for every remaining target; do not scale the baseline linearly.
- At an essence limit of at least 22, show zero required catches, zero cube expenses and zero reporting refunds. Handle this independently of empty weights, and never divide bar widths by zero.
- Complementary front/back percentages default to 70/30, with integer level difference defaulting to 10 and allowing negatives. All rate formulas reflect the actual input and the official level bands.
- Main amounts are net costs: cube expenses minus basic reporting refunds. The user-confirmed base is 1,200 credits per successful catch, with adjustable bonus defaulting to 30% (1,560 credits). Show both gross expenses and refunds. Negative net cost is explicitly labeled expected net income and plotted left of a fixed zero axis.
- Show the shared successful-capture completion distribution as a genuine discrete histogram from the full integer frequencies, with no normal fit. Chart bins are display-only; interval probabilities, cumulative completion, remaining probability and quantiles use the original CDF. Essence completion is an explicit atom at zero.
- Support horizontal chart brushing plus two labeled native integer range inputs for keyboard and touch. Quantile cards select a cumulative interval. Keep the theoretical p100 minimum distinct from a 100% completion guarantee; p95 is the lower 5th-percentile threshold, with discrete ties explained.
- Show the rare first-capture direct-weather probability analytically and distinguish it from the empirical total probability of completing in one capture. The displayed sample maximum is not a theoretical game bound. A degenerate all-zero capture distribution disables the sliders and retains a 0–100% probability axis.
- All-zero and invalid weights clear computed values, show a local alert and preserve input editing.
- Restore defaults resets target mode, single base rate, capture bonus mode/rate, essence count, front/back split, level difference, reporting bonus, weighting mode and weights; clear only removes weights and preserves the other settings.
- Store all numeric settings and both target/weight modes locally with guarded storage calls; old saved states use safe defaults for missing fields. Single mode ignores invalid hidden weights; serialize a safe weight fallback without replacing the in-memory values. Unavailable or corrupt storage never blocks calculation.
- Local KaTeX produces math with MathML accessibility output. Dynamic substitutions update with inputs and selected explanation target/cube.
- Motion is limited to brief bar transitions; honor reduced-motion preferences. No decorative continuous motion.
- Source rules and modeling assumptions remain readable without JavaScript.

## Skill application

Consulted `ui-ux-pro-max` design-system and accessibility search. Adopted minimal/direct structure, native input types, visible labels and validation, contrast and responsive checks. Its generated dark/neon/neumorphic palette conflicts with the explicit brief, so the user-directed cream editorial palette takes precedence.
