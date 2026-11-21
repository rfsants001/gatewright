import { useEffect, useState } from "react";
import { BookOpen, Plus, Search, SquarePen, Trash2 } from "lucide-react";
import { ContextHelp, HelpDrawer, helpErrorCode } from "./help.jsx";

const scopes = { project: "Projeto", user: "Pessoal", run: "Tarefa" };
const types = { decision: "Decisão", preference: "Preferência", learning: "Aprendizado" };
const ref = ({ id, scope, version }) => ({ id, scope, version });

function MemoryEditor({ record, agents, request, cwd, onClose, onSaved }) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [scope, setScope] = useState(record?.scope ?? "project");
  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const result = await request("memory.upsert", {
      cwd,
      record: {
        ...(record ? { id: record.id, version: record.version } : { version: 0 }),
        scope,
        ...(scope === "run" ? { runId: form.get("runId") } : {}),
        title: form.get("title"),
        body: form.get("body"),
        type: form.get("type"),
        origin: record?.origin ?? "human",
        recipients: form.getAll("recipients"),
      },
    });
    setSaving(false);
    if (result.ok) onSaved();
    else setError(result.error);
  }
  return (
    <HelpDrawer title={record ? "Editar memória" : "Guardar contexto"} onClose={onClose}>
      <form className="form-panel" onSubmit={save} aria-busy={saving}>
        <p>Salve uma decisão revisada. Você escolhe quando enviá-la à IA.</p>
        <label>
          Título
          <input autoFocus name="title" required maxLength={160} defaultValue={record?.title} />
        </label>
        <div className="form-grid">
          <label>
            Escopo
            <select
              name="scope"
              value={scope}
              disabled={!!record}
              onChange={(event) => setScope(event.target.value)}
            >
              {Object.entries(scopes).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tipo
            <select name="type" defaultValue={record?.type ?? "decision"}>
              {Object.entries(types).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {scope === "run" && (
          <label>
            ID da execução
            <input name="runId" required defaultValue={record?.runId} placeholder="run-…" />
          </label>
        )}
        <label>
          Conteúdo
          <textarea name="body" rows={9} required maxLength={16000} defaultValue={record?.body} />
        </label>
        <fieldset>
          <legend>Disponível para</legend>
          <p>Sem seleção: qualquer agente deste projeto.</p>
          {agents.map((agent) => (
            <label className="check-line" key={agent.id}>
              <input
                type="checkbox"
                name="recipients"
                value={agent.id}
                defaultChecked={record?.recipients.includes(agent.id)}
              />
              {agent.name}
            </label>
          ))}
        </fieldset>
        {scope === "user" && (
          <p className="notice">
            Memória pessoal: ficará disponível para seleção explícita em outros projetos.
          </p>
        )}
        {error && (
          <div role="alert">
            <p className="inline-error">{error}</p>
            <ContextHelp screenId="memory" action="Salvar memória" errorCode={helpErrorCode(error)} />
          </div>
        )}
        <button className="primary" disabled={saving}>
          {saving ? "Salvando…" : "Salvar memória"}
        </button>
      </form>
    </HelpDrawer>
  );
}

export function MemoryPage({ cwd, request, agents }) {
  const [rows, setRows] = useState([]),
    [scope, setScope] = useState("project"),
    [query, setQuery] = useState("");
  const [includeUser, setIncludeUser] = useState(false),
    [runId, setRunId] = useState("");
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [editing, setEditing] = useState(undefined),
    [deleting, setDeleting] = useState(null),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    request("memory.list", { cwd, includeUser, ...(runId ? { runId } : {}) }).then((result) => {
      if (!live) return;
      setLoading(false);
      if (result.ok) setRows(result.data);
      else setError(result.error);
    });
    return () => {
      live = false;
    };
  }, [cwd, includeUser, runId, version]);
  const visible = rows.filter(
    (row) =>
      row.scope === scope &&
      `${row.title} ${row.body}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  async function remove() {
    const result = await request("memory.delete", { cwd, ref: ref(deleting) });
    if (result.ok) {
      setDeleting(null);
      setVersion((value) => value + 1);
    } else setError(result.error);
  }
  return (
    <>
      <header className="page-heading">
        <div>
          <span className="eyebrow">CONTEXTO SOB SEU CONTROLE</span>
          <h1>Memória do trabalho</h1>
          <p>Decisões úteis, com origem, alcance e versão.</p>
        </div>
        <div className="actions">
          <button className="primary" onClick={() => setEditing(null)}>
            <Plus size={14} />
            Nova memória
          </button>
        </div>
      </header>
      <div className="memory-layout" aria-busy={loading}>
        <aside className="surface padded">
          <h2>Onde vale</h2>
          <nav className="scope-nav" aria-label="Escopo da memória">
            {Object.entries(scopes).map(([id, label]) => (
              <button key={id} aria-pressed={scope === id} onClick={() => setScope(id)}>
                {label}
                <span>{rows.filter((row) => row.scope === id).length}</span>
              </button>
            ))}
          </nav>
          <label className="check-line">
            <input
              type="checkbox"
              checked={includeUser}
              onChange={(event) => setIncludeUser(event.target.checked)}
            />
            Mostrar memórias pessoais
          </label>
          {scope === "run" && (
            <label>
              ID da execução
              <input value={runId} onChange={(event) => setRunId(event.target.value)} placeholder="run-…" />
            </label>
          )}
          <p className="muted">Nada é enviado automaticamente. Selecione o contexto ao preparar a tarefa.</p>
        </aside>
        <section className="surface table-panel">
          <div className="panel-heading">
            <label className="search-field">
              <Search size={14} />
              <input
                aria-label="Buscar memória"
                placeholder="Buscar decisão ou conteúdo"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <span>
              {visible.length} {visible.length === 1 ? "registro" : "registros"}
            </span>
          </div>
          {error ? (
            <div className="padded" role="alert">
              <p>{error}</p>
              <button onClick={() => setVersion((value) => value + 1)}>Tentar novamente</button>
            </div>
          ) : loading ? (
            <p className="table-empty">Carregando memórias…</p>
          ) : visible.length ? (
            <div className="memory-rows">
              {visible.map((row) => (
                <article className="memory-row" key={row.id}>
                  <BookOpen size={17} />
                  <div>
                    <div className="actions">
                      <h3>{row.title}</h3>
                      <span className="badge">v{row.version}</span>
                    </div>
                    <p className="memory-body">{row.body}</p>
                    <small>
                      Atualizada em {new Date(row.updatedAt).toLocaleString("pt-BR")} · {types[row.type]} ·{" "}
                      {row.origin === "human" ? "Revisada por você" : "Sugestão de IA revisada"} ·{" "}
                      {row.recipients.length
                        ? row.recipients
                            .map((id) => agents.find((agent) => agent.id === id)?.name ?? id)
                            .join(", ")
                        : "Todos os agentes"}
                    </small>
                  </div>
                  <div className="actions">
                    <button
                      className="icon-button"
                      aria-label={`Editar ${row.title}`}
                      onClick={() => setEditing(row)}
                    >
                      <SquarePen size={15} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Excluir ${row.title}`}
                      onClick={() => setDeleting(row)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="table-empty">
              <BookOpen size={24} />
              <h2>
                {query
                  ? "Nenhuma memória encontrada"
                  : scope === "user" && !includeUser
                    ? "Suas memórias pessoais estão ocultas"
                    : scope === "run" && !runId
                      ? "Escolha uma execução"
                      : "Ainda sem contexto guardado"}
              </h2>
              <p>
                {query
                  ? "Tente outro termo ou escopo."
                  : "Registre uma decisão para reutilizar nas próximas tarefas."}
              </p>
            </div>
          )}
        </section>
      </div>
      {editing !== undefined && (
        <MemoryEditor
          record={editing}
          agents={agents}
          request={request}
          cwd={cwd}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            setVersion((value) => value + 1);
          }}
        />
      )}
      {deleting && (
        <HelpDrawer title="Excluir esta memória?" onClose={() => setDeleting(null)}>
          <p>
            “{deleting.title}” deixará de aparecer nas novas seleções. Tarefas anteriores preservam a versão
            recebida.
          </p>
          {error && <p role="alert">{error}</p>}
          <div className="actions">
            <button onClick={() => setDeleting(null)}>Manter memória</button>
            <button className="danger" onClick={remove}>
              Confirmar exclusão
            </button>
          </div>
        </HelpDrawer>
      )}
    </>
  );
}

