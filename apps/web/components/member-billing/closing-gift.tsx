"use client";
import { useContext, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { AddressContext, ProfileContext } from "@components/contexts";
import { checkPermission } from "@courselit/utils";
import { FEEDBACK_ADMIN_PERMISSIONS } from "@ui-config/constants";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { PageSelection } from "@/components/feedback/targets";
import { billingCopy as copy } from "./copy";
const CommentForm = dynamic(() => import("@/components/feedback/comment-form"));

export function ClosingGift({ readOnly }: { readOnly: boolean }) {
    const [open, setOpen] = useState(false);
    const { profile } = useContext(ProfileContext);
    const address = useContext(AddressContext);
    const selection: PageSelection = {
        element: null,
        label: copy.farewellTitle,
        target: {
            kind: "page",
            path: "/dashboard/membership",
            componentId: "membership-closing-gift",
            label: copy.farewellTitle,
        },
    };
    const admin = Boolean(
        profile?.permissions &&
            checkPermission(profile.permissions, FEEDBACK_ADMIN_PERMISSIONS),
    );
    return (
        <section
            id="membership-closing-gift"
            data-feedback-id="membership-closing-gift"
            className="mx-auto max-w-xl space-y-6 px-4 py-20 text-center"
        >
            <h2 className="text-2xl font-semibold">{copy.farewellTitle}</h2>
            <p className="leading-relaxed text-muted-foreground">
                {copy.farewell}
            </p>
            <Link
                href="/dashboard/my-content"
                className="inline-flex min-h-11 items-center underline underline-offset-4"
            >
                {copy.library}
            </Link>
            <div className="flex flex-col items-center gap-5 pt-8 sm:flex-row sm:justify-center">
                <Button
                    variant="ghost"
                    disabled={readOnly}
                    onClick={() => setOpen(true)}
                    className="min-h-11 underline underline-offset-4"
                >
                    {copy.feedback}
                </Button>
                <Link
                    href="/p/contact"
                    className="inline-flex min-h-11 items-center underline underline-offset-4"
                >
                    {copy.connect}
                </Link>
            </div>
            <Dialog open={open && !readOnly} onOpenChange={setOpen}>
                <DialogContent
                    data-feedback-ui
                    className="max-h-[85dvh] overflow-y-auto"
                >
                    <CommentForm
                        selection={selection}
                        profile={profile}
                        address={address}
                        admin={admin}
                        onSent={() => setOpen(false)}
                    />
                </DialogContent>
            </Dialog>
        </section>
    );
}
