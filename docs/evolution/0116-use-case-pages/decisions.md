# Decisions: Phase 0116

- Three docs pages under `/use-cases/` and a "Use Cases" nav section, not
  landing-page sections: each page needs steps and commands, and the docs
  site already has the layout and the sitemap.
- The pages describe the use cases generically. No user, site or capture from
  the September and October data is named.
- Each page says what WRL doesn't do there: no link-following crawler, and
  captures of sites behind bot checks can hold the check screen and still be
  marked complete (GH #317). The marketplace page says to check the
  screenshot before relying on a capture.
- The preservation page recommends the Wayback Machine alongside WRL, as the
  user who preserved a site did.
- `batch.md` said up to 100 URLs per request. Production runs the default of
  20 (`MAX_BATCH_SIZE` unset, phase 0043 D5), so a request with 21 to 100 URLs
  got a 400. The page now says 20, and that an operator can raise it to 100.
- The "Are screenshots admissible in court?" page and per-competitor pages
  (C3) are left for Ben to review, since they make legal and comparative
  claims.