export function MemoryPicker({ cwd, request, agentId, selected, onChange, disabled }) {
  const [rows, setRows] = useState([]),
    [personal, setPersonal] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    request("memory.list", { cwd, includeUser: personal }).then((result) => {
      if (!live) return;
      if (result.ok) {
        setRows(result.data);
        setError("");
      } else setError(result.error);
    });
    return () => {
      live = false;
    };
  }, [cwd, personal]);
  const eligible = rows.filter((row) => !row.recipients.length || row.recipients.includes(agentId));
  return (
    <details className="context-picker">
      <summary>
        Contexto da tarefa <span>{selected.length} selecionadas</span>
      </summary>
      <p>A versão selecionada fica registrada no histórico.</p>
      <label className="check-line">
        <input
          type="checkbox"
          checked={personal}
          disabled={disabled}
          onChange={(event) => {
            setPersonal(event.target.checked);
            if (!event.target.checked) onChange(selected.filter((item) => item.scope !== "user"));
          }}
        />
        Incluir memórias pessoais na lista
      </label>
      {error && <p role="alert">{error}</p>}
      {!eligible.length && <p>Nenhuma memória disponível para este agente.</p>}
      {eligible.map((row) => (
        <label key={`${row.scope}:${row.id}`} className="check-line">
          <input
            type="checkbox"
            disabled={disabled}
            checked={selected.some((item) => item.id === row.id && item.scope === row.scope)}
            onChange={(event) =>
              onChange(
                event.target.checked
                  ? [...selected, ref(row)]
                  : selected.filter((item) => !(item.id === row.id && item.scope === row.scope)),
              )
            }
          />
          <span>
            {row.title}
            <small>
              {" "}
              · {scopes[row.scope]} · v{row.version}
            </small>
          </span>
        </label>
      ))}
    </details>
  );
}
