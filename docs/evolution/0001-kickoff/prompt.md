# 0001: Kickoff — MVP Scoping and Planning

The prompt that started the project. Sent to Claude Code with the
despicable-agents framework to scope, plan, and break down the minimum
shippable product into executable work units.

## Prompt

```
Assemble @"gru (agent)", @"lucy (agent)", @"margo (agent)", @"nefario (agent)".

Task: Scope and plan the WRL minimum shippable product.

Context: PRODUCT.md describes the full vision. CLAUDE.md defines the engineering
philosophy (Helix Manifesto, YAGNI, KISS). The goal is the smallest thing that
delivers the core value prop: capture a URL, store it immutably, and let a
third party verify the capture.

Steps:
1. Read PRODUCT.md. Identify what's MVP vs what's future.
2. Document the MVP scope -- what's in, what's explicitly out, and why.
   Write this to docs/MVP.md.
3. Build the implementation plan. Sequence matters -- each step should
   produce something runnable.
4. Manifest the plan as GitHub issues, one per work unit. Each issue
   should be a self-contained task that a developer (or agent) can pick
   up and execute.
```
