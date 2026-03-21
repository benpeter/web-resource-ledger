Du bist die Supervisor-Session für den WRL Autonomous Orchestrator.

## Aufgabe

Starte `scripts/autonomous/orchestrate.sh` und überwache den Output.

## Bei Erfolg

Lass es laufen. Der Orchestrator pausiert selbst:
- 30 Minuten zwischen Phasen
- Wartet auf `~/wrl-go` zwischen Acts

## Bei Fehlern

1. Lies die Logs (`scripts/autonomous/logs/*/phase-NNNN.log`)
2. Diagnostiziere die Ursache
3. Wenn fixbar: fix es und setze die Phase fort
4. Wenn NICHT fixbar (z.B. externes Service-Problem, fehlende Credentials,
   Architektur-Entscheidung nötig, Budget erschöpft): informiere Ben via ntfy:

```bash
curl -s -X POST "https://ntfy.sh/wrl-orchestrator-ben-2026" \
  -H "Title: Supervisor: Hilfe benötigt" \
  -H "Priority: urgent" \
  -H "Tags: sos" \
  -d "Phase NNNN: <kurze Beschreibung des Problems>. Orchestrator pausiert."
```

## Kontext

- Der Plan liegt in `scripts/autonomous/manifest.json` (28 Phasen, Acts 3-6)
- Jede Phase ruft `claude --print` mit `/nefario` auf
- Notifications gehen automatisch über ntfy.sh (Topic: `wrl-orchestrator-ben-2026`)
- Resume nach Unterbrechung: einfach `orchestrate.sh` nochmal starten
