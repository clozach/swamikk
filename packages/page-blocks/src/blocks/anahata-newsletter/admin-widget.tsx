import React, { useEffect, useState } from "react";
import type { Address, Profile } from "@courselit/common-models";
import type {
    SectionBackground,
    Theme,
    ThemeStyle,
} from "@courselit/page-models";
import {
    AdminWidgetPanel,
    AdminWidgetPanelContainer,
    Checkbox,
    CssIdField,
    Form,
    FormField,
    MaxWidthSelector,
    PageBuilderPropertyHeader,
    SectionBackgroundPanel,
    Select,
    VerticalPaddingSelector,
} from "@courselit/components-library";
import Settings, { SubscribeMode } from "./settings";
import {
    DEFAULT_BACKGROUND,
    DEFAULT_BODY,
    DEFAULT_BUTTON_CAPTION,
    DEFAULT_EMAIL_LABEL,
    DEFAULT_EMAIL_PLACEHOLDER,
    DEFAULT_HEADING,
    DEFAULT_INVALID_EMAIL_MESSAGE,
    DEFAULT_MISSING_EMAIL_MESSAGE,
    DEFAULT_SUBSCRIBE_LINK,
    DEFAULT_SUBSCRIBE_MODE,
    DEFAULT_SUCCESS_MESSAGE,
    DEFAULT_VERTICAL_PADDING,
} from "./defaults";

interface AdminWidgetProps {
    name: string;
    settings: Settings;
    onChange: (...args: any[]) => void;
    address: Address;
    networkAction: boolean;
    profile: Profile;
    theme: Theme;
}

