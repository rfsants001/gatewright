import { useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Database, Wallet } from "lucide-react";

import { HelpDrawer } from "./help.jsx";

export const number = new Intl.NumberFormat("pt-BR");
export const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 4,
});
const compactCurrency = new Intl.NumberFormat("pt-BR", {
  style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 4,
});
const dayLabel = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });
const longDay = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" });
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const formatCost = (amount) => amount == null ? "—" : currency.format(amount);
const modelName = (name) => name === "unknown" ? "Modelo desconhecido" : name;

function dayKey(date) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()].join("-");
}

function seriesFor(dailyUsage, period) {
  const end = new Date();
  const byDay = new Map(dailyUsage.map((day) => [day.day, day]));
  return Array.from({ length: period }, (_, index) => {
    const date = new Date(end.getFullYear(), end.getMonth(), end.getDate() - period + 1 + index);
    const entry = byDay.get(dayKey(date));
    return {
      date,
      cost: entry?.totalCostBrl ?? null,
      records: entry?.count ?? 0,
      unpriced: entry ? entry.count - entry.pricedCount : 0,
    };
  });
}

function chartCeiling(value) {
  if (value <= 0) return 0;
  const base = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / base) * base;
}

export function CostTimeline({ dailyUsage = [], period = 7, controls, compact = false }) {
  const [selectedDay, setSelectedDay] = useState(null);
  const days = seriesFor(dailyUsage, period);
  const priced = days.filter((day) => day.cost != null);
  const total = priced.length ? priced.reduce((sum, day) => sum + day.cost, 0) : null;
  const top = chartCeiling(Math.max(0, ...priced.map((day) => day.cost)));
  const active = days.find(({ date }) => dayKey(date) === selectedDay);
  const withoutCost = days.reduce((sum, day) => sum + day.unpriced, 0);
  function description(day) {
    if (day.cost == null) return day.records ? "Custo indisponível" : "Sem registros";
    return day.unpriced ? `${formatCost(day.cost)} · parcial` : formatCost(day.cost);
  }
  return <section className={`surface cost-panel${compact ? " compact" : ""}`} aria-label="Custo por dia">
    <header className="panel-heading">
      <div><h2>Custo por dia</h2><p>{dayLabel.format(days[0].date)} – {dayLabel.format(days.at(-1).date)}</p></div>
      {controls}
    </header>
    <div className="cost-head">
      <strong className="cost-total">{total == null ? "—" : formatCost(total)}</strong>
      <span>{active ? `${dayLabel.format(active.date)} · ${description(active)}` : "No período"}</span>
    </div>
    {priced.length ? <div className="chart" aria-label="Gráfico de barras. Use Tab para consultar os valores.">
      <div className="chart-ticks" aria-hidden="true">{(top > 0 ? [1, .75, .5, .25, 0] : [0]).map((tick) =>
        <span key={tick}>{compactCurrency.format(top * tick)}</span>)}</div>
      <div className="chart-body">
        <div className="chart-grid" aria-hidden="true">{Array.from({ length: 5 }, (_, index) => <span key={index} />)}</div>
        <div className="chart-bars" onMouseLeave={() => setSelectedDay(null)}>
          {days.map((day) => {
            const key = dayKey(day.date);
            const label = `${longDay.format(day.date)}: ${description(day)}`;
            return <button className={`chart-bar${selectedDay === key ? " is-active" : ""}`} key={key}
              aria-label={label} title={label} type="button"
              onMouseEnter={() => setSelectedDay(key)} onFocus={() => setSelectedDay(key)}
              onBlur={() => setSelectedDay(null)} onClick={() => setSelectedDay(key)}>
              <span aria-hidden="true" className={day.cost == null ? "missing" : ""} style={{ height: top > 0 ? `${(day.cost ?? 0) / top * 100}%` : "0%" }} />
            </button>;
          })}
        </div>
      </div>
      <div className="chart-dates" aria-hidden="true">
        {days.map(({ date }, index) => <span key={dayKey(date)}>{period === 7 || index % 7 === 0 || index === period - 1 ? date.getDate() : ""}</span>)}
      </div>
    </div> : <div className="chart-empty"><Wallet size={19} aria-hidden="true" />
      <p>Sem dados de custo no período.</p>
    </div>}
    <footer className="chart-caption">
      {withoutCost ? `${number.format(withoutCost)} ${withoutCost === 1 ? "registro com custo ausente" : "registros com custo ausente"}.`
        : "Valores reportados ou estimados em reais."}
    </footer>
  </section>;
}

