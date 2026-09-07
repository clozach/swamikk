import type {
    ContentChange,
    ContentChangeInput,
} from "@courselit/common-models";
import type { InternalContentChange } from "@courselit/orm-models";
export type PageCreationChange = Extract<
    ContentChange,
    { target: { kind: "page-create" } }
>;
export type PageCreationInput = Extract<
    ContentChangeInput,
    { target: { kind: "page-create" } }
>;
export type PageCreationRecord = Extract<
    InternalContentChange,
    { target: { kind: "page-create" } }
>;
export const isPageCreation = (
    change: ContentChange,
): change is PageCreationChange => change.target.kind === "page-create";
export const isPageCreationRecord = (
    change: InternalContentChange,
): change is PageCreationRecord => change.target.kind === "page-create";
