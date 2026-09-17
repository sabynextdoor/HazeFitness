# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 1.x | ✅ |

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Instead, use GitHub's [private security advisory](https://github.com/sabynextdoor/HazeFitness/security/advisories/new)
and include:

- A description of the issue and its impact
- Steps to reproduce (or a proof of concept)
- Affected version / commit
- Any suggested remediation

You can expect an acknowledgement within a few days. Please allow time for a
fix before any public disclosure.

## Hardening checklist for operators

- Never commit `.env` files — they are git-ignored by default.
- Run with `NODE_ENV=production` and set a strong `ADMIN_PASSWORD`.
- Serve over HTTPS so session cookies are transmitted securely.
- Restrict `FRONTEND_ORIGINS` to your real domain(s).
- Set `ALLOW_PUBLIC_STAFF_SIGNUP=false` unless you intend open staff signup.
- Configure and verify the Razorpay webhook secret.
