# Tasks: Run-Binding Store
> Spec: features/run-binding-store/spec.md

## Status: PENDING

## Tasks

### [F0-RB-01] Identidade de workspace + path do registro
- **What:** Implementar `workspaceHash(workspace)` = sha1(realpath(workspace)).slice(0,16) e resolver o path do arquivo de bindings (sob um root configurável via env, default `~/.gatewright/sessions/run-bindings.json`). `isSafeSlug(slug)`.
- **Files:** `src/core/run-binding/paths.ts`
- **Req:** [FN-001, FN-005, NF-002]
- **Done when:**
  - [ ] workspaceHash é estável e resolve realpath antes do hash (symlink → mesmo hash do destino)
  - [ ] isSafeSlug rejeita `../`, espaços e vazio
  - [ ] `npm run typecheck` passa
- **Commit:** `feat(run-binding): stable workspace identity and safe slug`
- **Depends on:** [F0-AS-01]

### [F0-RB-02] observe() + bindingsFor()
- **What:** Implementar `observe()` (lê o registro via ArtifactStore; ausente → `{status:"observed", value:{}}`; corrupto → `{status:"unavailable", code:"MALFORMED"}`) e `bindingsFor(value, workspace)`.
- **Files:** `src/core/run-binding/run-binding-store.ts`
- **Req:** [FN-002, FN-003, NF-001]
- **Done when:**
  - [ ] registro ausente → observed com valor vazio (fail-open)
  - [ ] JSON corrupto → unavailable (não lança)
  - [ ] bindingsFor retorna o mapa do workspace certo
- **Commit:** `feat(run-binding): fail-open observe and per-workspace lookup`
- **Depends on:** [F0-RB-01, F0-AS-03]

### [F0-RB-03] update() atômico
- **What:** Implementar `update(workspace, mutate)`: observa, aplica `mutate(bindings)` ao mapa do workspace, valida slugs e persiste atomicamente via ArtifactStore.
- **Files:** `src/core/run-binding/run-binding-store.ts`
- **Req:** [FN-004, FN-005]
- **Done when:**
  - [ ] update adiciona/remove binding e persiste atomicamente
  - [ ] slug inseguro na mutação é rejeitado (erro tipado)
  - [ ] bindings de outros workspaces são preservados
- **Commit:** `feat(run-binding): atomic per-workspace update`
- **Depends on:** [F0-RB-02, F0-AS-02]

### [F0-RB-04] Testes do run-binding store
- **What:** Suite vitest: observe de ausente/corrupto, update round-trip, isolamento entre workspaces, rejeição de slug inseguro, estabilidade do workspaceHash sob symlink.
- **Files:** `src/core/run-binding/run-binding-store.test.ts`
- **Req:** [FN-001, FN-002, FN-004, NF-001]
- **Done when:**
  - [ ] `npm test` passa
  - [ ] teste confirma isolamento entre dois workspaces
  - [ ] teste confirma fail-open em registro corrupto
- **Commit:** `test(run-binding): cover observe, update, isolation, fail-open`
- **Depends on:** [F0-RB-03]
