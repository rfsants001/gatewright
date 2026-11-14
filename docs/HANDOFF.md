# Retomar o Gatewright

Leia [DESKTOP.md](DESKTOP.md), [PRD](GATEWRIGHT-PRD.md) e [TRD](GATEWRIGHT-TRD.md). O SDD do autor está em `.specs/` neste checkout. A vault está em `~/Documentos/planning-vault/ideias/projetos/gatewright/`. Ambos são locais.

## Pontos de entrada

- `src/cli/gate.ts` — terminal, hooks, MCP, desktop e subprocesso de completion.
- `desktop/main.mjs` e `preload.cjs` — janela, seleção de pasta e IPC. `desktop/renderer/` — React e tema escuro. `src/desktop/bridge.ts` — ações e eventos sobre stdin/stdout.
- `src/app/terminal.ts` — configuração de hosts por projeto. `providers.ts` — endpoints e chaves por referência. `customize.ts` — propostas tipadas com revisão.
- `src/core/engine/`, `src/host/`, `src/mcp/` — harness e integrações compartilhados.

## Próximos aceites

1. Repetir o aceite gráfico e de teclado em instalações limpas, incluindo macOS e Windows antes de anunciar suporte. Exercitar seleção de pasta, tarefa, cancelamento, revisão e troca de projeto.
2. Em repositório descartável, testar com as versões instaladas de Claude Code, Codex, Gemini e OpenCode. Registrar separadamente login, descoberta de MCP, prompts/resources, hooks e telemetria. O Claude Code 2.1.172 confirmou a conexão MCP em configuração temporária. Invocação interativa de skill e execução autenticada ainda exigem dogfood.
3. Adicionar integração do harness no OpenCode e métricas de sessões externas que os hosts disponibilizem. Manter a matriz de compatibilidade atualizada por capacidade.
4. Persistir Flow e decisões de configuração com retomada, reversão e auditabilidade. Evoluir plugins de registro MCP para instalações revisáveis com contrato tipado. Validar a política de roteamento e budgets quando houver dados confiáveis.
5. Empacotar o runtime e estabilizar a invocação usada por hooks e MCP. Retirar a TUI após o piloto completar o fluxo em instalação limpa.

Para verificar localmente, rode `npm run typecheck`, `npm test` e `npm run build`. O guia desktop tem a entrada pelo menu. Preserve `.specs/` e vault fora do Git e mantenha commits sem trailer de coautoria.
