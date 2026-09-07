import type Settings from "./settings";
import content from "./content";

export default function AdminWidget({
    settings,
    onChange,
}: {
    settings: Settings;
    onChange: (settings: Settings) => void;
}) {
    const variant = settings.variant || "terms";
    const defaults = content[variant];
    return (
        <div className="space-y-4 p-4">
            <label className="block">
                Page topics
                <select
                    className="block w-full border p-2"
                    value={variant}
                    onChange={(event) =>
                        onChange({
                            ...settings,
                            variant: event.target.value as Settings["variant"],
                            topics: undefined,
                            title: undefined,
                            intro: undefined,
                        })
                    }
                >
                    <option value="terms">Terms & cancellation</option>
                    <option value="privacy">Privacy</option>
                    <option value="help">Common questions</option>
                </select>
            </label>
            <label className="block">
                Heading
                <input
                    className="block w-full border p-2"
                    value={settings.title ?? defaults.title}
                    onChange={(event) =>
                        onChange({ ...settings, title: event.target.value })
                    }
                />
            </label>
            <label className="block">
                Introduction
                <textarea
                    className="block w-full border p-2"
                    value={settings.intro ?? defaults.intro}
                    onChange={(event) =>
                        onChange({ ...settings, intro: event.target.value })
                    }
                />
            </label>
            {(settings.topics ?? defaults.topics).map(
                (topic, index, topics) => (
                    <fieldset key={topic.id} className="space-y-2 border p-3">
                        <legend>{topic.title}</legend>
                        {(["title", "summary", "full"] as const).map(
                            (field) => (
                                <label className="block" key={field}>
                                    {field === "title"
                                        ? "Topic"
                                        : field === "summary"
                                          ? "Summary"
                                          : "Full text"}
                                    <textarea
                                        className="block w-full border p-2"
                                        value={topic[field]}
                                        onChange={(event) =>
                                            onChange({
                                                ...settings,
                                                topics: topics.map(
                                                    (item, position) =>
                                                        position === index
                                                            ? {
                                                                  ...item,
                                                                  [field]:
                                                                      event
                                                                          .target
                                                                          .value,
                                                              }
                                                            : item,
                                                ),
                                            })
                                        }
                                    />
                                </label>
                            ),
                        )}
                    </fieldset>
                ),
            )}
        </div>
    );
}
