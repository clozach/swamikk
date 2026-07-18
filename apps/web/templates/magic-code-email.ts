// Sign-in code email.
//
// Email clients are a hostile rendering target: no flexbox/grid, <style>
// blocks get stripped by several of them (Gmail's web client most notably),
// and web fonts usually don't load. So this is deliberately old-fashioned —
// nested tables for layout, every style inline, and font stacks that fall
// back to Georgia/system sans when Playfair Display and Open Sans are
// unavailable (which, in email, is most of the time).
//
// Colors come from the Anahata design system
// (projects/karuna-membership/anahata-design-system/tokens.css): cream page,
// white card, warm hairline borders, ink body copy, cocoa display type, and
// rust for the one big statement — here, the code itself. Saffron stays out
// of it; the tokens reserve saffron for interactive accents, and there is
// nothing to click in this email.
const magicCodeEmail = `
doctype html
html
    head
        meta(charset="utf-8")
        meta(name="viewport" content="width=device-width, initial-scale=1")
        title Your sign-in code
    body(style="margin:0; padding:0; width:100%; background-color:#f7f4eb; -webkit-text-size-adjust:100%;")
        table(role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f7f4eb;")
            tr
                td(align="center" style="padding:32px 16px;")
                    table(role="presentation" cellpadding="0" cellspacing="0" border="0" width="480" style="width:480px; max-width:100%; background-color:#ffffff; border:1px solid #e7dfcc; border-radius:10px;")
                        tr
                            td(align="center" style="padding:40px 36px 8px 36px;")
                                if logoUrl
                                    img(
                                        src=logoUrl
                                        width="72"
                                        height="72"
                                        alt=schoolName
                                        style="display:block; width:72px; height:72px; border:0; outline:none; text-decoration:none; margin:0 auto 24px auto;"
                                    )
                                h1(style="margin:0 0 14px 0; font-family:'Playfair Display', Georgia, 'Times New Roman', serif; font-size:28px; line-height:1.3; font-weight:400; color:#312110;") Your sign-in code
                                p(style="margin:0 0 28px 0; font-family:'Open Sans', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; font-size:15px; line-height:1.65; color:#545454;")
                                    | Welcome — here is the code to sign in to #{schoolName}. It stays valid for five minutes.
                        tr
                            td(align="center" style="padding:0 36px;")
                                table(role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%")
                                    tr
                                        td(align="center" style="background-color:#f7f4eb; border:1px solid #e7dfcc; border-radius:8px; padding:22px 16px;")
                                            div(style="font-family:'Open Sans', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; font-size:34px; line-height:1.15; font-weight:700; letter-spacing:8px; text-indent:8px; color:#993300;")= code
                        tr
                            td(align="center" style="padding:28px 36px 0 36px;")
                                p(style="margin:0 0 10px 0; font-family:'Open Sans', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; font-size:13px; line-height:1.65; color:#545454;")
                                    | Anyone holding this code can sign in as you, so please keep it to yourself.
                                p(style="margin:0; font-family:'Open Sans', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; font-size:13px; line-height:1.65; color:#545454;")
                                    | If you didn't ask to sign in, you can safely ignore this message — nothing will happen.
                        tr
                            td(style="padding:32px 36px 0 36px;")
                                table(role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%")
                                    tr
                                        td(height="1" style="height:1px; line-height:1px; font-size:1px; background-color:#e7dfcc;")
                                            | &nbsp;
                        tr
                            td(align="center" style="padding:22px 36px 32px 36px;")
                                if logoUrl
                                    img(
                                        src=logoUrl
                                        width="26"
                                        height="26"
                                        alt=""
                                        style="display:block; width:26px; height:26px; border:0; outline:none; text-decoration:none; margin:0 auto 8px auto;"
                                    )
                                div(style="font-family:'Open Sans', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; font-size:12px; line-height:1.5; color:#545454;")= schoolName
`;

export default magicCodeEmail;
