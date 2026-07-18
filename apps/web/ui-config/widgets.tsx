import { Widget } from "@courselit/common-models";
import {
    Banner,
    Featured,
    Footer,
    Header,
    RichText,
    EmailForm,
    Hero,
    Grid,
    Content,
    FAQ,
    Pricing,
    Media,
    Marquee,
    Embed,
    AnahataHeader,
    AnahataHero,
    AnahataTour,
    AnahataPrivateSessions,
    AnahataGatherings,
    AnahataPosts,
    AnahataNewsletter,
    AnahataFooter,
} from "@courselit/page-blocks";

function loadWidgets(): Record<string, any> {
    const widgets: Record<string, Widget> = {};

    // Adding page blocks to CourseLit
    widgets[RichText.metadata.name] = RichText;
    widgets[Featured.metadata.name] = Featured;
    widgets[Banner.metadata.name] = Banner;
    widgets[Hero.metadata.name] = Hero;
    widgets[Grid.metadata.name] = Grid;
    widgets[Content.metadata.name] = Content;
    widgets[FAQ.metadata.name] = FAQ;
    widgets[Pricing.metadata.name] = Pricing;
    widgets[Media.metadata.name] = Media;
    widgets[Marquee.metadata.name] = Marquee;
    widgets[Embed.metadata.name] = Embed;
    widgets[EmailForm.metadata.name] = EmailForm;
    widgets[Footer.metadata.name] = Object.assign({}, Footer, { shared: true });
    widgets[Header.metadata.name] = Object.assign({}, Header, { shared: true });

    // Anahata Yoga Retreat blocks. The header and footer declare a `role` in
    // their metadata, so the page template hoists them into the chrome slots
    // the same way it does the stock pair — see WidgetMetadata.role.
    widgets[AnahataHero.metadata.name] = AnahataHero;
    widgets[AnahataTour.metadata.name] = AnahataTour;
    widgets[AnahataPrivateSessions.metadata.name] = AnahataPrivateSessions;
    widgets[AnahataGatherings.metadata.name] = AnahataGatherings;
    widgets[AnahataPosts.metadata.name] = AnahataPosts;
    widgets[AnahataNewsletter.metadata.name] = AnahataNewsletter;
    widgets[AnahataHeader.metadata.name] = Object.assign({}, AnahataHeader, {
        shared: true,
    });
    widgets[AnahataFooter.metadata.name] = Object.assign({}, AnahataFooter, {
        shared: true,
    });

    return widgets;
}

const widgets = loadWidgets();
export default widgets;
