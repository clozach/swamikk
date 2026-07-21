import React, { useState, useRef, useEffect } from "react";
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
    Upload,
    AlertCircle,
    Loader2,
    FileVideo,
    FileAudio,
    FileText,
    Image as ImageIcon,
    Sparkles,
} from "lucide-react";
import { Address, Media } from "@courselit/common-models";
import { useToast } from "@/hooks/use-toast";
import Access from "./access";
import MediaType from "./type";
import { AlertDialogAction } from "@radix-ui/react-alert-dialog";
import { useMediaLit } from "@/hooks/use-medialit";
import { maybeDownsizeImage, formatBytes } from "./downsize-image";
import {
    typeErrorMessage,
    sizeErrorMessage,
    describeAcceptedTypes,
    friendlyUploadError,
} from "./upload-messages";

// Not-subscribed MediaLit per-file default (50 MB). Overridable per call site;
// raster images are auto-downsized well under this, so it only bites big
// video/pdf/audio — where we say so plainly instead of failing mid-upload.
const DEFAULT_MAX_SIZE_BYTES = 50 * 1024 * 1024;

interface FileUploadAlertDialogProps {
    acceptedMimeTypes?: string[];
    disabled?: boolean;
    address: Address;
    access: Access;
    type: MediaType;
    onSuccess: (media: Media) => void;
    open: boolean;
    setOpen: (value: boolean) => void;
    maxSizeBytes?: number;
}

interface Dimensions {
    width: number;
    height: number;
}

