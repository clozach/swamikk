"use client";

import { useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type {
    ContactPreferenceFields,
    ContactPreferences,
    ContactPreferencesInput,
} from "@courselit/common-models";
import { contactPreferencesCopy as copy } from "@/config/strings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PhotoPicker from "./photo-picker";

const schema = z
    .object({
        method: z.enum(["email", "voice", "text"]),
        detail: z.string().trim().min(1),
        checkIns: z.enum(["none", "occasional"]),
    })
    .superRefine((value, ctx) => {
        const valid =
            value.method === "email"
                ? z.string().email().safeParse(value.detail).success
                : /^\+?[0-9 ()-]{6,40}$/.test(value.detail);
        if (!valid)
            ctx.addIssue({
                code: "custom",
                path: ["detail"],
                message: value.method === "email" ? copy.email : copy.phone,
            });
    });

interface Props {
    initial: ContactPreferences;
    readOnly: boolean;
    onSave: (input: ContactPreferencesInput) => Promise<ContactPreferences>;
    onReload: () => void;
    onSavePhoto: (
        input: Pick<ContactPreferencesInput, "revision" | "photo">,
    ) => Promise<ContactPreferences>;
}

export default function ContactPreferencesForm({
    initial,
    readOnly,
    onSave,
    onReload,
    onSavePhoto,
}: Props) {
    const baseline = useRef(initial);
    const [saved, setSaved] = useState(initial);
    const [photoSaving, setPhotoSaving] = useState(false);
    const photoBusy = useRef(false);
    const [notice, setNotice] = useState("");
    const [error, setError] = useState("");
    const [edit, setEdit] = useState(false);
    const {
        register,
        control,
        handleSubmit,
        reset,
        formState: { errors, isSubmitting },
    } = useForm<ContactPreferenceFields>({
        resolver: zodResolver(schema),
        defaultValues: {
            method: initial.contact.kind,
            detail: initial.contact.value,
            checkIns: initial.checkIns,
        },
    });
    const values = useWatch({ control });
    const changed =
        values.method !== saved.contact.kind ||
        values.detail !== saved.contact.value ||
        values.checkIns !== saved.checkIns;
    async function save(fields: ContactPreferenceFields) {
        if (readOnly || photoBusy.current) return;
        photoBusy.current = true;
        setNotice("");
        setError("");
        try {
            const result = await onSave({
                revision: baseline.current.revision,
                contact: { kind: fields.method, value: fields.detail },
                checkIns: fields.checkIns,
                photo: { kind: "keep" },
            });
            baseline.current = result;
            setSaved(result);
            reset({
                method: result.contact.kind,
                detail: result.contact.value,
                checkIns: result.checkIns,
            });
            setNotice(copy.saved);
            setEdit(false);
        } catch (failure) {
            setError(
                failure instanceof Error ? failure.message : copy.saveFailed,
            );
        } finally {
            photoBusy.current = false;
        }
    }

    async function savePhoto(photo: ContactPreferencesInput["photo"]) {
        if (readOnly || photoBusy.current || isSubmitting)
            throw new Error(
                "Wait for the current save before changing your photo.",
            );
        photoBusy.current = true;
        setPhotoSaving(true);
        setNotice("");
        setError("");
        try {
            const result = await onSavePhoto({
                revision: baseline.current.revision,
                photo,
            });
            baseline.current = result;
            // Preserve any unsaved contact edits; only the saved photo/revision change.
            setSaved(result);
            setNotice(copy.photoSaved);
        } catch (failure) {
            setError(
                failure instanceof Error ? failure.message : copy.saveFailed,
            );
            throw failure;
        } finally {
            photoBusy.current = false;
            setPhotoSaving(false);
        }
    }

    return (
        <form
            onSubmit={(event) => {
                void handleSubmit(save)(event);
            }}
            className="space-y-6"
            aria-label={copy.title}
        >
            <p className="text-muted-foreground">{copy.intro}</p>
            {readOnly && <p>{copy.readOnly}</p>}
            <fieldset
                disabled={readOnly || isSubmitting || photoSaving}
                className="min-w-0 space-y-5"
            >
                <div className="space-y-2">
                    <label
                        htmlFor="contact-method"
                        className="block font-medium"
                    >
                        {copy.method}
                    </label>
                    <select
                        id="contact-method"
                        className="min-h-11 w-full rounded border bg-background px-3"
                        {...register("method", {
                            onChange: () => setEdit(true),
                        })}
                    >
                        {(["email", "voice", "text"] as const).map((kind) => (
                            <option key={kind} value={kind}>
                                {copy.methods[kind]}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="space-y-2">
                    <label
                        htmlFor="contact-detail"
                        className="block font-medium"
                    >
                        {values.method === "email" ? copy.email : copy.phone}
                    </label>
                    <Input
                        id="contact-detail"
                        type={values.method === "email" ? "email" : "tel"}
                        autoComplete={
                            values.method === "email" ? "email" : "tel"
                        }
                        readOnly={!edit}
                        aria-invalid={!!errors.detail}
                        {...register("detail")}
                    />
                    {!readOnly && !edit && (
                        <Button
                            type="button"
                            variant="outline"
                            className="min-h-11"
                            onClick={() => setEdit(true)}
                        >
                            {copy.edit}
                        </Button>
                    )}
                    {errors.detail && (
                        <p role="alert">{errors.detail.message}</p>
                    )}
                    <p className="text-sm text-muted-foreground">
                        {copy.contactNote}
                    </p>
                </div>
                <div className="space-y-2">
                    <label
                        htmlFor="personal-check-ins"
                        className="block font-medium"
                    >
                        {copy.checkIns}
                    </label>
                    <select
                        id="personal-check-ins"
                        className="min-h-11 w-full rounded border bg-background px-3"
                        {...register("checkIns")}
                    >
                        <option value="none">{copy.none}</option>
                        <option value="occasional">{copy.occasional}</option>
                    </select>
                    <p className="text-sm text-muted-foreground">
                        {copy.checkInNote}
                    </p>
                </div>
                <PhotoPicker
                    photo={saved.photo}
                    action={{ kind: "keep" }}
                    readOnly={readOnly || photoSaving || isSubmitting}
                    onChange={savePhoto}
                    onError={setError}
                />
                {!readOnly && (
                    <Button
                        className="min-h-11"
                        type="submit"
                        disabled={!changed || isSubmitting}
                    >
                        {isSubmitting ? copy.saving : copy.save}
                    </Button>
                )}
            </fieldset>
            {photoSaving && <p role="status">{copy.photoSaving}</p>}
            {notice && <p role="status">{notice}</p>}
            {error && (
                <div role="alert">
                    <p>{error}</p>
                    <button
                        type="button"
                        className="min-h-11 underline"
                        onClick={onReload}
                    >
                        {copy.reload}
                    </button>
                </div>
            )}
        </form>
    );
}
