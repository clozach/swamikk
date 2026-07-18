// Digital-download delivery email — same visual system as
// magic-code-email.ts and course-enroll.ts; see the former for the fuller
// layout rationale (nested tables, inline styles, font fallbacks).
//
// The original template signed off "Best, {name}" with the course creator's
// (or school's) name as plain text. The Hari Om closing now carries that
// signal visually via Karuna's signature, so `name` moves to the image's alt
// text — still present for screen readers and clients that block images,
// just no longer duplicated as a second, differently-styled sign-off.
const digitalDownloadTemplate = `
doctype html
html
    head
        meta(charset="utf-8")
        meta(name="viewport" content="width=device-width, initial-scale=1")
        title Your download is ready
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
                                h1(style="margin:0 0 14px 0; font-family:'Playfair Display', Georgia, 'Times New Roman', serif; font-size:28px; line-height:1.3; font-weight:400; color:#312110;") Your download is ready
                                p(style="margin:0; font-family:'Open Sans', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; font-size:15px; line-height:1.65; color:#545454;")
                                    | Thank you for signing up for
                                    |
                                    strong= courseName
                                    | .
                        tr
                            td(align="center" style="padding:28px 36px 0 36px;")
                                table(role="presentation" cellpadding="0" cellspacing="0" border="0")
                                    tr
                                        td(align="center" style="background-color:#ff9900; border-radius:10px;")
                                            a(
                                                href=downloadLink
                                                style="display:inline-block; padding:14px 32px; font-family:'Open Sans', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; font-size:15px; font-weight:700; color:#ffffff; text-decoration:none;"
                                            ) Download now
                        tr
                            td(align="center" style="padding:20px 36px 0 36px;")
                                p(style="margin:0; font-family:'Open Sans', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; font-size:13px; line-height:1.65; color:#545454;")
                                    | Want to see everything at once?
                                    |
                                    a(href=loginLink style="color:#993300;") Log in to your account
                                    | .
                        tr
                            td(style="padding:28px 36px 0 36px;")
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
                                        alt=name || schoolName
                                        style="display:block; width:190px; height:64px; border:0; outline:none; text-decoration:none; margin:14px 0 0 28px;"
                                    )
`;

export default digitalDownloadTemplate;
