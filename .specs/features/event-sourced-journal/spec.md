# Spec: Event-Sourced Journal
> Phase: 0 | Source: ROADMAP.md F0-001, F0-002, F0-006

## Summary
Log append-only de eventos **encadeado por hash**: cada evento carrega o hash do anterior e o seu próprio (sha256 de serialização canônica), formando uma cadeia à la blockchain/Merkle-linear. Permite **verificar integridade** (detectar adulteração/reordenação) e **derivar projeções** (reconstruir o estado atual dobrando os eventos). É a fonte canônica de verdade do runtime.

## Why (phase context)
Toda a governança (estado de controle, escopo, conclusão) precisa ser auditável, recuperável e à prova de adulteração. Event sourcing com hash chain dá replay, time-travel (F6) e integridade. Projeções são como os gates leem "o estado agora" sem reprocessar tudo a cada vez.

## Requirements

### Functional
- [FN-001] `append(event)` anexa um evento ao log, computando `hash = sha256(canonical({...event, prevHash}))` e avançando o `head` pro novo hash. O 1º evento (genesis) usa `prevHash` vazio/sentinela.
- [FN-002] Serialização **canônica** determinística (chaves ordenadas) pro hash ser estável e reproduzível.
- [FN-003] `read()` itera os eventos na ordem de inserção; `head()` retorna o hash corrente.
- [FN-004] `verify()` revalida a cadeia inteira: recomputa cada hash e confere o encadeamento `prevHash`→`hash`; retorna `{ ok, brokenAt? }`. Detecta adulteração de conteúdo e reordenação.
- [FN-005] `project(reducer, initial)` dobra os eventos numa projeção (estado derivado), pura e determinística.
- [FN-006] Persistência via `ArtifactStore` (write atômico); um append nunca deixa o log meio-escrito.

### Non-Functional
- [NF-001] `verify()` é O(n) nos eventos; hash via `node:crypto` (sha256).
- [NF-002] Determinístico: mesmos eventos → mesma cadeia de hashes em qualquer máquina.

## Out of Scope
- Concorrência de escritores / lease (F1) — assume um escritor por run neste estágio.
- Snapshots/compactação do log (otimização futura).
- Esquema de eventos de domínio (control-state, dispatch) — aqui o evento é genérico `{ type, payload, at, ... }`.

## Dependencies
- Requires: portable-artifact-store (persistência atômica).
- Enables: máquina de estados (F1), projeções de run, replay/time-travel (F6).
