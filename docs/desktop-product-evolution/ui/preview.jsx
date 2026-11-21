import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  FolderGit2,
  ClipboardList,
  ChartNoAxesColumnIncreasing,
  Plug,
  Layers,
  FileText,
  Search,
  Plus,
  ChevronRight,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  CircleCheck,
  Circle,
  TriangleAlert,
  Clock3,
  X,
  CircleHelp,
  RefreshCw,
  ExternalLink,
  BookOpen,
  GitBranch,
  SlidersHorizontal,
  Pause,
  Play,
  ShieldCheck,
  Network,
  Trash2,
  SquarePen,
} from "lucide-react";
import {
  skills,
  agents,
  memories,
  costRows,
  modules,
  edges,
} from "./fixtures.js";

const nav = [
  ["project", "Projeto", FolderGit2],
  ["tasks", "Tarefas", ClipboardList],
  ["costs", "Custos", ChartNoAxesColumnIncreasing],
  ["integrations", "Integrações", Plug],
  ["agents", "Agentes", Layers],
  ["skills", "Skills", FileText],
];
const projectViews = [
  ["pending", "Pendências"],
  ["memory", "Memória"],
  ["map", "Mapa"],
];
const titles = {
  pending: "Pendências do projeto",
  skills: "Biblioteca de skills",
  agents: "Perfis de agentes",
  install: "Instalações e conexões",
  memory: "Memória do projeto",
  map: "Mapa do projeto",
  costs: "Custos do projeto",
  tasks: "Tarefa em revisão",
};
const brl = (n) =>
  n == null
    ? "Sem custo informado"
    : new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(n);