function ModelCosts({ rows, period }) {
  const ranked = [...rows].filter((row) => row.totalCostBrl != null)
    .sort((a, b) => b.totalCostBrl - a.totalCostBrl);
  const top = ranked[0]?.totalCostBrl ?? 0;
  return <section className="surface model-costs">
    <header className="panel-heading"><div><h2>Custo por modelo</h2><p>Últimos {period} dias</p></div></header>
    {ranked.length ? <ol className="model-list">{ranked.slice(0, 6).map((row) => <li key={row.model}>
      <div><span title={modelName(row.model)}>{modelName(row.model)}</span><strong>{formatCost(row.totalCostBrl)}</strong></div>
      <div className="model-track" aria-hidden="true"><span style={{ width: `${top > 0 ? row.totalCostBrl / top * 100 : 0}%` }} /></div>
    </li>)}</ol> : <p className="model-empty">Nenhum modelo com custo registrado.</p>}
  </section>;
}

export function Usage({ usage: initialUsage, heading, cwd, request, openTask }) {
  const [period, setPeriod] = useState(7);
  const [usage, setUsage] = useState(initialUsage), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [dimension, setDimension] = useState("agent"), [filter, setFilter] = useState(null), [detail, setDetail] = useState(null);
  useEffect(() => {
    let live = true; setLoading(true); setError(""); setFilter(null);
    request("usage.get", { cwd, days: period }).then((result) => { if (!live) return; setLoading(false); if (result.ok) setUsage(result.data); else setError(result.error); });
    return () => { live = false; };
  }, [cwd, period, initialUsage]);
  async function inspect(runId) {
    const result = await request("run.detail", { cwd, runId });
    if (result.ok) setDetail(result.data); else setError(result.error);
  }
  const groups = [...(usage?.byAttribution?.[dimension] ?? [])].sort((a, b) => (b.knownSumBrl ?? -1) - (a.knownSumBrl ?? -1));
  const groupTop = groups[0]?.knownSumBrl ?? 0;

  const runs = [...(usage?.byRun ?? [])].sort((a, b) =>
    (b.recordedAt ?? "").localeCompare(a.recordedAt ?? "") || a.runSlug.localeCompare(b.runSlug));
  const models = usage?.byModel ?? [];
  const unpriced = runs.some((run) => run.totalCostBrl == null || run.pricedCount < run.count);
  const costs = runs.some((run) => run.totalCostBrl != null);
  const metrics = [
    ["Custo registrado", costs ? formatCost(usage.totalCostBrl) : "—", Wallet, unpriced && costs ? "Parcial" : ""],
    ["Entrada", number.format(usage?.totalTokensIn ?? 0), ArrowDownLeft, "tokens"],
    ["Saída", number.format(usage?.totalTokensOut ?? 0), ArrowUpRight, "tokens"],
    ["Leitura de cache", number.format(usage?.totalCacheRead ?? 0), Database, "tokens"],
  ];
  return <>
    {heading}
    <div className="cost-toolbar"><span>Período de toda a análise</span><div className="segmented" role="group" aria-label="Período da análise">{[7, 30].map((days) => <button key={days} aria-pressed={period === days} onClick={() => setPeriod(days)}>{days} dias</button>)}</div></div>
    {error && <p role="alert" className="notice">{error}</p>}
    {loading && <p role="status">Atualizando custos…</p>}
    <div aria-busy={loading} className="metrics surface" aria-label="Totais do projeto">
      {metrics.map(([label, value, MetricIcon, note]) => <div className="metric" key={label}>
        <span className="metric-label"><MetricIcon size={14} aria-hidden="true" />{label}</span>
        <div><strong>{value}</strong>{note && <small>{note}</small>}</div>
      </div>)}
    </div>
    {unpriced && <p className="footer-copy" role="status">{runs.filter((run) => run.pricedCount < run.count).length} {runs.filter((run) => run.pricedCount < run.count).length === 1 ? "execução com custo ausente ou parcial" : "execuções com custo ausente ou parcial"}. Valores desconhecidos não entram na soma.</p>}
    <div className="usage-grid">
      <CostTimeline dailyUsage={usage?.byDay} period={period} />
      <ModelCosts rows={models} period={period} />
    </div>
    <section className="section surface attribution-panel">
      <header className="panel-heading"><div><h2>De onde vem o consumo</h2><p>{dimension === "integration" ? "Divisão igual entre integrações habilitadas · não mede chamadas por ferramenta" : "Atribuição registrada no início da tarefa"}</p></div><label>Agrupar por<select aria-label="Agrupar custos por" value={dimension} onChange={(event) => { setDimension(event.target.value); setFilter(null); }}>{[["agent", "Agente"], ["provider", "Provedor"], ["task", "Tarefa"], ["integration", "Integração"]].map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label></header>
      {groups.length ? <div className="attribution-bars">{groups.map((group) => <button key={group.id} aria-pressed={filter?.id === group.id} onClick={() => setFilter(filter?.id === group.id ? null : group)}><span>{group.label}</span><div className="model-track"><span style={{ width: `${groupTop ? (group.knownSumBrl ?? 0) / groupTop * 100 : 0}%` }} /></div><strong>{formatCost(group.knownSumBrl)}{group.unpricedCount > 0 && " · parcial"}</strong></button>)}</div> : <p className="table-empty">Sem medições neste período.</p>}
    </section>
    <section className="section table-panel surface">
      <header className="panel-heading"><div><h2>Execuções recentes</h2><p>{filter ? `Filtro: ${filter.label} · clique no grupo para limpar` : `Execuções com medição nos últimos ${period} dias`}</p></div></header>
      {runs.length ? <div className="table-wrap"><table>
        <thead><tr><th scope="col">Execução</th><th scope="col">Registrada em</th><th scope="col">Modelo</th><th scope="col">Entrada</th><th scope="col">Saída</th><th scope="col">Cache</th><th scope="col">Custo</th></tr></thead>
        <tbody>{runs.filter((run) => !filter || filter.runIds.includes(run.runSlug)).map((run) => <tr key={run.runSlug}>
          <th scope="row"><button className="link-button" onClick={() => inspect(run.runSlug)} title={run.runSlug}>{run.runSlug.length > 18 ? `${run.runSlug.slice(0, 16)}…` : run.runSlug}</button></th>
          <td>{run.recordedAt ? dateTime.format(new Date(run.recordedAt)) : "—"}</td>
          <td>{run.model ? <span title={run.model}>{modelName(run.model)}</span> : <span className="run-model-none">—</span>}</td>
          <td>{number.format(run.totalTokensIn)}</td><td>{number.format(run.totalTokensOut)}</td><td>{number.format(run.totalCacheRead)}</td>
          <td>{formatCost(run.totalCostBrl)}{run.totalCostBrl != null && run.pricedCount < run.count && <small> parcial</small>}</td>
        </tr>)}</tbody>
      </table></div> : <p className="table-empty">As execuções com medição vão aparecer aqui.</p>}
    </section>
    {detail && <HelpDrawer title="Detalhes do consumo" onClose={() => setDetail(null)}>
      <code>{detail.runId}</code><dl className="meta-grid"><div><dt>Agente</dt><dd>{detail.context?.agentId ?? "Sem atribuição"}</dd></div><div><dt>Provedor / ferramenta</dt><dd>{detail.context?.providerId ?? detail.context?.engineId ?? "Sem atribuição"}</dd></div><div><dt>Origem</dt><dd>{detail.context?.attributionSource === "run-start" ? "Registrada no início" : "Histórico sem atribuição explícita"}</dd></div></dl>
      <p>Fonte do custo: {({ reported: "reportado pela ferramenta", estimated: "estimativa da tabela local", unknown: "não informado", mixed: "fontes mistas" })[runs.find((run) => run.runSlug === detail.runId)?.source ?? "unknown"]}.</p>
      <h3>Integrações habilitadas</h3><p>{detail.context?.integrationIds?.join(", ") || "Nenhuma registrada"}</p><p>A presença na configuração não comprova uso durante a tarefa.</p>
      <h3>Memórias recebidas</h3>{detail.context?.memorySnapshot?.items?.length ? detail.context.memorySnapshot.items.map((record) => <article key={record.id}><h4>{record.title} · v{record.version}</h4><pre className="file-preview">{record.body}</pre></article>) : <p>Nenhuma memória selecionada.</p>}
      <button className="primary" onClick={() => { openTask(detail); setDetail(null); }}>Abrir tarefa</button>
    </HelpDrawer>}
  </>;
}
