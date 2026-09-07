import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ContactPreferencesForm from "../form";
import ContactPreferencesPanel from "../panel";
import { contactPreferencesCopy as copy } from "@/config/strings";
import type { ContactPreferences } from "@courselit/common-models";

const initial: ContactPreferences = {
    revision: 0,
    contact: { kind: "email", value: "member@example.com" },
    checkIns: "none",
    photo: { kind: "none" },
};
afterEach(() => jest.restoreAllMocks());
function form(overrides = {}) {
    return render(
        <ContactPreferencesForm
            initial={initial}
            readOnly={false}
            onSave={jest.fn()}
            onReload={jest.fn()}
            {...overrides}
        />,
    );
}
it("defaults to no check-ins/photo, prefills contact and explicitly edits without changing sign-in email", () => {
    form();
    expect(screen.getByLabelText(copy.email)).toHaveValue("member@example.com");
    expect(screen.getByLabelText(copy.email)).toHaveAttribute("readonly");
    expect(screen.getByLabelText(copy.checkIns)).toHaveValue("none");
    expect(screen.getByText(copy.noPhoto)).toBeVisible();
    expect(screen.getByRole("button", { name: copy.save })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: copy.edit }));
    expect(screen.getByLabelText(copy.email)).not.toHaveAttribute("readonly");
    expect(screen.getByText(copy.contactNote)).toBeVisible();
});
it("saves matching phone and explicit check-ins, confirms in place, and disables duplicate saves", async () => {
    const onSave = jest.fn().mockImplementation(async (input) => ({
        ...initial,
        ...input,
        revision: 1,
        photo: { kind: "none" },
    }));
    form({ onSave });
    fireEvent.change(screen.getByLabelText(copy.method), {
        target: { value: "text" },
    });
    fireEvent.change(screen.getByLabelText(copy.phone), {
        target: { value: "+64 21 1234567" },
    });
    fireEvent.change(screen.getByLabelText(copy.checkIns), {
        target: { value: "occasional" },
    });
    fireEvent.click(screen.getByRole("button", { name: copy.save }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith({
        revision: 0,
        contact: { kind: "text", value: "+64 21 1234567" },
        checkIns: "occasional",
        photo: { kind: "keep" },
    });
    expect(await screen.findByText(copy.saved)).toBeVisible();
    expect(screen.getByRole("button", { name: copy.save })).toBeDisabled();
});
it("keeps edits when saving fails, including an explicit photo removal", async () => {
    const onSave = jest.fn().mockRejectedValue(new Error("Save unavailable"));
    form({
        initial: {
            ...initial,
            revision: 2,
            photo: { kind: "shared", version: 2 },
        },
        onSave,
    });
    expect(screen.getByRole("img")).toHaveAttribute(
        "src",
        "/api/contact-preferences/photo?v=2",
    );
    fireEvent.click(screen.getByRole("button", { name: copy.removePhoto }));
    fireEvent.click(screen.getByRole("button", { name: copy.edit }));
    fireEvent.change(screen.getByLabelText(copy.email), {
        target: { value: "reply@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: copy.save }));
    expect(await screen.findByText("Save unavailable")).toBeVisible();
    expect(screen.getByLabelText(copy.email)).toHaveValue("reply@example.com");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ photo: { kind: "remove" } }),
    );
});
it("shows shared data in Mimic with all mutations unavailable", () => {
    const onSave = jest.fn();
    form({
        readOnly: true,
        onSave,
        initial: { ...initial, photo: { kind: "shared", version: 1 } },
    });
    expect(screen.getByLabelText(copy.method)).toBeDisabled();
    expect(screen.getByLabelText(copy.email)).toBeDisabled();
    expect(screen.getByLabelText(copy.checkIns)).toBeDisabled();
    expect(screen.queryByLabelText(copy.choosePhoto)).not.toBeInTheDocument();
    expect(
        screen.queryByRole("button", { name: copy.save }),
    ).not.toBeInTheDocument();
    expect(
        screen.queryByRole("button", { name: copy.removePhoto }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(copy.readOnly)).toBeVisible();
    expect(onSave).not.toHaveBeenCalled();
});
it("does not mount any private form until loading succeeds and offers retry after failure", async () => {
    const fetchMock = jest
        .fn()
        .mockResolvedValueOnce({ ok: false })
        .mockResolvedValueOnce({ ok: true, json: async () => initial });
    global.fetch = fetchMock;
    render(<ContactPreferencesPanel readOnly={false} />);
    expect(screen.queryByLabelText(copy.email)).not.toBeInTheDocument();
    expect(await screen.findByText(copy.failed)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: copy.retry }));
    expect(await screen.findByLabelText(copy.email)).toHaveValue(
        "member@example.com",
    );
    expect(fetchMock).toHaveBeenCalledWith(
        "/api/contact-preferences",
        expect.objectContaining({ cache: "no-store" }),
    );
});