const categoryNames = [
  "Todas as categorias",
  ...new Set(skills.map((s) => s.category)),
];
function Tone({ tone = "neutral", children }) {
  return (
    <span className={`tone ${tone}`}>
      {tone === "success" ? (
        <CircleCheck size={13} />
      ) : tone === "error" ? (
        <TriangleAlert size={13} />
      ) : (
        <Circle size={10} />
      )}{" "}
      {children}
    </span>
  );
}
function Panel({ title, subtitle, action, children, className = "" }) {
  return (
    <section className={`surface ${className}`}>
      <header className="panel-heading">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
function Empty({ title, children, action, error = false }) {
  const Icon = error ? TriangleAlert : Search;
  return (
    <section className="surface empty-state">
      <Icon size={26} />
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </section>
  );
}
function SearchBox({ value, onChange, placeholder = "Buscar" }) {
  return (
    <label className="search">
      <Search size={15} />
      <span className="sr-only">{placeholder}</span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}
function Header({ title, subtitle, action }) {
  return (
    <header className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="inline-actions">{action}</div>
    </header>
  );
}
function ModalDrawer({ title, children, onClose, footer }) {
  const dialog = useRef(null);
  useEffect(() => {
    const before = document.activeElement;
    const root = dialog.current;
    root.querySelector("button,input,textarea,select")?.focus();
    const key = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const nodes = [
          ...root.querySelectorAll(
            'button,input,textarea,select,[tabindex="0"]',
          ),
        ].filter((n) => !n.disabled);
        if (!nodes.length) return;
        const first = nodes[0],
          last = nodes.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      before?.focus();
    };
  }, []);
  return (
    <div
      className="aside-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        ref={dialog}
      >
        <header>
          <h2 id="drawer-title">{title}</h2>
          <button
            className="icon-button"
            aria-label="Fechar painel"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        <div className="drawer-content">{children}</div>
        {footer && <footer>{footer}</footer>}
      </section>
    </div>
  );
}
function SkillsView({ open, onAgents }) {
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState(categoryNames[0]),
    [origin, setOrigin] = useState("Todas as origens"),
    [chosen, setChosen] = useState(skills[0]);
  const list = skills.filter(
    (s) =>
      (category === categoryNames[0] || s.category === category) &&
      (origin === "Todas as origens" || s.origin === origin) &&
      `${s.name} ${s.description}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <Header
        title={titles.skills}
        subtitle="Encontre um playbook e confira quais agentes usam suas instruções."
        action={
          <button className="primary" onClick={() => open({ type: "skill" })}>
            <Plus size={14} />
            Nova skill
          </button>
        }
      />
      <div className="toolbar">
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="Buscar nome ou finalidade"
        />
        <select
          aria-label="Categoria da skill"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {categoryNames.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select
          aria-label="Origem da skill"
          value={origin}
          onChange={(e) => setOrigin(e.target.value)}
        >
          {["Todas as origens", "Projeto", "Gatewright"].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <span className="count">{list.length} skills</span>
      </div>
      <div className="split">
        <Panel title="Skills disponíveis">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Skill</th>
                  <th>Origem</th>
                  <th>Agentes</th>
                  <th>
                    <span className="sr-only">Detalhes</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.map((s) => (
                  <tr key={s.id}>
                    <th>
                      <button
                        className="table-select"
                        onClick={() => setChosen(s)}
                      >
                        <div className="row-title">
                          <FileText size={16} />
                          <div>
                            <strong>{s.name}</strong>
                            <small>{s.category}</small>
                          </div>
                        </div>
                      </button>
                    </th>
                    <td>{s.origin}</td>
                    <td>{s.agents.length}</td>
                    <td>
                      <button
                        className="icon-button"
                        aria-label={`Abrir ${s.name}`}
                        onClick={() => setChosen(s)}
                      >
                        <ChevronRight size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!list.length && (
            <div className="padded">
              <p>Nenhuma skill com esses filtros.</p>
              <button
                className="help-link"
                onClick={() => {
                  setQuery("");
                  setCategory(categoryNames[0]);
                  setOrigin("Todas as origens");
                }}
              >
                Limpar filtros
              </button>
            </div>
          )}
        </Panel>
        <Panel
          title={chosen.name}
          subtitle={chosen.category}
          action={<span className="soft-pill">{chosen.origin}</span>}
        >
          <div className="padded">
            <p>{chosen.description}</p>
          </div>
          <div className="detail-section detail-body">
            <h3>Instruções</h3>
            <pre>{chosen.body}</pre>
          </div>
          <div className="detail-section">
            <h3>Usada por</h3>
            <div className="inline-actions">
              {chosen.agents.map((a) => (
                <button key={a} onClick={() => onAgents(a)}>
                  {a}
                  <ArrowRight size={13} />
                </button>
              ))}
            </div>
          </div>
          <div className="detail-section">
            <span className="footer-copy">Identificador · {chosen.id}</span>
          </div>
        </Panel>
      </div>
    </>
  );
}
function AgentsView({ initialAgent, onTask, notify, open }) {
  const [profiles, setProfiles] = useState(agents);
  const [selected, setSelected] = useState(
      agents.find((a) => a.name === initialAgent) || agents[0],
    ),
    [tab, setTab] = useState("Ficha"),
    [order, setOrder] = useState(selected.skills);
  const setAgent = (a) => {
    setSelected(a);
    setOrder(a.skills);
    setTab("Ficha");
  };
  const editProfile = (item) =>
    open({
      type: "agent",
      profile: item,
      onSave: (next) => {
        setProfiles((old) =>
          old.some((a) => a.id === next.id)
            ? old.map((a) => (a.id === next.id ? next : a))
            : [...old, next],
        );
        setAgent(next);
      },
    });
  const move = (i, delta) => {
    const next = [...order];
    [next[i], next[i + delta]] = [next[i + delta], next[i]];
    setOrder(next);
  };
  const composed = [
    `Perfil: ${selected.name}\nObjetivo: ${selected.goal}`,
    `Responsabilidades\n${selected.responsibilities.join("\n")}`,
    `Entrada\n${selected.input}`,
    `Saída\n${selected.output}`,
    `Limites\n${selected.boundaries}`,
    ...order.map((id) => {
      const s = skills.find((s) => s.id === id);
      return `## ${s.name}\n${s.body}`;
    }),
  ].join("\n\n");
  return (
    <>
      <Header
        title={titles.agents}
        subtitle="Defina responsabilidades e combine skills na ordem de trabalho."
        action={
          <button onClick={() => editProfile(null)}>
            <Plus size={14} />
            Novo perfil
          </button>
        }
      />
      <div className="split agent-layout">
        <Panel title="Perfis do projeto">
          <div className="profile-list">
            {profiles.map((a) => (
              <button
                key={a.id}
                className={a.id === selected.id ? "selected" : ""}
                onClick={() => setAgent(a)}
              >
                <span className="row-title">
                  <Layers size={15} />
                  {a.name}
                </span>
                <small>{a.skills.length} skills · Projeto</small>
              </button>
            ))}
          </div>
        </Panel>
        <Panel
          title={selected.name}
          subtitle={selected.goal}
          className="agent-profile"
          action={
            <div className="inline-actions">
              <button
                onClick={() => editProfile({ ...selected, skills: order })}
              >
                <SquarePen size={13} />
                Editar ficha
              </button>
              <button
                className="primary"
                onClick={() => onTask({ ...selected, skills: order })}
              >
                <Play size={13} />
                Usar em tarefa
              </button>
            </div>
          }
        >
          <nav className="subnav" aria-label="Detalhes do agente">
            {["Ficha", "Skills", "Instruções"].map((t) => (
              <button
                key={t}
                aria-current={tab === t ? "page" : undefined}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </nav>
          {tab === "Ficha" ? (
            <>
              <div className="detail-section">
                <h3>Responsabilidades</h3>
                <ul>
                  {selected.responsibilities.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
              <div className="detail-section">
                <dl className="meta-grid">
                  <div>
                    <dt>Entrada esperada</dt>
                    <dd>{selected.input}</dd>
                  </div>
                  <div>
                    <dt>Resultado esperado</dt>
                    <dd>{selected.output}</dd>
                  </div>
                </dl>
              </div>
              <div className="detail-section">
                <h3>Limites de atuação</h3>
                <p>{selected.boundaries}</p>
              </div>
              <div className="detail-section">
                <h3>Composição</h3>
                <div className="inline-actions">
                  {order.map((id, i) => (
                    <span className="soft-pill" key={id}>
                      {i + 1} · {skills.find((s) => s.id === id).name}
                    </span>
                  ))}
                </div>
                <p style={{ marginTop: 12 }}>
                  Modelo e provedor são escolhidos ao iniciar a tarefa.
                </p>
              </div>
            </>
          ) : tab === "Skills" ? (
            <div className="padded">
              <p>O perfil segue a ordem abaixo.</p>
              <ol className="skill-order">
                {order.map((id, i) => (
                  <li key={id}>
                    <span className="ordinal">{i + 1}</span>
                    <span>{skills.find((s) => s.id === id).name}</span>
                    <button
                      aria-label={`Subir ${id}`}
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                    >
                      <ArrowUp size={13} />
                    </button>
                    <button
                      aria-label={`Descer ${id}`}
                      disabled={i === order.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      <ArrowDown size={13} />
                    </button>
                  </li>
                ))}
              </ol>
              <button
                className="primary"
                onClick={() =>
                  notify(
                    "Ordem aplicada à prévia. A persistência será conectada pelo Claude.",
                  )
                }
              >
                Salvar ordem
              </button>
            </div>
          ) : (
            <div className="padded detail-body">
              <pre>{composed}</pre>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
function PendingView({ navigate, open }) {
  const [filter, setFilter] = useState("Todas");
  const items = [
    {
      id: "review",
      type: "Aprovações",
      title: "Revisar o plano da API",
      text: "catalogo-142 · Revisor de API · Gemini CLI",
      status: "Aguarda sua decisão",
      action: "Abrir revisão",
      icon: ShieldCheck,
    },
    {
      id: "resume",
      type: "Retomadas",
      title: "Continuar a validação dos filtros",
      text: "catalogo-141 · execução interrompida antes da conclusão",
      status: "Retomada disponível",
      action: "Revisar retomada",
      icon: Pause,
    },
    {
      id: "integration",
      type: "Conexões",
      title: "Graphify precisa de uma nova verificação",
      text: "Registrado neste projeto · última tentativa falhou",
      status: "Falha na conexão",
      action: "Ver diagnóstico",
      icon: Plug,
    },
  ];
  return (
    <>
      <Header
        title={titles.pending}
        subtitle="Decisões e interrupções que precisam da sua atenção."
        action={
          <button className="primary" onClick={() => navigate("tasks")}>
            <Plus size={14} />
            Nova tarefa
          </button>
        }
      />
      <Panel title="Ações pendentes" subtitle="catalogo-web">
        <div className="summary-strip">
          {[
            ["1", "Aprovação"],
            ["1", "Retomada"],
            ["1", "Conexão"],
          ].map(([n, label]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{n}</strong>
            </div>
          ))}
        </div>
        <nav
          className="subnav"
          style={{ margin: 0, padding: "0 8px" }}
          aria-label="Filtrar pendências"
        >
          {["Todas", "Aprovações", "Retomadas", "Conexões"].map((t) => (
            <button
              key={t}
              aria-current={filter === t ? "page" : undefined}
              onClick={() => setFilter(t)}
            >
              {t}
            </button>
          ))}
        </nav>
        <ul className="card-list">
          {items
            .filter((i) => filter === "Todas" || i.type === filter)
            .map((item) => (
              <li key={item.id}>
                <item.icon className="status-icon" size={19} />
                <div className="copy">
                  <strong>{item.title}</strong>
                  <p>{item.text}</p>
                  <div style={{ marginTop: 8 }}>
                    <Tone
                      tone={item.id === "integration" ? "error" : "warning"}
                    >
                      {item.status}
                    </Tone>
                  </div>
                </div>
                <button
                  onClick={() =>
                    item.id === "integration"
                      ? navigate("install")
                      : open({ type: item.id })
                  }
                >
                  {item.action}
                  <ChevronRight size={14} />
                </button>
              </li>
            ))}
        </ul>
      </Panel>
      <p className="footer-copy" style={{ marginTop: 13 }}>
        Atualizado com os registros deste projeto. Uma execução só continua
        depois de você escolher retomar.
      </p>
    </>
  );
}
function InstallView({ notify }) {
  const [stage, setStage] = useState("review"),
    [step, setStep] = useState(0),
    [health, setHealth] = useState("error");
  const steps = [
    "Preparar ambiente",
    "Instalar pacote",
    "Registrar MCP",
    "Testar conexão",
  ];
  useEffect(() => {
    if (stage !== "running") return;
    const timer = setTimeout(() => {
      if (step === 2) {
        setStep(3);
        setStage("failed");
      } else {
        setStep((n) => n + 1);
      }
    }, 750);
    return () => clearTimeout(timer);
  }, [stage, step]);
  const label = {
    review: "Proposta pronta",
    running: "Aplicando integração",
    failed: "Verificação pendente",
    done: "Conexão verificada",
  }[stage];
  return (
    <>
      <Header
        title={titles.install}
        subtitle="Revise a origem, acompanhe as etapas e confirme a conexão."
        action={
          <button
            onClick={() =>
              notify(
                "O pedido em linguagem natural permanece no formulário de integrações existente.",
              )
            }
          >
            <Plus size={14} />
            Nova integração
          </button>
        }
      />
      <div className="split">
        <Panel
          title="Graphify"
          subtitle="Instalação de exemplo · projeto catalogo-web"
          action={
            <Tone
              tone={
                stage === "done"
                  ? "success"
                  : stage === "failed"
                    ? "warning"
                    : "neutral"
              }
            >
              {label}
            </Tone>
          }
        >
          <div className="padded">
            <div className="operation-head">
              <Network size={23} />
              <div>
                <strong>Mapa de código via MCP</strong>
                <p>Ambiente local com pacote de versão definida.</p>
              </div>
            </div>
            <div
              className="meter"
              aria-label={`Progresso ${stage === "review" ? 0 : stage === "done" ? 100 : 75}%`}
            >
              <span
                style={{
                  width:
                    stage === "review"
                      ? "0%"
                      : stage === "done"
                        ? "100%"
                        : stage === "failed"
                          ? "75%"
                          : `${step * 25}%`,
                }}
              />
            </div>
            <ol className="steps">
              {steps.map((title, i) => {
                const done =
                  stage === "done" || (stage !== "review" && i < step);
                const active = stage === "running" && i === step;
                const failed = stage === "failed" && i === 3;
                const Icon = done
                  ? CircleCheck
                  : failed
                    ? TriangleAlert
                    : active
                      ? Clock3
                      : Circle;
                return (
                  <li
                    key={title}
                    className={
                      done ? "done" : failed ? "failed" : active ? "active" : ""
                    }
                  >
                    <Icon className="step-icon" size={17} />
                    <div>
                      <strong>{title}</strong>
                      <p>
                        {i === 0
                          ? "Criar o ambiente do projeto."
                          : i === 1
                            ? "Instalar a versão incluída na proposta."
                            : i === 2
                              ? "Registrar a configuração sem substituir conexões existentes."
                              : failed
                                ? "O pacote está instalado. O handshake ainda precisa ser confirmado."
                                : stage === "done" && i === 3
                                  ? "O servidor respondeu à inicialização MCP."
                                  : "Iniciar uma sessão e aguardar a resposta MCP."}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
          <div className="panel-actions">
            {stage === "review" ? (
              <button
                className="primary"
                onClick={() => {
                  setStage("running");
                  setStep(0);
                }}
              >
                Aprovar e instalar
              </button>
            ) : stage === "running" ? (
              <Tone tone="warning">Aguarde a etapa atual</Tone>
            ) : stage === "failed" ? (
              <button
                className="primary"
                onClick={() => {
                  setStage("done");
                  setHealth("ok");
                }}
              >
                <RefreshCw size={13} />
                Testar conexão novamente
              </button>
            ) : (
              <Tone tone="success">Concluído nesta demonstração</Tone>
            )}
          </div>
        </Panel>
        <div className="stack">
          <Panel title="O que será aplicado">
            <div className="padded">
              <dl className="meta-grid">
                <div>
                  <dt>Origem</dt>
                  <dd>graphifyy[mcp]</dd>
                </div>
                <div>
                  <dt>Versão</dt>
                  <dd>Definida pela proposta</dd>
                </div>
                <div>
                  <dt>Destino</dt>
                  <dd>.gatewright/integrations/graphify</dd>
                </div>
                <div>
                  <dt>Escopo</dt>
                  <dd>Este projeto</dd>
                </div>
              </dl>
            </div>
            <div className="detail-section">
              <h3>Pré-requisitos</h3>
              <ul>
                <li>uv disponível no ambiente</li>
                <li>Grafo em graphify-out/graph.json</li>
              </ul>
            </div>
          </Panel>
          <Panel
            title="Saúde das conexões"
            subtitle="Resultados observados e configuração têm estados próprios"
          >
            <div className="padded">
              <div className="detail-title">
                <strong>Graphify</strong>
                <Tone tone={health === "ok" ? "success" : "error"}>
                  {health === "ok" ? "Respondeu" : "Falhou"}
                </Tone>
              </div>
              <div className="facts">
                <span>Última tentativa · 14:32</span>
                <span>
                  {health === "ok" ? "Latência · 82 ms" : "Sem resposta MCP"}
                </span>
              </div>
              <div style={{ marginTop: 16 }}>
                <button
                  onClick={() => {
                    setHealth("ok");
                    notify(
                      "Handshake simulado. O serviço real será consultado pela implementação.",
                    );
                  }}
                >
                  <RefreshCw size={13} />
                  Verificar agora
                </button>
              </div>
            </div>
            <div className="detail-section">
              <div className="detail-title">
                <strong>MCP do Gatewright</strong>
                <Tone tone="success">Respondeu</Tone>
              </div>
              <div className="facts">
                <span>Última tentativa · 14:30</span>
                <span>Latência · 18 ms</span>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
function MemoryView({ open, rows, onRemove }) {
  const [scope, setScope] = useState("Projeto"),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState(rows[0]);
  const list = rows.filter(
    (m) =>
      m.scope === scope &&
      `${m.title} ${m.body}`.toLowerCase().includes(query.toLowerCase()),
  );
  const current = list.find((m) => m.id === selected?.id) || list[0];
  return (
    <>
      <Header
        title="Memória"
        subtitle="Decisões e preferências com origem e alcance visíveis."
        action={
          <button
            className="primary"
            onClick={() => open({ type: "memory", scope })}
          >
            <Plus size={14} />
            Adicionar registro
          </button>
        }
      />
      <div className="toolbar">
        <div className="memory-scope" aria-label="Escopo da memória">
          {["Usuário", "Projeto", "Execução"].map((s) => (
            <button
              key={s}
              aria-pressed={scope === s}
              onClick={() => setScope(s)}
            >
              {s}
            </button>
          ))}
        </div>
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="Buscar decisões e preferências"
        />
      </div>
      {!list.length ? (
        <Empty
          title="Nenhum registro neste escopo"
          action={
            <button onClick={() => open({ type: "memory", scope })}>
              Adicionar registro
            </button>
          }
        >
          Registre uma preferência ou decisão que possa ajudar nas próximas
          tarefas.
        </Empty>
      ) : (
        <div className="split">
          <Panel
            title={`${list.length} registros`}
            subtitle={
              scope === "Usuário"
                ? "Disponíveis em projetos escolhidos"
                : "Projeto catalogo-web"
            }
          >
            <div className="memory-list">
              {list.map((m) => (
                <button
                  key={m.id}
                  className={current.id === m.id ? "selected" : ""}
                  onClick={() => setSelected(m)}
                >
                  <strong>{m.title}</strong>
                  <p>{m.body}</p>
                  <span className="soft-pill">{m.type}</span>
                  <small style={{ marginLeft: 8 }}>{m.updated}</small>
                </button>
              ))}
            </div>
          </Panel>
          <Panel
            title={current.title}
            action={
              <button
                className="icon-button"
                aria-label="Editar registro"
                onClick={() =>
                  open({
                    type: "memory",
                    memory: current,
                    scope: current.scope,
                  })
                }
              >
                <SquarePen size={15} />
              </button>
            }
          >
            <div className="padded">
              <p>{current.body}</p>
            </div>
            <div className="detail-section">
              <dl className="meta-grid">
                <div>
                  <dt>Escopo</dt>
                  <dd>{current.scope}</dd>
                </div>
                <div>
                  <dt>Tipo</dt>
                  <dd>{current.type}</dd>
                </div>
                <div>
                  <dt>Origem</dt>
                  <dd>{current.source}</dd>
                </div>
                <div>
                  <dt>Atualizado em</dt>
                  <dd>{current.updated}</dd>
                </div>
              </dl>
            </div>
            <div className="detail-section">
              <h3>Uso no contexto</h3>
              <p>{current.agent}</p>
              <div className="note" style={{ marginTop: 12 }}>
                O registro será oferecido na seleção de contexto da tarefa.
                Confira o conteúdo antes de enviá-lo ao modelo.
              </div>
            </div>
            <div className="detail-section inline-actions">
              <button
                onClick={() =>
                  open({
                    type: "memory",
                    memory: current,
                    scope: current.scope,
                  })
                }
              >
                <SquarePen size={13} />
                Editar
              </button>
              <button
                className="danger"
                onClick={() =>
                  open({ type: "remove-memory", memory: current, onRemove })
                }
              >
                <Trash2 size={13} />
                Excluir
              </button>
            </div>
          </Panel>
        </div>
      )}
    </>
  );
}
function MapView({ notify }) {
  const [selected, setSelected] = useState(modules[1]),
    [mode, setMode] = useState("Mapa"),
    [changed, setChanged] = useState(false);
  const linked = edges
    .filter((e) => e.includes(selected.id))
    .map((e) =>
      modules.find((m) => m.id === e.find((id) => id !== selected.id)),
    );
  return (
    <>
      <Header
        title={titles.map}
        subtitle="Explore dependências e consumidores a partir do grafo do projeto."
        action={
          <button
            onClick={() =>
              notify(
                "A atualização será uma operação de geração do Graphify com progresso e erro próprios.",
              )
            }
          >
            <RefreshCw size={14} />
            Atualizar mapa
          </button>
        }
      />
      <div className="toolbar">
        <div className="segmented">
          <button
            aria-pressed={mode === "Mapa"}
            onClick={() => setMode("Mapa")}
          >
            Mapa
          </button>
          <button
            aria-pressed={mode === "Lista"}
            onClick={() => setMode("Lista")}
          >
            Lista
          </button>
        </div>
        <label
          className="check"
          style={{ display: "flex", gap: 8, alignItems: "center" }}
        >
          <input
            type="checkbox"
            checked={changed}
            onChange={(e) => setChanged(e.target.checked)}
          />
          Relacionar ao diff
        </label>
        <span className="count" style={{ marginLeft: "auto" }}>
          Graphify · indexado em 20 nov, 14:20
        </span>
      </div>
      <div className="split">
        <Panel
          title={
            changed
              ? "Dependências e arquivos alterados"
              : "Dependências do catálogo"
          }
        >
          {mode === "Mapa" ? (
            <div
              className="map-canvas"
              role="group"
              aria-label="Mapa de dependências. Use os botões dos módulos ou alterne para Lista."
            >
              <svg
                className="map-lines"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                {edges.map(([a, b]) => {
                  const start = modules.find((m) => m.id === a),
                    end = modules.find((m) => m.id === b);
                  return (
                    <line
                      key={`${a}-${b}`}
                      x1={start.x + 13}
                      y1={start.y + 7}
                      x2={end.x + 1}
                      y2={end.y + 7}
                      stroke={
                        selected.id === a || selected.id === b
                          ? "#aa648e"
                          : "#4b424e"
                      }
                      strokeWidth=".4"
                    />
                  );
                })}
              </svg>
              {modules.map((m) => (
                <button
                  key={m.id}
                  className={`map-node ${selected.id === m.id ? "selected" : ""}`}
                  style={{ left: `${m.x}%`, top: `${m.y}%` }}
                  onClick={() => setSelected(m)}
                >
                  <strong>{m.name}</strong>
                  <small>
                    {m.type}
                    {changed && m.id === "contracts" ? " · alterado" : ""}
                  </small>
                </button>
              ))}
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Módulo</th>
                    <th>Tipo</th>
                    <th>Arquivo</th>
                  </tr>
                </thead>
                <tbody>
                  {modules.map((m) => (
                    <tr key={m.id}>
                      <th>
                        <button
                          className="table-select"
                          onClick={() => setSelected(m)}
                        >
                          {m.name}
                        </button>
                      </th>
                      <td>{m.type}</td>
                      <td>
                        <code>{m.file}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="map-footer">
            <GitBranch size={14} />
            Dependências observadas · {modules.length} módulos · {edges.length}{" "}
            relações
          </div>
        </Panel>
        <Panel title={selected.name} subtitle={selected.type}>
          <div className="padded">
            <dl className="meta-grid">
              <div>
                <dt>Arquivo de origem</dt>
                <dd>
                  <code>{selected.file}</code>
                </dd>
                <span className="sr-only"> </span>
              </div>
              <div>
                <dt>Fonte</dt>
                <dd>Grafo do projeto</dd>
              </div>
            </dl>
          </div>
          <div className="detail-section">
            <h3>Relações diretas</h3>
            <div className="stack">
              {linked.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelected(m)}
                  style={{ justifyContent: "space-between" }}
                >
                  {m.name}
                  <ChevronRight size={13} />
                </button>
              ))}
            </div>
          </div>
          {changed && (
            <div className="detail-section">
              <h3>Relação com a mudança</h3>
              <p>
                O diff altera Contratos v2. Portal web e SDK público aparecem
                como consumidores possíveis a revisar.
              </p>
              <p style={{ marginTop: 8 }}>
                A dependência sugere impacto. Valide o comportamento antes de
                concluir.
              </p>
            </div>
          )}
          <div className="detail-section">
            <button
              onClick={() =>
                notify(
                  "Abrir arquivo dependerá da ação do Electron para a pasta ativa.",
                )
              }
            >
              <ExternalLink size={13} />
              Abrir arquivo
            </button>
          </div>
        </Panel>
      </div>
    </>
  );
}
function CostsView({ open }) {
  const [dimension, setDimension] = useState("Agente"),
    [group, setGroup] = useState("");
  const key = {
    Agente: "agent",
    Provedor: "provider",
    Tarefa: "title",
    Integração: "integration",
  }[dimension];
  const bucket = costRows.reduce((acc, r) => {
    const value = r[key] || "Sem atribuição";
    const item = acc[value] || { total: 0, priced: 0 };
    if (r.amount != null) {
      item.total += r.amount;
      item.priced += 1;
    }
    acc[value] = item;
    return acc;
  }, {});
  const list = Object.entries(bucket)
    .map(([label, item]) => [label, item.priced ? item.total : null])
    .sort((a, b) => (b[1] ?? -1) - (a[1] ?? -1));
  const rows = costRows.filter(
    (r) => !group || (r[key] || "Sem atribuição") === group,
  );
  const total = rows.reduce((n, r) => n + (r.amount ?? 0), 0),
    unknown = rows.filter((r) => r.amount == null).length;
  return (
    <>
      <Header
        title={titles.costs}
        subtitle="Siga o custo registrado até a tarefa e sua fonte de medição."
      />
      <div className="toolbar">
        <label className="field">
          Agrupar por
          <select
            value={dimension}
            onChange={(e) => {
              setDimension(e.target.value);
              setGroup("");
            }}
          >
            {["Agente", "Provedor", "Tarefa", "Integração"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <span className="count">Período · 14 a 20 nov de 2026</span>
        {group && (
          <button onClick={() => setGroup("")}>
            <X size={12} />
            Limpar seleção
          </button>
        )}
      </div>
      <div className="metric-cards">
        <div className="surface">
          <span>Custo registrado</span>
          <strong>
            {rows.some((row) => row.amount != null) ? brl(total) : "—"}
          </strong>
          <small>
            {unknown
              ? "Parcial · há registros sem preço"
              : "Reportado e estimado"}
          </small>
        </div>
        <div className="surface">
          <span>Tokens registrados</span>
          <strong>
            {new Intl.NumberFormat("pt-BR").format(
              rows.reduce((n, r) => n + r.tokens, 0),
            )}
          </strong>
          <small>Entrada e saída da execução</small>
        </div>
        <div className="surface">
          <span>Execuções sem preço</span>
          <strong>{unknown}</strong>
          <small>Consumo preservado no histórico</small>
        </div>
      </div>
      <div className="split">
        <Panel
          title={`Custo por ${dimension.toLowerCase()}`}
          subtitle="Selecione uma linha para filtrar as execuções"
        >
          <div className="breakdown">
            {list.map(([label, amount]) => (
              <button
                key={label}
                onClick={() => setGroup(label)}
                aria-pressed={group === label}
              >
                <span className="bar-label">
                  <span>{label}</span>
                  <strong>{amount == null ? "Sem preço" : brl(amount)}</strong>
                </span>
                <div className="bar-track" aria-hidden="true">
                  <span
                    style={{
                      width: `${((amount ?? 0) / Math.max(1, ...list.map((x) => x[1] ?? 0))) * 100}%`,
                    }}
                  />
                </div>
              </button>
            ))}
          </div>
        </Panel>
        <Panel title="Cobertura dos dados">
          <div className="padded">
            <p>Os valores vêm das execuções registradas neste projeto.</p>
            <div className="note" style={{ marginTop: 15 }}>
              A associação com uma integração informa onde ela participou da
              tarefa. O valor exibido corresponde ao uso de modelos atribuído à
              execução.
            </div>
            <p style={{ marginTop: 15 }}>
              Mensalidades e faturas externas precisam de uma fonte de cobrança
              própria.
            </p>
          </div>
        </Panel>
      </div>
      {group && (
        <p className="selection-label">
          <SlidersHorizontal size={13} />
          {dimension} · {group}
        </p>
      )}
      <section className="section surface">
        <header className="panel-heading">
          <h2>Execuções no período</h2>
          <span className="footer-copy">{rows.length} registros</span>
        </header>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tarefa</th>
                <th>Agente</th>
                <th>Provedor</th>
                <th>Custo</th>
                <th>Fonte</th>
                <th>
                  <span className="sr-only">Detalhes</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <th>
                    <span>{r.title}</span>
                    <p className="footer-copy">{r.id}</p>
                  </th>
                  <td>{r.agent}</td>
                  <td>{r.provider}</td>
                  <td>{r.amount == null ? "—" : brl(r.amount)}</td>
                  <td>{r.source}</td>
                  <td>
                    <button
                      className="icon-button"
                      aria-label={`Ver custo de ${r.id}`}
                      onClick={() => open({ type: "cost", row: r })}
                    >
                      <ChevronRight size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
function TasksView({ profile, open }) {
  const [context, setContext] = useState(true);
  return (
    <>
      <Header
        title="Revisar a paginação do catálogo"
        subtitle="catalogo-142 · Gemini CLI · aguardando decisão"
        action={<Tone tone="warning">Revisão pendente</Tone>}
      />
      <div className="split">
        <Panel title="Configuração da tarefa">
          <div className="padded">
            <dl className="meta-grid">
              <div>
                <dt>Agente</dt>
                <dd>{profile?.name || "Revisor de API"}</dd>
              </div>
              <div>
                <dt>Modelo</dt>
                <dd>Padrão do host</dd>
              </div>
            </dl>
            <label className="field" style={{ marginTop: 18 }}>
              Objetivo
              <textarea
                rows={3}
                defaultValue="Verificar a compatibilidade dos filtros e da paginação."
              />
            </label>
            <div
              className="detail-section"
              style={{ paddingInline: 0, marginTop: 16 }}
            >
              <h3>Memória selecionada</h3>
              <label
                className="check"
                style={{ display: "flex", gap: 8, alignItems: "center" }}
              >
                <input
                  type="checkbox"
                  checked={context}
                  onChange={(e) => setContext(e.target.checked)}
                />
                Paginação por cursor · Projeto
              </label>
              <p style={{ marginTop: 8 }}>
                Preservar o campo nextCursor para os consumidores da API v2.
              </p>
            </div>
          </div>
        </Panel>
        <Panel title="Plano disponível">
          <div className="padded detail-body">
            <pre>
              {
                "1. Comparar o schema público com a implementação.\n2. Cobrir cursor inicial e página vazia.\n3. Executar os testes de contrato.\n4. Revisar o diff antes de concluir."
              }
            </pre>
            <div style={{ marginTop: 20 }}>
              <button
                className="primary"
                onClick={() => open({ type: "review" })}
              >
                Revisar etapa
                <ArrowRight size={13} />
              </button>
            </div>
          </div>
        </Panel>
      </div>
    </>
  );
}
const helpCopy = {
  skills: [
    "Como organizar uma skill",
    "Use a categoria para agrupar o catálogo e descreva o momento em que o agente deve usar as instruções.",
    "Uma skill pode participar de vários perfis. Ao atualizar as instruções, confira os agentes dependentes.",
  ],
  agents: [
    "Como compor um agente",
    "A ficha descreve o trabalho esperado. A aba Skills define a ordem de composição.",
    "Confira o texto em Instruções antes de iniciar uma tarefa. As decisões que dependem de aprovação seguem o fluxo do runtime.",
  ],
  install: [
    "Como recuperar uma instalação",
    "Confira qual etapa falhou. Um pacote instalado pode continuar aguardando a verificação MCP.",
    "Testar novamente verifica a conexão. Instalar novamente depende do estado da operação e das etapas já concluídas.",
  ],
  memory: [
    "Como selecionar contexto",
    "Cada registro tem escopo, origem e destinatários. Escolha o que será enviado na tarefa.",
    "Revise uma sugestão extraída da execução antes de torná-la memória persistente.",
  ],
  map: [
    "Como interpretar o mapa",
    "As relações vêm da versão indexada do projeto. Confira a data antes de avaliar uma mudança.",
    "Um consumidor conectado ao arquivo alterado sugere um ponto de teste. A relação sozinha não comprova uma regressão.",
  ],
  costs: [
    "Como interpretar os custos",
    "Consulte a fonte da medição e abra a tarefa para entender a atribuição.",
    "Um registro sem preço mantém os tokens. Custos estimados usam a tabela de preços registrada no momento da medição.",
  ],
  pending: [
    "Como resolver pendências",
    "Abra a revisão para ler o plano e conferir o diff antes de decidir.",
    "Uma tarefa interrompida continua após uma ação explícita. Revalide o contexto antes de retomar.",
  ],
  tasks: [
    "Como revisar a etapa",
    "Compare o plano ao objetivo da tarefa e ao diff atual.",
    "Se o repositório mudar, reabra a revisão para decidir sobre a versão atual.",
  ],
};
function App() {
  const params = new URLSearchParams(location.search),
    initial = params.get("view") || "pending";
  const [view, setView] = useState(initial === "help" ? "install" : initial),
    [scenario, setScenario] = useState("data"),
    [drawer, setDrawer] = useState(
      initial === "help" ? { type: "help" } : null,
    ),
    [toast, setToast] = useState(""),
    [profile, setProfile] = useState(null),
    [initialAgent, setInitialAgent] = useState(""),
    [rows, setRows] = useState(memories);
  const mainRef = useRef(null);
  const navigate = (v) => {
    setView(v);
    setScenario("data");
    setDrawer(null);
    const url = new URL(location.href);
    url.searchParams.set("view", v);
    history.replaceState(null, "", url);
    requestAnimationFrame(() => {
      mainRef.current?.scrollTo(0, 0);
      mainRef.current?.querySelector("h1")?.setAttribute("tabindex", "-1");
      mainRef.current?.querySelector("h1")?.focus();
    });
  };
  const notify = (t) => setToast(t);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    document.title = `Gatewright · ${titles[view] || view}`;
    document.documentElement.dataset.ready = "true";
  }, [view]);
  const currentNav = ["pending", "memory", "map"].includes(view)
    ? "project"
    : view === "install"
      ? "integrations"
      : view;
  const onAgents = (name) => {
    setInitialAgent(name);
    navigate("agents");
  };
  const help = helpCopy[view] || helpCopy.pending;
  let content =
    view === "skills" ? (
      <SkillsView open={setDrawer} onAgents={onAgents} />
    ) : view === "agents" ? (
      <AgentsView
        open={setDrawer}
        initialAgent={initialAgent}
        notify={notify}
        onTask={(a) => {
          setProfile(a);
          navigate("tasks");
        }}
      />
    ) : view === "install" ? (
      <InstallView notify={notify} />
    ) : view === "memory" ? (
      <MemoryView open={setDrawer} rows={rows} />
    ) : view === "map" ? (
      <MapView notify={notify} />
    ) : view === "costs" ? (
      <CostsView open={setDrawer} />
    ) : view === "tasks" ? (
      <TasksView profile={profile} open={setDrawer} />
    ) : (
      <PendingView navigate={navigate} open={setDrawer} />
    );
  if (scenario !== "data")
    content = (
      <>
        <Header title={titles[view]} subtitle="Projeto catalogo-web" />
        {scenario === "loading" ? (
          <div
            className="surface loading"
            role="status"
            aria-label="Carregando dados"
          >
            {[1, 2, 3, 4].map((n) => (
              <span key={n} />
            ))}
          </div>
        ) : (
          <Empty
            error={scenario === "error"}
            title={
              scenario === "error"
                ? "Não foi possível carregar esta área"
                : "Ainda não há registros aqui"
            }
            action={
              <button onClick={() => setScenario("data")}>
                {scenario === "error" ? "Tentar novamente" : "Mostrar exemplo"}
              </button>
            }
          >
            {scenario === "error"
              ? "O projeto continua aberto. Tente atualizar os dados."
              : "Os registros aparecem depois da primeira configuração ou tarefa."}
          </Empty>
        )}
      </>
    );
  return (
    <>
      <div className="preview-bar">
        <strong>Proposta de interface</strong>
        <span>Dados de demonstração · ações simuladas</span>
        <label className="sr-only" htmlFor="scenario">
          Estado da tela
        </label>
        <select
          id="scenario"
          value={scenario}
          onChange={(e) => setScenario(e.target.value)}
        >
          <option value="data">Com dados</option>
          <option value="loading">Carregando</option>
          <option value="empty">Sem registros</option>
          <option value="error">Falha ao carregar</option>
        </select>
      </div>
      <div className="app-shell">
        <header className="app-header">
          <div className="header-inner">
            <div className="brand">
              <span className="brand-mark" aria-hidden="true">
                <i />
                <i />
              </span>
              Gatewright
            </div>
            <nav className="app-nav" aria-label="Navegação principal">
              {nav.map(([id, label, Icon]) => (
                <button
                  key={id}
                  aria-current={currentNav === id ? "page" : undefined}
                  onClick={() =>
                    navigate(
                      id === "project"
                        ? "pending"
                        : id === "integrations"
                          ? "install"
                          : id,
                    )
                  }
                >
                  <Icon size={14} />
                  {label}
                </button>
              ))}
            </nav>
            <div className="header-actions">
              <button
                className="project-switch"
                onClick={() => notify("Projeto de demonstração · catalogo-web")}
              >
                <FolderGit2 size={14} />
                catalogo-web
              </button>
              <button
                className="icon-button"
                aria-label="Ajuda desta tela"
                onClick={() => setDrawer({ type: "help" })}
              >
                <CircleHelp size={17} />
              </button>
            </div>
          </div>
        </header>
        <main ref={mainRef} id="main">
          <div className="content">
            <div className="contextbar">
              <span>Projeto</span>
              <ChevronRight size={12} />
              <strong>catalogo-web</strong>
            </div>
            {currentNav === "project" && (
              <nav className="subnav" aria-label="Áreas do projeto">
                {projectViews.map(([id, label]) => (
                  <button
                    key={id}
                    aria-current={view === id ? "page" : undefined}
                    onClick={() => navigate(id)}
                  >
                    {label}
                  </button>
                ))}
              </nav>
            )}
            {content}
          </div>
        </main>
        <footer className="statusbar">
          <CircleCheck size={12} />
          <span style={{ width: "auto", height: "auto", background: "none" }}>
            Projeto local · prévia de design
          </span>
          <button
            className="help-link"
            style={{ marginLeft: "auto" }}
            onClick={() => setDrawer({ type: "help" })}
          >
            <BookOpen size={12} />
            Ajuda nesta tela
          </button>
        </footer>
      </div>
      {drawer && (
        <ModalDrawer
          title={
            drawer.type === "help"
              ? help[0]
              : drawer.type === "memory"
                ? "Registro de memória"
                : drawer.type === "remove-memory"
                  ? "Excluir registro"
                  : drawer.type === "cost"
                    ? "Custo da execução"
                    : drawer.type === "agent"
                      ? drawer.profile
                        ? "Editar perfil"
                        : "Novo perfil"
                      : drawer.type === "skill"
                        ? "Nova skill"
                        : drawer.type === "resume"
                          ? "Retomar validação"
                          : "Revisar etapa"
          }
          onClose={() => setDrawer(null)}
        >
          {drawer.type === "help" ? (
            <>
              <span className="soft-pill">{titles[view]}</span>
              <h3>Como usar</h3>
              <p>{help[1]}</p>
              <h3>Antes de continuar</h3>
              <p>{help[2]}</p>
              <h3>Relacionados</h3>
              <div className="stack">
                {[
                  ["skills", "Compor skills"],
                  ["install", "Conectar uma ferramenta"],
                  ["costs", "Consultar a medição"],
                ]
                  .filter(([id]) => id !== view)
                  .map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => navigate(id)}
                      style={{ justifyContent: "space-between" }}
                    >
                      {label}
                      <ArrowRight size={13} />
                    </button>
                  ))}
              </div>
            </>
          ) : drawer.type === "memory" ? (
            <MemoryForm
              item={drawer.memory}
              scope={drawer.scope}
              onSave={(item) => {
                setRows((old) => {
                  const next = {
                    ...item,
                    id: item.id || `demo-${Date.now()}`,
                    source: item.source || "Adicionada por você",
                    updated: "Agora",
                    agent: item.agent || "Selecionar na tarefa",
                  };
                  return old.some((m) => m.id === next.id)
                    ? old.map((m) => (m.id === next.id ? next : m))
                    : [...old, next];
                });
                setDrawer(null);
                notify("Registro atualizado nesta demonstração.");
              }}
            />
          ) : drawer.type === "remove-memory" ? (
            <>
              <p>
                Excluir “{drawer.memory.title}” da lista de memória disponível?
              </p>
              <p style={{ marginTop: 12 }}>
                As execuções anteriores preservam o contexto que já receberam.
              </p>
              <button
                className="danger"
                style={{ marginTop: 20 }}
                onClick={() => {
                  setRows((old) =>
                    old.filter((m) => m.id !== drawer.memory.id),
                  );
                  setDrawer(null);
                  notify("Registro removido da demonstração.");
                }}
              >
                Excluir registro
              </button>
            </>
          ) : drawer.type === "agent" ? (
            <AgentForm
              profile={drawer.profile}
              onSave={(profile) => {
                drawer.onSave(profile);
                setDrawer(null);
                notify("Perfil atualizado nesta demonstração.");
              }}
            />
          ) : drawer.type === "skill" ? (
            <SkillForm
              onSave={() => {
                setDrawer(null);
                notify(
                  "Prévia do formulário. A criação de SKILL.md usará o contrato existente.",
                );
              }}
            />
          ) : drawer.type === "cost" ? (
            <>
              <span className="soft-pill">{drawer.row.id}</span>
              <h3>{drawer.row.title}</h3>
              <dl className="meta-grid">
                {[
                  ["Agente", drawer.row.agent],
                  ["Provedor", drawer.row.provider],
                  ["Modelo", drawer.row.model],
                  ["Custo", brl(drawer.row.amount)],
                  ["Fonte", drawer.row.source],
                  ["Integração", drawer.row.integration || "Sem atribuição"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              <h3>Origem da medição</h3>
              <p>Uso de modelos registrado no journal desta execução.</p>
              <button
                style={{ marginTop: 20 }}
                onClick={() => {
                  navigate("tasks");
                  notify("Tarefa de exemplo aberta.");
                }}
              >
                Abrir tarefa
                <ArrowRight size={13} />
              </button>
            </>
          ) : (
            <>
              <Tone tone="warning">
                {drawer.type === "resume"
                  ? "Execução interrompida"
                  : "Decisão pendente"}
              </Tone>
              <h3>Validar a paginação do catálogo</h3>
              <p>
                Confira o objetivo e os arquivos alterados antes de continuar.
              </p>
              <h3>
                {drawer.type === "resume"
                  ? "Ponto de retomada"
                  : "Plano proposto"}
              </h3>
              <p>
                {drawer.type === "resume"
                  ? "A etapa de testes estava em execução. Verifique se o host ainda está ativo antes de autorizar uma nova tentativa."
                  : "Comparar o contrato público, testar página vazia e revisar os consumidores do nextCursor."}
              </p>
              <h3>Arquivos envolvidos</h3>
              <pre>
                src/contracts/catalog.ts{"\n"}tests/catalog/pagination.test.ts
              </pre>
              <div className="inline-actions" style={{ marginTop: 24 }}>
                <button
                  className="primary"
                  onClick={() => {
                    setDrawer(null);
                    notify(
                      drawer.type === "resume"
                        ? "Retomada simulada. O runtime revalidará processo, etapa e revisão."
                        : "Aprovação simulada. O runtime verificará o snapshot atual.",
                    );
                  }}
                >
                  {drawer.type === "resume"
                    ? "Autorizar retomada"
                    : "Aprovar esta etapa"}
                </button>
                <button
                  onClick={() => {
                    setDrawer(null);
                    notify("Fluxo preservado na demonstração.");
                  }}
                >
                  Voltar
                </button>
              </div>
            </>
          )}
        </ModalDrawer>
      )}
      {toast && (
        <div className="feedback" role="status">
          {toast}
        </div>
      )}
    </>
  );
}
function MemoryForm({ item, scope, onSave }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.currentTarget));
        onSave({ ...item, ...data });
      }}
    >
      <label className="field">
        Título
        <input
          name="title"
          defaultValue={item?.title || ""}
          maxLength={120}
          required
        />
      </label>
      <label className="field">
        Escopo
        <select name="scope" defaultValue={scope}>
          {["Usuário", "Projeto", "Execução"].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
      <label className="field">
        Tipo
        <select name="type" defaultValue={item?.type || "Decisão"}>
          {["Decisão", "Preferência", "Aprendizado"].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
      <label className="field">
        Disponível para
        <select
          name="agent"
          defaultValue={item?.agent || "Selecionar na tarefa"}
        >
          <option>Selecionar na tarefa</option>
          <option>Todos os perfis</option>
          {agents.map((a) => (
            <option key={a.id}>{a.name}</option>
          ))}
        </select>
      </label>
      <label className="field">
        Conteúdo
        <textarea
          name="body"
          rows={5}
          defaultValue={item?.body || ""}
          required
        />
      </label>
      <p style={{ marginTop: 12 }}>
        Confira o conteúdo e o alcance antes de disponibilizá-lo para as
        tarefas.
      </p>
      <button className="primary" style={{ marginTop: 18 }}>
        Salvar registro
      </button>
    </form>
  );
}
function SkillForm({ onSave }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <label className="field">
        Nome
        <input name="name" required placeholder="Revisar autenticação" />
      </label>
      <label className="field">
        Quando usar
        <input name="description" required />
      </label>
      <label className="field">
        Categoria
        <select>
          {categoryNames.slice(1).map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
      <label className="field">
        Instruções
        <textarea rows={8} required />
      </label>
      <button className="primary" style={{ marginTop: 18 }}>
        Salvar skill
      </button>
    </form>
  );
}
function AgentForm({ profile, onSave }) {
  const [selected, setSelected] = useState(profile?.skills || []);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(event.currentTarget));
        onSave({
          id: profile?.id || `demo-${Date.now()}`,
          name: data.name,
          goal: data.goal,
          responsibilities: data.responsibilities.split("\n").filter(Boolean),
          input: data.input,
          output: data.output,
          boundaries: data.boundaries,
          skills: selected,
        });
      }}
    >
      <label className="field">
        Nome
        <input
          name="name"
          defaultValue={profile?.name || ""}
          required
          maxLength={70}
        />
      </label>
      <label className="field">
        Objetivo
        <textarea
          name="goal"
          defaultValue={profile?.goal || ""}
          rows={2}
          required
        />
      </label>
      <label className="field">
        Responsabilidades
        <textarea
          name="responsibilities"
          defaultValue={profile?.responsibilities.join("\n") || ""}
          rows={3}
          placeholder="Uma responsabilidade por linha"
        />
      </label>
      <label className="field">
        Entrada esperada
        <textarea name="input" defaultValue={profile?.input || ""} rows={2} />
      </label>
      <label className="field">
        Resultado esperado
        <textarea name="output" defaultValue={profile?.output || ""} rows={2} />
      </label>
      <label className="field">
        Limites de atuação
        <textarea
          name="boundaries"
          defaultValue={profile?.boundaries || ""}
          rows={2}
        />
      </label>
      <fieldset className="skill-picker" style={{ marginTop: 16 }}>
        <legend>Skills</legend>
        {skills.map((skill) => (
          <label
            className="check"
            key={skill.id}
            style={{ display: "flex", gap: 8, padding: 6 }}
          >
            <input
              style={{ width: 15, minHeight: 0 }}
              type="checkbox"
              checked={selected.includes(skill.id)}
              onChange={(e) =>
                setSelected((old) =>
                  e.target.checked
                    ? [...old, skill.id]
                    : old.filter((id) => id !== skill.id),
                )
              }
            />
            {skill.name}
          </label>
        ))}
      </fieldset>
      <button
        className="primary"
        style={{ marginTop: 16 }}
        disabled={!selected.length}
      >
        Salvar perfil
      </button>
    </form>
  );
}
createRoot(document.getElementById("root")).render(<App />);
