import React from "react";
import { Button2, Tooltip } from "@courselit/components-library";
import Link from "next/link";
import { Exit } from "@courselit/icons";
import { BTN_EXIT_COURSE, BTN_EXIT_COURSE_TOOLTIP } from "@ui-config/strings";

function ExitCourseButton() {
    return (
        <Tooltip title={BTN_EXIT_COURSE_TOOLTIP}>
            <Button2 variant="secondary" className="flex gap-2" asChild>
                <Link href="/dashboard/my-content">
                    <Exit /> {BTN_EXIT_COURSE}
                </Link>
            </Button2>
        </Tooltip>
    );
}

export default ExitCourseButton;
