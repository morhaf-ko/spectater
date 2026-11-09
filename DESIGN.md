# Clean review interface

The operator selected the OpenDesign Clean system and a minimal reader with system, light and dark themes. The existing artifact navigation, document and feedback layout stays in place.

Source: https://github.com/nexu-io/open-design/tree/07a86b1041531bfa0bec1006d9c0993985fee560/design-systems/clean. Concrete tokens.css and components.html take precedence over the package's conflicting generic typography/color prose. The adapted token source is Apache-2.0; retain docs/licenses/open-design.txt. Dark colors extend the light-only reference.

## Tokens and layout

Use semantic Clean names: --bg, --surface, --fg, --fg-2, --muted, --border, --border-soft, --accent and --accent-on. Light: white background, #f7f7f7 surface, #111111 ink/actions, #707070 secondary text. Dark: #111111 background, #191919 surface, #ededed ink, #a1a1a1 secondary text and #f5f5f5 actions. Status errors use --danger.

Use the native Apple system stack (-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif) for prose and controls, and local monospace for source, hashes and commands. No remote font or asset fetches. Reading text is 16px/1.7, controls 14px, metadata 12px, document measure 72ch. Spacing uses 4/8/12/16/24/32/48px; controls have 44px minimum height and 8px radius. Prefer whitespace and subtle dividing rules over cards.

Desktop columns are 200px navigation, flexible reader and 300px feedback. Below 1100px feedback follows the document; below 700px the layout stacks. Avoid page overflow in both themes. Source may scroll horizontally inside its own region.

## Essential interface

Keep artifact navigation, rendered/source controls, text selection and submission. Selection opens a native, non-modal popover beside the selected text, focuses the comment input, and clamps to the viewport. Escape/outside click dismiss it; Resume draft recovers the text. The sidebar holds saved comments with Edit, Resolve, Delete and recoverable Undo/Restore actions. Submitted batches are unaffected by those changes. Put location, revision hashes and native status behind Details. Reveal export and retrieval information after choosing/submitting a batch. Remove repeated introductions, instructions and empty export fields. Preserve exact source content, precision labels, conflict messages and stale/orphaned feedback.

The sun/moon button follows System initially and toggles the effective light/dark scheme on click. A secondary Use system theme action under Details clears the override. Save that preference in browser local storage for the current local origin; reopening on another port starts with System. Storage denial falls back to an in-memory choice. A small blocking local script applies the preference before styles paint. Theme changes only update root CSS variables; no document replacement, server request, polling or framework is involved.

Keyboard focus, labeled native controls, selection contrast, errors, disabled actions and draft preservation apply to both themes. Keep motion absent. Inspect desktop/mobile light/dark screenshots separately from operator aesthetic acceptance.

## Identity and interaction details

The header mark is an original inline vector potato wearing reading glasses: a small warm ochre accent within the neutral interface. Its accessible name is supplied by the adjacent SpecTater wordmark. Sun/moon and close icons use consistent vector strokes, with labeled native buttons and 44px hit areas. No image request, icon library or animation is required.

Draft caching is optional and tab-local; durable feedback remains in the private server-side store. A reload only restores a cached anchor if the document hash still matches. Changed source retains the body and requires a new selection. Keyboard range selection opens the composer after Shift is released; Escape must not recapture and reopen it. Both themes and narrow viewports retain focus visibility, error recovery and draft text.
