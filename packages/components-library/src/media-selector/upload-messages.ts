// Human-readable, actionable copy for the upload modal. The whole point (Al's
// note): a user who picks the wrong thing should learn exactly what's wrong —
// "that's a PDF, this takes an image" or "that's 78 MB, the cap is 50 MB" —
// instead of a raw tus/S3 error dump that reads as "the app is broken."

import { formatBytes } from "./downsize-image";

const MIME_LABELS: Record<string, string> = {
    "image/png": "PNG",
    "image/jpeg": "JPEG",
    "image/jpg": "JPEG",
    "image/webp": "WebP",
    "image/gif": "GIF",
    "image/svg+xml": "SVG",
    "application/pdf": "PDF",
};

// "image/*" -> "image", "video/mp4" -> "MP4", unknown -> the raw type.
export function labelForMime(mime: string): string {
    if (!mime) return "file";
    if (MIME_LABELS[mime]) return MIME_LABELS[mime];
    const [type, subtype] = mime.split("/");
    if (subtype === "*" || !subtype) return type;
    if (subtype.startsWith("x-")) return type;
    return subtype.toUpperCase();
}

// ["image/png","image/jpeg"] -> "PNG or JPEG"; broad families collapse to
// "images" / "videos" so the message stays short when many types are allowed.
export function describeAcceptedTypes(acceptedMimeTypes: string[]): string {
    if (!acceptedMimeTypes || acceptedMimeTypes.length === 0) {
        return "most file types";
    }
    const families = new Set(acceptedMimeTypes.map((m) => m.split("/")[0]));
    if (families.size === 1) {
        const family = [...families][0];
        const labels = acceptedMimeTypes.map(labelForMime);
        // Collapse an exhaustive image/video list to the family word.
        if (labels.length > 3) return `${family}s`;
        return joinWithOr(labels);
    }
    return joinWithOr(acceptedMimeTypes.map(labelForMime));
}

function joinWithOr(items: string[]): string {
    const unique = [...new Set(items)];
    if (unique.length === 1) return unique[0];
    if (unique.length === 2) return `${unique[0]} or ${unique[1]}`;
    return `${unique.slice(0, -1).join(", ")}, or ${unique[unique.length - 1]}`;
}

export function typeErrorMessage(
    file: File,
    acceptedMimeTypes: string[],
): string {
    return `That's a ${labelForMime(file.type)} file — this spot accepts ${describeAcceptedTypes(
        acceptedMimeTypes,
    )}.`;
}

export function sizeErrorMessage(file: File, maxSizeBytes: number): string {
    const isImage = file.type.startsWith("image/");
    const hint = isImage
        ? " Try a smaller image."
        : file.type.startsWith("video/")
          ? " Try a shorter clip or compress it first."
          : " Try compressing it first.";
    return `This file is ${formatBytes(file.size)} — the upload limit is ${formatBytes(
        maxSizeBytes,
    )}.${hint}`;
}

// Map a raw upload/tus/S3 error into something a human can act on, without
// hiding the fact that it's a server-side problem (not their file).
export function friendlyUploadError(raw: string | undefined): string {
    const message = (raw || "").trim();
    const lower = message.toLowerCase();
    if (!message) {
        return "Upload failed. Please try again.";
    }
    if (lower.includes("tagging") || lower.includes("notimplemented")) {
        return "The storage server rejected this upload (a server configuration issue, not your file). Please report it.";
    }
    if (
        lower.includes("413") ||
        lower.includes("too large") ||
        lower.includes("exceeds") ||
        lower.includes("entity too large")
    ) {
        return "This file is too large for the server. Try a smaller file.";
    }
    if (lower.includes("signature")) {
        return "Your session couldn't authorize this upload. Refresh the page and try again.";
    }
    if (
        lower.includes("failed to fetch") ||
        lower.includes("network") ||
        lower.includes("connection")
    ) {
        return "Network problem during upload. Check your connection and try again.";
    }
    // Keep it short — surface the gist, not a stack trace.
    return `Upload failed: ${message.split("\n")[0].slice(0, 140)}`;
}
