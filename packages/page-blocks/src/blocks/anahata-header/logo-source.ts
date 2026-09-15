import {
    fromUrlOrMedia,
    normalizeImageSource,
    type ImageSource,
} from "../../components/image-source";
import { logoSource as defaultLogoSource } from "./defaults";
import type Settings from "./settings";

/**
 * The one reader for the header's logo, shared by the widget and its admin
 * panel so both see the same picture.
 *
 * Precedence: an explicit `logoSource` (parsed at the boundary, so a
 * hand-edited document still yields one of the three arms); else the legacy
 * `logoMedia` + `logoSrc` pair folded into a single source, so every layout
 * saved before the union keeps rendering its mark; else the default — the
 * placeholder well, because every picture on the site is a well until the
 * real asset lands.
 */
export function headerLogoSource(
    settings: Pick<Settings, "logoSource" | "logoSrc" | "logoMedia">,
): ImageSource {
    return (
        normalizeImageSource(settings.logoSource) ??
        fromUrlOrMedia(settings.logoSrc, settings.logoMedia) ??
        defaultLogoSource
    );
}