export function FileUploadAlertDialog({
    acceptedMimeTypes = [],
    disabled = false,
    address,
    access,
    type,
    onSuccess,
    open,
    setOpen,
    maxSizeBytes = DEFAULT_MAX_SIZE_BYTES,
}: FileUploadAlertDialogProps) {
    const [file, setFile] = useState<File | null>(null);
    const [pendingName, setPendingName] = useState("");
    const [pendingType, setPendingType] = useState("");
    const [caption, setCaption] = useState("");
    const [isDragging, setIsDragging] = useState(false);
    const [fileError, setFileError] = useState("");
    const [optimizing, setOptimizing] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [dimensions, setDimensions] = useState<Dimensions | null>(null);
    const [downsizeNote, setDownsizeNote] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { toast } = useToast();
    const { isUploading, uploadProgress, uploadFile, cancelUpload } =
        useMediaLit({
            signatureEndpoint: `${address.backend}/api/media/presigned`,
            access,
            onUploadComplete: (media) => {
                onSuccess(media as unknown as Media);
                resetState();
                setOpen(false);
            },
            onUploadError: (error) => {
                toast({
                    title: "Upload failed",
                    description: friendlyUploadError(error?.message),
                    variant: "destructive",
                });
            },
        });

    const revokePreview = () => {
        setPreviewUrl((current) => {
            if (current) URL.revokeObjectURL(current);
            return null;
        });
    };

    // Release any object URL when the dialog unmounts.
    useEffect(() => revokePreview, []);

    const resetState = () => {
        revokePreview();
        setFile(null);
        setPendingName("");
        setPendingType("");
        setCaption("");
        setFileError("");
        setOptimizing(false);
        setDimensions(null);
        setDownsizeNote("");
        setIsDragging(false);
        setOpen(false);
    };

    const isValidMimeType = (mimeType: string) =>
        acceptedMimeTypes.length === 0 || acceptedMimeTypes.includes(mimeType);

    const handleFileSelected = async (selectedFile: File) => {
        revokePreview();
        setDownsizeNote("");
        setDimensions(null);
        setFileError("");
        setPendingName(selectedFile.name);
        setPendingType(selectedFile.type);

        // 1. Type — say exactly what's wrong, don't accept it.
        if (!isValidMimeType(selectedFile.type)) {
            setFile(null);
            setFileError(typeErrorMessage(selectedFile, acceptedMimeTypes));
            return;
        }

        // 2. Auto-downsize images so size is a non-issue for the common case.
        const isImage = selectedFile.type.startsWith("image/");
        let finalFile = selectedFile;
        if (isImage) {
            setOptimizing(true);
            try {
                const result = await maybeDownsizeImage(selectedFile);
                finalFile = result.file;
                if (result.finalDimensions) {
                    setDimensions(result.finalDimensions);
                }
                if (result.downsized) {
                    const dimNote =
                        result.originalDimensions && result.finalDimensions
                            ? ` · ${result.originalDimensions.width}×${result.originalDimensions.height} → ${result.finalDimensions.width}×${result.finalDimensions.height}`
                            : "";
                    setDownsizeNote(
                        `Optimized ${formatBytes(result.originalBytes)} → ${formatBytes(
                            result.finalBytes,
                        )}${dimNote}`,
                    );
                }
            } catch {
                finalFile = selectedFile;
            } finally {
                setOptimizing(false);
            }
        }

        // 3. Size — validate the FINAL (possibly downsized) file, message clearly.
        if (finalFile.size > maxSizeBytes) {
            setFileError(sizeErrorMessage(finalFile, maxSizeBytes));
        }

        // 4. Preview (thumbnail for images; a typed icon otherwise).
        if (isImage && typeof URL !== "undefined") {
            setPreviewUrl(URL.createObjectURL(finalFile));
        }
        setPendingName(finalFile.name);
        setPendingType(finalFile.type);
        setFile(finalFile);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };
    const handleDragLeave = () => setIsDragging(false);
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const droppedFiles = e.dataTransfer.files;
        if (droppedFiles.length > 0) handleFileSelected(droppedFiles[0]);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.length) handleFileSelected(e.target.files[0]);
    };

    const handleUpload = async () => {
        if (!file || fileError) return;
        await uploadFile(file, {
            caption: caption || "",
            type,
        });
    };

    const acceptAttribute =
        acceptedMimeTypes.length > 0 ? acceptedMimeTypes.join(",") : undefined;

    const hasValidFile = !!file && !fileError;
    const zoneStateClass = fileError
        ? "border-destructive bg-destructive/5"
        : isDragging
          ? "border-primary bg-primary/5"
          : hasValidFile
            ? "border-primary/60 bg-primary/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/50";

    return (
        <AlertDialog open={open}>
            <AlertDialogTrigger asChild>
                <Button
                    className="w-full"
                    size="sm"
                    disabled={disabled}
                    onClick={() => setOpen(true)}
                >
                    Upload file
                </Button>
            </AlertDialogTrigger>

            <AlertDialogContent className="max-w-md">
                <AlertDialogHeader>
                    <AlertDialogTitle>Upload File</AlertDialogTitle>
                    <AlertDialogDescription>
                        Drag and drop your file or click to browse
                    </AlertDialogDescription>
                </AlertDialogHeader>

                <div className="space-y-4 py-4">
                    <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() =>
                            !isUploading && fileInputRef.current?.click()
                        }
                        className={`relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-6 text-center transition-all duration-200 ${zoneStateClass}`}
                        style={{
                            pointerEvents:
                                isUploading || optimizing ? "none" : "auto",
                        }}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            onChange={handleFileChange}
                            className="hidden"
                            disabled={isUploading}
                            accept={acceptAttribute}
                        />

                        {optimizing ? (
                            <div className="flex flex-col items-center gap-2 py-2">
                                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                <p className="text-sm font-medium text-primary">
                                    Optimizing image…
                                </p>
                            </div>
                        ) : hasValidFile ? (
                            <FilePreview
                                previewUrl={previewUrl}
                                name={pendingName}
                                mimeType={pendingType}
                                sizeBytes={file!.size}
                                dimensions={dimensions}
                                downsizeNote={downsizeNote}
                            />
                        ) : fileError ? (
                            <div className="flex flex-col items-center gap-2 py-1">
                                <AlertCircle className="h-6 w-6 text-destructive" />
                                {pendingName && (
                                    <p className="max-w-full truncate text-sm font-medium text-destructive">
                                        {pendingName}
                                    </p>
                                )}
                                <p className="text-xs text-muted-foreground">
                                    Click to choose a different file
                                </p>
                            </div>
                        ) : (
                            <>
                                <Upload className="mb-2 h-6 w-6 text-muted-foreground" />
                                <p className="text-sm font-medium text-muted-foreground">
                                    Drop file here or click
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground/80">
                                    {describeAcceptedTypes(acceptedMimeTypes)} ·
                                    up to {formatBytes(maxSizeBytes)}
                                </p>
                            </>
                        )}
                    </div>

                    {fileError && (
                        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                            <p className="text-xs text-destructive">
                                {fileError}
                            </p>
                        </div>
                    )}

                    {hasValidFile && downsizeNote && (
                        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                            <Sparkles className="h-4 w-4 shrink-0 text-primary" />
                            <p className="text-xs text-muted-foreground">
                                {downsizeNote}
                            </p>
                        </div>
                    )}

                    <div className="space-y-2">
                        <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                            Caption (optional)
                        </label>
                        <Input
                            placeholder="Add a caption to your file..."
                            value={caption}
                            onChange={(e) => setCaption(e.target.value)}
                            className="resize-none"
                            disabled={isUploading}
                        />
                    </div>

                    {isUploading && (
                        <div className="space-y-3 rounded-lg border border-muted bg-muted/30 p-4">
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex items-start gap-3">
                                    <Upload className="mt-1 h-5 w-5 text-primary" />
                                    <div>
                                        <p className="text-sm font-medium">
                                            {pendingName}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {Math.round(uploadProgress)}%
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <Progress value={uploadProgress} className="h-2" />
                        </div>
                    )}
                </div>

                <AlertDialogFooter>
                    {isUploading ? (
                        <AlertDialogCancel
                            onClick={cancelUpload}
                            disabled={Math.round(uploadProgress) > 99}
                        >
                            {Math.round(uploadProgress) > 99
                                ? "Processing..."
                                : "Cancel"}
                        </AlertDialogCancel>
                    ) : (
                        <>
                            <AlertDialogCancel onClick={resetState}>
                                Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction asChild>
                                <Button
                                    disabled={!hasValidFile || optimizing}
                                    onClick={handleUpload}
                                >
                                    Upload
                                </Button>
                            </AlertDialogAction>
                        </>
                    )}
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