export default function AdminWidget({
    settings,
    onChange,
    address,
    profile,
}: AdminWidgetProps): JSX.Element {
    const [heading, setHeading] = useState(settings.heading);
    const [body, setBody] = useState(settings.body);
    const [subscribeMode, setSubscribeMode] = useState<SubscribeMode>(
        settings.subscribeMode || DEFAULT_SUBSCRIBE_MODE,
    );
    const [emailLabel, setEmailLabel] = useState(settings.emailLabel);
    const [emailPlaceholder, setEmailPlaceholder] = useState(
        settings.emailPlaceholder,
    );
    const [buttonCaption, setButtonCaption] = useState(settings.buttonCaption);
    const [subscribeLink, setSubscribeLink] = useState(settings.subscribeLink);
    const [subscribeLinkOpensInNewTab, setSubscribeLinkOpensInNewTab] =
        useState(!!settings.subscribeLinkOpensInNewTab);
    const [successMessage, setSuccessMessage] = useState(
        settings.successMessage,
    );
    const [missingEmailMessage, setMissingEmailMessage] = useState(
        settings.missingEmailMessage,
    );
    const [invalidEmailMessage, setInvalidEmailMessage] = useState(
        settings.invalidEmailMessage,
    );
    const [disclaimer, setDisclaimer] = useState(settings.disclaimer);
    const [background, setBackground] = useState<SectionBackground>(
        settings.background || DEFAULT_BACKGROUND,
    );
    const [maxWidth, setMaxWidth] = useState<
        ThemeStyle["structure"]["page"]["width"]
    >(settings.maxWidth);
    const [verticalPadding, setVerticalPadding] = useState<
        ThemeStyle["structure"]["section"]["padding"]["y"]
    >(settings.verticalPadding || DEFAULT_VERTICAL_PADDING);
    const [cssId, setCssId] = useState(settings.cssId);

    useEffect(() => {
        onChange({
            heading,
            body,
            subscribeMode,
            emailLabel,
            emailPlaceholder,
            buttonCaption,
            subscribeLink,
            subscribeLinkOpensInNewTab,
            successMessage,
            missingEmailMessage,
            invalidEmailMessage,
            disclaimer,
            background,
            maxWidth,
            verticalPadding,
            cssId,
        });
    }, [
        heading,
        body,
        subscribeMode,
        emailLabel,
        emailPlaceholder,
        buttonCaption,
        subscribeLink,
        subscribeLinkOpensInNewTab,
        successMessage,
        missingEmailMessage,
        invalidEmailMessage,
        disclaimer,
        background,
        maxWidth,
        verticalPadding,
        cssId,
    ]);

    return (
        <AdminWidgetPanelContainer
            type="multiple"
            defaultValue={["copy", "subscribe", "design"]}
        >
            <AdminWidgetPanel title="Copy" value="copy">
                <Form>
                    <FormField
                        label="Heading"
                        value={heading || ""}
                        placeholder={DEFAULT_HEADING}
                        tooltip="Rendered in Playfair Display, uppercase."
                        onChange={(e) => setHeading(e.target.value)}
                    />
                    <FormField
                        label="Body"
                        component="textarea"
                        rows={4}
                        value={body || ""}
                        placeholder={DEFAULT_BODY}
                        tooltip="Leave a blank line between paragraphs."
                        onChange={(e) => setBody(e.target.value)}
                    />
                    <FormField
                        label="Small print"
                        value={disclaimer || ""}
                        placeholder="Optional. Leave blank to hide."
                        onChange={(e) => setDisclaimer(e.target.value)}
                    />
                </Form>
            </AdminWidgetPanel>

            <AdminWidgetPanel title="Subscribe" value="subscribe">
                <Select
                    title="Subscription style"
                    subtitle="An inline email field, or a button linking to the newsletter page."
                    value={subscribeMode}
                    onChange={(value: SubscribeMode) => setSubscribeMode(value)}
                    options={[
                        {
                            label: "Inline email form",
                            value: "form",
                            sublabel: "Field plus Subscribe button",
                        },
                        {
                            label: "Link button only",
                            value: "link",
                            sublabel: "Matches the current Anahata site",
                        },
                    ]}
                />
                <Form>
                    <FormField
                        label="Button caption"
                        value={buttonCaption || ""}
                        placeholder={DEFAULT_BUTTON_CAPTION}
                        onChange={(e) => setButtonCaption(e.target.value)}
                    />
                </Form>

                {subscribeMode === "link" ? (
                    <>
                        <Form>
                            <FormField
                                label="Button link"
                                value={subscribeLink || ""}
                                placeholder={DEFAULT_SUBSCRIBE_LINK}
                                onChange={(e) =>
                                    setSubscribeLink(e.target.value)
                                }
                            />
                        </Form>
                        <div className="flex items-center justify-between gap-2">
                            <PageBuilderPropertyHeader label="Open in a new tab" />
                            <Checkbox
                                checked={subscribeLinkOpensInNewTab}
                                onChange={(value: boolean) =>
                                    setSubscribeLinkOpensInNewTab(value)
                                }
                            />
                        </div>
                    </>
                ) : (
                    <Form>
                        <FormField
                            label="Email field placeholder"
                            value={emailPlaceholder || ""}
                            placeholder={DEFAULT_EMAIL_PLACEHOLDER}
                            onChange={(e) =>
                                setEmailPlaceholder(e.target.value)
                            }
                        />
                        <FormField
                            label="Email field label"
                            value={emailLabel || ""}
                            placeholder={DEFAULT_EMAIL_LABEL}
                            tooltip="Read aloud by screen readers; not shown on screen."
                            onChange={(e) => setEmailLabel(e.target.value)}
                        />
                    </Form>
                )}
            </AdminWidgetPanel>

            {subscribeMode === "form" && (
                <AdminWidgetPanel title="Messages" value="messages">
                    <Form>
                        <FormField
                            label="Success message"
                            component="textarea"
                            rows={2}
                            value={successMessage || ""}
                            placeholder={DEFAULT_SUCCESS_MESSAGE}
                            tooltip="Shown inline after a valid address is submitted."
                            onChange={(e) => setSuccessMessage(e.target.value)}
                        />
                        <FormField
                            label="Empty field message"
                            value={missingEmailMessage || ""}
                            placeholder={DEFAULT_MISSING_EMAIL_MESSAGE}
                            onChange={(e) =>
                                setMissingEmailMessage(e.target.value)
                            }
                        />
                        <FormField
                            label="Invalid address message"
                            value={invalidEmailMessage || ""}
                            placeholder={DEFAULT_INVALID_EMAIL_MESSAGE}
                            onChange={(e) =>
                                setInvalidEmailMessage(e.target.value)
                            }
                        />
                    </Form>
                </AdminWidgetPanel>
            )}

            <AdminWidgetPanel title="Design" value="design">
                <PageBuilderPropertyHeader
                    label="Background"
                    tooltip="Defaults to the Anahata callout photograph, anchored to its bottom edge."
                />
                <SectionBackgroundPanel
                    value={background}
                    onChange={setBackground}
                    profile={profile}
                    address={address}
                />
                <MaxWidthSelector value={maxWidth} onChange={setMaxWidth} />
                <VerticalPaddingSelector
                    value={verticalPadding}
                    onChange={setVerticalPadding}
                />
            </AdminWidgetPanel>

            <AdminWidgetPanel title="Advanced" value="advanced">
                <CssIdField value={cssId} onChange={setCssId} />
            </AdminWidgetPanel>
        </AdminWidgetPanelContainer>
    );
}
