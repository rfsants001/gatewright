# README gallery — 22 November 2026

These are captures of the production Electron renderer, not design mockups. The banners add a heading, the current Gatewright mark and capture metadata around the screen. Screen content is never painted over or fabricated by the banner generator.

All projects, memories, usage records, agents and map data are disposable fixtures. The provider returns fixed HTTP responses. Codex examples use `desktop/codex-fixture.mjs` with the real Gatewright MCP; they do not represent authenticated Codex editing or a provider invoice. Native-host acceptance limits remain in [CODEX-PARITY.md](../desktop-product-evolution/CODEX-PARITY.md).

| Banner | Capture / scenario |
| --- | --- |
| gatewright-project.webp | evolution/project.png — project overview and recorded activity |
| gatewright-pending.webp | pending/pending-overview.png — journal-derived reviews and installation diagnostics |
| gatewright-memory.webp | evolution/memory.png — versioned project memory |
| gatewright-map.webp | evolution/map.png — Graphify fixture with file relationships |
| gatewright-tasks.webp | evolution/codex-tasks.png — completed controlled Codex task |
| gatewright-review.webp | evolution/codex-review.png — actual diff dialog before approval |
| gatewright-flow.webp | evolution/codex-flow.png — Flow awaiting a human decision |
| gatewright-costs.webp | evolution/costs.png — declared usage data with a shared analysis period |
| gatewright-integrations.webp | evolution/integrations.png — providers, recipes and installation history |
| gatewright-connections.webp | evolution/codex-connections.png — configuration applied and native-trust check completed in the fixture |
| gatewright-agents.webp | evolution/agents.png — saved profile and ordered skill composition |
| gatewright-skills.webp | evolution/skills.png — searchable production catalog |
| gatewright-responsive.webp | evolution/compact-tasks.png — compact 780 × 860 viewport |

`manifest.json` records capture and banner hashes, dimensions and capture date. Most captures use 1440 × 960. The compact capture preserves its native width. Banners use the bundled Geist font and existing vector-derived app icon. WebP files replace the previous gallery at the same paths so downstream links remain valid.

## Reproduce

From the repository root in a graphical session:

```sh
npm run build
node desktop/evolution-smoke.mjs release/readme-captures/evolution
node desktop/pending-smoke.mjs release/readme-captures/pending
python3 scripts/generate-readme-banners.py release/readme-captures/evolution release/readme-captures/pending --date 2026-11-22
```

The capture scripts use temporary projects and profiles and clean up their processes. `release/` is ignored. The banner utility requires development-only Python packages Pillow and fontTools with WOFF support; normal app builds do not require Python. It reads the bundled Geist WOFF2 from node_modules. To validate compact layouts separately, run `npm run test:desktop:responsive`.