function iconForMime(mimeType: string) {
    if (mimeType.startsWith("video/")) return FileVideo;
    if (mimeType.startsWith("audio/")) return FileAudio;
    if (mimeType === "application/pdf") return FileText;
    if (mimeType.startsWith("image/")) return ImageIcon;
    return FileText;
}

function FilePreview({
    previewUrl,
    name,
    mimeType,
    sizeBytes,
    dimensions,
    downsizeNote,
}: {
    previewUrl: string | null;
    name: string;
    mimeType: string;
    sizeBytes: number;
    dimensions: Dimensions | null;
    downsizeNote: string;
}) {
    const Icon = iconForMime(mimeType);
    const meta = [
        formatBytes(sizeBytes),
        dimensions ? `${dimensions.width}×${dimensions.height}` : "",
    ]
        .filter(Boolean)
        .join(" · ");

    return (
        <div className="flex w-full items-center gap-3 text-left">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-background">
                {previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={previewUrl}
                        alt={name}
                        className="h-full w-full object-cover"
                    />
                ) : (
                    <Icon className="h-7 w-7 text-muted-foreground" />
                )}
            </div>
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-primary">
                    {name}
                </p>
                <p className="text-xs text-muted-foreground">{meta}</p>
                <p className="mt-0.5 text-xs text-muted-foreground/70">
                    Click to choose a different file
                </p>
                {downsizeNote && (
                    <span className="sr-only">{downsizeNote}</span>
                )}
            </div>
        </div>
    );
}
