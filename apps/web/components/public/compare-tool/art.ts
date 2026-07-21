// Easter-egg cursor art. Three creatures — a decorated egg, a chick, a full
// hen — rendered as parametric inline SVG so a single colour "pattern" ties
// all three together (the chick and hen wear the egg's colours as feathers).
// Each page that carries a compare tool gets its own palette, so the checkout
// egg and the resilience egg are visibly different birds.
//
// The art is validated at cursor scale (44–112px): every shape reads at a
// glance and the beak tip lands exactly on the declared hotspot, so the chick
// and hen point like a real arrow cursor.

export type Palette = {
    /** shell / body fill */
    base: string;
    /** four decorative colours, reused across egg bands, chick tufts, hen tail */
    accents: [string, string, string, string];
    beak: string;
    comb: string;
    legs: string;
};

export type CompareContext = "checkout" | "resilience";

export const PALETTES: Record<CompareContext, Palette> = {
    // warm — saffron / rust / marigold / ocean on a golden shell
    checkout: {
        base: "#ffe08a",
        accents: ["#ff9900", "#993300", "#f6d36a", "#216097"],
        beak: "#ff8a00",
        comb: "#c0392b",
        legs: "#e08a00",
    },
    // cool — ocean / forest / marigold / rust on a mint shell
    resilience: {
        base: "#bfe3d0",
        accents: ["#216097", "#2e7d5b", "#f6d36a", "#993300"],
        beak: "#f0a500",
        comb: "#b03a3a",
        legs: "#c98a2e",
    },
};

// A creature: an SVG <g> body drawn in a 0..100 viewBox, plus the hotspot
// point (also in viewBox units) that should sit under the pointer pixel.
type Creature = { svg: string; hot: { x: number; y: number } };

export function eggArt(p: Palette): Creature {
    const [a0, a1, a2, a3] = p.accents;
    const svg = `
    <g transform="rotate(-12 50 52)">
      <ellipse cx="50" cy="52" rx="30" ry="40" fill="${p.base}" stroke="#00000022" stroke-width="1"/>
      <clipPath id="egg"><ellipse cx="50" cy="52" rx="30" ry="40"/></clipPath>
      <g clip-path="url(#egg)">
        <path d="M20 34 Q35 26 50 34 T80 34 V44 H20 Z" fill="${a0}"/>
        <path d="M20 62 q7.5 -8 15 0 t15 0 t15 0 t15 0 V72 H20 Z" fill="${a1}"/>
        <g fill="${a3}">
          <circle cx="32" cy="52" r="3.4"/><circle cx="50" cy="52" r="3.4"/><circle cx="68" cy="52" r="3.4"/>
        </g>
        <path d="M22 82 l7 -7 l7 7 l7 -7 l7 7 l7 -7 l7 7" fill="none" stroke="${a2}" stroke-width="3.4" stroke-linejoin="round"/>
      </g>
      <ellipse cx="42" cy="34" rx="8" ry="12" fill="#ffffff" opacity=".28"/>
    </g>`;
    // egg is "armed but not yet pointing" — hotspot at its centre
    return { svg, hot: { x: 50, y: 50 } };
}

export function chickArt(p: Palette): Creature {
    const [a0, a1, a2, a3] = p.accents;
    // oriented so the beak points up-left, like an arrow tip
    const svg = `
    <g>
      <path d="M42 84 l-6 9 M42 84 l0 10 M42 84 l6 9" stroke="${p.legs}" stroke-width="3.2" fill="none" stroke-linecap="round"/>
      <path d="M60 84 l-6 9 M60 84 l0 10 M60 84 l6 9" stroke="${p.legs}" stroke-width="3.2" fill="none" stroke-linecap="round"/>
      <circle cx="52" cy="60" r="30" fill="${p.base}"/>
      <circle cx="38" cy="34" r="20" fill="${p.base}"/>
      <path d="M30 18 q-3 -10 4 -12 q2 7 -1 12 Z" fill="${a1}"/>
      <path d="M40 14 q0 -11 7 -10 q-1 8 -5 12 Z" fill="${a0}"/>
      <path d="M60 58 q16 4 12 20 q-12 2 -18 -8 Z" fill="${a2}"/>
      <path d="M58 66 q10 3 8 12" stroke="${a3}" stroke-width="2.4" fill="none"/>
      <path d="M16 14 L34 30 L30 40 Z" fill="${p.beak}" stroke="#00000022" stroke-width=".8"/>
      <circle cx="34" cy="30" r="3.6" fill="#2a1c0c"/>
      <circle cx="35.2" cy="28.8" r="1.1" fill="#fff"/>
    </g>`;
    return { svg, hot: { x: 16.5, y: 14.5 } };
}

export function henArt(p: Palette): Creature {
    const [a0, a1, a2, a3] = p.accents;
    const svg = `
    <g>
      <path d="M50 86 l0 10 M50 96 l-6 3 M50 96 l6 3" stroke="${p.legs}" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M64 86 l0 10 M64 96 l-6 3 M64 96 l6 3" stroke="${p.legs}" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M78 60 q20 -18 20 -34 q-14 6 -22 22 Z" fill="${a0}"/>
      <path d="M80 62 q18 -10 22 -24 q-12 3 -24 16 Z" fill="${a2}"/>
      <ellipse cx="52" cy="62" rx="34" ry="26" fill="${p.base}"/>
      <path d="M40 58 q22 -6 34 8 q-16 14 -34 4 Z" fill="${a1}"/>
      <path d="M44 60 q16 -3 26 6" stroke="${a3}" stroke-width="2.2" fill="none"/>
      <circle cx="30" cy="34" r="16" fill="${p.base}"/>
      <path d="M22 20 q3 -8 7 -3 q4 -7 7 -1 q4 -6 6 1 q-2 6 -10 7 Z" fill="${p.comb}"/>
      <path d="M24 46 q-2 8 3 10 q4 -2 3 -9 Z" fill="${p.comb}"/>
      <path d="M12 30 L30 34 L26 42 Z" fill="${p.beak}" stroke="#00000022" stroke-width=".8"/>
      <circle cx="28" cy="31" r="3.2" fill="#2a1c0c"/>
      <circle cx="29" cy="30" r="1" fill="#fff"/>
    </g>`;
    return { svg, hot: { x: 12.5, y: 30.5 } };
}

// Browsers cap cursor images near 128px and ignore oversized ones, so the hen
// stays at 112. A keyword fallback is always appended per the CSS grammar.
export function toCursor(c: Creature, size: number): string {
    const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">` +
        c.svg +
        `</svg>`;
    const uri = "data:image/svg+xml," + encodeURIComponent(svg);
    const hx = Math.round((c.hot.x / 100) * size);
    const hy = Math.round((c.hot.y / 100) * size);
    return `url("${uri}") ${hx} ${hy}, auto`;
}

export const CURSOR_SIZES = { egg: 44, chick: 46, hen: 112 } as const;

export function eggCursor(p: Palette): string {
    return toCursor(eggArt(p), CURSOR_SIZES.egg);
}
export function chickCursor(p: Palette): string {
    return toCursor(chickArt(p), CURSOR_SIZES.chick);
}
export function henCursor(p: Palette): string {
    return toCursor(henArt(p), CURSOR_SIZES.hen);
}
