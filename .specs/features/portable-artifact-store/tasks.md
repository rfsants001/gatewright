# Tasks: Portable Artifact Store
> Spec: features/portable-artifact-store/spec.md

## Status: DONE (2026-10-14) — 8 tests green, typecheck clean

## Tasks

### [F0-AS-01] Tipos e erros do store
- **What:** Definir a interface pública (`ArtifactStore`) e a classe `ArtifactStoreError` com `code` (`WRITE_FAILED` | `READ_FAILED` | `RECOVER_FAILED`). Sem implementação ainda.
- **Files:** `src/core/artifact-store/types.ts`
- **Req:** [FN-005]
- **Done when:**
  - [ ] `ArtifactStore` declara `write`, `read`, `exists`, `recover`
  - [ ] `ArtifactStoreError extends Error` com campo `code` tipado
  - [ ] `npm run typecheck` passa
- **Commit:** `feat(artifact-store): define store interface and typed errors`
- **Depends on:** none

### [F0-AS-02] Write atômico (tmp + fsync + rename) + mkdir recursivo
- **What:** Implementar `write(path, data)`: cria dirs-pai, escreve em `<path>.tmp.<rand>` com `fsync`, faz `rename` pro destino. Em falha, lança `ArtifactStoreError(WRITE_FAILED)` e remove o tmp.
- **Files:** `src/core/artifact-store/artifact-store.ts`
- **Req:** [FN-001, FN-003, FN-005]
- **Done when:**
  - [ ] write grava o conteúdo final corretamente
  - [ ] nenhum arquivo `.tmp.*` sobra após write bem-sucedido
  - [ ] dirs-pai inexistentes são criados
- **Commit:** `feat(artifact-store): atomic write via tmp+fsync+rename`
- **Depends on:** [F0-AS-01]

### [F0-AS-03] Read / exists
- **What:** Implementar `read(path)` (retorna conteúdo ou null se ausente) e `exists(path)` (boolean). Erro de I/O real (≠ ENOENT) → `ArtifactStoreError(READ_FAILED)`.
- **Files:** `src/core/artifact-store/artifact-store.ts`
- **Req:** [FN-002, FN-005]
- **Done when:**
  - [ ] read de arquivo existente retorna o conteúdo; ausente retorna null (não lança)
  - [ ] exists reflete presença corretamente
- **Commit:** `feat(artifact-store): read and exists`
- **Depends on:** [F0-AS-02]

### [F0-AS-04] Recuperação de crash (limpeza de tmp órfão)
- **What:** Implementar `recover(dir)`: varre `dir`, remove `.tmp.*` órfãos. Como o destino final só existe após rename atômico, limpar tmp garante consistência. Ausência de dir → no-op.
- **Files:** `src/core/artifact-store/artifact-store.ts`
- **Req:** [FN-004, FN-005]
- **Done when:**
  - [ ] recover remove arquivos `.tmp.*` e preserva os finais
  - [ ] dir inexistente → no-op (não lança)
- **Commit:** `feat(artifact-store): crash recovery of orphan temp files`
- **Depends on:** [F0-AS-03]

### [F0-AS-05] Testes do artifact store
- **What:** Suite vitest cobrindo write/read/exists/recover, incluindo: round-trip, ausência de tmp pós-write, recover limpando tmp forjado, write concorrente simulado (dois writes → conteúdo final íntegro).
- **Files:** `src/core/artifact-store/artifact-store.test.ts`
- **Req:** [FN-001, FN-002, FN-004, NF-002]
- **Done when:**
  - [ ] `npm test` passa
  - [ ] teste cobre recover de `.tmp.*` órfão
  - [ ] teste confirma conteúdo final íntegro após write simulado concorrente
- **Commit:** `test(artifact-store): cover atomic write, read, recovery`
- **Depends on:** [F0-AS-04]
