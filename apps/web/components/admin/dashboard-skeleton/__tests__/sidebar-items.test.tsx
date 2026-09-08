import { isValidElement } from "react";
import { UIConstants } from "@courselit/common-models";
import { feedbackUi } from "@config/strings";
import {
    SIDEBAR_MENU_MAILS,
    SIDEBAR_MENU_SETTINGS,
    SIDEBAR_MENU_USERS,
} from "@ui-config/strings";
import { getSidebarItems, type NavProjectItem } from "../sidebar-items";
import type { NavItemData } from "../nav-item";

const everything = getSidebarItems({
    profile: {
        userId: "admin",
        permissions: Object.values(UIConstants.permissions),
    },
    checklist: ["one left"],
    totalChecklistItems: 3,
    path: "/dashboard/changes",
    tab: null,
});

const railEntries: (NavItemData | NavProjectItem)[] = [
    ...everything.navProjectItems,
    ...everything.navGroups.flatMap((group) => group.items),
    ...everything.navSecondaryItems,
];

const glyphOf = (icon: NavItemData["icon"]) =>
    isValidElement(icon) ? icon.type : icon;

test("every rail entry carries a glyph no other entry uses", () => {
    const glyphs = railEntries.map((entry) => glyphOf(entry.icon));
    expect(glyphs.every(Boolean)).toBe(true);
    expect(new Set(glyphs).size).toBe(glyphs.length);
});

test("Settings sits at the foot of the rail, directly above the Legacy builder", () => {
    const foot = everything.navSecondaryItems.map((entry) => entry.title);
    expect(foot.indexOf(SIDEBAR_MENU_SETTINGS)).toBe(
        foot.indexOf(feedbackUi.legacy) - 1,
    );
    expect(
        everything.navGroups.flatMap((group) => group.items),
    ).not.toContainEqual(
        expect.objectContaining({ title: SIDEBAR_MENU_SETTINGS }),
    );
});

test("every entry with pages, and every page, leads somewhere", () => {
    const parents = railEntries.filter(
        (entry): entry is NavItemData =>
            "items" in entry && !!entry.items?.length,
    );
    expect(parents.map((entry) => entry.title)).toEqual([
        SIDEBAR_MENU_USERS,
        SIDEBAR_MENU_MAILS,
        SIDEBAR_MENU_SETTINGS,
    ]);
    for (const parent of parents) {
        expect(parent.url).toMatch(/^\/dashboard\//);
        for (const page of parent.items!) {
            expect(page.url).toMatch(/^\/dashboard\//);
        }
    }
});

test("the mailing entry is called Email", () => {
    expect(SIDEBAR_MENU_MAILS).toBe("Email");
});
