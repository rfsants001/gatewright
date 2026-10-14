# Spec: Run-Binding Store
> Phase: 0 | Source: ROADMAP.md F0-005

## Summary
Mapa persistente `[workspace][sessionKey] → runSlug`: qual run cada sessão (num dado workspace) possui. É o índice que os gates agent-coupled consultam pra saber "esta sessão tem uma run ativa?". Observação read-only e atualização atômica.

## Why (phase context)
Todo gate acoplado a agente decide a partir de "esta sessão possui uma run ativa deste workspace". Esse binding é a fonte única desse fato (como vimos na RE do HubStack: um gate sem binding fica dormente). Fica no backbone porque precisa ser durável e atômico desde o início.

## Requirements

### Functional
- [FN-001] `workspaceHash(workspace)` deriva um id estável e filesystem-safe do caminho **físico** (realpath) do workspace — mesma lógica em toda leitura/escrita pra identidade nunca divergir.
- [FN-002] `observe()` lê o registro de bindings e retorna `{ status: "observed", value } | { status: "unavailable", code }` — nunca lança.
- [FN-003] `bindingsFor(value, workspace)` retorna o mapa `{ [sessionKey]: runSlug }` daquele workspace (ou undefined).
- [FN-004] `update(workspace, mutate)` aplica uma mutação ao mapa do workspace e persiste **atomicamente** via `ArtifactStore`.
- [FN-005] `runSlug` é validado contra um padrão seguro (`[A-Za-z0-9._-]+`); slug inseguro é rejeitado.

### Non-Functional
- [NF-001] Leitura é fail-open (ausência/corrupção → `unavailable`, não exceção) — gates precisam degradar sem travar.
- [NF-002] Identidade de workspace estável entre processos (realpath resolvido antes do hash).

## Out of Scope
- Liveness/lease da run (F1) — aqui só o mapeamento existe/pertence.
- Classificação de "run ativa vs terminal" (depende do journal/estado — F1).

## Dependencies
- Requires: portable-artifact-store.
- Enables: detector `sessionHasActiveAgentRun` (F1) e todos os gates agent-coupled.
