import { useEffect, useRef, useState } from "react";
import { CircleHelp, X } from "lucide-react";

export function HelpDrawer({ title, onClose, children }) {
  const dialog = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const trigger = document.activeElement;
    dialog.current.showModal();
    return () => {
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);
  return (
    <dialog
      className="workspace-dialog"
      ref={dialog}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        close.current();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close.current();
      }}
    >
      <section className="drawer">
        <header>
          <h2>{title}</h2>
          <button className="icon-button" aria-label="Fechar painel" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="drawer-content">{children}</div>
      </section>
    </dialog>
  );
}

const content = {
  project: [
    "Seu espaço de trabalho",
    "Abra a pasta do repositório. Pendências reúne revisões e operações que precisam de atenção. Memória guarda decisões selecionáveis; Mapa relaciona arquivos e dependências do Graphify.",
  ],
  execution: [
    "Preparar uma tarefa",
    "Escolha a ferramenta ou um provedor, um agente opcional e as memórias que deseja enviar. O contexto é fixado no início. O fluxo SDD usa ferramentas de terminal e pausa para revisão. Credenciais continuam na configuração do provedor ou da CLI.",
  ],
  usage: [
    "Entender os custos",
    "O período vale para totais, gráficos e tabela. Valores reportados e estimativas usam a conversão local em reais; não substituem a fatura. Traço significa custo desconhecido. Integrações indicam contexto habilitado e dividem o valor igualmente, sem duplicar o total.",
  ],
  settings: [
    "Conectar ferramentas",
    "Peça uma integração usando a documentação do projeto. Revise a receita, origem e destino antes de aplicar. Testar conexão não reinstala. Uma operação interrompida deve ser reconciliada antes de gerar outra proposta.",
  ],
  agents: [
    "Compor um agente",
    "Defina objetivo, responsabilidades e limites. As skills são combinadas na ordem escolhida em uma instrução única. A prévia corresponde ao contexto usado na execução; o limite total com memórias é de 20 KB.",
  ],
  skills: [
    "Sua biblioteca de skills",
    "Skills são instruções reutilizáveis, não processos independentes. Busque por origem e categoria e veja quais agentes dependem delas. Uma skill do projeto com o mesmo nome substitui a versão distribuída.",
  ],
  memory: [
    "Escolher o que a IA lembra",
    "Somente versões selecionadas são enviadas. Memórias pessoais ficam fora da lista até você optar por mostrá-las; podem ser usadas em vários projetos por seleção explícita. Memórias de tarefa só pertencem à execução indicada. Evite guardar senhas ou chaves. Editar ou excluir não apaga os snapshots de tarefas anteriores.",
  ],
  map: [
    "Explorar o código",
    "Conecte Graphify em Integrações e gere graphify-out/graph.json. Atualizar lê o artefato local; gerar executa o Graphify instalado. Um resultado inválido preserva o último mapa válido. A lista oferece as mesmas seleções do mapa. Somente arquivos de texto dentro do projeto podem ser abertos.",
  ],
};
const errorHelp = {
  STALE_REVISION:
    "O conteúdo mudou desde a leitura. Atualize e confira a versão antes de confirmar. Em memórias, retire a seleção antiga e selecione a versão atual.",
  CONTEXT_BUDGET:
    "As instruções do agente e as memórias compartilham 20 KB em UTF-8. Remova memórias ou reduza o corpo das skills antes de iniciar.",
  AUTH_REQUIRED:
    "Confira o nome da variável de ambiente e a autenticação na ferramenta. O desktop precisa ser iniciado num ambiente que tenha essa credencial.",
  GRAPH_MISSING:
    "Use Integrações para instalar Graphify e depois Gerar mapa local. Atualizar apenas relê graphify-out/graph.json.",
  COST_UNKNOWN:
    "Traço indica ausência de preço ou medição. Um zero só aparece quando foi registrado. Confira o modelo e a fonte de telemetria.",
};
export function helpErrorCode(message = "") {
  if (/mudou|revisão|versão selecionada/i.test(message)) return "STALE_REVISION";
  if (/20 KB|contexto.*excede/i.test(message)) return "CONTEXT_BUDGET";
  if (/credencial|autentic|401|403|variável/i.test(message)) return "AUTH_REQUIRED";
  if (/graphify|grafo|mapa/i.test(message)) return "GRAPH_MISSING";
  return undefined;
}
export function ContextHelp({ screenId, action, errorCode }) {
  const [open, setOpen] = useState(false);
  const [title, text] = content[screenId] ?? content.project;
  return (
    <>
      <button
        className="icon-button"
        aria-label="Ajuda desta tela"
        title="Ajuda desta tela"
        onClick={() => setOpen(true)}
      >
        <CircleHelp size={16} />
      </button>
      {open && (
        <HelpDrawer title={title} onClose={() => setOpen(false)}>
          {errorHelp[errorCode] && (
            <>
              <h3>{action ?? "Resolver este aviso"}</h3>
              <p>{errorHelp[errorCode]}</p>
            </>
          )}
          <p>{text}</p>
          <h3>Se algo mudou</h3>
          <p>
            Atualize os dados e revise a seleção. Uma revisão vencida precisa ser aberta novamente antes de
            confirmar. Seus campos continuam preenchidos ao fechar esta ajuda.
          </p>
        </HelpDrawer>
      )}
    </>
  );
}
