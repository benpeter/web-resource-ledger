The `@w-r-l/verify` CLI can produce a comprehensive, plain-language verification report suitable for submission in legal proceedings. When a paralegal, attorney, or forensic examiner runs verification with this flag, the output explains not just the pass/fail results but *what was verified, how, and why the result is trustworthy* — in terms a judge or opposing counsel can follow without cryptographic expertise.

Source: GitHub issue #166

Success criteria:
- `npx @w-r-l/verify --legal <url>` produces a structured report
- Report language is precise but accessible to legal professionals
- All hash values, key identifiers, timestamps, TSA details untruncated
- Distinguishes standard RFC 3161 vs eIDAS qualified timestamps
- `--legal --json` variant produces machine-readable output
- Default output unchanged

Constraints:
- No ANSI codes in --legal mode
- Reference FRE 901(b)(9) and eIDAS Art. 41 without claiming admissibility
