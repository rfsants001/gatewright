import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight, ChartNoAxesColumnIncreasing, ChevronRight, CircleCheck, ClipboardList, Clock3,
  FileText, FolderGit2, FolderOpen, GitCompareArrows, Layers, Play, Plus, Plug, RefreshCw, Square, Terminal,
} from "lucide-react";
import { AgentsPage, SkillsPage } from "./library.jsx";
import { CostTimeline, Usage } from "./usage.jsx";

const gate = window.gatewright;
const states = {
  RUNNING: "Em execução", PAUSED: "Pausada", PASSED: "Concluída", FAILED: "Falhou", CANCELLED: "Cancelada", IDLE: "Pronta",
};
const pages = [
  ["project", "Projeto", FolderGit2], ["execution", "Tarefas", ClipboardList],
  ["usage", "Custos", ChartNoAxesColumnIncreasing], ["settings", "Integrações", Plug],
  ["agents", "Agentes", Layers], ["skills", "Skills", FileText],
];
const leaf = (path) => path.split(/[\\/]/).filter(Boolean).at(-1) || path;
const empty = { hosts: [], providers: [], skills: [], skillDetails: [], agents: [], linkedProjects: [], integrations: { jev: false, mcp: [], packages: [] } };

function Brand() {
  return <div className="brand"><span className="brand-mark" aria-hidden="true"><i /><i /></span><span>Gatewright</span></div>;
}

function Status({ children, tone = "neutral" }) {
  return <span className={`badge ${tone}`}><span aria-hidden="true" />{children}</span>;
}

function PageHeading({ title, children, actions }) {
  return <header className="page-heading">
    <div><h1>{title}</h1>{children && <p>{children}</p>}</div>{actions}
  </header>;
}

function Empty({ title, children, action }) {
  return <section className="empty surface"><h1>{title}</h1><p>{children}</p>{action}</section>;
}

function Modal({ modal, notice, onClose }) {
  const dialog = useRef(null);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    dialog.current.showModal();
  }, []);
  async function decide(action) {
    setPending(true);
    try { await action(); } finally { setPending(false); }
  }
  return <dialog ref={dialog} aria-labelledby="modal-title" onCancel={(event) => {
    event.preventDefault();
    if (!pending) onClose();
  }}>
    <header className="dialog-heading"><h2 id="modal-title">{modal.title}</h2>{modal.summary && <p>{modal.summary}</p>}</header>
    <div className="dialog-content">{modal.body}{notice.tone === "error" && <p className="form-error" role="alert">{notice.text}</p>}</div>
    <footer className="dialog-actions">
      <button autoFocus disabled={pending} onClick={onClose}>Voltar</button>
      {modal.reload && <button disabled={pending} onClick={() => decide(modal.reload)}><RefreshCw size={14} />Reabrir diff</button>}
      {modal.reject && <button className="danger" disabled={pending} onClick={() => decide(modal.reject)}>Recusar</button>}
      {modal.confirm && <button className="primary" disabled={pending} onClick={() => decide(modal.confirm)}>
        {pending ? modal.pendingLabel ?? "Aguarde…" : modal.label}
      </button>}
    </footer>
  </dialog>;
}

