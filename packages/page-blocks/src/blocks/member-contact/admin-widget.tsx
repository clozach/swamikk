import type { Settings } from "./widget";
export default function AdminWidget({
    settings,
    onChange,
}: {
    settings: Settings;
    onChange: (settings: Settings) => void;
}) {
    return (
        <div className="space-y-4 p-4">
            <label className="block">
                Heading
                <input
                    className="block w-full border p-2"
                    value={
                        settings.title ?? "How would you like to stay in touch?"
                    }
                    onChange={(event) =>
                        onChange({ ...settings, title: event.target.value })
                    }
                />
            </label>
            <label className="block">
                Introduction
                <textarea
                    className="block w-full border p-2"
                    value={
                        settings.intro ??
                        "A question about your practice, your membership or something that is not working? You are welcome to get in touch."
                    }
                    onChange={(event) =>
                        onChange({ ...settings, intro: event.target.value })
                    }
                />
            </label>
        </div>
    );
}
