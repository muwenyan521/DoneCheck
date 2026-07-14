# DoneCheck Desktop Design System

## 0. Design Direction

- Brief: turn DoneCheck into a focused desktop verification workspace inspired by Vercel's precision, not a Vercel clone or a marketing page.
- Primary users: engineers who need to set up an audit quickly, review an in-progress analysis with confidence, and return to a saved report without hunting through the interface.
- Reference: Vercel's near-black and white developer-tool surfaces, compact Geist-like typography, shadow-as-border depth, and restrained workflow color.
- Product distinction: DoneCheck uses the Vercel-derived structure for a verification workflow. The product mark, content, report language, and data model remain DoneCheck's own.
- Accessibility constraints: visible focus ring, 44 px touch-capable controls where space permits, no status communicated by color alone, Chinese and English must wrap without clipping, reduced-motion users receive no transform transitions, and all actions remain reachable by keyboard in document order.
- Accepted debt: the bundled report renderer owns its internal markup, so its semantic hierarchy is styled from the desktop shell rather than rewritten in this pass.

## 1. Foundations

- Typography: `Geist`, `Geist Mono`, `ui-sans-serif`, `system-ui`, and Chinese-capable platform fallbacks. Use normal tracking for UI text; only product headings use tight tracking.
- Color modes: `system` is the default and tracks `prefers-color-scheme` live. Explicit `light` and `dark` modes override the operating system and persist locally. Theme changes must not flash a mismatched canvas at startup.
- Surface tokens: every component uses semantic canvas, elevated canvas, inset canvas, ink, muted text, line, hover, selected, overlay, and shadow tokens. Light mode keeps the existing near-white precision; dark mode uses neutral charcoal surfaces with sufficient elevation and contrast rather than inverted pure black.
- Accent themes: blue is the DoneCheck default; violet, green, and amber are optional accents. Accent color is reserved for focus, selection, progress, and product identity. Success, warning, error, and scope semantics never inherit the chosen accent.
- Semantic colors: analysis/info blue `#0070f3`; success green `#137333`; warning amber `#9a6700`; error red `#d43c2f`; scope-review violet `#6e56cf`. These colors appear only in status, evidence, and recovery contexts.
- Spacing: 4 px base rhythm. Primary composition uses 8, 12, 16, 24, 32, and 40 px. Side rail width is 360 px on wide windows.
- Shape: 6 px controls, 8 px panels, 4 px inner report elements. Pills are reserved for concise status labels.
- Depth: no decorative gradients. Surfaces use the shadow-border recipe `0 0 0 1px rgba(0,0,0,.08)`; elevated surfaces add a maximum `0 8px 24px -16px rgba(0,0,0,.2)`.

## 2. Layout And Hierarchy

- Desktop layout: a persistent left configuration rail and a separate right review canvas. The top bar states current context and puts settings in a predictable location.
- Configuration rail: order is workspace, requirement, optional completion claim, report options, primary analysis action, then saved history. Analysis inputs never compete visually with report controls.
- Review canvas: outcome/report is the dominant surface. Before a result exists it shows the current next step, never an empty decorative card.
- Narrow layout: at 980 px the rail becomes a top workspace section; at 640 px paired fields and action rows become one column. Controls retain stable width and content never relies on hover.

## 3. Components And States

- Product bar: small triangular DoneCheck mark, product name, current workflow state, a compact appearance menu, and one utility settings button.
- Appearance menu: icon-triggered popover with a three-option segmented mode control and four labeled color swatches. It closes on Escape or outside click, preserves keyboard order, and announces each selected option without relying on color alone.
- Buttons: black is the sole primary action. Neutral buttons are white with a shadow border. Destructive actions are text-forward red and require explicit labels. Buttons use a 120 ms opacity/box-shadow transition only.
- Fields: visible labels and concise supporting copy where needed. Inputs use a quiet fill and shadow border, with a 2 px blue focus ring.
- Status banner: a small mono label plus concise copy; a colored left rule supplements plain-language status text.
- History row: full-width report selector with requirement summary and timestamp; remove is visually secondary but clearly destructive.
- Dialog: white elevated panel on a translucent neutral backdrop; Escape closes and focus returns to the invoking settings control.
- Report items: the renderer uses compact section separation, readable line length, semantic status tint, and code blocks with stable overflow.

## 4. Interaction And Motion

- The primary button is enabled only when an analysis can begin. Busy states lock the defining inputs and expose an explicit cancel action.
- Reports actions remain grouped in the review canvas so users act on the result where they read it.
- Hover, pressed, selected, and popover feedback make interactive controls discoverable. Controls may translate by at most 1 px on press; popovers may combine a 4 px vertical offset with opacity. Analysis progress may animate only the status indicator. No decorative movement.
- Theme transitions are limited to foreground, background, border, and shadow colors and are disabled for reduced-motion users. The application avoids a whole-page crossfade so text remains stable and readable.
- `prefers-reduced-motion: reduce` removes nonessential transitions.

## 5. Reusable Primitives

- `panel`: shadow-bordered white surface, 8 px radius.
- `primary button`, `secondary button`, `danger button`: shared command hierarchy used across analysis, recovery, settings, history, and report actions.
- `status`: semantic state notice with mono label and a supporting message.
- `workspace rail`: named section layout for input, actions, and history.
- `review canvas`: named outcome layout for empty, reviewing, error, and completed report states.
- `appearance menu`: reusable local-preference popover composed of an icon command, segmented mode control, and color swatches.

## 6. Content Rules

- Lead with the user's next decision. Do not expose source IDs, schema versions, service internals, or development-stage labels.
- Use sentence case for English UI and ordinary Chinese labels. Do not rely on uppercase or color for meaning.
- Keep action text explicit: analyze, cancel, save, export, copy repair instructions, remove, undo.

## 7. Verification Checklist

- Check the ready, analyzing, decomposition review, completed report, error, settings, saved history, and undo states.
- Verify keyboard focus, outside-click and Escape close, visible disabled states, and no clipping at 375, 768, and 1280 px.
- Verify system, light, and dark modes plus every accent swatch; confirm system mode reacts to a live operating-system preference change and explicit modes do not.
- Verify the result workflow through the Electron GUI smoke surface and inspect built desktop screenshots before release.
