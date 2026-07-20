"use client";

import React, { useMemo } from "react";
import { WidgetProps } from "@courselit/common-models";
import { Link } from "@courselit/components-library";
import Settings, { BlockImage } from "./settings";
import * as defaults from "./defaults";

/** CSS-safe scope token derived from the widget instance id (stable across SSR). */
function toScope(id: string | undefined): string {
    const cleaned = (id || "").replace(/[^A-Za-z0-9_-]/g, "");
    return cleaned.length ? cleaned : "default";
}

/**
 * Resolve a picture to a `src`. The tagged union means there is exactly one
 * place a URL can come from, so there is no precedence rule to get wrong.
 */
function resolveImageSrc(image?: BlockImage): string {
    const source = image?.source;
    if (!source) {
        return "";
    }
    if (source.kind === "media") {
        return source.media?.file || source.media?.thumbnail || "";
    }
    return source.url || "";
}

const numLeadStyle: React.CSSProperties = {
    fontFamily: "var(--er-display)",
    fontStyle: "italic",
    color: "var(--ink)",
    fontSize: "18px",
    margin: 0,
};
const accessStyle: React.CSSProperties = {
    textAlign: "center",
    margin: "22px 0 0",
};
const accessInnerStyle: React.CSSProperties = {
    fontSize: "15px",
    color: "var(--ink)",
};

/**
 * Editorial — Resilience: a single self-contained magazine feature for the
 * 2026 Building Resilience course. A faithful port of the standalone
 * `03-editorial-magazine.html` mockup: masthead rules → cover → three
 * questions → feature body + "At a Glance" sidebar → mountains band →
 * highlights → pull-quote → dot-leadered contents → live-sessions dispatch →
 * namaste band → teacher profile → tilted bind-in CTA → contact.
 *
 * The whole stylesheet is emitted scoped to this instance's `data-editorial-
 * resilience` attribute (and every class is `er-` prefixed), so the intricate
 * editorial CSS — multi-column body, drop-caps, dot leaders, the rotated
 * bind-in card, the breath-paced motion — cannot leak into or be clobbered by
 * the rest of the page. Colours are the Anahata palette (hardcoded hex, the
 * same convention the sibling anahata-* blocks use); fonts ride the app's own
 * next/font CSS variables so nothing external is loaded.
 *
 * The block renders the feature BODY only. The page keeps its Anahata header
 * and footer chrome, so the mockup's own masthead logo/dateline and footer are
 * intentionally dropped.
 */
