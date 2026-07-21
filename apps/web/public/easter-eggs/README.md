# public/easter-eggs — bundled design-exploration compare tools

These are **generated** copies of the vault's design-exploration comparators,
served statically so the compare-tool easter egg can iframe them same-origin.
Don't hand-edit the HTML here — edit the source and re-bundle.

- `download-checkout/` ← `~/amaanah/projects/kk-web-tools/design-explorations/download-checkout/`
  revealed by the easter egg on **/checkout** (`CompareTool context="checkout"`).
- `resilience/` ← `~/amaanah/projects/kk-web-tools/design-explorations/resilience/`
  revealed on the **Building Resilience** page (`/p/2026-developing-resilience-online-course`,
  any page carrying the `editorialResilience` block).

Each topic dir is self-contained: `compare.html` (+ `index.html`) iframe the
sibling mockup `NN-*.html` files, and every image they reference was copied into
`assets/` with `../../.assets/...` paths rewritten to `assets/...`. The images
already exist under `public/editorial/`, `public/anahata/`, and `public/swami-kk-logo.png`.

To re-bundle after changing a mockup, from the repo root
(`.creations/courselit`): copy the changed `.html` from the vault into the
matching topic dir and re-run the two-step path rewrite
(`../../.assets/design-explorations/` → `assets/`, then `../../.assets/` →
`assets/`), then confirm `grep -rn '\.\./\.\.\|\.assets' public/easter-eggs`
returns nothing.

The controller that reveals these lives at
`apps/web/components/public/compare-tool/`.
