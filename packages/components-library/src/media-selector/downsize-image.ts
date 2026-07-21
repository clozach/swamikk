// Client-side image downsizing for the upload modal. Cuts oversized raster
// images down to a sane dimension/byte budget in the browser BEFORE they hit
// the network, so a user never has to think about "is my photo too big?" — a
// 12 MP phone snap becomes a few-hundred-KB upload automatically.
//
// Deliberately conservative:
//   - Only touches raster photos it can safely re-encode (jpeg/png/webp).
//     GIF (animation), SVG (vector), and non-images pass through untouched.
//   - Preserves the source format, so transparency (PNG/WebP) survives.
//   - NEVER returns a file larger than the original (re-encoding a small,
//     already-optimized image can inflate it — we keep the original then).
//   - Any failure (decode error, no canvas, blocked toBlob) returns the
//     original file: downsizing is an optimization, never a gate on upload.

const RESIZABLE = /^image\/(jpe?g|png|webp)$/i;

export interface DownsizeOptions {
    // Longest edge the output may have. Larger images are scaled down to fit.
    maxDimension?: number;
    // Re-encode even when dimensions are already within budget once the file
    // is bigger than this (helps heavy screenshots that aren't over-sized).
    softByteLimit?: number;
    // Encoder quality for lossy formats (jpeg/webp). PNG ignores it.
    quality?: number;
}

export interface Dimensions {
    width: number;
    height: number;
}

export interface DownsizeResult {
    file: File;
    downsized: boolean;
    originalBytes: number;
    finalBytes: number;
    originalDimensions?: Dimensions;
    finalDimensions?: Dimensions;
}

const DEFAULTS: Required<DownsizeOptions> = {
    maxDimension: 2048,
    softByteLimit: 1.5 * 1024 * 1024,
    quality: 0.85,
};

function passthrough(file: File, dims?: Dimensions): DownsizeResult {
    return {
        file,
        downsized: false,
        originalBytes: file.size,
        finalBytes: file.size,
        originalDimensions: dims,
        finalDimensions: dims,
    };
}

// Decode a File into something drawable, preferring createImageBitmap (fast,
// off-main-thread) and falling back to an <img> element where it's missing.
async function decode(file: File): Promise<{
    source: CanvasImageSource;
    width: number;
    height: number;
} | null> {
    if (typeof createImageBitmap === "function") {
        try {
            const bitmap = await createImageBitmap(file);
            return {
                source: bitmap,
                width: bitmap.width,
                height: bitmap.height,
            };
        } catch {
            // fall through to the <img> path
        }
    }
    if (typeof Image === "undefined" || typeof URL === "undefined") {
        return null;
    }
    return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            resolve({
                source: img,
                width: img.naturalWidth,
                height: img.naturalHeight,
            });
            URL.revokeObjectURL(url);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(null);
        };
        img.src = url;
    });
}

function toBlob(
    canvas: HTMLCanvasElement,
    type: string,
    quality: number,
): Promise<Blob | null> {
    return new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob), type, quality);
    });
}

export async function maybeDownsizeImage(
    file: File,
    options: DownsizeOptions = {},
): Promise<DownsizeResult> {
    const { maxDimension, softByteLimit, quality } = {
        ...DEFAULTS,
        ...options,
    };

    if (!RESIZABLE.test(file.type) || typeof document === "undefined") {
        return passthrough(file);
    }

    const decoded = await decode(file);
    if (!decoded) {
        return passthrough(file);
    }
    const { source, width, height } = decoded;
    const originalDimensions: Dimensions = { width, height };

    const scale = Math.min(1, maxDimension / Math.max(width, height));
    const needsResize = scale < 1;
    const needsReencode = file.size > softByteLimit;
    if (!needsResize && !needsReencode) {
        return passthrough(file, originalDimensions);
    }

    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        return passthrough(file, originalDimensions);
    }
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, targetW, targetH);
    if (typeof (source as ImageBitmap).close === "function") {
        (source as ImageBitmap).close(); // release the ImageBitmap
    }

    // Preserve format so PNG/WebP transparency survives; JPEG stays JPEG.
    const outType = /png/i.test(file.type)
        ? "image/png"
        : /webp/i.test(file.type)
          ? "image/webp"
          : "image/jpeg";

    const blob = await toBlob(canvas, outType, quality);
    // Guard: never hand back something bigger than we were given.
    if (!blob || blob.size >= file.size) {
        return passthrough(file, originalDimensions);
    }

    const newName = renameForType(file.name, outType);
    const downsizedFile = new File([blob], newName, {
        type: outType,
        lastModified: Date.now(),
    });

    return {
        file: downsizedFile,
        downsized: true,
        originalBytes: file.size,
        finalBytes: downsizedFile.size,
        originalDimensions,
        finalDimensions: { width: targetW, height: targetH },
    };
}

// Only rewrite the extension when the container type actually changed
// (it never does here, since we preserve format — but keep names honest).
function renameForType(name: string, type: string): string {
    const ext = type === "image/jpeg" ? "jpg" : type.split("/")[1];
    if (!ext) return name;
    const dot = name.lastIndexOf(".");
    const base = dot > 0 ? name.slice(0, dot) : name;
    const current = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
    const normalizedCurrent = current === "jpeg" ? "jpg" : current;
    return normalizedCurrent === ext ? name : `${base}.${ext}`;
}

export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
