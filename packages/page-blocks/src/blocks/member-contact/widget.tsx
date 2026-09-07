import type {
    WidgetDefaultSettings,
    WidgetProps,
} from "@courselit/common-models";
import { helpStyles } from "../help-policies/styles";

export interface Settings extends WidgetDefaultSettings {
    title?: string;
    intro?: string;
    cssId?: string;
}
export default function Widget({ settings, state }: WidgetProps<Settings>) {
    const signedIn = Boolean(state.profile?.userId);
    const membershipHref = signedIn
        ? "/dashboard/membership"
        : "/login?redirect=%2Fdashboard%2Fmembership";
    return (
        <section className="kk-help" id={settings.cssId}>
            <style>{helpStyles}</style>
            <nav className="kk-help-nav" aria-label="Help and policies">
                <a href="/p/contact" aria-current="page">
                    Help & contact
                </a>
                <a href="/p/terms">Terms & cancellation</a>
                <a href="/p/privacy">Privacy</a>
            </nav>
            <h1>{settings.title ?? "How would you like to stay in touch?"}</h1>
            <p>
                {settings.intro ??
                    "A question about your practice, your membership or something that is not working? You are welcome to get in touch."}
            </p>
            <div className="kk-help-panel">
                <h2>Email KK’s support team</h2>
                <p>
                    Write to{" "}
                    <a href="mailto:clozach+kk@gmail.com">
                        clozach+kk@gmail.com
                    </a>
                    . For a purchase question, include the email you purchased
                    with and your order reference, if you have it.
                </p>
                {signedIn && state.profile?.email && (
                    <p>
                        Your signed-in email:{" "}
                        <strong>{state.profile.email}</strong>.
                    </p>
                )}
                <p>
                    If you would like to connect with Swami Karma Karuna, let
                    the support team know. They can help pass on your request.
                </p>
                <div className="kk-help-actions">
                    <a
                        className="kk-help-action"
                        href="mailto:clozach+kk@gmail.com"
                    >
                        Write an email
                    </a>
                    <a href={membershipHref}>
                        Membership and receipts / request a refund
                    </a>
                </div>
            </div>
            <div className="kk-help-panel">
                <h2>Ask from the page you are on</h2>
                <p>
                    Use the round ? control to select something on the page and
                    send a private comment. You can send text and tell us where
                    you would like a reply. Please leave out sign-in codes and
                    payment-card details.
                </p>
            </div>
            <div className="kk-help-note">
                <h2>News from Anahata</h2>
                <p>
                    If you would like news about events and retreats, you can
                    join the mailing list using the form on the homepage.
                </p>
                <div className="kk-help-actions">
                    <a href="/#stay-in-touch">Open the newsletter form</a>
                    {signedIn && (
                        <a href="/dashboard/profile#contact-preferences">
                            Your contact, check-in and news preferences
                        </a>
                    )}
                </div>
            </div>
        </section>
    );
}
