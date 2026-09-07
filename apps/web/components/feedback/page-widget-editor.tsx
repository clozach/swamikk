"use client";

import { useEffect, useState } from "react";
import type {
    Address,
    PageWidgetField,
    Profile,
} from "@courselit/common-models";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { feedbackRequest } from "./api";
import FieldDraft from "./page-field-draft";
import { pageEditCopy as copy } from "./page-edit-copy";

export default function PageWidgetEditor({
    target,
    profile,
    address,
}: {
    target: { pageId: string; widgetId: string };
    profile: Profile;
    address: Address;
}) {
    const [fields, setFields] = useState<PageWidgetField[] | null>(null);
    const [selected, setSelected] = useState("");
    const [error, setError] = useState("");
    useEffect(() => {
        let active = true;
        feedbackRequest<{ fields: PageWidgetField[] }>(
            `/api/content-changes/page-widget?${new URLSearchParams(target)}`,
        )
            .then((result) => {
                if (active) {
                    setFields(result.fields);
                    setSelected(result.fields[0]?.field || "");
                }
            })
            .catch((error) => {
                if (active) setError(error.message);
            });
        return () => {
            active = false;
        };
    }, [target]);
    const field = fields?.find((item) => item.field === selected);
    return (
        <>
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogDescription>{copy.intro}</DialogDescription>
            {error && <p role="alert">{error}</p>}
            {!fields && !error && <p role="status">{copy.loading}</p>}
            {fields && !fields.length && <p>{copy.empty}</p>}
            {!!fields?.length && (
                <label className="grid gap-2">
                    {copy.field}
                    <select
                        className="min-h-11 rounded-lg border bg-background p-2"
                        value={selected}
                        onChange={(event) => setSelected(event.target.value)}
                    >
                        {fields.map((item) => (
                            <option key={item.field} value={item.field}>
                                {item.label}
                            </option>
                        ))}
                    </select>
                </label>
            )}
            {field && (
                <FieldDraft
                    key={`${profile.userId}:${target.pageId}:${target.widgetId}:${field.field}`}
                    target={target}
                    field={field}
                    profile={profile}
                    address={address}
                />
            )}
        </>
    );
}
