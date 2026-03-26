# Phase 0096 — Align email link domains with sending domain

Issue: #216

Ensure all links in outbound WRL emails use the WRL sending domain instead
of third-party domains (e.g., invoice.stripe.com), so Resend's deliverability
checks don't flag domain mismatches.
