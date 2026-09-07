# Shared media player and catalog previews

The lesson viewer, course audio introduction and catalog sample use `MediaPlayer`. It keeps one audio/video element across inline/fullscreen changes. Playback starts only from Play. Starting another exclusive player pauses the previous one; leaving the component pauses and releases the source. The existing course-introduction wrapper now delegates to the same component.

Video starts inline with `playsInline`. A physical portrait-to-landscape change requests fullscreen only while the video is playing. Returning to portrait exits this player's fullscreen. The component does not lock orientation, autoplay, select the next lesson or write learner progress. Rejected browser requests leave the video inline and expose the manual Fullscreen control. iPhone native fullscreen is a manual fallback; Member Mimic passes `presentation="inline-only"` so it cannot hide the surrounding identity banner/watermark. To use contextual commenting in native fullscreen, exit to the page first.

Controls include Play/Pause, bounded 15-second skip, seek/timing, mute, speed, manual fullscreen/exit, and supplied caption tracks/transcript links. No caption or transcript is invented. Controls use at least 44 CSS px hit areas, keyboard-operable native buttons/ranges/selects and accessible names. The dimensions concern hit areas, not square visible artwork.

Catalog cards show Membership, Class or Download. Subscription plans take the monthly amount when available and show explicit currency and period; one-time prices omit “once”. Preview controls are siblings of the product link and do not navigate or purchase. No preview appears until a separate public sample has been selected.

Admins can choose/upload a public audio sample in the existing product Manage details page and explicitly save it. The GraphQL `updateCourse` input accepts `previewAudioMediaId` (ID or null); `Course.previewAudio` returns the provider-validated public audio projection. Both selection and reads check tenant group, public access and audio MIME type. Selecting a private lesson file or arbitrary URL is rejected. Stored `previewAudio.mediaId` participates in the existing media-reference collector; removing/replacing a preview does not erase the original media. There is no new REST endpoint.

## Evidence and limits

[Spotify music-video support](https://support.spotify.com/nz/article/music-videos/) documents landscape fullscreen and timestamp continuity when switching audio/video. [Spotify podcast support](https://support.spotify.com/us/article/podcasts-and-shows/) documents speed and 15-second skip. These are references for familiar controls, not evidence of identical behavior on every Spotify platform. [WebKit's inline-video policy](https://webkit.org/blog/6784/new-video-policies-for-ios/) documents `playsinline` and user-gesture restrictions. [The Fullscreen standard](https://fullscreen.spec.whatwg.org/) permits an orientation-triggered request, but browser implementation and permissions still decide whether it succeeds. Native iPhone rotation and play-state behavior require device verification; unit tests cannot establish that hardware result.

Automated checks cover no autoplay/paused rotation, playing rotation and return with the same element/playhead/state, rejected requests and manual retry, explicit exit, Mimic inline presentation, native iPhone manual fallback, exclusive samples, retry/seek behavior, public-media validation, GraphQL exposure, and preview buttons outside product links.

## Manual verification

- Open a catalog. Nothing plays. Play a sample, then a second sample; the first stops and the page stays on the catalog.
- Open a video lesson on a phone in portrait. Tap Play, note the time, rotate to landscape and back. Confirm continuity; if automatic fullscreen is blocked, use Fullscreen and Exit.
- Pause before rotating. It stays inline and paused. After a manual fullscreen exit, it stays inline until another actual orientation change or tap.
- Enter Member Mimic and play video. Identity remains visible, fullscreen is unavailable, and no learner progress is written.
- Test seek, skip at both ends, keyboard navigation, speed, mute, available captions, failed media, route changes and native fullscreen exit. In native fullscreen, exit before selecting the component for a comment.
- Configure a separate public sample through product Manage details, Save, then load its public catalog card. Test removal and rejection of a private/other-tenant file.

The implementation subtask made no runtime/content changes, public media uploads or publications. Root performs the integrated browser/device review and Changes deck capture.
