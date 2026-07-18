// Enrollment confirmation email — the second email a new member ever
// receives, right after the sign-in code (templates/magic-code-email.ts).
// Shares that template's visual system deliberately: same cream/card/hairline
// shell, same header logo, same Hari Om closing over Karuna's signature. A
// member who got the branded sign-in email and then a stock "Powered by
// CourseLit" enrollment notice would notice the seam; this closes it.
//
// See magic-code-email.ts for the fuller rationale on layout choices (nested
// tables, inline styles, Georgia/system-sans fallbacks — email clients strip
// <style> blocks and rarely load web fonts).
//
// Saffron appears here or in the button, unlike the code email, and that's
// deliberate per the Anahata tokens: saffron is reserved for interactive
// accents, and this email's whole point is one clickable action.
const courseEnrollTemplate = `
doctype html
html
    head
        meta(charset="utf-8")
        meta(name="viewport" content="width=device-width, initial-scale=1")
        title You're enrolled
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
                                h1(style="margin:0 0 14px 0; font-family:'Playfair Display', Georgia, 'Times New Roman', serif; font-size:28px; line-height:1.3; font-weight:400; color:#312110;") You're enrolled
                                p(style="margin:0; font-family:'Open Sans', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; font-size:15px; line-height:1.65; color:#545454;")
                                    | You've been enrolled in
                                    |
                                    strong= courseName
                                    | . It's ready whenever you are.
                        tr
                            td(align="center" style="padding:28px 36px 0 36px;")
                                table(role="presentation" cellpadding="0" cellspacing="0" border="0")
                                    tr
                                        td(align="center" style="background-color:#ff9900; border-radius:10px;")
                                            a(
                                                href=loginLink
                                                style="display:inline-block; padding:14px 32px; font-family:'Open Sans', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; font-size:15px; font-weight:700; color:#ffffff; text-decoration:none;"
                                            ) Log in to start
                        tr
                            td(style="padding:32px 36px 0 36px;")
                                table(role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%")
                                    tr
                                        td(height="1" style="height:1px; line-height:1px; font-size:1px; background-color:#e7dfcc;")
                                            | &nbsp;
                        tr
                            td(align="left" style="padding:24px 36px 32px 36px; text-align:left;")
                                div(style="font-family:'Playfair Display', Georgia, 'Times New Roman', serif; font-size:20px; line-height:1.3; color:#312110;") Hari Om!
                                if signatureUrl
                                    img(
                                        src=signatureUrl
                                        width="190"
                                        height="64"
                                        alt=schoolName
                                        style="display:block; width:190px; height:64px; border:0; outline:none; text-decoration:none; margin:14px 0 0 28px;"
                                    )
`;

export default courseEnrollTemplate;
