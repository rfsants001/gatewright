import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Database, Wallet } from "lucide-react";

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

function ModelCosts({ rows }) {
  const ranked = [...rows].filter((row) => row.totalCostBrl != null)
    .sort((a, b) => b.totalCostBrl - a.totalCostBrl);
  const top = ranked[0]?.totalCostBrl ?? 0;
  return <section className="surface model-costs">
    <header className="panel-heading"><div><h2>Custo por modelo</h2><p>Todo o histórico do projeto</p></div></header>
    {ranked.length ? <ol className="model-list">{ranked.slice(0, 6).map((row) => <li key={row.model}>
      <div><span title={modelName(row.model)}>{modelName(row.model)}</span><strong>{formatCost(row.totalCostBrl)}</strong></div>
      <div className="model-track" aria-hidden="true"><span style={{ width: `${top > 0 ? row.totalCostBrl / top * 100 : 0}%` }} /></div>
    </li>)}</ol> : <p className="model-empty">Nenhum modelo com custo registrado.</p>}
  </section>;
}

export function Usage({ usage, heading }) {
  const [period, setPeriod] = useState(7);
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
    <div className="metrics surface" aria-label="Totais do projeto">
      {metrics.map(([label, value, MetricIcon, note]) => <div className="metric" key={label}>
        <span className="metric-label"><MetricIcon size={14} aria-hidden="true" />{label}</span>
        <div><strong>{value}</strong>{note && <small>{note}</small>}</div>
      </div>)}
    </div>
    <div className="usage-grid">
      <CostTimeline dailyUsage={usage?.byDay} period={period} controls={<div className="segmented" role="group" aria-label="Período do gráfico">
        {[7, 30].map((days) => <button key={days} aria-pressed={period === days} onClick={() => setPeriod(days)}>{days} dias</button>)}
      </div>} />
      <ModelCosts rows={models} />
    </div>
    <section className="section table-panel surface">
      <header className="panel-heading"><div><h2>Execuções recentes</h2><p>Execuções com tokens ou custo registrados</p></div></header>
      {runs.length ? <div className="table-wrap"><table>
        <thead><tr><th scope="col">Execução</th><th scope="col">Registrada em</th><th scope="col">Entrada</th><th scope="col">Saída</th><th scope="col">Cache</th><th scope="col">Custo</th></tr></thead>
        <tbody>{runs.slice(0, 10).map((run) => <tr key={run.runSlug}>
          <th scope="row"><code title={run.runSlug}>{run.runSlug.length > 18 ? `${run.runSlug.slice(0, 16)}…` : run.runSlug}</code></th>
          <td>{run.recordedAt ? dateTime.format(new Date(run.recordedAt)) : "—"}</td>
          <td>{number.format(run.totalTokensIn)}</td><td>{number.format(run.totalTokensOut)}</td><td>{number.format(run.totalCacheRead)}</td>
          <td>{formatCost(run.totalCostBrl)}{run.totalCostBrl != null && run.pricedCount < run.count && <small> parcial</small>}</td>
        </tr>)}</tbody>
      </table></div> : <p className="table-empty">As execuções com medição vão aparecer aqui.</p>}
    </section>
  </>;
}
