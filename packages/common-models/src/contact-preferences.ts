export type PreferredContact =
    | { kind: "email"; value: string }
    | { kind: "voice"; value: string }
    | { kind: "text"; value: string };

export type PersonalCheckIns = "none" | "occasional";

export interface ContactPreferences {
    revision: number;
    contact: PreferredContact;
    checkIns: PersonalCheckIns;
    photo: { kind: "none" } | { kind: "shared"; version: number };
}

export interface ContactPreferencesInput {
    revision: number;
    contact: PreferredContact;
    checkIns: PersonalCheckIns;
    photo:
        | { kind: "keep" }
        | { kind: "remove" }
        | { kind: "replace"; data: string };
}

export interface ContactPreferenceFields {
    method: "email" | "voice" | "text";
    detail: string;
    checkIns: PersonalCheckIns;
}
