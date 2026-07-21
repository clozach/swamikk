"use client";

import { ThemeContext } from "@components/contexts";
import { Section } from "@courselit/page-primitives";
import { useContext } from "react";
import ProductCheckout from "./product";
import CompareTool from "@components/public/compare-tool/compare-tool";

export default function CheckoutPage() {
    const { theme } = useContext(ThemeContext);
    return (
        <Section theme={theme.theme}>
            <div className="flex flex-col">
                <ProductCheckout />
            </div>
            {/* Easter egg: draw 3 circles → egg → click → this page's
                design-exploration compare tool. Renders null until summoned. */}
            <CompareTool context="checkout" />
        </Section>
    );
}
