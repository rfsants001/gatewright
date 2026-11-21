# Dogfooding do Gatewright — como registrar

Objetivo: usar o Gatewright de verdade no dia a dia (configurar Claude Code e Codex, instalar pacotes, rodar tarefas) e **registrar tudo** para, no fim da semana/mês, termos **dados reais** — pra decidir o que melhorar e pra alimentar o "build in public".

## Regra de ouro
Logar **na hora**, não de memória. Uma linha já vale. O log é append-only: nunca apague, só acrescente. Dado cru > dado bonito.

## O que capturar (de onde)
- **Custo/tokens/modelo:** aba **Custos** do app (por execução).
- **Gates que dispararam:** o que o agente tentou e se o Gatewright deixou passar (`allow`), avisou (`warn`) ou bloqueou (`block`), e se isso **ajudou ou atrapalhou**.
- **Saúde das integrações:** aba **Integrações** (verificado / aguardando artefato / falhou / latência).
- **Pendências/retomada:** aba **Pendências** (retomou um fluxo? reabriu revisão?).
- **Fricção/bug do app:** travou, lento, UX confusa, algo que faltou.

## Cadência
- **A cada sessão de uso:** uma entrada em `journal.md` (template abaixo). 1–3 min.
- **Toda sexta:** preencher uma linha no **Rollup semanal** (`rollup.md`).
- **Fim do mês:** linha no **Rollup mensal** + decisão (continuar / ajustar / priorizar bug X).

## Métricas que importam (o que a gente quer provar)
1. **O gate evita deriva de verdade?** Quantas vezes um `warn`/`block` impediu um estrago real vs. atrapalhou à toa.
2. **Vale o overhead?** Tempo/fricção que o Gatewright adiciona vs. retrabalho que evita.
3. **Estabilidade:** com que frequência o app/bridge quebrou em uso real.
4. **Custo:** R$/tokens por tipo de tarefa e por host (Claude Code vs Codex).
5. **Multi-host:** Claude Code e Codex convivem bem no mesmo projeto?

## Onde isso vai
- Este log é **do projeto** (uso real do Gatewright). Marcos de carreira/divulgação (clipe gravado, post publicado, release) continuam no diário da vault.
- Você controla o que publicar: o template não tem nada sensível; ao divulgar, redija/recorte o que quiser. Nada de credenciais ou código de cliente aqui.

## Links
- Entradas diárias: [`journal.md`](journal.md)
- Consolidado semanal/mensal: [`rollup.md`](rollup.md)