function FlowQuestions({ data, notice, onAnswer, onStop }) {
  const dialog = useRef(null);
  const [pending, setPending] = useState(false);
  useEffect(() => { dialog.current.showModal(); }, []);
  async function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const answers = Object.fromEntries(data.questions.map(({ id, type }) => [
      id, type === "confirm" ? form.has(id) : type === "multiselect" ? form.getAll(id) : form.get(id) ?? "",
    ]));
    setPending(true);
    try { await onAnswer(answers); } finally { setPending(false); }
  }
  return <dialog ref={dialog} aria-labelledby="flow-title" onCancel={(event) => event.preventDefault()}>
    <form onSubmit={submit}>
      <header className="dialog-heading"><h2 id="flow-title">{data.title}</h2><p>Revise a etapa antes de continuar.</p></header>
      <div className="dialog-content">
        {data.output && <pre>{data.output}</pre>}
        {notice.tone === "error" && <p className="form-error" role="alert">{notice.text}</p>}
        {data.diff && <details><summary>Ver alterações no repositório</summary><pre>{data.diff}</pre></details>}
        {data.questions.map(({ id, prompt, type, options = [] }) => <fieldset key={id}>
          <legend>{prompt}</legend>
          {type === "confirm" ? <label className="check"><input name={id} type="checkbox" />Aprovo esta etapa</label>
            : type === "select" ? <select name={id} aria-label={prompt}>{options.map((option) => <option key={option}>{option}</option>)}</select>
              : type === "multiselect" ? options.map((option) => <label className="check" key={option}>
                <input name={id} type="checkbox" value={option} />{option}
              </label>) : <input name={id} aria-label={prompt} />}
        </fieldset>)}
      </div>
      <footer className="dialog-actions"><button className="danger" type="button" disabled={pending} onClick={onStop}>Encerrar fluxo</button>
        <button className="primary" disabled={pending}>Continuar</button></footer>
    </form>
  </dialog>;
}

function Project({ cwd, data, loading, recents, busy, open, choose, connect, navigate }) {
  const otherProjects = recents.filter((item) => item.path !== cwd);
  const detected = data.hosts.filter((host) => host.installed).length;
  return <>
    {cwd ? <PageHeading title={leaf(cwd)} actions={
      <button className="primary" onClick={() => navigate("execution")}><Plus size={15} aria-hidden="true" />Nova tarefa</button>
    }>
      <span className="project-path" title={cwd}>{cwd}</span>
    </PageHeading> : <Empty title="Abra um projeto para começar" action={
      <button className="primary" onClick={choose}><FolderOpen size={15} aria-hidden="true" />Abrir pasta…</button>
    }>
      Escolha a pasta do repositório que você quer usar.
    </Empty>}
    {cwd && <div className="dashboard-grid">
      <section className="surface table-panel">
        <header className="panel-heading">
          <div><h2>Integrações com o terminal</h2><p>Confira o suporte a MCP e hooks antes de configurar.</p></div>
          {data.hosts.length > 0 && <span className="tag">{detected} de {data.hosts.length} detectados</span>}
        </header>
        {loading && !data.hosts.length && <p className="table-empty" role="status">Procurando ferramentas do terminal…</p>}
        {!!data.hosts.length && <div className="table-wrap"><table className="host-table">
          <thead><tr><th scope="col">Ferramenta</th><th scope="col">Instalação</th><th scope="col">Recursos suportados</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
          <tbody>{data.hosts.map((host) => <tr key={host.id}>
            <th scope="row">
              <div className="host-name"><Terminal size={15} aria-hidden="true" /><div><strong>{host.name}</strong>
                {host.version && <small title={host.version}>{host.version}</small>}</div></div>
            </th>
            <td><Status>{host.installed ? "Detectado" : "Não instalado"}</Status></td>
            <td>{host.hooks ? "MCP + hooks" : "MCP"}</td>
            <td><button className="table-action" aria-label={`Revisar conexão de ${host.name}`} onClick={() => connect(host)}>
              Revisar <ChevronRight size={14} aria-hidden="true" />
            </button></td>
          </tr>)}</tbody>
        </table></div>}
      </section>
      <CostTimeline dailyUsage={data.usage?.byDay} compact controls={
        <button className="icon-button" aria-label="Ver custos do projeto" title="Ver custos do projeto" onClick={() => navigate("usage")}><ArrowRight size={16} /></button>
      } />
    </div>}
    {!!otherProjects.length && <section className="section surface table-panel">
      <header className="panel-heading"><h2>Projetos recentes</h2></header>
      <div className="rows">{otherProjects.map(({ path, name }) => <button key={path} className="recent" onClick={() => open(path)} disabled={busy}>
        <Clock3 size={15} aria-hidden="true" /><span><strong>{name}</strong><small>{path}</small></span><ChevronRight size={15} aria-hidden="true" />
      </button>)}</div>
    </section>}
  </>;
}

