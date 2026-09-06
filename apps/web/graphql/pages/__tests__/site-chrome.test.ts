/**
 * The page-save validator and the shared-widget copy must recognise whichever
 * blocks fill the site's header and footer slots — the configured chrome
 * (SITE_*_WIDGET) or the stock names — not the two literals alone. Checking the
 * literals rejected every page save on a site running replacement chrome
 * ("Invalid layout: Missing mandatory blocks", seen on the swamikk rig on
 * 2026-09-06).
 */
import {
    hasMandatoryBlocks,
    isSiteChromeBlock,
    headerBlockNames,
    footerBlockNames,
} from "../../../config/site-chrome";

const layout = (...names: string[]) => names.map((name) => ({ name }));

describe("site chrome block predicates", () => {
    it("accepts the stock header and footer", () => {
        expect(
            hasMandatoryBlocks(layout("header", "rich-text", "footer")),
        ).toBe(true);
    });

    it("accepts a configured replacement chrome", () => {
        const l = layout("anahataHeader", "banner", "anahataFooter");
        expect(hasMandatoryBlocks(l, "anahataHeader", "anahataFooter")).toBe(
            true,
        );
    });

    it("still accepts the stock names while replacement chrome is configured", () => {
        const l = layout("header", "footer");
        expect(hasMandatoryBlocks(l, "anahataHeader", "anahataFooter")).toBe(
            true,
        );
    });

    it("rejects a layout missing either slot", () => {
        expect(
            hasMandatoryBlocks(
                layout("anahataHeader", "banner"),
                "anahataHeader",
                "anahataFooter",
            ),
        ).toBe(false);
        expect(
            hasMandatoryBlocks(
                layout("banner", "anahataFooter"),
                "anahataHeader",
                "anahataFooter",
            ),
        ).toBe(false);
        expect(hasMandatoryBlocks([], "anahataHeader", "anahataFooter")).toBe(
            false,
        );
    });

    it("treats only chrome blocks as shared", () => {
        expect(
            isSiteChromeBlock(
                "anahataFooter",
                "anahataHeader",
                "anahataFooter",
            ),
        ).toBe(true);
        expect(
            isSiteChromeBlock("footer", "anahataHeader", "anahataFooter"),
        ).toBe(true);
        expect(
            isSiteChromeBlock("rich-text", "anahataHeader", "anahataFooter"),
        ).toBe(false);
        expect(isSiteChromeBlock(undefined)).toBe(false);
    });

    it("lists each slot's names without duplicates when the stock block is configured", () => {
        expect(headerBlockNames("header")).toEqual(["header"]);
        expect(footerBlockNames("anahataFooter")).toEqual([
            "anahataFooter",
            "footer",
        ]);
    });
});
