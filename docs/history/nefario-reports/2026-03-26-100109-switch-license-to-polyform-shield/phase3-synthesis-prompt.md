MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a final execution plan.

## Original Task
Switch license from Apache 2.0 to PolyForm Shield 1.0.0

**Outcome**: WRL is relicensed under PolyForm Shield 1.0.0, so the source remains fully public but competitors cannot use the code to offer a competing web capture service. No time-based conversion — the protection is permanent.

**Success criteria**:
- LICENSE file contains PolyForm Shield 1.0.0 text
- package.json license field updated
- README references the new license accurately
- CONTRIBUTING.md updated if it references the old license
- No other files still claim Apache 2.0
- Evolution log phase documents the switch with rationale

**Scope**:
- In: LICENSE file, package.json, README, CONTRIBUTING.md, any files referencing "Apache 2.0", evolution log entry
- Out: Adding per-file license headers, CLA setup, license scanning CI

**Constraints**:
- PolyForm Shield 1.0.0 (not FSL, not BSL, not CC)

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-TxlCaJ/switch-license-to-polyform-shield/phase2-product-marketing-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-TxlCaJ/switch-license-to-polyform-shield/phase2-devx-minion.md

## Key consensus across specialists:

### product-marketing-minion
- Replace "open source" with "source-available" everywhere. Lead with what users CAN do (self-host, audit, modify) rather than the restriction.
- 15+ instances across landing pages (index.html, 404.html, privacy.html, security.html, refund-policy.html, terms.html, content-policy.html), README, llms.txt need updating.
- Specific before/after copy provided for every touchpoint.

### devx-minion
- Add dedicated License section to CONTRIBUTING.md with explicit inbound=outbound clause.
- Use "SEE LICENSE IN LICENSE" for package.json since PolyForm Shield has no SPDX identifier.
- Do not mention CLA deferral -- silence is better than uncertainty.
- Verify no external contributors exist whose Apache 2.0 code can't be relicensed.

### Conflict to resolve:
- package.json license field: devx-minion recommends "SEE LICENSE IN LICENSE" (npm convention for non-SPDX). Task brief suggested "PolyForm-Shield-1.0.0". Need to decide.

## External Skills Context
No external skills detected relevant to this task.

## Instructions
1. Review all specialist contributions
2. Resolve any conflicts between recommendations
3. Incorporate risks and concerns into the plan
4. Create the final execution plan in structured format
5. Ensure every task has a complete, self-contained prompt
6. Write your complete delegation plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-TxlCaJ/switch-license-to-polyform-shield/phase3-synthesis.md`
