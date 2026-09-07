# Contextual feedback controls

The question-mark control stays at the bottom-right of the visible viewport. The
selection outline and compact action toolbar are body portals, so a transformed
or clipped page ancestor cannot move them offscreen. Toolbar placement first
keeps every control inside the visible viewport, keeps the question-mark button
clear, then minimizes coverage of the selected target. It reserves that button's
measured rectangle plus a small gap, including when checkout raises the button
above its purchase bar. It does not reserve the whole bottom edge. Scrolling,
resizing and visual-viewport panning update these positions without changing the
selected target.

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
   stays on the selected part. Repeat after scrolling it outside the viewport,
   with a zoomed visible area, and above the mobile purchase bar. Check that the
   question-mark button itself receives a tap; an in-bounds rectangle alone does
   not prove that another control is not covering it.
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

## Nested modal focus

Web Dialog, AlertDialog and Sheet use the library's dedicated `dialogs` export.
This keeps their Radix focus manager identical to the one used by the built
private upload dialog. Matching version numbers alone did not do that: the
workspace resolved different peer-qualified focus-manager modules, and the outer
composer took focus back from the upload caption. The first-run popup uses the
same AlertDialog context with its existing unstyled Cancel appearance.

The failure was reproduced on native app `159701ba`. An isolated browser bundle
using the actual built `FileUploadAlertDialog` reproduces it with all three old
web wrappers and verifies caption typing, Cancel focus return and preservation
of an unsent draft with the shared wrappers. That fixture selects no file and
makes no network request. Native app `78c62f91` also passed caption typing,
Cancel focus return and preservation of the unsent draft without choosing a
file. The page-primitives Sheet already resolves the library's focus manager
and remains unchanged.

DropdownMenu, Select and Popover retain their web wrappers and styles while
using primitive namespaces from the same library export. The corresponding
library versions keep their focus and dismissal managers shared with the parent
Dialog or Sheet. The prior split also blocked popover typing and redirected
menu/select keyboard interaction to the parent. Isolated browser checks cover
actual wrappers, pointer and keyboard use, child Escape, focus return and the
untouched parent draft. A running-app check remains a separate deployment step.

Native `78c62f91` exposed a separate placement collision at a desktop-emulated
pinch scale of 1.5: the selected-target tools covered the question-mark button
even though both rectangles were inside the visible viewport. The placement
regressions cover compact public and wider admin tools, short and panned
viewports, and a purchase-bar-raised button. This correction must also pass the
same native center hit check after rollout; it is not an actual-phone claim.
