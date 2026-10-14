# Tasks: Event-Sourced Journal
> Spec: features/event-sourced-journal/spec.md

## Status: PENDING

## Tasks

### [F0-EJ-01] Tipos de evento + serialização canônica + hash
- **What:** Definir `JournalEvent` (`type`, `payload`, `at`, `prevHash`, `hash`) e `canonicalize(value)` (JSON com chaves ordenadas recursivamente) + `computeHash(record)` (sha256 hex da serialização canônica).
- **Files:** `src/core/journal/event.ts`
- **Req:** [FN-001, FN-002]
- **Done when:**
  - [ ] `canonicalize` produz string idêntica independente da ordem das chaves de entrada
  - [ ] `computeHash` é estável (mesma entrada → mesmo hash) e sensível a qualquer mudança
  - [ ] `npm run typecheck` passa
- **Commit:** `feat(journal): event types, canonical serialization, sha256 hashing`
- **Depends on:** [F0-AS-01]

### [F0-EJ-02] Append com hash chain + head
- **What:** Implementar `Journal.append(input)`: carrega o head atual, monta o evento com `prevHash = head` (genesis = sentinela), computa `hash`, persiste o log atualizado via `ArtifactStore` e avança o `head`.
- **Files:** `src/core/journal/journal.ts`
- **Req:** [FN-001, FN-006]
- **Done when:**
  - [ ] genesis tem `prevHash` sentinela; eventos seguintes encadeiam `prevHash === hash anterior`
  - [ ] o log persiste atomicamente (usa ArtifactStore)
  - [ ] `head()` reflete o hash do último evento
- **Commit:** `feat(journal): append-only log with hash chaining`
- **Depends on:** [F0-EJ-01, F0-AS-02]

### [F0-EJ-03] Read / iteração
- **What:** Implementar `read()` (lista ordenada de eventos) e `head()`. Log ausente → `[]` e head sentinela.
- **Files:** `src/core/journal/journal.ts`
- **Req:** [FN-003]
- **Done when:**
  - [ ] read retorna os eventos na ordem de inserção
  - [ ] log inexistente → lista vazia, sem lançar
- **Commit:** `feat(journal): read events and head pointer`
- **Depends on:** [F0-EJ-02]

### [F0-EJ-04] Verificação de integridade da cadeia
- **What:** Implementar `verify()`: recomputa o hash de cada evento e confere o encadeamento; retorna `{ ok: true }` ou `{ ok: false, brokenAt: index }`. Detecta conteúdo adulterado e reordenação.
- **Files:** `src/core/journal/journal.ts`
- **Req:** [FN-004, NF-001]
- **Done when:**
  - [ ] cadeia íntegra → `{ ok: true }`
  - [ ] evento adulterado → `{ ok: false, brokenAt }` no índice certo
  - [ ] reordenação de eventos é detectada
- **Commit:** `feat(journal): chain integrity verification with tamper detection`
- **Depends on:** [F0-EJ-03]

### [F0-EJ-05] Projeções (fold determinístico)
- **What:** Implementar `project(reducer, initial)` que dobra os eventos numa projeção. Pura/determinística; não toca disco além do read.
- **Files:** `src/core/journal/journal.ts`
- **Req:** [FN-005, NF-002]
- **Done when:**
  - [ ] project reconstrói um estado derivado a partir dos eventos
  - [ ] mesmos eventos → mesma projeção (determinístico)
- **Commit:** `feat(journal): derive projections by folding events`
- **Depends on:** [F0-EJ-04]

### [F0-EJ-06] Testes do journal
- **What:** Suite vitest: append+chain, read-ordem, verify (ok / adulterado / reordenado), projeção determinística, persistência via store (recarrega e verifica).
- **Files:** `src/core/journal/journal.test.ts`
- **Req:** [FN-001, FN-004, FN-005, NF-002]
- **Done when:**
  - [ ] `npm test` passa
  - [ ] teste de adulteração confirma `brokenAt` correto
  - [ ] teste de reload (novo Journal sobre o mesmo store) preserva a cadeia
- **Commit:** `test(journal): cover chaining, integrity, projection, reload`
- **Depends on:** [F0-EJ-05]
