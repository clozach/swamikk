/**
 * The keyboard chord a magnet button carries in its label — a button is not
 * complete until it says how to reach it without a mouse. Decorative for
 * assistive tech: the button's aria-keyshortcuts names the same chord.
 */
export const Shortcut = ({ children }: { children: string }) => (
    <kbd className="kk-key" aria-hidden="true">
        {children}
    </kbd>
);
