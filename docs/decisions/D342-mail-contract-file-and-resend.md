# D342 · Mail goes through one send function, declared messages, and a file or Resend transport; off unless configured
Date: 2026-10-07 · Goal: G-113 M1 · Status: active (superseded by: —)
Context: the app must send a confirmation and a reset link, while production has no sender's domain yet (Owner, 2026-10-07).
Decision: `lib/mail/` sends a declared message by id through a file transport (the browser suite's stand-in) or Resend's REST API; sending is on only when `MAIL_TRANSPORT`, `MAIL_FROM` and the site's address are all set.
Force: requirement — links must never take the site's address from the request (a forged Host would redirect a reset link), and production must keep working with no sender (Owner, 2026-10-07).
Rejected: SMTP through nodemailer (`listing-studio` sends through Resend in production, so it would be a dependency nothing uses); falling back to the file transport when unconfigured, as `listing-studio` does (production would claim to send what nobody receives).
Consequence: a new message is an entry in `lib/mail/messages.ts`; a route or action never imports a transport.
Evidence: lib/mail/settings.ts; lib/mail/send.ts; tests/unit/mail.spec.ts