function Execution({ options, engine, setEngine, agents, agent, setAgent, model, setModel, task, setTask, state, busy, running, canReview, log, start, cancel, review }) {
  const transcript = useRef(null);
  useEffect(() => {
    const panel = transcript.current;
    if (panel) panel.scrollTop = panel.scrollHeight;
  }, [log]);
  return <>
    <PageHeading title="Tarefas">Execute um objetivo direto ou passe pela revisão de um plano SDD.</PageHeading>
    <div className="execution-grid">
      <section className="surface">
        <header className="panel-heading"><h2>Definir tarefa</h2></header>
        <form className="form-panel" onSubmit={(event) => { event.preventDefault(); start(false); }}>
        <div className="form-grid"><label>Ferramenta ou provedor<select value={engine} onChange={(event) => setEngine(event.target.value)} disabled={busy}>
          {!options.length && <option value="">Nenhum disponível</option>}
          {options.map(({ id, name }) => <option value={id} key={id}>{name}</option>)}
        </select></label>
        <label>Modelo<input value={model} onChange={(event) => setModel(event.target.value)} placeholder="Usar padrão" disabled={busy} /></label></div>
        {!!agents.length && <label>Agente<select value={agent} onChange={(event) => setAgent(event.target.value)} disabled={busy}>
          <option value="">Sem agente</option>{agents.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
        </select></label>}
        <label>Objetivo<textarea rows="4" value={task} onChange={(event) => setTask(event.target.value)} placeholder="Ex.: revise as mudanças da API do catálogo." maxLength={48000} disabled={busy} /></label>
        <div className="actions">
          <button className="primary" disabled={busy || !engine || !task.trim()}><Play size={14} aria-hidden="true" />Executar tarefa</button>
          <button type="button" disabled={busy || !engine || engine.startsWith("provider:") || !task.trim()} onClick={() => start(true)}>Iniciar fluxo SDD</button>
          {busy && <button type="button" className="danger" disabled={state !== "RUNNING"} onClick={cancel}><Square size={13} aria-hidden="true" />Cancelar execução</button>}
        </div>
        </form>
      </section>
      <section className="surface execution-log">
        <div className="panel-heading"><h2>Registro da tarefa</h2>
          <Status tone={running || state === "PAUSED" ? "progress" : state === "PASSED" ? "success" : (state === "FAILED" || state === "CANCELLED") ? "error" : "neutral"}>{states[state] || state}</Status>
        </div>
        <div ref={transcript} className="transcript" tabIndex={0} aria-label="Registro da tarefa">
          {log ? <pre>{log}</pre> : <p>A saída aparece quando a tarefa começa.</p>}
        </div>
        <div className="panel-actions"><button disabled={!canReview} onClick={review}><GitCompareArrows size={14} aria-hidden="true" />Abrir diff</button></div>
      </section>
    </div>
  </>;
}

function Settings({ data, saveProvider, propose, testIntegration, connect }) {
  const [providerId, setProvider] = useState("");
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [diagnostics, setDiagnostics] = useState({});
  const configLabel = { configured: "Aplicada", pending: "Pendente", review: "Requer revisão" };

  async function test(name) {
    setDiagnostics((current) => ({ ...current, [name]: { pending: true } }));
    const result = await testIntegration(name);
    const diagnostic = result.ok
      ? { message: `${result.data.name} ${result.data.version} respondeu.`, tone: "success" }
      : { message: result.error, tone: "error" };
    setDiagnostics((current) => ({ ...current, [name]: diagnostic }));
  }

  function connectionCheck(name, ready, label) {
    const status = diagnostics[name];
    return <div className="connection-check">
      <button type="button" onClick={() => test(name)} disabled={!ready || status?.pending}
        aria-label={`${label} ${name}`}>{status?.pending ? "Testando…" : label}</button>
      {status?.message && <Status tone={status.tone}>{status.message}</Status>}
    </div>;
  }
  return <>
    <PageHeading title="Integrações">Conecte ferramentas, instale integrações e configure provedores para este projeto.</PageHeading>
    <div className="settings-grid">
      <section className="surface">
        <header className="panel-heading"><div><h2>Provedor de modelos</h2><p>Use uma API ou proxy compatível com o Chat Completions da OpenAI.</p></div></header>
        <form className="form-panel" onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const values = Object.fromEntries(new FormData(form));
          const provider = { id: values.id.trim(), endpoint: values.endpoint.trim(), model: values.model.trim() };
          if (values.key.trim()) provider.keyEnv = values.key.trim();
          setSaving(true);
          try { if (await saveProvider(provider)) form.reset(); } finally { setSaving(false); }
        }}>
          <div className="form-grid">
            <label>ID do provedor<input name="id" placeholder="proxy-equipe" required /></label>
            <label>URL base<input name="endpoint" type="url" placeholder="https://exemplo.com/v1" required /></label>
            <label>Modelo<input name="model" required /></label>
            <label>Variável de ambiente da chave<input name="key" placeholder="OPENROUTER_API_KEY" /></label>
          </div>
          <div className="actions"><button disabled={saving}>{saving ? "Salvando…" : "Salvar provedor"}</button></div>
        </form>
      </section>
      <section className="surface">
        <header className="panel-heading"><div><h2>Instalar ou conectar com IA</h2><p>Descreva o que você quer integrar. Revise a origem e o que será aplicado.</p></div></header>
        <form className="form-panel" onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setGenerating(true);
          try { await propose({ providerId: form.get("provider"), model: form.get("model").trim(), prompt: form.get("prompt").trim(), reference: form.get("reference").trim() }); }
          finally { setGenerating(false); }
        }}>
          <div className="form-grid"><label>Provedor<select name="provider" value={providerId || data.providers[0]?.id || ""} onChange={(event) => setProvider(event.target.value)}>
            {data.providers.map(({ id }) => <option key={id} value={id}>{id === "ollama" ? "Ollama" : id}</option>)}
          </select></label><label>Modelo<input name="model" placeholder="Informe o ID ao usar Ollama" /></label></div>
          <label>Mudança<textarea name="prompt" rows="3" maxLength={4000} required placeholder="Ex.: conecte o MCP em https://exemplo.com/mcp." /></label>
          <p>Você pode indicar um pacote MCP do npm, uma imagem Docker, um repositório Git, Graphify ou Jev.</p>
          <details><summary>Anexar instruções de instalação</summary>
            <label>Trecho da documentação<textarea name="reference" rows="3" maxLength={12000} placeholder="Cole a fonte, os pré-requisitos e a versão." /></label>
            <p>O provedor escolhido recebe o pedido e este trecho. Remova chaves e tokens antes de enviar.</p>
          </details>
          <div className="actions"><button className="primary" disabled={generating || !data.providers.length}>{generating ? "Gerando proposta…" : "Gerar proposta"}</button></div>
        </form>
      </section>
    </div>
    <section className="section surface">
      <header className="panel-heading"><div><h2>Diagnóstico da conexão</h2><p>Confira a instalação do host e os arquivos deste projeto. O teste MCP abre uma conexão local com o Gatewright.</p></div></header>
      <div className="table-wrap"><table>
        <thead><tr><th scope="col">Ferramenta</th><th scope="col">Instalação</th><th scope="col">Configuração</th><th scope="col">Ação</th></tr></thead>
        <tbody>{data.hosts.map((host) => <tr key={host.id}>
          <th scope="row">{host.name}</th>
          <td>{host.installed ? <Status tone="success">{host.version || "Detectada"}</Status> : "Não detectada"}</td>
          <td><Status tone={host.configuration === "configured" ? "success" : host.configuration === "review" ? "error" : "neutral"}>{configLabel[host.configuration]}</Status></td>
          <td><button type="button" aria-label={`Revisar configuração do ${host.name}`} onClick={() => connect(host)}>Revisar</button></td>
        </tr>)}</tbody>
      </table></div>
      <div className="form-panel">{connectionCheck("gatewright", true, "Testar MCP do Gatewright")}</div>
    </section>
    <section className="section surface"><header className="panel-heading"><h2>Integrações do projeto</h2></header>
      <div className="form-panel">
        <ul className="library-list">
          <li><strong>Jev</strong><p>{data.integrations.jev ? "Configurado para este projeto" : "Sem configuração de projeto"}</p></li>
          {data.integrations.mcp.map(({ name, ready, type, url }) => <li key={`mcp-${name}`}>
            <strong>{name} · MCP {type === "stdio" ? "local" : "HTTP"}</strong>
            <p>{ready ? (url || "Servidor registrado no projeto.") : "Aguardando graphify-out/graph.json."}</p>
            {ready ? connectionCheck(name, true, type === "stdio" ? "Iniciar e testar MCP" : "Testar MCP")
              : <p>Gere o grafo, atualize esta tela e revise a configuração do host.</p>}
          </li>)}
          {data.integrations.packages.map(({ id, version, containerId, via }) => <li key={`package-${id}`}>
            <strong>{id}</strong><p>{containerId ? "Contêiner criado" : "Instalação registrada"}{version ? ` · ${version}` : ""}</p>
            {via && <p>{via}</p>}
          </li>)}
        </ul>
        <h2>Projetos vinculados</h2>
        {data.linkedProjects.length ? <ul className="asset-list">{data.linkedProjects.map((path) => <li key={path}>{path}</li>)}</ul> : <p>Nenhum projeto vinculado.</p>}
      </div>
    </section>
  </>;
}

