# Spec: Portable Artifact Store
> Phase: 0 | Source: ROADMAP.md F0-003, F0-004

## Summary
Camada mais baixa do backbone: lê e escreve artefatos (bytes/texto) no disco de forma **atômica** e **durável**, e **recupera** estado consistente após um crash no meio de uma escrita. Todo o resto (journal, bindings, leases) persiste através dela.

## Why (phase context)
Um runtime de governança event-sourced não pode corromper estado por um crash/kill no meio de um write. Essa feature garante a propriedade "write ou tudo ou nada" que o journal e as projeções assumem. É pré-requisito de toda persistência.

## Requirements

### Functional
- [FN-001] `write(path, data)` grava de forma atômica: escreve em `<path>.tmp.<rand>`, `fsync`, `rename` pro destino final (rename é atômico no mesmo filesystem).
- [FN-002] `read(path)` retorna o conteúdo; `exists(path)` indica presença; ausência não lança (retorna null/false).
- [FN-003] Escrita cria diretórios-pai faltantes.
- [FN-004] `recover(dir)` remove artefatos temporários órfãos (`.tmp.*`) deixados por um crash — o destino final nunca fica meio-escrito, então limpar o tmp basta pra consistência.
- [FN-005] Erros de I/O são tipados (`ArtifactStoreError` com `code`), nunca exceção crua silenciosa.

### Non-Functional
- [NF-001] Determinístico e sem dependências externas (só `node:fs`/`node:path`/`node:crypto`).
- [NF-002] Seguro sob escrita concorrente de processos distintos no mesmo path (último rename vence; nunca conteúdo parcial).

## Out of Scope
- Hash chain / integridade de evento (é do event-sourced-journal).
- Locking/lease de ownership (é da F1).
- Content-addressing / cache certificado (F5).

## Dependencies
- Requires: nada (camada base).
- Enables: event-sourced-journal, run-binding-store, e toda persistência futura.
