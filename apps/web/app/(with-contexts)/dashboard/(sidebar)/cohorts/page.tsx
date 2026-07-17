import { Metadata, ResolvingMetadata } from "next";
import { COHORTS_PAGE_HEADING } from "@ui-config/strings";
import CohortsHub from "./cohorts-hub";

export async function generateMetadata(
    _: any,
    parent: ResolvingMetadata,
): Promise<Metadata> {
    return {
        title: `${COHORTS_PAGE_HEADING} | ${(await parent)?.title?.absolute}`,
    };
}

export default function Page() {
    return <CohortsHub />;
}
