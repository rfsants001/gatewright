# Gatewright — Roadmap

> Ordem por dependência. Design completo na vault: `ideias/projetos/gatewright/architecture.md`.

## Phase 0 — Backbone event-sourced [status: 🔄 IN PROGRESS]

**Focus:** a fundação que tudo depende — journal append-only hash-encadeado, store de artefatos portável e binding de run, com recuperação de crash.

### Deliverables
- [ ] [F0-001] Journal append-only com hash chain (evento → head hash encadeado)
- [ ] [F0-002] Integridade: verificação da cadeia + detecção de adulteração
- [x] [F0-003] Portable artifact store com write atômico (tmp+rename)
- [x] [F0-004] Recuperação de crash: replay de write pendente deixa estado consistente
- [ ] [F0-005] Run-binding store ([cwd][sessionKey] → runSlug) com leitura/observação
- [ ] [F0-006] Projeções derivadas do journal (estado reconstruído a partir dos eventos)

## Phase 1 — Ownership & ciclo de vida [status: ⏳ PLANNED]

**Focus:** máquina de estados de controle + session-lease (fencing · heartbeat · TTL).

### Deliverables
- [ ] [F1-001] Máquina de estados de controle (IDLE→RUNNING→PASSED/FAILED/CANCELLED) + política de transição
- [ ] [F1-002] Session-lease com fencing token, reclaim de lock stale, heartbeat e TTL

## Phase 2 — MCP + host-contract + gates payload-only [status: ⏳ PLANNED]

**Focus:** 1º dogfood ponta-a-ponta.

### Deliverables
- [ ] [F2-001] Servidor MCP local (SDK oficial TS) com transport stdio
- [ ] [F2-002] Abstração de host (adapter Claude Code)
- [ ] [F2-003] Gates payload-only plugados: secret-guard, verify-on-edit, error-classifier, proportion-gate

## Phase 3 — Plan-gate + grafo [status: ⏳ PLANNED]

**Focus:** admissão de escopo + DAG + scheduler.

### Deliverables
- [ ] [F3-001] Grafo de execução (DAG) + ready-queue + ordenação topológica
- [ ] [F3-002] Plan-gate-core + bootstrap/aprovação (evidência + gate humano)
- [ ] [F3-003] AST/escopo (ts-morph/oxc) + grafo semântico de dependências

## Phase 4 — Dispatch + reconciliação nativa + Jev [status: ⏳ PLANNED]

**Focus:** agent-system + fluxo nativo (destrava quality/completion full) + IA local de decisão.

### Deliverables
- [ ] [F4-001] Agent-system: papéis (COORDINATOR + especialistas), dispatch, capability
- [ ] [F4-002] Reconciliação nativa (start/stop do host → conclusão de nó do grafo)
- [ ] [F4-003] Jev: motor de decisão IA local (Ollama/LM Studio), budget-aware, advisory

## Phase 5 — Registries + Skills manager + evidência + worktrees [status: ⏳ PLANNED]

### Deliverables
- [ ] [F5-001] Validators atômicos composáveis + gate/validator/step/workflow registries
- [ ] [F5-002] Skills manager: catálogo + instalar + `gate skill new`
- [ ] [F5-003] Goal-verifier + evidence-progress + finding-ledger
- [ ] [F5-004] Worktree por run

## Phase 6 — Ou além [status: ⏳ PLANNED]

### Deliverables
- [ ] [F6-001] Replay/time-travel de runs (habilitado pelo journal)
- [ ] [F6-002] Verificação formal das transições de estado
- [ ] [F6-003] Jev aprende com correções do humano
- [ ] [F6-004] Fleet multi-agente/multi-máquina + gate marketplace (skills de terceiros via contrato tipado)
