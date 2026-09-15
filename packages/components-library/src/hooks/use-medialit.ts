import { useState, useRef, useEffect } from "react";
import { Upload as TUSUpload, UploadOptions } from "tus-js-client";

interface UseMediaLitProps {
    signatureEndpoint: string;
    access: any;
    chunkSize?: number;
    onUploadComplete?: (media: Record<string, string>) => void | Promise<void>;
    onUploadError?: (error: Error) => void;
}

export function useMediaLit({
    signatureEndpoint,
    access,
    chunkSize,
    onUploadComplete,
    onUploadError,
}: UseMediaLitProps) {
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [file, setFile] = useState<File | null>(null);
    const operation = useRef<{
        upload?: TUSUpload;
        controller: AbortController;
        reject: (error: Error) => void;
    } | null>(null);
    const mounted = useRef(true);

    const abortUpload = () => {
        const current = operation.current;
        if (!current) return;
        operation.current = null;
        current.controller.abort();
        void current.upload?.abort().catch(() => undefined);
        current.reject(new DOMException("Upload cancelled.", "AbortError"));
        if (mounted.current) {
            setIsUploading(false);
            setFile(null);
        }
    };
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            abortUpload();
        };
    }, []);

    const uploadFile = (
        fileToUpload: File,
        metadata: Record<string, any> = {},
    ): Promise<Record<string, string>> => {
        if (!mounted.current)
            return Promise.reject(
                new DOMException("Upload cancelled.", "AbortError"),
            );
        abortUpload();
        setFile(fileToUpload);
        setIsUploading(true);
        setUploadProgress(0);
        return new Promise((resolve, reject) => {
            const current = {
                controller: new AbortController(),
                reject,
            } as NonNullable<typeof operation.current>;
            operation.current = current;
            const active = () => operation.current === current;
            const fail = (reason: unknown) => {
                if (!active()) return;
                operation.current = null;
                const error =
                    reason instanceof Error
                        ? reason
                        : new Error("Upload failed.");
                if (mounted.current) {
                    setIsUploading(false);
                    setFile(null);
                }
                onUploadError?.(error);
                reject(error);
            };
            void (async () => {
                const response = await fetch(signatureEndpoint, {
                    method: "POST",
                    signal: current.controller.signal,
                });
                if (!response.ok)
                    throw new Error(
                        "Could not start the upload. Check that you are signed in.",
                    );
                const { signature, endpoint } = await response.json();
                if (!signature || !endpoint)
                    throw new Error(
                        "The upload service did not provide an upload address.",
                    );
                if (!active()) return;
                const options: UploadOptions = {
                    endpoint: `${endpoint}/media/create/resumable`,
                    // Never reuse a stored upload created under another identity or access level.
                    storeFingerprintForResuming: false,
                    removeFingerprintOnSuccess: true,
                    retryDelays: [0, 3000, 5000],
                    headers: { "x-medialit-signature": signature },
                    metadata: {
                        ...metadata,
                        fileName: fileToUpload.name,
                        mimeType: fileToUpload.type,
                        access,
                    },
                    onProgress: (uploaded, total) => {
                        if (active() && mounted.current)
                            setUploadProgress(
                                total ? (uploaded / total) * 100 : 0,
                            );
                    },
                    onError: fail,
                    onSuccess: (payload) => {
                        void (async () => {
                            const header =
                                payload.lastResponse.getHeader("Media");
                            if (!header)
                                throw new Error(
                                    "The image service did not return the uploaded file.",
                                );
                            const media = JSON.parse(header) as Record<
                                string,
                                string
                            >;
                            if (!media?.mediaId)
                                throw new Error(
                                    "The image service returned an incomplete file.",
                                );
                            delete media.group;
                            // Register cleanup before any caller can attach or abandon this upload.
                            // This request must finish even if the UI was closed after upload completion.
                            const tracked = await fetch(
                                signatureEndpoint.replace(
                                    /\/presigned\/?$/,
                                    "/uploads",
                                ),
                                {
                                    method: "POST",
                                    headers: {
                                        "Content-Type": "application/json",
                                    },
                                    body: JSON.stringify({
                                        mediaId: media.mediaId,
                                    }),
                                },
                            );
                            if (!tracked.ok)
                                throw new Error(
                                    "The upload finished, but could not be registered. Please try again.",
                                );
                            if (!active()) return;
                            await onUploadComplete?.(media);
                            if (!active()) return;
                            operation.current = null;
                            if (mounted.current) {
                                setIsUploading(false);
                                setUploadProgress(100);
                                setFile(null);
                            }
                            resolve(media);
                        })().catch(fail);
                    },
                };
                if (chunkSize) options.chunkSize = chunkSize;
                current.upload = new TUSUpload(fileToUpload, options);
                current.upload.start();
            })().catch(fail);
        });
    };
    return {
        file,
        isUploading,
        uploadProgress,
        uploadFile,
        cancelUpload: abortUpload,
    };
}
