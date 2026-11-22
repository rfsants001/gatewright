# Responsividade e galeria — 22/11/2026

Continuação de main `d28669d`, preservando também o commit concorrente do Claude `6ca608f` no workflow de release. Pedido: atualizar o README com telas atuais e corrigir a adaptação do aplicativo a janelas menores. O runtime de agentes, MCP, hooks e contratos de dados foi preservado.

## Problemas reproduzidos e correção

O cabeçalho podia deixar ações fora da área visível em larguras pequenas. A ficha de agente com URL sem espaços gerava overflow horizontal no main até em janela larga. A matriz inicial falhou em 15 de 84 combinações de tela/tamanho.

O cabeçalho agora usa uma segunda linha de navegação abaixo de 1180 px e três colunas de áreas abaixo de 620 px. Marca, troca de projeto, ajuda e atualização continuam acessíveis. Formulários respondem à largura do próprio painel; títulos, ações, textos extensos e metadados quebram sem alargar a página. Memória e Mapa empilham painéis abaixo de 920 px. Métricas usam duas colunas em janela compacta. O rodapé pode quebrar linha e o main conserva o espaço de rolagem.

A janela Electron aceita mínimo de **600 × 480**, antes 760 × 570. O layout também é ensaiado em viewport efetivo de 480 px para cobrir redução da área disponível por escala. Isso é adaptação da janela desktop; não é uma entrega de aplicativo mobile.

Tabelas e mapa preservam rolagem própria: colunas e relações não são ocultadas para fazer a tela caber. Tabelas têm região identificada e foco de teclado. Diálogos e drawers limitam largura/altura à janela e conservam rolagem para alcançar as ações.

## Validação

`npm run test:desktop:responsive` compila e abre Electron em projeto descartável. Cobre as nove telas (Projeto, Pendências, Memória, Mapa, Tarefas, Custos, Integrações, Agentes e Skills) e três painéis (memória, agente e detalhe de tarefa) em:

- 1440 × 960
- 1120 × 860
- 1024 × 768
- 920 × 700
- 780 × 580
- 600 × 480
- 480 × 640

**84 verificações passaram**, incluindo nomes longos, URL sem espaços, controles dentro da área disponível, seis áreas de navegação, scroll vertical até o fim e rolagem local de tabelas/mapa. O teste não considera válido apenas esconder overflow no body: verifica também main, painéis, formulários e controles. O CI Linux executa a matriz junto dos smokes existentes. A abertura multiplataforma mantém seu job nos três sistemas.

`npm run check` passou com **974 testes / 130 arquivos**, usando registro e HOME do Gatewright temporários. Os smokes de evolução e Pendências passaram; AppImage e `.deb` foram reconstruídos com o renderer atualizado. A evidência local é Linux; a inicialização Windows/macOS continua no CI, sem afirmar aceite nativo completo desses sistemas.

A galeria do README tem **13 banners** produzidos das telas reais, incluindo revisão do diff, Flow, diagnóstico de hooks Codex e janela compacta. Dados controlados são identificados; nenhuma captura comprova custo faturado ou autenticação externa. Fontes e comandos em [docs/screenshots/README.md](../screenshots/README.md).

## Retomada

Não reimplementar as fases P0–P7. Preservar o layout com navegação superior, o mínimo de janela e a distinção entre rolagem de página e de dados. Ao alterar uma tela, rodar o smoke responsivo e os fluxos que dependem dela; renovar capturas pela fonte do app, sem editar seus dados na imagem. A geração dos banners é uma ferramenta de desenvolvimento e não acrescenta dependência Python ao app.
