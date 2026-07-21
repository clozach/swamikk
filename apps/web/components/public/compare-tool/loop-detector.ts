// Detects "draw N quick circles" from a stream of pointer positions, in either
// direction. It accumulates the signed angle swept around the recent path's
// centroid; every 2π is one loop. Back-and-forth wiggling cancels out (the net
// sweep stays near zero), so only genuine circling fires — hovering, scrolling,
// or reading never trips it.
//
// Tuned so a deliberate three-circle gesture fires right around the third loop:
// there is a small unavoidable warm-up while the centroid settles, so the
// threshold is a hair under the nominal count to compensate.

export type LoopDirection = "cw" | "ccw";

type Pt = { x: number; y: number; t: number };

export type LoopDetectorOptions = {
    /** loops required to fire (default 3) */
    turns?: number;
    /** points older than this (ms) fall out of the window (default 2600) */
    windowMs?: number;
    /** a gap longer than this (ms) starts a fresh gesture (default 450) */
    pauseMs?: number;
    /** minimum average circling radius in px, rejects jitter (default 20) */
    minRadius?: number;
};

export class LoopDetector {
    private pts: Pt[] = [];
    private sweep = 0; // radians, signed
    private lastAng: number | null = null;
    private radiusEma = 0;
    private lastT = 0;

    private readonly turnsNeeded: number;
    private readonly windowMs: number;
    private readonly pauseMs: number;
    private readonly minRadius: number;

    // fire a hair before the nominal count to cancel centroid warm-up
    private static readonly WARMUP_TURNS = 0.28;

    constructor(
        private readonly onLoops: (dir: LoopDirection) => void,
        opts: LoopDetectorOptions = {},
    ) {
        this.turnsNeeded = (opts.turns ?? 3) - LoopDetector.WARMUP_TURNS;
        this.windowMs = opts.windowMs ?? 2600;
        this.pauseMs = opts.pauseMs ?? 450;
        this.minRadius = opts.minRadius ?? 20;
    }

    reset(): void {
        this.pts = [];
        this.sweep = 0;
        this.lastAng = null;
        this.radiusEma = 0;
    }

    feed(x: number, y: number, t: number): void {
        // a pause means the previous motion was a different gesture
        if (this.lastT && t - this.lastT > this.pauseMs) this.reset();
        this.lastT = t;

        this.pts.push({ x, y, t });
        while (this.pts.length && t - this.pts[0].t > this.windowMs)
            this.pts.shift();
        if (this.pts.length > 160) this.pts.shift();
        if (this.pts.length < 5) return;

        let cx = 0,
            cy = 0;
        for (const p of this.pts) {
            cx += p.x;
            cy += p.y;
        }
        cx /= this.pts.length;
        cy /= this.pts.length;

        const r = Math.hypot(x - cx, y - cy);
        this.radiusEma = this.radiusEma ? this.radiusEma * 0.8 + r * 0.2 : r;

        const ang = Math.atan2(y - cy, x - cx);
        if (this.lastAng !== null) {
            let d = ang - this.lastAng;
            while (d > Math.PI) d -= 2 * Math.PI;
            while (d < -Math.PI) d += 2 * Math.PI;
            this.sweep += d;
        }
        this.lastAng = ang;

        // collapsed radius → the user stopped circling; drop stale sweep
        if (this.radiusEma < this.minRadius / 2) {
            this.sweep = 0;
            return;
        }

        const turns = this.sweep / (2 * Math.PI);
        if (
            Math.abs(turns) >= this.turnsNeeded &&
            this.radiusEma >= this.minRadius
        ) {
            const dir: LoopDirection = turns > 0 ? "cw" : "ccw";
            this.reset();
            this.onLoops(dir);
        }
    }
}
