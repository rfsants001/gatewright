import { useEffect, useState } from "react";
import { HelpDrawer } from "./help.jsx";

export function TaskHistory({ cwd, request, version, openTask }) {
  const [rows, setRows] = useState([]),
    [detail, setDetail] = useState(null),
    [error, setError] = useState(""),
    [limit, setLimit] = useState(10);
  useEffect(() => {
    let live = true;
    request("run.list", { cwd }).then((result) => {
      if (!live) return;
      if (result.ok) {
        setRows(result.data);
        setError("");
      } else setError(result.error);
    });
    return () => {
      live = false;
    };
  }, [cwd, version]);
  async function inspect(runId) {
    const result = await request("run.detail", { cwd, runId });
    if (result.ok) setDetail(result.data);
    else setError(result.error);
  }
  return (
    <section className="section surface table-panel">
      <header className="panel-heading">
        <div>
          <h2>Histórico do projeto</h2>
          <p>Contexto e resultados persistem mesmo sem medição de custo.</p>
        </div>
      </header>
      {error && (
        <p className="padded" role="alert">
          {error}
        </p>
      )}
      {rows.length ? (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Histórico de tarefas">
          <table>
            <thead>
              <tr>
                <th>Tarefa</th>
                <th>Iniciada</th>
                <th>Estado</th>
                <th>Contexto</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, limit).map((row) => (
                <tr key={row.runId}>
                  <th>{row.title}</th>
                  <td>{new Date(row.at).toLocaleString("pt-BR")}</td>
                  <td>
                    {{
                      PASSED: "Concluída",
                      FAILED: "Falhou",
                      CANCELLED: "Cancelada",
                      RUNNING: "Execução registrada",
                      IDLE: "Registrada",
                      PAUSED: "Pausada",
                    }[row.state] ?? row.state}
                  </td>
                  <td>
                    {row.agentId ?? "Sem agente"} · {row.memories} memórias
                  </td>
                  <td>
                    <button onClick={() => inspect(row.runId)}>Ver tarefa</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="table-empty">Seu histórico aparece após a primeira execução.</p>
      )}
      {rows.length > limit && (
        <div className="panel-actions">
          <button onClick={() => setLimit((value) => value + 20)}>Mostrar mais tarefas</button>
        </div>
      )}
      {detail && (
        <HelpDrawer title="Contexto registrado da tarefa" onClose={() => setDetail(null)}>
          <code>{detail.runId}</code>
          <h3>Objetivo</h3>
          <p>{detail.context?.prompt ?? "Objetivo não registrado nesta versão."}</p>
          <h3>Memórias recebidas</h3>
          {detail.context?.memorySnapshot?.items?.length ? (
            detail.context.memorySnapshot.items.map((record) => (
              <article key={record.id}>
                <h4>
                  {record.title} · v{record.version}
                </h4>
                <pre className="file-preview">{record.body}</pre>
              </article>
            ))
          ) : (
            <p>Nenhuma memória registrada.</p>
          )}
          <details>
            <summary>Instruções do agente</summary>
            <pre className="file-preview">
              {detail.context?.systemPrompt ?? "Sem instruções registradas."}
            </pre>
          </details>
          <div className="actions">
            <button
              className="primary"
              onClick={() => {
                openTask(detail);
                setDetail(null);
              }}
            >
              Abrir tarefa
            </button>
          </div>
        </HelpDrawer>
      )}
    </section>
  );
}