function App() {
  const [page, setPage] = useState("project");
  const [cwd, setCwd] = useState("");
  const cwdRef = useRef("");
  const refreshId = useRef(0);
  const [data, setData] = useState(empty);
  const [recents, setRecents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState({ text: "Nenhum projeto aberto.", tone: "neutral" });
  const [modal, setModal] = useState(null);
  const [questions, setQuestions] = useState(null);
  const [engine, setEngine] = useState("");
  const [agentId, setAgentId] = useState("");
  const [model, setModel] = useState("");
  const [task, setTask] = useState("");
  const [state, setState] = useState("IDLE");
  const [starting, setStarting] = useState(false);
  const [inFlow, setInFlow] = useState(false);
  const [runId, setRunId] = useState("");
  const [log, setLog] = useState("");
  const busy = starting || inFlow || state === "RUNNING";
  const options = [...data.hosts.filter((host) => host.installed), ...data.providers.map(({ id }) => ({
    id: `provider:${id}`, name: id === "ollama" ? "Ollama" : id,
  }))];
  const selectedEngine = options.some(({ id }) => id === engine) ? engine : options[0]?.id ?? "";
  const notify = (text, tone = "neutral") => setNotice({ text, tone });

  async function request(method, params) {
    try {
      const reply = await gate.request(method, params);
      if (reply.error) throw new Error(reply.error);
      return { ok: true, data: reply.result };
    } catch (error) {
      notify(error.message, "error");
      return { ok: false, error: error.message };
    }
  }

  async function listProjects() {
    const result = await request("projects");
    if (result.ok) setRecents(result.data);
  }

  async function refresh(project = cwdRef.current) {
    if (!project) return;
    const version = ++refreshId.current;
    setLoading(true);
    const result = await request("snapshot", { cwd: project });
    if (version !== refreshId.current) return;
    if (result.ok && project === cwdRef.current) setData(result.data);
    setLoading(false);
  }

  async function open(path) {
    const result = await request("open", { cwd: path });
    if (!result.ok) return;
    const project = result.data.cwd;
    cwdRef.current = project;
    setCwd(project);
    setData(empty);
    setAgentId("");
    setRunId("");
    setLog("");
    setState("IDLE");
    setPage("project");
    notify("Projeto aberto.", "success");
    void listProjects();
    void refresh(project);
  }

  useEffect(() => {
    const unsubscribe = gate.onEvent((message) => {
      if (message.event === "bridge.closed") {
        setInFlow(false);
        setStarting(false);
        setState("FAILED");
        setQuestions(null);
        notify("O serviço local foi encerrado. Abra o Gatewright novamente.", "error");
        return;
      }
      if (message.cwd !== cwdRef.current) return;
      switch (message.event) {
        case "run.state":
          setState(message.data);
          if (message.data !== "RUNNING") {
            const messages = { PASSED: "Execução concluída.", FAILED: "A execução falhou. Consulte o registro.", CANCELLED: "Execução cancelada.", PAUSED: "Execução pausada." };
            if (messages[message.data]) notify(messages[message.data], message.data === "FAILED" ? "error" : message.data === "PASSED" ? "success" : "neutral");
            void refresh();
          } else notify("Execução em andamento.");
          break;
        case "run.log": {
          const entry = message.data;
          const text = entry.text || [entry.tool, entry.detail].filter(Boolean).join(" · ");
          if (text) setLog((previous) => `${previous}${text}\n`.slice(-150000));
          break;
        }
        case "flow.run": setRunId(message.data); break;
        case "flow.ask":
          setModal(null);
          notify("Etapa disponível para revisão.");
          setQuestions(message.data);
          break;
        case "flow.done":
        case "flow.error":
          setQuestions(null);
          setInFlow(false);
          notify(message.data || "Fluxo concluído. O diff está disponível para revisão.", message.event === "flow.error" ? "error" : "success");
          break;
      }
    });
    void listProjects();
    void gate.initialProject().then((path) => { if (path) void open(path); });
    return unsubscribe;
  }, []);

  async function choose() {
    try {
      const path = await gate.chooseFolder();
      if (path) await open(path);
    } catch (error) { notify(error.message, "error"); }
  }

  async function start(flow) {
    if (!task.trim() || !selectedEngine || busy) return;
    setStarting(true);
    setInFlow(flow);
    setLog("");
    setRunId("");
    notify(flow ? "Iniciando fluxo SDD…" : "Iniciando execução…");
    const result = await request(flow ? "flow.start" : "run", { cwd, engine: selectedEngine, model: model.trim(), prompt: task.trim(), ...(agentId ? { agentId } : {}) });
    setStarting(false);
    if (result.ok) setRunId(result.data.runId || "");
    else setInFlow(false);
  }

  async function cancel() {
    if (inFlow) await request("flow.stop", { cwd });
    else if (runId) {
      const result = await request("cancel", { runId });
      if (result.ok) notify("Cancelamento solicitado.");
    }
  }

  async function connect(host) {
    const result = await request("terminal.preview", { cwd, host: host.id });
    if (!result.ok) return;
    const { revision, changes } = result.data;
    const hasChanges = changes.some(({ action }) => action !== "noop");
    const blocked = changes.some((change) => change.blocked);
    notify("Conexão disponível para revisão.");
    setModal({
      title: `Configurar ${host.name}`,
      summary: blocked ? "Corrija a configuração indicada antes de aplicar." : hasChanges
        ? "Confira os arquivos que o Gatewright vai alterar." : "A configuração deste projeto já está atualizada.",
      label: "Gravar configuração",
      body: <ul className="change-list">{changes.map(({ path, action, summary, blocked }) => <li key={path}><strong>
        {blocked ? "Requer revisão" : action === "noop" ? "Sem alteração" : action === "create" ? "Criar arquivo" : "Atualizar arquivo"}</strong>
        <code>{path}</code><p>{summary}</p></li>)}</ul>,
      confirm: hasChanges && !blocked ? async () => {
        const applied = await request("terminal.apply", { cwd, host: host.id, revision });
        if (applied.ok) {
          setModal(null);
          notify("Configuração gravada. Reinicie o host para verificar a conexão.", "success");
          void refresh();
        }
      } : null,
    });
  }

  async function review() {
    const result = await request("review", { cwd, runId });
    if (!result.ok) return;
    const { diff, status, revision } = result.data;
    const changes = [status, diff].filter(Boolean).join("\n\n") || "Sem alterações no repositório.";
    async function decide(approved) {
      const decision = await request("review.decide", { cwd, revision, approved });
      if (decision.ok) {
        setModal(null);
        notify(approved ? "Revisão aprovada e registrada." : "Recusa registrada na execução.", "success");
      } else if (decision.error?.startsWith("A revisão mudou.")) {
        setModal((current) => ({ ...current, confirm: null, reject: null, reload: review }));
      }
    }
    notify("Diff disponível para revisão.");
    setModal({
      title: "Revisar alterações", label: "Aprovar revisão", summary: "A decisão fica vinculada a esta revisão do repositório.",
      body: <pre className="diff" tabIndex={0} aria-label="Alterações no repositório">{changes.length > 500_000 ? changes : changes.split("\n").map((line, index) =>
        <span className={line.startsWith("+") ? "addition" : line.startsWith("-") ? "deletion" : line.startsWith("@@") ? "location" : undefined} key={index}>{line}{"\n"}</span>)}</pre>,
      confirm: () => decide(true), reject: () => decide(false),
    });
  }

  async function saveProvider(provider) {
    const result = await request("provider.save", { cwd, provider });
    if (result.ok) { notify("Provedor salvo para este projeto.", "success"); void refresh(); }
    return result.ok;
  }

  async function saveLibrary(method, key, value, message) {
    const result = await request(method, { cwd, [key]: value });
    if (result.ok && cwdRef.current === cwd) {
      notify(message, "success");
      await refresh();
    }
    return result.ok;
  }

  async function previewAgent(agent) {
    const result = await request("agent.preview", { cwd, agent });
    return result.ok ? result.data.instructions : "";
  }

  function testIntegration(name) {
    return request("integration.test", { cwd, name });
  }

  async function propose(input) {
    const result = await request("customize.propose", { cwd, ...input });
    if (!result.ok || cwdRef.current !== cwd) return;
    const { revision, message, change, plan } = result.data;
    notify(revision ? "Proposta disponível para revisão." : "Confira a resposta do provedor.");
    if (!revision) {
      setModal({ title: "Detalhes necessários", body: <p>{message || "O provedor não retornou uma proposta válida."}</p> });
      return;
    }
    setModal({
      title: "Revisar proposta", label: "Aplicar mudança", pendingLabel: "Aplicando…",
      summary: change.kind === "opencode-plugin" ? "O OpenCode poderá baixar e executar este pacote ao iniciar." : "Confira os dados que serão gravados no projeto.",
      body: <>
        {plan?.steps.length > 0 && <ol className="proposal-steps">{plan.steps.map((step) => <li key={step}>{step}</li>)}</ol>}
        {plan?.target && <p className="proposal-target">Configuração: <code>{plan.target}</code></p>}
        <pre>{JSON.stringify(change, null, 2)}</pre>
      </>,
      confirm: async () => {
        const applied = await request("customize.apply", { cwd, revision });
        if (applied.ok) { setModal(null); notify(applied.data?.warning ?? "Mudança aplicada ao projeto.", applied.data?.warning ? "neutral" : "success"); void refresh(); }
      },
    });
  }

  async function answer(answers) {
    const token = questions.token;
    const result = await request("flow.answer", { cwd, token, answers });
    if (result.ok) {
      setQuestions((current) => current?.token === token ? null : current);
      if (result.data.runId) setRunId(result.data.runId);
    }
  }

  const execNotice = (() => {
    if (starting) return { text: inFlow ? "Iniciando fluxo SDD…" : "Iniciando execução…", tone: "neutral" };
    if (state === "RUNNING") return { text: "Execução em andamento.", tone: "neutral" };
    if (state === "PAUSED") return { text: "Execução pausada.", tone: "neutral" };
    if (state === "PASSED") return { text: "Execução concluída.", tone: "success" };
    if (state === "FAILED") return { text: "A execução falhou. Consulte o registro.", tone: "error" };
    if (state === "CANCELLED") return { text: "Execução cancelada.", tone: "neutral" };
    return null;
  })();
  const footerNotice = page === "execution" ? execNotice ?? notice : notice;

  return <div className="app-shell">
    <header className="app-header">
      <div className="header-inner">
        <Brand />
        <nav className="app-nav" aria-label="Área de trabalho">{pages.map(([id, name, NavIcon]) => (
          <button key={id} aria-current={page === id ? "page" : undefined} onClick={() => setPage(id)}>
            <NavIcon size={15} aria-hidden="true" />{name}
          </button>
        ))}</nav>
        <div className="header-actions">
          <button className="project-switch" onClick={choose} disabled={busy}
            aria-label={cwd ? `Trocar de projeto. Projeto atual: ${leaf(cwd)}` : "Abrir projeto"}
            title={cwd ? `Trocar de projeto · ${cwd}` : "Abrir projeto"}>
            <FolderOpen size={15} aria-hidden="true" /><span>{cwd ? leaf(cwd) : "Abrir projeto"}</span>
          </button>
          <button className="icon-button" aria-label="Atualizar projeto" title="Atualizar projeto" onClick={() => refresh()} disabled={!cwd || loading}>
            <RefreshCw size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
    <main id="main" key={page} tabIndex={0}><div className="content">
      {page === "project" ? <Project {...{ cwd, data, loading, recents, busy, open, choose, connect, navigate: setPage }} />
        : !cwd ? <Empty title="Abra um projeto" action={<button className="primary" onClick={choose}>Abrir pasta…</button>}>
          Escolha a pasta do repositório para continuar.
        </Empty> : page === "execution" ? <Execution {...{
          options, engine: selectedEngine, setEngine, agents: data.agents, agent: agentId, setAgent: setAgentId, model, setModel, task, setTask, state, busy, running: state === "RUNNING",
          canReview: !!runId && !busy, log, start, cancel, review,
        }} /> : page === "usage" ? <Usage usage={data.usage} heading={<PageHeading title="Custos do projeto">Veja os valores e tokens registrados pelo Gatewright.</PageHeading>} /> : page === "agents" ? <AgentsPage cwd={cwd} cwdRef={cwdRef} catalog={data.skillDetails} agents={data.agents} preview={previewAgent}
          save={(agent) => saveLibrary("agent.save", "agent", agent, "Agente salvo no projeto.")}
          useAgent={(id) => { setAgentId(id); setPage("execution"); }} openSkills={() => setPage("skills")}
          refresh={() => refresh()} />
          : page === "skills" ? <SkillsPage cwd={cwd} cwdRef={cwdRef} catalog={data.skillDetails} save={(skill) => saveLibrary("skill.save", "skill", skill, "Skill salva no projeto.")}
          onNavigateAgent={(id) => { setPage("agents"); }} />
          : <Settings key={cwd} {...{ data, saveProvider, propose, testIntegration, connect }} />}
    </div></main>
    <footer className={`statusbar ${footerNotice.tone}`} role="status">{footerNotice.tone === "success" ? <CircleCheck size={13} aria-hidden="true" /> : <span aria-hidden="true" />}{footerNotice.text}</footer>
    {modal && <Modal modal={modal} notice={notice} onClose={() => setModal(null)} />}
    {questions && <FlowQuestions key={questions.token} data={questions} notice={notice} onAnswer={answer} onStop={cancel} />}
  </div>;
}

createRoot(document.getElementById("root")).render(<App />);
