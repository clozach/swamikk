"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import type { PageSelection } from "./targets";

export function SelectionChoices({
    choices,
    onSelect,
}: {
    choices: PageSelection[];
    onSelect: (selection: PageSelection) => void;
}) {
    const buttons = useRef<Array<HTMLButtonElement | null>>([]);
    return (
        <div className="grid gap-2">
            {choices.map((selection, index) => (
                <Button
                    key={index}
                    ref={(button) => {
                        buttons.current[index] = button;
                    }}
                    variant="outline"
                    className="min-h-11 h-auto justify-start whitespace-normal text-left"
                    onClick={() => onSelect(selection)}
                    onKeyDown={(event) => {
                        if (
                            event.altKey ||
                            event.ctrlKey ||
                            event.metaKey ||
                            event.shiftKey ||
                            !["ArrowUp", "ArrowDown"].includes(event.key)
                        )
                            return;
                        event.preventDefault();
                        const direction = event.key === "ArrowDown" ? 1 : -1;
                        const next = Math.max(
                            0,
                            Math.min(choices.length - 1, index + direction),
                        );
                        buttons.current[next]?.focus();
                    }}
                >
                    {selection.label}
                </Button>
            ))}
        </div>
    );
}
