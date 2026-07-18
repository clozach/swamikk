import { useState, useEffect, useRef, useCallback } from "react";
import { Play, X } from "lucide-react";
import { extractVideoId } from "@courselit/utils";

type VideoType = "youtube" | "vimeo" | "self-hosted";

export type AspectRatio =
    | "16/9" // Widescreen
    | "4/3" // Standard
    | "1/1" // Square
    | "21/9" // Ultrawide
    | "9/16" // Vertical
    | "2/1" // Panoramic
    | "3/2" // Classic
    | string; // Allow custom aspect ratios

export interface VideoThumbnailProps {
    title?: string;
    thumbnailUrl?: string;
    videoUrl: string;
    aspectRatio?: AspectRatio;
    modal?: boolean;
}

export function VideoWithPreview({
    title = "Video",
    thumbnailUrl,
    videoUrl = "https://www.youtube.com/watch?v=7OP2bU9RWVE",
    aspectRatio = "16/9",
    modal = false,
}: VideoThumbnailProps) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [vimeoThumbnail, setVimeoThumbnail] = useState<string | null>(null);

    // Hold the active self-hosted <video> so we can stop it when it's torn
    // down. Safari does NOT pause a media element that has been removed from
    // the DOM, so without this the hero/preview audio keeps playing after a
    // client-side route change (e.g. into checkout) or after the modal is
    // closed — audio with no visible source. The callback ref fires with null
    // the instant React detaches the element (including on component unmount),
    // which is where we pause it. Chrome pauses detached media on its own, so
    // this is effectively a Safari fix.
    const activeVideoRef = useRef<HTMLVideoElement | null>(null);
    const setVideoRef = useCallback((node: HTMLVideoElement | null) => {
        if (node === null && activeVideoRef.current) {
            const v = activeVideoRef.current;
            try {
                // Pausing is not enough in Safari: restoring the page from
                // the back-forward cache (e.g. Back from Stripe checkout) can
                // revive a detached element's audio even though it was paused
                // at teardown — audio on a page with no video. Fully release
                // the media resource so there is nothing left to resume.
                v.pause();
                v.removeAttribute("src");
                while (v.firstChild) v.removeChild(v.firstChild);
                v.load();
            } catch {
                // element already gone — nothing to stop
            }
        }
        activeVideoRef.current = node;
    }, []);

    // Also stop playback when the page is hidden for Safari's back-forward
    // cache. bfcache FREEZES the page without unmounting React, so the callback
    // ref above never fires; without this, Safari resumes the still-playing
    // <video> (and its audio) on Back — sometimes over a live instance, which
    // is the "echo" heard when bouncing between checkout and Stripe.
    useEffect(() => {
        const stopPlayback = () => {
            const v = activeVideoRef.current;
            if (v && !v.paused) {
                try {
                    v.pause();
                } catch {
                    // ignore — nothing to stop
                }
            }
        };
        // pagehide: pause before the bfcache freeze snapshots "playing".
        // pageshow(persisted): Safari has been observed resuming media on
        // bfcache restore regardless — pause again defensively.
        const onPageShow = (e: PageTransitionEvent) => {
            if (e.persisted) stopPlayback();
        };
        window.addEventListener("pagehide", stopPlayback);
        window.addEventListener("pageshow", onPageShow);
        return () => {
            window.removeEventListener("pagehide", stopPlayback);
            window.removeEventListener("pageshow", onPageShow);
        };
    }, []);

    const detectVideoType = (): VideoType => {
        if (extractVideoId(videoUrl, "youtube")) {
            return "youtube";
        }

        if (extractVideoId(videoUrl, "vimeo")) {
            return "vimeo";
        }

        return "self-hosted";
    };

    const videoType = detectVideoType();

    const getVideoId = () => {
        if (videoType === "youtube") {
            return extractVideoId(videoUrl, "youtube");
        }

        if (videoType === "vimeo") {
            return extractVideoId(videoUrl, "vimeo");
        }

        return null;
    };

    // Fetch Vimeo thumbnail if needed
    useEffect(() => {
        const fetchVimeoThumbnail = async () => {
            // Skip fetching if a thumbnail URL is already provided
            if (thumbnailUrl || videoType !== "vimeo") return;

            const videoId = getVideoId();
            if (!videoId) return;

            try {
                // Use Vimeo's oEmbed API to get thumbnail (no token required)
                const response = await fetch(
                    `https://vimeo.com/api/oembed.json?url=https://vimeo.com/${videoId}`,
                );

                if (response.ok) {
                    const data = await response.json();
                    setVimeoThumbnail(data.thumbnail_url);
                }
            } catch (error) {
                console.error("Error fetching Vimeo thumbnail:", error);
            }
        };

        fetchVimeoThumbnail();
    }, [videoUrl, videoType, thumbnailUrl]);

    // Get the appropriate thumbnail URL
    const getThumbnailUrl = () => {
        // If a thumbnail URL is explicitly provided, use that
        if (thumbnailUrl) return thumbnailUrl;

        // For YouTube videos, generate thumbnail URL
        if (videoType === "youtube") {
            const videoId = getVideoId();
            if (videoId) {
                return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
            }
        }

        // For Vimeo videos, use the fetched thumbnail
        if (videoType === "vimeo" && vimeoThumbnail) {
            return vimeoThumbnail;
        }

        // Fall back to placeholder
        return "/placeholder.svg?height=480&width=854";
    };

    // Lock body scroll when modal is open
    useEffect(() => {
        if (isModalOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }

        return () => {
            document.body.style.overflow = "";
        };
    }, [isModalOpen]);

    // Get embed URL based on video type
    const getEmbedUrl = () => {
        const videoId = getVideoId();
        // Add autoplay parameter for in-place videos
        const shouldAutoplay = isPlaying;

        if (videoType === "youtube") {
            if (videoId) {
                return `https://www.youtube.com/embed/${videoId}${shouldAutoplay ? "?autoplay=1" : ""}`;
            }

            // If we couldn't extract the ID but it's a YouTube URL, try to use it directly
            const hasParams = videoUrl.includes("?");
            return (
                videoUrl +
                (shouldAutoplay && !hasParams
                    ? "?autoplay=1"
                    : shouldAutoplay && hasParams
                      ? "&autoplay=1"
                      : "")
            );
        }

        if (videoType === "vimeo" && videoId) {
            return `https://player.vimeo.com/video/${videoId}${shouldAutoplay ? "?autoplay=1" : ""}`;
        }

        // For self-hosted videos, return the URL as is
        return videoUrl;
    };

    // Calculate aspect ratio style
    const aspectRatioStyle = () => {
        if (!aspectRatio.includes("/")) return {};

        const [width, height] = aspectRatio.split("/").map(Number);
        if (!width || !height) return {};

        return {
            aspectRatio: `${width}/${height}`,
        };
    };

    // Handle thumbnail click
    const handleThumbnailClick = () => {
        if (modal) {
            setIsModalOpen(true);
        } else {
            setIsPlaying(true);
        }
    };

    return (
        <div className={aspectRatio === "9/16" ? "max-w-xs mx-auto" : ""}>
            {/* Thumbnail with play button or in-place video */}
            <div
                className="relative overflow-hidden"
                style={aspectRatioStyle()}
            >
                {!modal && isPlaying ? (
                    // In-place video player
                    <div className="w-full h-full">
                        {videoType !== "self-hosted" ? (
                            <iframe
                                src={getEmbedUrl()}
                                className="w-full h-full"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                            ></iframe>
                        ) : (
                            <video
                                ref={setVideoRef}
                                src={videoUrl}
                                controls
                                controlsList="nodownload" // eslint-disable-line react/no-unknown-property
                                onContextMenu={(e) => e.preventDefault()}
                                autoPlay
                                className="w-full h-full"
                            >
                                Your browser does not support the video tag.
                            </video>
                        )}
                    </div>
                ) : (
                    // Thumbnail with play button
                    <div
                        className="cursor-pointer group w-full h-full"
                        onClick={handleThumbnailClick}
                    >
                        <img
                            src={getThumbnailUrl() || "/placeholder.svg"}
                            alt={`Thumbnail for ${title}`}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                            <div className="relative">
                                {/* Smaller grayish concentric wave animation */}
                                <span className="absolute -inset-1.5 rounded-full bg-gray-200/50 animate-pulse duration-[3000ms]"></span>

                                {/* Play button */}
                                <div className="relative z-1 rounded-full bg-primary p-4 text-primary-foreground">
                                    <Play
                                        className="h-8 w-8"
                                        fill="currentColor"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Custom Video Modal (only used when modal is true) */}
            {modal && isModalOpen && (
                <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4 sm:p-6 md:p-10">
                    <button
                        onClick={() => setIsModalOpen(false)}
                        className="absolute top-2 right-2 sm:top-4 sm:right-4 text-white hover:text-gray-300 focus:outline-none z-10"
                        aria-label="Close"
                    >
                        <X className="h-6 w-6 sm:h-8 sm:w-8" />
                    </button>

                    <div
                        className="w-full max-w-xl sm:max-w-2xl md:max-w-3xl"
                        style={aspectRatioStyle()}
                    >
                        {videoType !== "self-hosted" ? (
                            // YouTube or Vimeo video
                            <iframe
                                src={getEmbedUrl()}
                                className="w-full h-full"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                            ></iframe>
                        ) : (
                            // Self-hosted video
                            <video
                                ref={setVideoRef}
                                src={videoUrl}
                                controls
                                controlsList="nodownload" // eslint-disable-line react/no-unknown-property
                                onContextMenu={(e) => e.preventDefault()}
                                autoPlay
                                className="w-full h-full"
                            >
                                Your browser does not support the video tag.
                            </video>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