export default function Widget({
    id,
    settings: {
        coverImage = defaults.coverImage,
        mountainsImage = defaults.mountainsImage,
        namasteImage = defaults.namasteImage,
        portraitImage = defaults.portraitImage,
        signatureImage = defaults.signatureImage,
        enrolCaption = defaults.enrolCaption,
        enrolAction = defaults.enrolAction,
        cssId,
    },
}: WidgetProps<Settings>) {
    const scope = useMemo(() => toScope(id), [id]);
    const S = `[data-editorial-resilience="${scope}"]`;

    const coverSrc = resolveImageSrc(coverImage);
    const mountainsSrc = resolveImageSrc(mountainsImage);
    const namasteSrc = resolveImageSrc(namasteImage);
    const portraitSrc = resolveImageSrc(portraitImage);
    const signatureSrc = resolveImageSrc(signatureImage);
    const showEnrol = Boolean(enrolCaption && enrolAction);

    const css = `
${S}{
  --cream:#f7f4eb; --card:#ffffff; --ink:#545454; --cocoa:#312110;
  --saffron:#ff9900; --rust:#993300; --rust-pressed:#7a2900; --amber:#ffbf00;
  --marigold:#f6d36a; --sand:#f6d3a1; --border-warm:#9c7f52;
  --ocean:#216097; --navy:#012772;
  --er-display: var(--font-playfair-display), "Playfair Display", Georgia, serif;
  --er-body: var(--font-open-sans), "Open Sans", -apple-system, "Segoe UI", sans-serif;
  --er-measure:1180px;
  display:block; background:var(--cream); color:var(--ink);
  font-family:var(--er-body); font-size:16px; line-height:1.62;
  -webkit-font-smoothing:antialiased; overflow-x:hidden;
}
${S} *{ box-sizing:border-box; }
${S} img{ max-width:100%; display:block; }
${S} .er-wrap{ max-width:var(--er-measure); margin:0 auto; padding:0 40px; }

${S} .er-kicker{ font-family:var(--er-body); font-weight:700; text-transform:uppercase; letter-spacing:.24em; font-size:12px; color:var(--rust); margin:0; }
${S} .er-hair{ border:0; border-top:1px solid var(--border-warm); margin:0; }
${S} .er-hair-rust{ border-top:2px solid var(--rust); }
${S} .er-num-lead{ font-variant-numeric:tabular-nums; }

${S} .er-mast-rule{ height:6px; background:var(--rust); }
${S} .er-mast-rule-thin{ height:1px; background:var(--amber); }

${S} .er-cover{ padding:70px 0 40px; }
${S} .er-cover .er-wrap{ display:grid; grid-template-columns:1.55fr 1fr; gap:56px; align-items:end; }
${S} .er-cover-kicker{ margin-bottom:26px; }
${S} .er-cover h1{ font-family:var(--er-display); font-weight:800; color:var(--rust); font-size:clamp(58px,8.5vw,118px); line-height:.94; letter-spacing:-.015em; margin:0 0 4px; }
${S} .er-cover h1 .er-thin{ font-weight:400; font-style:italic; display:block; font-size:.44em; letter-spacing:-.01em; color:var(--cocoa); margin-top:.35em; line-height:1.05; }
${S} .er-standfirst{ font-family:var(--er-display); font-weight:400; font-size:22px; line-height:1.5; color:var(--cocoa); max-width:34ch; margin:30px 0 22px; }
${S} .er-standfirst .er-drop{ color:var(--rust); }
${S} .er-byline{ font-size:13px; letter-spacing:.14em; text-transform:uppercase; color:var(--ink); font-weight:600; }
${S} .er-byline b{ color:var(--rust); font-weight:700; }
${S} .er-cover-fig{ margin:0; }
${S} .er-cover-fig .er-frame{ border:1px solid var(--border-warm); padding:8px; background:var(--card); }
${S} .er-cover-fig img{ width:100%; height:auto; }
${S} .er-figcap{ font-size:12.5px; line-height:1.45; color:var(--ink); margin-top:10px; padding-top:8px; border-top:1px solid var(--border-warm); font-style:italic; }
${S} .er-figcap b{ font-style:normal; font-weight:700; color:var(--cocoa); text-transform:uppercase; letter-spacing:.08em; font-size:11px; }

${S} .er-questions{ padding:64px 0; }
${S} .er-questions .er-wrap{ max-width:960px; }
${S} .er-q-kicker{ text-align:center; margin-bottom:34px; }
${S} .er-q-list{ list-style:none; margin:0; padding:0; counter-reset:q; }
${S} .er-q-list li{ font-family:var(--er-display); font-weight:400; font-size:clamp(26px,3.8vw,40px); line-height:1.24; color:var(--cocoa); padding:26px 0 26px 78px; position:relative; border-top:1px solid rgba(49,33,16,.16); }
${S} .er-q-list li:first-child{ border-top:0; }
${S} .er-q-list li::before{ counter-increment:q; content:"0" counter(q); position:absolute; left:0; top:30px; font-family:var(--er-display); font-style:italic; font-weight:500; font-size:24px; color:var(--rust); line-height:1; }
${S} .er-q-list li em{ font-style:italic; color:var(--rust); }
${S} .er-q-join{ max-width:60ch; margin:44px auto 0; text-align:center; font-size:17px; line-height:1.7; color:var(--ink); }
${S} .er-q-join b{ color:var(--cocoa); font-weight:700; }

${S} .er-feature{ padding:20px 0 40px; }
${S} .er-feature .er-wrap{ display:grid; grid-template-columns:repeat(12,1fr); gap:40px; }
${S} .er-feature-head{ grid-column:1 / -1; margin-bottom:8px; }
${S} .er-feature-head .er-an-h2{ font-family:var(--er-display); font-weight:600; color:var(--rust); font-size:36px; margin:14px 0 0; line-height:1.1; }
${S} .er-cols{ grid-column:1 / 9; }
${S} .er-cols-inner{ columns:2; column-gap:38px; }
${S} .er-cols-inner p{ margin:0 0 1.05em; text-align:justify; hyphens:auto; }
${S} .er-cols-inner p.er-lead::first-letter{ font-family:var(--er-display); font-weight:800; color:var(--rust); float:left; font-size:78px; line-height:.72; padding:8px 12px 0 0; }
${S} .er-pull{ column-span:all; margin:18px 0 22px; padding:22px 0; border-top:2px solid var(--rust); border-bottom:1px solid var(--border-warm); font-family:var(--er-display); font-weight:500; font-style:italic; font-size:27px; line-height:1.32; color:var(--rust); text-align:center; }
${S} .er-glance{ grid-column:9 / -1; }
${S} .er-glance-box{ border:1px solid var(--cocoa); background:var(--card); }
${S} .er-glance-box .er-gh{ background:var(--cocoa); color:#fff; padding:14px 18px; font-family:var(--er-body); font-weight:700; letter-spacing:.2em; text-transform:uppercase; font-size:12px; }
${S} .er-glance-grid{ padding:6px 18px 14px; }
${S} .er-glance-row{ display:flex; align-items:baseline; gap:14px; padding:14px 0; border-bottom:1px solid rgba(49,33,16,.12); }
${S} .er-glance-row:last-child{ border-bottom:0; }
${S} .er-glance-fig{ font-family:var(--er-display); font-weight:800; color:var(--rust); font-size:44px; line-height:.9; min-width:1.6ch; text-align:right; font-variant-numeric:tabular-nums; }
${S} .er-glance-fig.er-sm{ font-size:30px; }
${S} .er-glance-lab{ font-size:13.5px; line-height:1.35; color:var(--cocoa); }
${S} .er-glance-lab b{ display:block; font-weight:700; text-transform:uppercase; letter-spacing:.06em; font-size:11px; color:var(--ink); }
${S} .er-glance-price{ background:var(--marigold); text-align:center; padding:18px; }
${S} .er-glance-price .er-amt{ font-family:var(--er-display); font-weight:800; color:var(--cocoa); font-size:46px; line-height:1; }
${S} .er-glance-price .er-amt small{ font-size:.44em; font-weight:600; vertical-align:.5em; margin-right:2px; }
${S} .er-glance-price .er-plan{ font-size:11.5px; letter-spacing:.14em; text-transform:uppercase; color:#5a3d14; margin-top:6px; font-weight:600; }
${S} .er-marginnote{ margin-top:18px; padding-left:14px; border-left:2px solid var(--saffron); font-size:13px; line-height:1.55; color:var(--ink); font-style:italic; }
${S} .er-marginnote b{ font-style:normal; color:var(--cocoa); }

${S} .er-band{ position:relative; margin:40px 0; }
${S} .er-band-img{ width:100%; height:clamp(260px,42vw,460px); object-fit:cover; display:block; }
${S} .er-band-cap{ position:absolute; left:0; bottom:0; right:0; background:linear-gradient(to top, rgba(49,33,16,.9), rgba(49,33,16,.62)); color:#fff; padding:40px 40px 20px; }
${S} .er-band-cap .er-wrap{ padding:0; }
${S} .er-band-cap .er-an-h2{ font-family:var(--er-display); color:#fff; font-weight:500; font-size:clamp(24px,3.4vw,38px); margin:0; line-height:1.15; }
${S} .er-band-cap p{ margin:8px 0 0; max-width:52ch; font-size:14.5px; color:#f3ece0; }

${S} .er-highlights{ padding:56px 0; }
${S} .er-hl-head{ display:flex; align-items:flex-end; justify-content:space-between; gap:20px; flex-wrap:wrap; margin-bottom:6px; }
${S} .er-hl-head h2{ font-family:var(--er-display); font-weight:600; color:var(--rust); font-size:38px; margin:8px 0 0; }
${S} .er-hl-grid{ margin-top:26px; display:grid; grid-template-columns:repeat(2,1fr); gap:0 56px; }
${S} .er-hl-item{ display:grid; grid-template-columns:auto 1fr; gap:20px; padding:26px 0; border-top:1px solid rgba(49,33,16,.16); align-items:start; }
${S} .er-hl-num{ font-family:var(--er-display); font-weight:400; font-style:italic; color:var(--rust); font-size:40px; line-height:.9; }
${S} .er-hl-item h3{ font-family:var(--er-body); font-weight:700; color:var(--rust); font-size:18px; margin:0 0 6px; letter-spacing:.01em; }
${S} .er-hl-item p{ margin:0; font-size:15px; line-height:1.55; color:var(--ink); }

${S} .er-statement{ padding:76px 0; text-align:center; }
${S} .er-statement .er-wrap{ max-width:900px; }
${S} .er-breath-mark{ width:14px; height:14px; border-radius:50%; background:var(--saffron); margin:0 auto 30px; }
${S} .er-statement blockquote{ margin:0; font-family:var(--er-display); font-weight:500; font-style:italic; font-size:clamp(28px,4.4vw,46px); line-height:1.28; color:var(--rust); letter-spacing:-.005em; }
${S} .er-statement blockquote .er-lg{ font-size:1.35em; font-style:normal; }

${S} .er-contents{ padding:20px 0 60px; }
${S} .er-contents-head{ text-align:center; margin-bottom:12px; }
${S} .er-contents-head h2{ font-family:var(--er-display); font-weight:600; color:var(--rust); font-size:42px; margin:10px 0 0; }
${S} .er-contents-head p{ margin:10px auto 0; max-width:52ch; font-size:15px; color:var(--ink); }
${S} .er-idx-grid{ display:grid; grid-template-columns:repeat(2,1fr); gap:20px 64px; margin-top:34px; }
${S} .er-idx-sec{ break-inside:avoid; }
${S} .er-idx-sec > .er-idx-secline{ display:flex; align-items:baseline; gap:14px; margin-bottom:6px; }
${S} .er-idx-secnum{ font-family:var(--er-display); font-style:italic; color:var(--rust); font-size:22px; font-weight:500; }
${S} .er-idx-sec h3{ font-family:var(--er-body); font-weight:700; text-transform:uppercase; letter-spacing:.08em; font-size:13px; color:var(--cocoa); margin:0; }
${S} .er-idx-sec .er-cnt{ margin-left:auto; font-size:11px; letter-spacing:.1em; color:var(--ink); }
${S} .er-idx-sec ul{ list-style:none; margin:0; padding:0; border-top:2px solid var(--rust); }
${S} .er-idx-row{ display:flex; align-items:baseline; gap:6px; padding:9px 0; border-bottom:1px solid rgba(49,33,16,.12); }
${S} .er-idx-title{ font-size:14.5px; color:var(--cocoa); }
${S} .er-idx-leader{ flex:1; border-bottom:1px dotted var(--border-warm); transform:translateY(-.28em); min-width:16px; }
${S} .er-idx-dur{ font-family:var(--er-body); font-variant-numeric:tabular-nums; font-size:13px; color:var(--rust); font-weight:600; white-space:nowrap; }
${S} .er-idx-dur.er-na{ color:var(--ink); font-weight:400; font-style:italic; }

${S} .er-live{ padding:10px 0 60px; }
${S} .er-live-box{ border:1px solid var(--cocoa); background:var(--card); display:grid; grid-template-columns:1.1fr 1fr; }
${S} .er-live-l{ padding:38px 40px; }
${S} .er-live-l .er-kicker{ margin-bottom:16px; }
${S} .er-live-l h2{ font-family:var(--er-display); font-weight:600; color:var(--rust); font-size:30px; line-height:1.16; margin:0 0 14px; }
${S} .er-live-l p{ margin:0 0 12px; font-size:15px; color:var(--ink); }
${S} .er-live-l p b{ color:var(--cocoa); }
${S} .er-live-r{ background:var(--cocoa); color:#fff; padding:38px 40px; }
${S} .er-live-r .er-kicker{ color:var(--marigold); margin-bottom:18px; }
${S} .er-live-dates{ font-family:var(--er-display); font-weight:500; font-size:26px; line-height:1.3; color:#fff; margin:0 0 22px; }
${S} .er-live-dates b{ color:var(--marigold); font-weight:600; }
${S} .er-tz{ list-style:none; margin:0; padding:0; }
${S} .er-tz li{ display:flex; justify-content:space-between; gap:14px; padding:9px 0; border-top:1px solid rgba(255,255,255,.18); font-size:14px; }
${S} .er-tz li:first-child{ border-top:0; }
${S} .er-tz .er-tz-time{ font-variant-numeric:tabular-nums; font-weight:700; color:var(--marigold); white-space:nowrap; }
${S} .er-tz .er-tz-zone{ color:#e9dcc9; letter-spacing:.06em; }

${S} .er-profile{ padding:20px 0 20px; }
${S} .er-profile .er-wrap{ display:grid; grid-template-columns:0.85fr 1.15fr; gap:52px; align-items:start; }
${S} .er-profile-figure{ margin:0; }
${S} .er-profile-figure .er-frame{ border:1px solid var(--border-warm); padding:8px; background:var(--card); }
${S} .er-profile-body .er-kicker{ margin-bottom:12px; }
${S} .er-profile-body h2{ font-family:var(--er-display); font-weight:700; color:var(--rust); font-size:44px; line-height:1.02; margin:0 0 4px; }
${S} .er-profile-role{ font-family:var(--er-display); font-style:italic; font-weight:400; color:var(--cocoa); font-size:19px; margin:0 0 24px; }
${S} .er-profile-cols{ columns:2; column-gap:36px; }
${S} .er-profile-cols p{ margin:0 0 1em; font-size:14.5px; line-height:1.62; text-align:justify; hyphens:auto; }
${S} .er-profile-cols p.er-lead::first-letter{ font-family:var(--er-display); font-weight:800; color:var(--rust); float:left; font-size:56px; line-height:.7; padding:6px 10px 0 0; }
${S} .er-sig{ margin-top:22px; }
${S} .er-sig img{ height:64px; width:auto; }
${S} .er-sig figcaption{ font-size:11px; letter-spacing:.18em; text-transform:uppercase; color:var(--ink); margin-top:6px; }

${S} .er-enrol{ padding:70px 0 84px; }
${S} .er-enrol .er-wrap{ display:flex; justify-content:center; }
${S} .er-bindin{ position:relative; transform:rotate(-1.6deg); background:var(--card); border:1px solid var(--cocoa); box-shadow:14px 16px 0 rgba(49,33,16,.10); max-width:640px; width:100%; }
${S} .er-bindin::before{ content:""; position:absolute; inset:9px; border:1px solid var(--border-warm); pointer-events:none; }
${S} .er-bindin-inner{ position:relative; padding:44px 48px 46px; text-align:center; }
${S} .er-bindin .er-perf{ position:absolute; left:0; right:0; top:-1px; height:16px; background-image:radial-gradient(circle, var(--cocoa) 1.3px, transparent 1.6px); background-size:12px 12px; background-position:center; opacity:.28; }
${S} .er-bindin .er-kicker{ margin-bottom:16px; }
${S} .er-bindin h2{ font-family:var(--er-display); font-weight:700; color:var(--rust); font-size:46px; line-height:1; margin:0 0 14px; }
${S} .er-bindin p{ margin:0 auto 8px; max-width:40ch; font-size:15.5px; color:var(--ink); }
${S} .er-bindin .er-when{ font-size:13px; letter-spacing:.06em; color:var(--cocoa); font-weight:600; margin:14px 0 4px; }
${S} .er-bindin .er-price-line{ font-family:var(--er-display); font-weight:800; color:var(--cocoa); font-size:40px; margin:20px 0 8px; }
${S} .er-bindin .er-price-line small{ font-size:.4em; font-weight:600; vertical-align:.6em; color:var(--ink); }
${S} .er-bindin .er-price-line .er-plan{ display:block; font-family:var(--er-body); font-size:11.5px; font-weight:600; letter-spacing:.16em; text-transform:uppercase; color:var(--ink); margin-top:6px; }

${S} .er-btn{ display:inline-block; background:var(--saffron); color:var(--cocoa); font-family:var(--er-body); font-weight:700; font-size:15px; letter-spacing:.04em; text-transform:uppercase; text-decoration:none; padding:16px 46px; border:none; border-radius:10px; cursor:pointer; min-width:220px; text-align:center; transition:background .1s ease-in, color .1s ease-in; }
${S} .er-btn:hover{ background:var(--rust); color:#fff; }
${S} .er-btn:active{ background:var(--rust-pressed); color:#fff; }
${S} .er-btn:focus-visible{ outline:2px solid var(--rust); outline-offset:3px; }
${S} .er-secondary{ display:inline-block; margin-top:18px; font-size:12px; letter-spacing:.2em; text-transform:uppercase; color:var(--rust); text-decoration:none; border-bottom:1px solid rgba(153,51,0,.5); padding-bottom:2px; transition:color .1s ease-in, border-color .1s ease-in; }
${S} .er-secondary:hover{ color:var(--rust-pressed); border-color:var(--rust-pressed); }
${S} .er-secondary:focus-visible{ outline:2px solid var(--rust); outline-offset:2px; }
${S} .er-secondary{ display:block; }

${S} .er-contact{ text-align:center; padding:20px 0 60px; }
${S} .er-contact p{ margin:0 0 6px; }
${S} .er-contact .er-q{ font-family:var(--er-display); font-style:italic; color:var(--rust); font-size:24px; }
${S} .er-contact .er-e{ font-size:14px; letter-spacing:.04em; color:var(--ink); }
${S} .er-link{ color:var(--rust); text-decoration:none; border-bottom:1px solid rgba(153,51,0,.4); transition:color .1s ease-in, border-color .1s ease-in; }
${S} .er-link:hover{ color:var(--rust-pressed); border-color:var(--rust-pressed); }
${S} .er-link:focus-visible{ outline:2px solid var(--rust); outline-offset:2px; }

@media (prefers-reduced-motion: no-preference){
  ${S} .er-rise{ opacity:0; transform:translateY(14px); animation:er-breathe-in 1.1s cubic-bezier(.22,.61,.36,1) forwards; }
  ${S} .er-cover .er-cover-fig.er-rise{ animation-delay:.15s; }
  ${S} .er-cover .er-standfirst.er-rise{ animation-delay:.1s; }
  @keyframes er-breathe-in{ to{ opacity:1; transform:none; } }
  ${S} .er-breath-mark{ animation:er-breath 6s ease-in-out infinite; }
  @keyframes er-breath{ 0%,100%{ transform:scale(1); opacity:.55; } 45%{ transform:scale(2.4); opacity:1; } }
}

@media (max-width:900px){
  ${S} .er-wrap{ padding:0 24px; }
  ${S} .er-cover .er-wrap{ grid-template-columns:1fr; gap:34px; align-items:start; }
  ${S} .er-cover{ padding:44px 0 20px; }
  ${S} .er-feature .er-wrap{ grid-template-columns:1fr; gap:30px; }
  ${S} .er-cols{ grid-column:auto; }
  ${S} .er-glance{ grid-column:auto; }
  ${S} .er-cols-inner{ columns:1; }
  ${S} .er-hl-grid{ grid-template-columns:1fr; }
  ${S} .er-live-box{ grid-template-columns:1fr; }
  ${S} .er-profile .er-wrap{ grid-template-columns:1fr; gap:30px; }
  ${S} .er-profile-cols{ columns:1; }
  ${S} .er-idx-grid{ grid-template-columns:1fr; gap:20px; }
  ${S} .er-contents-head h2{ font-size:34px; }
}
@media (max-width:420px){
  ${S}{ font-size:15px; }
  ${S} .er-wrap{ padding:0 18px; }
  ${S} .er-cover h1{ font-size:clamp(46px,14vw,64px); }
  ${S} .er-q-list li{ padding-left:56px; font-size:23px; }
  ${S} .er-glance-fig{ font-size:36px; }
  ${S} .er-bindin-inner{ padding:34px 24px 36px; }
  ${S} .er-bindin h2{ font-size:34px; }
  ${S} .er-btn{ min-width:0; width:100%; padding:16px 20px; }
  ${S} .er-profile-body h2{ font-size:34px; }
  ${S} .er-band-cap{ padding:24px 18px 16px; }
}
`;

    return (
        <div
            id={cssId || undefined}
            data-editorial-resilience={scope}
            className="w-full"
        >
            <style>{css}</style>

            {/* Opening flourish — the site's Anahata header sits above this;
                these two rules stand in for the magazine masthead. */}
            <div className="er-mast-rule" />
            <div className="er-mast-rule-thin" />

            {/* ===== COVER ===== */}
            <section className="er-cover">
                <div className="er-wrap">
                    <div className="er-cover-lead">
                        <p className="er-kicker er-cover-kicker er-rise">
                            2026 · 4-Week Online Course · Breath &amp; Nervous
                            System
                        </p>
                        <h1 className="er-rise">
                            Building
                            <br />
                            Resilience
                            <span className="er-thin">
                                Train both your body and mind to function
                                harmoniously.
                            </span>
                        </h1>
                        <p className="er-standfirst er-rise">
                            <span className="er-drop">
                                Embrace your innate ability
                            </span>{" "}
                            to return to your center, rise from challenges, and
                            creatively tackle obstacles.
                        </p>
                        <p className="er-byline er-rise">
                            Guided by <b>Swami Karma Karuna</b>
                        </p>
                    </div>
                    {coverSrc && (
                        <figure className="er-cover-fig er-rise">
                            <div className="er-frame">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={coverSrc} alt={coverImage.alt} />
                            </div>
                            <figcaption className="er-figcap">
                                <b>Fig. 1</b>&nbsp;Stillness practised in the
                                New Zealand bush — resilience that transcends
                                the mat and enters daily life.
                            </figcaption>
                        </figure>
                    )}
                </div>
            </section>

            {/* ===== THREE QUESTIONS ===== */}
            <section className="er-questions">
                <div className="er-wrap">
                    <p className="er-kicker er-q-kicker">
                        Before we begin — three questions
                    </p>
                    <ul className="er-q-list">
                        <li>
                            Are you wanting to improve your ability to withstand{" "}
                            <em>life&rsquo;s challenges?</em>
                        </li>
                        <li>
                            Do you wish you had a greater capacity to{" "}
                            <em>cope and adapt</em> to adversity?
                        </li>
                        <li>
                            Are you wanting to intentionally <em>respond</em> to
                            life rather than react?
                        </li>
                    </ul>
                    <p className="er-q-join">
                        Join <b>Swami Karma Karuna</b> for an enriching course
                        where you&rsquo;ll learn to gracefully respond to
                        life&rsquo;s challenges with resilience and strength.
                        Train both your body and mind to function harmoniously
                        and maintain more balance in daily life.
                    </p>
                </div>
            </section>

            {/* ===== FEATURE BODY + AT A GLANCE ===== */}
            <section className="er-feature">
                <div className="er-wrap">
                    <div className="er-feature-head">
                        <p className="er-kicker">The Course · Overview</p>
                        <h2 className="er-an-h2">
                            A comprehensive toolkit to support your body, mind,
                            and nervous system.
                        </h2>
                    </div>

                    <div className="er-cols">
                        <div className="er-cols-inner">
                            <p className="er-lead">
                                Embrace your innate ability to return to your
                                center, rise from challenges, and creatively
                                tackle obstacles. Resilience is not just an
                                option; it&rsquo;s essential for navigating the
                                complexities of modern life. &lsquo;Building
                                Resilience&rsquo; with Swami Karma Karuna offers
                                you a comprehensive toolkit to support your
                                body, mind, and nervous system amid global
                                changes.
                            </p>
                            <p className="er-pull">
                                Resilience is not just an option; it&rsquo;s
                                essential for navigating the complexities of
                                modern life.
                            </p>
                            <p>
                                Dive into 4 interactive live sessions with Swami
                                Karma Karuna, alongside in-depth theory, yoga,
                                breathing, relaxation exercises, and
                                introspective practices. Experience how Hatha
                                Yoga subtly introduces manageable stress levels,
                                promoting resilience that transcends the yoga
                                mat and enters daily life.
                            </p>
                            <p>
                                Learn the profound impact of simple yet potent
                                yogic tools on your journey to cultivating a
                                resilient body and mind. This course welcomes
                                everyone, from total beginners to seasoned
                                practitioners.
                            </p>
                        </div>
                    </div>

                    <aside className="er-glance">
                        <div className="er-glance-box">
                            <div className="er-gh">At a Glance</div>
                            <div className="er-glance-grid">
                                <div className="er-glance-row">
                                    <span className="er-glance-fig">4</span>
                                    <span className="er-glance-lab">
                                        <b>Live sessions</b>1.5-hour Zoom
                                        classes with Swami Karma Karuna
                                    </span>
                                </div>
                                <div className="er-glance-row">
                                    <span className="er-glance-fig">7</span>
                                    <span className="er-glance-lab">
                                        <b>Short videos</b>Inspirational
                                        teaching, 5–12 minutes each
                                    </span>
                                </div>
                                <div className="er-glance-row">
                                    <span className="er-glance-fig">6</span>
                                    <span className="er-glance-lab">
                                        <b>Practice MP3s</b>Breath, yoga nidra
                                        &amp; meditation audio
                                    </span>
                                </div>
                                <div className="er-glance-row">
                                    <span className="er-glance-fig er-sm">
                                        3
                                    </span>
                                    <span className="er-glance-lab">
                                        <b>Months access</b>All materials fully
                                        downloadable to keep
                                    </span>
                                </div>
                            </div>
                            <div className="er-glance-price">
                                <div className="er-amt">
                                    <small>NZD</small>$247
                                </div>
                                <div className="er-plan">
                                    One-time enrolment
                                </div>
                            </div>
                        </div>
                        <p className="er-marginnote">
                            <b>A note in the margin —</b> Experience how Hatha
                            Yoga subtly introduces manageable stress levels,
                            promoting resilience that transcends the yoga mat
                            and enters daily life.
                        </p>
                    </aside>
                </div>
            </section>

            {/* ===== FIGURE BAND — mountains ===== */}
            {mountainsSrc && (
                <figure className="er-band">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        className="er-band-img"
                        src={mountainsSrc}
                        alt={mountainsImage.alt}
                    />
                    <figcaption className="er-band-cap">
                        <div className="er-wrap">
                            <p className="er-an-h2">
                                Resilience that transcends the yoga mat.
                            </p>
                            <p>
                                Learn the profound impact of simple yet potent
                                yogic tools on your journey to cultivating a
                                resilient body and mind.
                            </p>
                        </div>
                    </figcaption>
                </figure>
            )}

            {/* ===== HIGHLIGHTS ===== */}
            <section className="er-highlights">
                <div className="er-wrap">
                    <div className="er-hl-head">
                        <div>
                            <p className="er-kicker">
                                What you&rsquo;ll cultivate
                            </p>
                            <h2>Course Highlights</h2>
                        </div>
                        <p className="er-num-lead" style={numLeadStyle}>
                            Five movements, one practice.
                        </p>
                    </div>
                    <hr className="er-hair er-hair-rust" />
                    <div className="er-hl-grid">
                        <div className="er-hl-item">
                            <span className="er-hl-num">01</span>
                            <div>
                                <h3>Mindful Responses</h3>
                                <p>
                                    Cultivate the art of responding, not
                                    reacting, to life&rsquo;s ups and downs.
                                </p>
                            </div>
                        </div>
                        <div className="er-hl-item">
                            <span className="er-hl-num">02</span>
                            <div>
                                <h3>Nervous System Mastery</h3>
                                <p>
                                    Engage in practices like conscious
                                    breathing, yoga nidra, and restorative yoga
                                    to soothe and stabilize your nervous system.
                                </p>
                            </div>
                        </div>
                        <div className="er-hl-item">
                            <span className="er-hl-num">03</span>
                            <div>
                                <h3>Everyday Resilience Techniques</h3>
                                <p>
                                    Equip yourself with practical strategies for
                                    resilience you can apply in daily life.
                                </p>
                            </div>
                        </div>
                        <div className="er-hl-item">
                            <span className="er-hl-num">04</span>
                            <div>
                                <h3>Neural Pathway Reformation</h3>
                                <p>
                                    Develop new brain pathways that support
                                    resilience and equanimity.
                                </p>
                            </div>
                        </div>
                        <div className="er-hl-item">
                            <span className="er-hl-num">05</span>
                            <div>
                                <h3>Supportive Live Sessions</h3>
                                <p>
                                    Access live guidance and support from Swami
                                    Karma Karuna.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ===== PULL-QUOTE STATEMENT ===== */}
            <section className="er-statement">
                <div className="er-wrap">
                    <div className="er-breath-mark" aria-hidden="true" />
                    <blockquote>
                        <span className="er-lg">Luckily,</span> our inner
                        resilience is a natural part of who we are and is a
                        trait that we can strengthen, cultivate and build upon.
                    </blockquote>
                </div>
            </section>

            {/* ===== CONTENTS / INDEX ===== */}
            <section className="er-contents">
                <div className="er-wrap">
                    <div className="er-contents-head">
                        <p className="er-kicker">Everything included</p>
                        <h2>The Contents</h2>
                        <p>
                            All course materials are fully downloadable so you
                            can continue your practice indefinitely.
                        </p>
                    </div>
                    <div className="er-idx-grid">
                        <div className="er-idx-sec">
                            <div className="er-idx-secline">
                                <span className="er-idx-secnum">I.</span>
                                <h3>Inspirational Short Videos</h3>
                                <span className="er-cnt">7 films</span>
                            </div>
                            <ul>
                                <li className="er-idx-row">
                                    <span className="er-idx-title">
                                        What is Resilience?
                                    </span>
                                    <span className="er-idx-leader" />
                                    <span className="er-idx-dur">5 min</span>
                                </li>
                                <li className="er-idx-row">
                                    <span className="er-idx-title">
                                        The Breath
                                    </span>
                                    <span className="er-idx-leader" />
                                    <span className="er-idx-dur">11 min</span>
                                </li>
                                <li className="er-idx-row">
                                    <span className="er-idx-title">
                                        Yoga Nidra
                                    </span>
                                    <span className="er-idx-leader" />
                                    <span className="er-idx-dur">11 min</span>
                                </li>
                                <li className="er-idx-row">
                                    <span className="er-idx-title">
                                        Stress &amp; the Nervous System
                                    </span>
                                    <span className="er-idx-leader" />
                                    <span className="er-idx-dur">12 min</span>
                                </li>
                                <li className="er-idx-row">
                                    <span className="er-idx-title">Mantra</span>
                                    <span className="er-idx-leader" />
                                    <span className="er-idx-dur">8 min</span>
                                </li>
                                <li className="er-idx-row">
                                    <span className="er-idx-title">
                                        Hatha Yoga
                                    </span>
                                    <span className="er-idx-leader" />
                                    <span className="er-idx-dur">8 min</span>
                                </li>
                                <li className="er-idx-row">
                                    <span className="er-idx-title">
                                        Yoga Lifestyle Attitudes
                                    </span>
                                    <span className="er-idx-leader" />
                                    <span className="er-idx-dur">11 min</span>
                                </li>
                            </ul>
                        </div>

                        <div className="er-idx-sec">
                            <div className="er-idx-secline">
                                <span className="er-idx-secnum">II.</span>
                                <h3>Practice MP3s &amp; Videos</h3>
                                <span className="er-cnt">6 practices</span>
                            </div>
                            <ul>
                                <li className="er-idx-row">
                                    <span className="er-idx-title">
                                        Natural Breath Meditation · MP3
                                    </span>
                                    <span className="er-idx-leader" />
                                    <span className="er-idx-dur">19:39</span>
                                </li>
                                <li className="er-idx-row">
                                    <span className="er-idx-title">
                                        Yogic Breath · MP3
                                    </span>
                                    <span className="er-idx-leader" />
                                    <span className="er-idx-dur er-na">
                                        MP3
                                    </span>
                                </li>
                                <li className="er-idx-row">
                                    <span className="er-idx-title">
                                        4-stage Yoga Nidra · MP3
                                    </span>
                                    <span className="er-idx-leader" />
                                    <span className="er-idx-dur">20:10</span>
                                </li>
                                <li className="er-idx-row">
                                    <span className="er-idx-title">
                                        8-stage Yoga Nidra · MP3
                                    </span>
                                    <span className="er-idx-leader" />
                                    <span className="er-idx-dur">28:58</span>
                                </li>
                                <li className="er-idx-row">
                                    <span className="er-idx-title">
                                        Inner Silence Meditation (Antar Mouna)
                                    </span>
                                    <span className="er-idx-leader" />
                                    <span className="er-idx-dur">18:34</span>
                                </li>
                                <li className="er-idx-row">
                                    <span className="er-idx-title">
                                        Restorative Yoga · Video
                                    </span>
                                    <span className="er-idx-leader" />
                                    <span className="er-idx-dur">30 min</span>
                                </li>
                            </ul>
                        </div>

                        <div className="er-idx-sec">
                            <div className="er-idx-secline">
                                <span className="er-idx-secnum">III.</span>
                                <h3>Morning Mantras MP3s</h3>
                                <span className="er-cnt">6 mantras</span>
                            </div>
                            <ul>
                                <li className="er-idx-row">
                                    <span className="er-idx-title">
                                        Peace Mantra
                                    </span>
                                    <span className="er-idx-leader" />
                                    <span className="er-idx-dur">4:18</span>
                                </li>
                                <li className="er-idx-row">
                                    <span className="er-idx-title">
                                        Maha Mritunjaya Healing Mantra
                                    </span>
                                    <span className="er-idx-leader" />
                                    <span className="er-idx-dur">3:07</span>
                                </li>
                                <li className="er-idx-row">
                                    <span className="er-idx-title">
                                        Gayatri Mantra for Energy and Intuition
                                    </span>
                                    <span className="er-idx-leader" />
                                    <span className="er-idx-dur">3:17</span>
                                </li>
                                <li className="er-idx-row">
                                    <span className="er-idx-title">
                                        Durga Mantra for Strength
                                    </span>
                                    <span className="er-idx-leader" />
                                    <span className="er-idx-dur">4:16</span>
                                </li>
                                <li className="er-idx-row">
                                    <span className="er-idx-title">
                                        Hanuman Chalisa for Courage and Faith
                                    </span>
                                    <span className="er-idx-leader" />
                                    <span className="er-idx-dur">10:22</span>
                                </li>
                                <li className="er-idx-row">
                                    <span className="er-idx-title">
                                        Closing Mantras
                                    </span>
                                    <span className="er-idx-leader" />
                                    <span className="er-idx-dur">3:03</span>
                                </li>
                            </ul>
                        </div>

                        <div className="er-idx-sec">
                            <div className="er-idx-secline">
                                <span className="er-idx-secnum">IV.</span>
                                <h3>Other Resources</h3>
                                <span className="er-cnt">3 readings</span>
                            </div>
                            <ul>
                                <li className="er-idx-row">
                                    <span className="er-idx-title">
                                        Yoga and Resilience Article
                                    </span>
                                    <span className="er-idx-leader" />
                                    <span className="er-idx-dur er-na">
                                        Read
                                    </span>
                                </li>
                                <li className="er-idx-row">
                                    <span className="er-idx-title">
                                        SWAN Sadhana — Strength, Weaknesses,
                                        Aims &amp; Needs
                                    </span>
                                    <span className="er-idx-leader" />
                                    <span className="er-idx-dur er-na">
                                        Practice
                                    </span>
                                </li>
                                <li className="er-idx-row">
                                    <span className="er-idx-title">
                                        Managing Mind and Emotions Article
                                    </span>
                                    <span className="er-idx-leader" />
                                    <span className="er-idx-dur er-na">
                                        Read
                                    </span>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            </section>

            {/* ===== LIVE SESSIONS DISPATCH ===== */}
            <section className="er-live">
                <div className="er-wrap">
                    <div className="er-live-box">
                        <div className="er-live-l">
                            <p className="er-kicker">
                                Live &amp; together · on Zoom
                            </p>
                            <h2>
                                4× Live ZOOM Sessions with Swami Karma Karuna
                            </h2>
                            <p>
                                <b>1.5 hours each</b>, recordings available if
                                you cannot attend live.
                            </p>
                            <p>
                                &amp; Extra Resources including additional
                                theory, Q and A, and a resilience practice each
                                week.
                            </p>
                        </div>
                        <div className="er-live-r">
                            <p className="er-kicker">Thursdays in July</p>
                            <p className="er-live-dates">
                                <b>
                                    2nd, 9th,
                                    <br />
                                    16th &amp; 23rd
                                </b>
                                <br />
                                of July
                            </p>
                            <ul className="er-tz">
                                <li>
                                    <span className="er-tz-zone">
                                        New Zealand (NZT)
                                    </span>
                                    <span className="er-tz-time">7:00 pm</span>
                                </li>
                                <li>
                                    <span className="er-tz-zone">
                                        Australia East (AEST)
                                    </span>
                                    <span className="er-tz-time">5:00 pm</span>
                                </li>
                                <li>
                                    <span className="er-tz-zone">
                                        Central Europe (CEST)
                                    </span>
                                    <span className="er-tz-time">9:00 am</span>
                                </li>
                                <li>
                                    <span className="er-tz-zone">
                                        Singapore (SGT)
                                    </span>
                                    <span className="er-tz-time">3:00 pm</span>
                                </li>
                            </ul>
                        </div>
                    </div>
                    <p style={accessStyle}>
                        <span style={accessInnerStyle}>
                            Course content is accessible for 3 months from time
                            of enrollment. All course materials are fully
                            downloadable so you can continue your practice
                            indefinitely.
                        </span>
                    </p>
                </div>
            </section>

            {/* ===== FIGURE BAND — namaste ===== */}
            {namasteSrc && (
                <figure className="er-band">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        className="er-band-img"
                        src={namasteSrc}
                        alt={namasteImage.alt}
                    />
                    <figcaption className="er-band-cap">
                        <div className="er-wrap">
                            <p className="er-an-h2">
                                This course welcomes everyone.
                            </p>
                            <p>
                                From total beginners to seasoned practitioners —
                                body and mind, trained to function harmoniously.
                            </p>
                        </div>
                    </figcaption>
                </figure>
            )}

            {/* ===== PROFILE / BIO ===== */}
            <section className="er-profile">
                <div className="er-wrap">
                    {portraitSrc && (
                        <figure className="er-profile-figure">
                            <div className="er-frame">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={portraitSrc}
                                    alt={portraitImage.alt}
                                />
                            </div>
                            <figcaption className="er-figcap">
                                <b>The Teacher</b>&nbsp;Swami Karma Karuna
                                Saraswati — co-founder and director of Anahata
                                Yoga Retreat.
                            </figcaption>
                        </figure>
                    )}
                    <div className="er-profile-body">
                        <p className="er-kicker">The Profile</p>
                        <h2>Swami Karma Karuna</h2>
                        <p className="er-profile-role">
                            Thirty years in the yoga field — teacher, therapist,
                            writer.
                        </p>
                        <div className="er-profile-cols">
                            <p className="er-lead">
                                Swami Karma Karuna Saraswati is an engaging,
                                intuitive yoga and meditation teacher,
                                inspirational speaker, writer and IAYT Certified
                                Yoga Therapist with 30 years of experience in
                                the yoga field, including significant training
                                in Nepal and India and ongoing visits and
                                guidance with her teachers from the Bihar School
                                of Yoga. She is certified by Yoga Alliance and
                                Yoga New Zealand, and is a senior teacher of
                                Yoga Australia/New Zealand.
                            </p>
                            <p>
                                A Bachelor of Arts in Interpersonal
                                Communications with a minor in Psychology
                                determined an early interest in working with
                                groups and individuals. Swami Karma Karuna
                                specialises in a range of areas such as stress
                                and emotion management, Yoga Nidra, Restorative
                                Yoga, Prana, Chakras, Yoga Psychology and
                                Women&rsquo;s Health.
                            </p>
                            <p>
                                She is also a co-founder and director of Anahata
                                Yoga Retreat, New Zealand and travels throughout
                                the world, leading workshops, training yoga
                                teachers, presenting at international events,
                                guiding spiritual sadhana retreats and offering
                                therapeutic one to one yoga sessions.
                            </p>
                            <p>
                                Swami Karma Karuna is passionate about sharing
                                an authentic and down to earth approach, weaving
                                together the ancient practices with a touch of
                                psychology and brain science aimed at motivating
                                people to live their yoga here and now.
                            </p>
                        </div>
                        {signatureSrc && (
                            <figure className="er-sig">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={signatureSrc}
                                    alt={signatureImage.alt}
                                />
                                <figcaption>
                                    Anahata Yoga Retreat · New Zealand
                                </figcaption>
                            </figure>
                        )}
                    </div>
                </div>
            </section>

            {/* ===== BIND-IN CTA CARD ===== */}
            <section className="er-enrol">
                <div className="er-wrap">
                    <div className="er-bindin">
                        <span className="er-perf" aria-hidden="true" />
                        <div className="er-bindin-inner">
                            <p className="er-kicker">
                                Your place in the course
                            </p>
                            <h2>Build Your Resilience</h2>
                            <p>
                                Access live guidance and support from Swami
                                Karma Karuna.
                            </p>
                            <p className="er-when">
                                Thursdays · 2nd, 9th, 16th &amp; 23rd of July,
                                2026 · 7:00 pm NZT
                            </p>
                            <div className="er-price-line">
                                <small>NZD</small>&thinsp;$247
                                <span className="er-plan">
                                    One-time enrolment · 3 months access · keep
                                    every download
                                </span>
                            </div>
                            {showEnrol && (
                                <>
                                    <Link href={enrolAction} className="er-btn">
                                        {enrolCaption}
                                    </Link>
                                    <Link
                                        href={enrolAction}
                                        className="er-secondary"
                                    >
                                        Begin the practice →
                                    </Link>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </section>

            {/* ===== CONTACT ===== */}
            <section className="er-contact">
                <div className="er-wrap">
                    <p className="er-q">Questions? Get in touch!</p>
                    <p className="er-e">
                        Email:{" "}
                        <a
                            className="er-link"
                            href="mailto:yoga@anahata-retreat.org.nz"
                        >
                            yoga@anahata-retreat.org.nz
                        </a>
                    </p>
                </div>
            </section>
        </div>
    );
}
