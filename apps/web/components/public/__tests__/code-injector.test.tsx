import { render } from "@testing-library/react";
import CodeInjector from "../code-injector";

describe("CodeInjector", () => {
    afterEach(() => {
        document.head.innerHTML = "";
        document.body.innerHTML = "";
    });

    it("injects a single head element", () => {
        render(<CodeInjector head='<style id="one">.a{}</style>' />);

        expect(document.head.querySelector("#one")).not.toBeNull();
    });

    it("injects every element when multiple are provided", () => {
        render(
            <CodeInjector
                head={
                    '<style id="first">.a{}</style><style id="second">.b{}</style><meta id="third" name="x" content="y">'
                }
            />,
        );

        expect(document.head.querySelector("#first")).not.toBeNull();
        expect(document.head.querySelector("#second")).not.toBeNull();
        expect(document.head.querySelector("#third")).not.toBeNull();
    });

    it("injects body elements alongside head elements", () => {
        render(
            <CodeInjector
                head='<style id="in-head">.a{}</style>'
                body='<div id="in-body-1"></div><div id="in-body-2"></div>'
            />,
        );

        expect(document.head.querySelector("#in-head")).not.toBeNull();
        expect(document.body.querySelector("#in-body-1")).not.toBeNull();
        expect(document.body.querySelector("#in-body-2")).not.toBeNull();
    });

    it("recreates script tags so they stay executable", () => {
        render(
            <CodeInjector head='<script id="s1">var x = 1;</script><script id="s2">var y = 2;</script>' />,
        );

        const s1 = document.head.querySelector("#s1");
        const s2 = document.head.querySelector("#s2");
        expect(s1?.nodeName).toBe("SCRIPT");
        expect(s2?.nodeName).toBe("SCRIPT");
        expect(s1?.innerHTML).toContain("var x = 1;");
        expect(s2?.innerHTML).toContain("var y = 2;");
    });
});
