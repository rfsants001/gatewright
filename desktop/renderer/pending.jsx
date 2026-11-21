import { useEffect, useState } from "react";
import { ChevronRight, CircleCheck, Clock3, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";

const filters = [
  { id: "all", label: "Todas" },
  { id: "reviews", label: "Aprovações" },
  { id: "runs", label: "Retomadas" },
  { id: "connections", label: "Conexões" },
];
const kindGroup = { review: "reviews", "resumable-ask": "reviews", "resumable-run": "runs", "integration-failure": "connections" };
const descriptions = {
  review: "Execução concluída aguardando sua revisão.",
  "resumable-ask": "O fluxo aguarda uma decisão para continuar.",
  "resumable-run": "Confira o ponto de retomada antes de autorizar a execução.",
  "integration-failure": "Confira a operação e os efeitos registrados antes de tentar novamente.",
};

export function PendingPage({ cwd, version, request, onOpen }) {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [opening, setOpening] = useState(null);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError("");
    void request("pending.list", { cwd }).then((result) => {
      if (!current) return;
      if (result.ok) setItems(result.data);
      else setError(result.error || "Não foi possível carregar as pendências.");
      setLoading(false);
    });
    return () => { current = false; };
  }, [cwd, version, reload]);

  const counts = items.reduce((total, item) => {
    total[kindGroup[item.kind]]++;
    return total;
  }, { reviews: 0, runs: 0, connections: 0 });
  const visible = items.filter((item) => filter === "all" || kindGroup[item.kind] === filter);

  async function open(item) {
    setOpening(item.entity);
    setError("");
    try { await onOpen(item); }
    finally { setOpening(null); setReload((value) => value + 1); }
  }

  return <>
    <header className="page-heading"><div><h1>Pendências do projeto</h1><p>Decisões e interrupções que precisam da sua atenção.</p></div>
      <button onClick={() => setReload((value) => value + 1)} disabled={loading}><RefreshCw size={14} aria-hidden="true" />Atualizar</button>
    </header>
    <section className="surface" aria-busy={loading}>
      <header className="panel-heading"><div><h2>Ações pendentes</h2><p>Registros deste projeto</p></div></header>
      <div className="pending-summary" aria-label="Totais de pendências">
        {filters.slice(1).map(({ id, label }) => <div key={id}><span>{label}</span><strong>{loading ? "—" : counts[id]}</strong></div>)}
      </div>
      <nav className="subnav pending-filters" aria-label="Filtrar pendências">
        {filters.map(({ id, label }) => <button key={id} aria-current={filter === id ? "page" : undefined} onClick={() => setFilter(id)}>
          {label}<small>{id === "all" ? items.length : counts[id]}</small>
        </button>)}
      </nav>
      {error && <div className="padded" role="alert"><p className="form-error">{error}</p><button onClick={() => setReload((value) => value + 1)}>Tentar novamente</button></div>}
      {loading ? <p className="table-empty" role="status">Consultando revisões, execuções e integrações…</p>
        : !error && !visible.length ? <div className="pending-empty"><CircleCheck size={24} aria-hidden="true" /><h2>{items.length ? "Nenhuma pendência neste filtro" : "Tudo em dia neste projeto"}</h2>
          <p>{items.length ? "Escolha outro filtro para consultar as ações disponíveis." : "Revisões, retomadas e falhas de instalação aparecem aqui quando precisarem de uma ação."}</p></div>
          : <ul className="pending-list">{visible.map((item) => {
            const Icon = item.kind === "integration-failure" ? TriangleAlert : item.kind === "resumable-run" ? Clock3 : ShieldCheck;
            return <li key={`${item.kind}:${item.entity}:${item.revision}`}>
              <Icon className={item.kind === "integration-failure" ? "error-icon" : "pending-icon"} size={19} aria-hidden="true" />
              <div className="pending-copy"><strong>{item.title}</strong><p>{descriptions[item.kind]}</p><code>{item.entity}</code></div>
              <button disabled={opening !== null} onClick={() => open(item)}>{opening === item.entity ? "Abrindo…" : item.action}<ChevronRight size={14} aria-hidden="true" /></button>
            </li>;
          })}</ul>}
    </section>
    {!loading && <p className="footer-copy pending-count" role="status">{visible.length} {visible.length === 1 ? "pendência exibida" : "pendências exibidas"}</p>}
  </>;
}

export function OperationDetails({ operation: initialOperation, onClose, cwd, request, onChanged }) {
  const [operation, setOperation] = useState(initialOperation), [inspection, setInspection] = useState(null), [error, setError] = useState(""), [working, setWorking] = useState(false), [confirm, setConfirm] = useState(false);
  async function inspect() {
    setWorking(true); setError("");
    const result = await request("integration.operation.inspect", { cwd, operationId: operation.id });
    setWorking(false); if (result.ok) setInspection(result.data); else setError(result.error);
  }
  async function recover(action) {
    setWorking(true); setError("");
    const result = await request("integration.operation.recover", { cwd, operationId: operation.id, action, revision: inspection.revision });
    setWorking(false);
    if (result.ok) { setOperation(result.data); setInspection(null); setConfirm(false); onChanged?.(); } else setError(result.error);
  }

  const labels = { pending: "Pendente", running: "Em andamento", succeeded: "Concluída", failed: "Falhou", partial: "Parcial", reverted: "Recursos removidos / encerrada", unknown: "Verificar estado", skipped: "Ignorada" };
  return <section className="surface operation-details" aria-label="Diagnóstico da operação">
    <header className="panel-heading"><div><h2>Diagnóstico da instalação</h2><p>{operation.recipeKind} · {operation.id}</p></div><button onClick={onClose}>Fechar detalhes</button></header>
    <div className="padded"><dl className="meta-grid"><div><dt>Estado registrado</dt><dd>{labels[operation.status]}</dd></div><div><dt>Última atualização</dt><dd>{new Date(operation.updatedAt).toLocaleString("pt-BR")}</dd></div></dl>
      <ol className="op-steps">{operation.steps.map((step) => <li className="op-step" key={step.id}><div><strong>{step.label}</strong><p>{labels[step.status]}</p>{step.errorCode && <p className="form-error">{step.errorCode}</p>}
        {step.evidence && <dl className="operation-evidence">{Object.entries(step.evidence).map(([key, value]) => <div key={key}><dt>{key}</dt><dd><code>{value}</code></dd></div>)}</dl>}
      </div></li>)}</ol>
      <p>Confira os recursos registrados antes de preparar uma nova instalação.</p>
      {request && <button disabled={working} onClick={inspect}>{working ? "Consultando…" : "Conferir recursos reais"}</button>}
      {error && <p role="alert" className="form-error">{error}</p>}
      {inspection && <div className="section"><h3>{inspection.resource.name}</h3><p>{inspection.resource.detail}</p><p>{inspection.resource.verified ? "Recurso e versão conferidos." : "A instalação ainda não foi confirmada."}</p><div className="actions"><button disabled={working} onClick={() => recover("reconcile")}>Registrar estado verificado</button><button className="danger" disabled={working || !inspection.canCleanup} onClick={() => setConfirm(true)}>Remover recursos desta operação</button></div></div>}
      {confirm && <div className="notice" role="alert"><p>Remover {inspection.resource.name} e o vínculo criado por esta operação? Esta ação apaga o diretório ou contêiner identificado.</p><div className="actions"><button onClick={() => setConfirm(false)}>Manter recurso</button><button className="danger" disabled={working} onClick={() => recover("cleanup")}>Confirmar remoção</button></div></div>}
    </div>
  </section>;
}
