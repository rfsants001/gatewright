import { useEffect, useMemo, useState } from "react";
import { FileCode2, List, Network, RefreshCw, Search } from "lucide-react";
import { ContextHelp, HelpDrawer, helpErrorCode } from "./help.jsx";

export function CodeMapPage({ cwd, request, connect }) {
  const [map, setMap] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [view, setView] = useState("map"),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState(null),
    [file, setFile] = useState(null);
  const [version, setVersion] = useState(0),
    [generating, setGenerating] = useState(false);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    request("projectMap.get", { cwd }).then((result) => {
      if (!live) return;
      setLoading(false);
      if (result.ok) setMap(result.data);
      else setError(result.error);
    });
    return () => {
      live = false;
    };
  }, [cwd, version]);
  const nodes = useMemo(
    () =>
      (map?.nodes ?? []).filter((node) =>
        `${node.name} ${node.path ?? ""} ${node.kind}`
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase()),
      ),
    [map, query],
  );
  const active = map?.nodes.find((node) => node.id === selected),
    links = (map?.links ?? []).filter((link) => link.source === selected || link.target === selected);
  async function generate() {
    setGenerating(true);
    setError("");
    const result = await request("projectMap.refresh", { cwd, generate: true });
    setGenerating(false);
    if (result.ok) setMap(result.data.map);
    else setError(result.error);
  }
  async function open(node, reveal = false) {
    const result = await request("projectMap.openFile", { cwd, path: node.path, reveal });
    if (result.ok) setFile(result.data);
    else setError(result.error);
  }
  const drawn = nodes.slice(0, 160),
    drawnIds = new Set(drawn.map((node) => node.id));
  const positions = new Map(
    drawn.map((node, index) => [node.id, { x: 75 + (index % 4) * 210, y: 45 + Math.floor(index / 4) * 90 }]),
  );
  return (
    <>
      <header className="page-heading">
        <div>
          <span className="eyebrow">ESTRUTURA E IMPACTO</span>
          <h1>Mapa do projeto</h1>
          <p>Explore símbolos, relações e arquivos alterados.</p>
        </div>
        <div className="actions">
          <button disabled={loading || generating} onClick={() => setVersion((value) => value + 1)}>
            <RefreshCw size={14} />
            Atualizar
          </button>
          <button className="primary" disabled={generating} onClick={generate}>
            {generating ? "Indexando…" : "Gerar mapa local"}
          </button>
        </div>
      </header>
      {error && (
        <div className="surface padded" role="alert">
          <p className="inline-error">{error}</p>
          <ContextHelp screenId="map" errorCode={helpErrorCode(error)} />
          <button onClick={connect}>Abrir integrações</button>
        </div>
      )}
      {loading ? (
        <p className="table-empty" role="status">
          Lendo estrutura do código…
        </p>
      ) : !map ? (
        <section className="surface empty">
          <Network size={30} />
          <h2>Veja como o projeto se conecta</h2>
          <p>
            Instale o Graphify em Integrações e gere um mapa. A indexação de código é local e não usa um
            modelo de IA.
          </p>
          <button onClick={connect}>Configurar Graphify</button>
        </section>
      ) : (
        <>
          <div className="map-status">
            <span>
              {map.nodes.length} de {map.totalNodes} símbolos
            </span>
            <span>{map.links.length} relações</span>
            <span>Graphify {map.graphifyVersion ?? "legado"}</span>
            <span>Indexado em {new Date(map.indexedAt).toLocaleString("pt-BR")}</span>
            <span className={`badge ${map.stale ? "warning" : "success"}`}>
              {map.stale ? "Reindexação recomendada" : "Mapa disponível"}
            </span>
          </div>
          {map.warning && (
            <p role="status" className="notice">
              {map.warning}
            </p>
          )}
          {map.truncated && (
            <p className="notice">
              A visualização foi limitada para manter a navegação rápida. Refine o escopo no Graphify.
            </p>
          )}
          <div className="map-layout" aria-busy={generating}>
            <section className="surface map-panel">
              <div className="panel-heading">
                <label className="search-field">
                  <Search size={14} />
                  <input
                    aria-label="Buscar símbolo ou arquivo"
                    placeholder="Buscar símbolo ou arquivo"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                <div className="segmented" role="group" aria-label="Visualização do mapa">
                  <button aria-pressed={view === "map"} onClick={() => setView("map")}>
                    <Network size={14} />
                    Mapa
                  </button>
                  <button aria-pressed={view === "list"} onClick={() => setView("list")}>
                    <List size={14} />
                    Lista
                  </button>
                </div>
              </div>
              {!nodes.length ? (
                <p className="table-empty">Nenhum símbolo encontrado. Tente outro termo.</p>
              ) : view === "list" ? (
                <div className="map-list" role="list" aria-label="Símbolos do projeto">
                  {nodes.map((node) => (
                    <button
                      key={node.id}
                      aria-pressed={selected === node.id}
                      onClick={() => setSelected(node.id)}
                    >
                      <FileCode2 size={14} />
                      <span>
                        <strong>{node.name}</strong>
                        <small>{node.path ?? "Sem arquivo associado"}</small>
                      </span>
                      <span className="badge">{node.changed ? "Alterado" : node.kind}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div
                  className="map-viewport"
                  tabIndex={0}
                  aria-label="Mapa de relações. Use Tab para selecionar símbolos ou alterne para Lista."
                >
                  <div
                    className="map-canvas"
                    style={{ height: Math.max(400, Math.ceil(drawn.length / 4) * 90 + 30) }}
                  >
                    <svg aria-hidden="true" width="860" height="100%">
                      {map.links
                        .filter((link) => drawnIds.has(link.source) && drawnIds.has(link.target))
                        .slice(0, 1200)
                        .map((link, index) => {
                          const a = positions.get(link.source),
                            b = positions.get(link.target);
                          return (
                            <path
                              key={index}
                              d={`M${a.x + 70} ${a.y + 20} C${a.x + 110} ${a.y + 20},${b.x - 20} ${b.y + 20},${b.x + 70} ${b.y + 20}`}
                              className={link.source === selected || link.target === selected ? "active" : ""}
                            />
                          );
                        })}
                    </svg>
                    {drawn.map((node) => {
                      const position = positions.get(node.id);
                      return (
                        <button
                          className={`map-node${node.changed ? " changed" : ""}`}
                          key={node.id}
                          style={{ left: position.x, top: position.y }}
                          aria-pressed={selected === node.id}
                          onClick={() => setSelected(node.id)}
                          title={`${node.name} · ${node.path ?? node.kind}`}
                        >
                          <FileCode2 size={14} />
                          <span>
                            {node.name}
                            <small>{node.kind}</small>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {nodes.length > drawn.length && (
                    <p className="padded">
                      O mapa mostra 160 símbolos por vez. Busque ou use a lista para acessar todos.
                    </p>
                  )}
                </div>
              )}
            </section>
            <aside className="surface padded map-detail">
              <h2>{active ? active.name : "Inspecionar símbolo"}</h2>
              {active ? (
                <>
                  <span className="badge">{active.kind}</span>
                  <p className="path-value">{active.path ?? "Sem caminho local"}</p>
                  {active.changed && <p className="notice">Alteração Git: {active.changed}</p>}
                  {active.path && <button onClick={() => open(active)}>Ver arquivo e diff</button>}
                  <h3>Relações · {links.length}</h3>
                  <ul>
                    {links.slice(0, 100).map((link, index) => {
                      const other = map.nodes.find(
                        (node) => node.id === (link.source === selected ? link.target : link.source),
                      );
                      return (
                        <li key={index}>
                          <small>
                            {link.source === selected ? "→" : "←"} {link.relation}
                          </small>
                          <button onClick={() => setSelected(other.id)}>{other.name}</button>
                        </li>
                      );
                    })}
                  </ul>
                  {links.length > 100 && <p>Primeiras 100 relações exibidas.</p>}
                </>
              ) : (
                <p>Selecione um item no mapa ou na lista para ver dependências e o diff atual.</p>
              )}
            </aside>
          </div>
        </>
      )}
      {file && (
        <HelpDrawer title={file.path} onClose={() => setFile(null)}>
          <div className="actions">
            <button onClick={() => open({ path: file.path }, true)}>Localizar no sistema</button>
          </div>
          <h3>Diff atual</h3>
          <pre className="file-preview">{file.diff || "Sem diff rastreado para este arquivo."}</pre>
          <h3>Conteúdo</h3>
          <pre className="file-preview">{file.content}</pre>
        </HelpDrawer>
      )}
    </>
  );
}
