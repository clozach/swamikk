// Server-safe entry point. Do not export visual editors or block settings here.
export { renderEmailToHtml, EmailTemplate } from "./lib/email-renderer";
export type { UtmParams } from "./lib/email-renderer";
export { defaultEmail } from "./lib/default-email";
export type { Email, EmailBlock, EmailStyle } from "./types/email-editor";
