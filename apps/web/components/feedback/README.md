# Contextual feedback controls

The question-mark control stays at the bottom-right of the visible viewport. The
selection outline and compact action toolbar are body portals, so a transformed
or clipped page ancestor cannot move them offscreen. Toolbar placement first
keeps every control inside the visible viewport, then minimizes coverage of the
selected target. Scrolling, resizing and visual-viewport panning update their
positions without changing the selected target.

On a narrow or short viewport, the comment composer fills the visible viewport, including
when a software keyboard reduces its height. Close and Send occupy a separate
header; the text, privacy note and private admin attachment control scroll below
it. The short header title can wrap without shrinking its buttons. The complete
target remains the dialog's accessible description. Enter in the textarea adds a
newline; keyboard activation of the focused Send button submits normally.

Public and member comments remain text-only. Admin photos use the existing
private upload flow. Copy prompt retains the human handoff: inspect/edit the
copied text on Mac, submit it deliberately to a desktop assistant, and choose
private attachments separately. Photo IDs do not include image bytes or signed
URLs and do not authorize an assistant to fetch them. Member Mimic hides this
interface. Per-target tab drafts survive closing and failed sends; Clear draft
remains an explicit action. This layout does not change proposal approval,
publication or recovery.

## Verification

Run the focused client suite from the repository root:

```sh
pnpm exec jest --config apps/web/jest.client.config.ts --runInBand apps/web/components/feedback/__tests__ apps/web/components/feedback-review-status/__tests__/integration.test.tsx
```

After a clean app rollout, inspect the following without submitting a comment:

1. At 390px width, open the bottom-right question mark, choose a part of the page
   and scroll it near an edge. The compact tools remain reachable and the outline
   stays on the selected part. Repeat after scrolling it outside the viewport.
2. Open Add a comment. Reduce visible height or open a phone keyboard. Close and
   Send remain visible above the scrolling body; close and reopen to check the
   unsent draft. Enter in the text adds a line rather than sending.
3. Open the public mobile menu, then the feedback controls and composer. Focus
   reaches the composer rather than returning to the menu. Close the composer;
   normal menu keyboard containment still works.
4. As an admin, open Upload file without choosing a file. Its caption and Cancel
   receive focus above the composer. Cancel returns focus to Upload file and
   preserves the unsent draft.
5. Check anonymous, member and Member Mimic views for their existing permission
   differences. Copy prompt remains an explicit clipboard action for admins.

Automated visual-viewport events and reduced-height browser captures are not a
claim of an actual iOS keyboard run; record device/browser evidence separately.
