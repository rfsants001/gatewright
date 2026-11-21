# Validação da continuação P3

Executada em 21/11/2026 no Linux, Node 24.16.0 e Electron 45.3.1. Base recebida do Claude em 27a393d. A validação utiliza o aplicativo compilado, seu preload, IPC e bridge reais, com repositório e journals temporários. Os registros do projeto de teste são sintéticos. O ensaio não chama um modelo para executar código.

## Caminhos exercitados

- Abrir uma pasta com espaços e consultar Pendências pelo menu Projeto.
- Derivar uma aprovação e uma falha de instalação dos journals reais.
- Filtrar uma aprovação, abrir a revisão e alterar o diff enquanto o diálogo está aberto.
- Recusar a decisão obsoleta, reabrir o diff e aprovar a versão atual.
- Remover a aprovação resolvida da projeção e conservar a falha de instalação.
- Abrir o diagnóstico da operação correta pelo seu ID.
- Alcançar o fim da página em 780 × 580 sem overflow horizontal global.
- Encerrar e reabrir o Electron na mesma pasta com revisão de Flow pendente. O formulário de aprovação recuperado aparece e permite encerrar o fluxo.
- Encerrar e reabrir novamente com um Flow no início de uma etapa de run. A janela aguarda uma ação explícita. A abertura não acrescenta uma execução ao journal.

## Repetir

Da raiz do checkout, executar o comando abaixo em uma sessão gráfica.

```sh
npm run test:desktop:pending
```

Para guardar capturas em uma pasta escolhida, executar o script depois do build.

```sh
node desktop/pending-smoke.mjs docs/desktop-product-evolution/screens/validation-2026-11-21
```

O script usa um perfil de Electron temporário, uma porta de diagnóstico local aleatória e um registro temporário de projetos. A pasta e os processos do teste são removidos ao terminar.

## Evidência e limites

As capturas pending-overview.png e pending-electron.png são da janela real com dados do projeto descartável. Os testes do bridge também cobrem revisão de pendência vencida e confirmação de retomada repetida. Execução autenticada em hosts reais e reconciliação de efeitos externos após crash continuam nos aceites das trilhas correspondentes.

P2-004b permanece pendente. A visualização da operação mostra apenas os eventos e as evidências que o instalador efetivamente registrou.
