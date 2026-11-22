import { useEffect, useRef, useState } from "react";
import {
  ArrowDown, ArrowRight, ArrowUp, CircleHelp, FileText, Layers, Play, Plus, Search,
  SquarePen, TriangleAlert, X,
} from "lucide-react";

import { HelpDrawer } from "./help.jsx";

const gate = window.gatewright;

// ── Helpers ───────────────────────────────────────────────────────────────────

function identifier(label) {
  return label.normalize("NFD").replace(/\p{Mark}/gu, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^[^a-z]+|-+$/g, "").slice(0, 48).replace(/-+$/, "");
}

async function bridgeRequest(method, params) {
  try {
    const reply = await gate.request(method, params);
    if (reply.error) throw new Error(reply.error);
    return { ok: true, data: reply.result };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

// ── HelpDrawer ────────────────────────────────────────────────────────────────

// ── AgentEditDrawer ───────────────────────────────────────────────────────────

function AgentEditDrawer({ agent, catalog, cwd, cwdRef, onClose, onSaved }) {
  const panelRef = useRef(null);
  const triggerEl = useRef(typeof document !== "undefined" ? document.activeElement : null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isNew = !agent;
  const initialSkills = useRef(agent?.skills ?? []);
  const [selected, setSelected] = useState(initialSkills.current);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const focusable = [...panel.querySelectorAll('button,input,textarea,select,[tabindex="0"]')]
      .filter((n) => !n.disabled);
    if (focusable.length) focusable[0].focus();

    function onKey(event) {
      if (event.key === "Escape") { onClose(); return; }
      if (event.key !== "Tab") return;
      const nodes = [...panel.querySelectorAll('button,input,textarea,select,[tabindex="0"]')]
        .filter((n) => !n.disabled);
      if (!nodes.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      triggerEl.current?.focus();
    };
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (!cwd) return;
    setError("");
    const fields = new FormData(event.currentTarget);
    const name = fields.get("name").trim();
    const profile = {
      id: agent?.id || identifier(name),
      name,
      goal: fields.get("goal").trim(),
      skills: selected,
    };
    const resp = fields.get("responsibilities").trim();
    const inp = fields.get("expectedInput").trim();
    const outp = fields.get("expectedOutput").trim();
    const bounds = fields.get("boundaries").trim();
    if (resp) profile.responsibilities = resp;
    if (inp) profile.expectedInput = inp;
    if (outp) profile.expectedOutput = outp;
    if (bounds) profile.boundaries = bounds;

    setSaving(true);
    const method = isNew ? "agent.save" : "agent.update";
    const result = await bridgeRequest(method, { cwd, agent: profile });
    if (cwdRef.current !== cwd) { setSaving(false); return; }
    if (result.ok) {
      onSaved(profile);
    } else {
      setError(result.error || "Erro ao salvar.");
    }
    setSaving(false);
  }

  return <div className="aside-overlay" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="drawer" role="dialog" aria-modal="true"
      aria-labelledby="agent-edit-title" ref={panelRef}>
      <header>
        <h2 id="agent-edit-title">{isNew ? "Novo perfil" : "Editar perfil"}</h2>
        <button className="icon-button" aria-label="Fechar painel" onClick={onClose}><X size={18} /></button>
      </header>
      <div className="drawer-content">
        <form onSubmit={submit}>
          <div style={{ display: "grid", gap: "10px" }}>
            <label style={{ display: "grid", gap: "4px", fontSize: "12px", fontWeight: "560" }}>
              Nome<input name="name" required maxLength={70} defaultValue={agent?.name ?? ""}
                placeholder="Revisor de API" disabled={saving} />
            </label>
            <label style={{ display: "grid", gap: "4px", fontSize: "12px", fontWeight: "560" }}>
              Objetivo<textarea name="goal" required maxLength={1000} rows={2}
                defaultValue={agent?.goal ?? ""} disabled={saving}
                placeholder="Descreva o objetivo do agente." />
            </label>
            <label style={{ display: "grid", gap: "4px", fontSize: "12px", fontWeight: "560" }}>
              Responsabilidades<textarea name="responsibilities" maxLength={1000} rows={3}
                defaultValue={agent?.responsibilities ?? ""} disabled={saving}
                placeholder="Descreva as responsabilidades." />
            </label>
            <label style={{ display: "grid", gap: "4px", fontSize: "12px", fontWeight: "560" }}>
              Entrada esperada<textarea name="expectedInput" maxLength={1000} rows={2}
                defaultValue={agent?.expectedInput ?? ""} disabled={saving} />
            </label>
            <label style={{ display: "grid", gap: "4px", fontSize: "12px", fontWeight: "560" }}>
              Resultado esperado<textarea name="expectedOutput" maxLength={1000} rows={2}
                defaultValue={agent?.expectedOutput ?? ""} disabled={saving} />
            </label>
            <label style={{ display: "grid", gap: "4px", fontSize: "12px", fontWeight: "560" }}>
              Limites de atuação<textarea name="boundaries" maxLength={1000} rows={2}
                defaultValue={agent?.boundaries ?? ""} disabled={saving} />
            </label>
          </div>
          <fieldset className="skill-picker" disabled={saving} style={{ marginTop: "12px" }}>
            <legend>Skills</legend>
            <p>As instruções seguem a ordem da seleção.</p>
            {catalog.map((skill) => <label className="check" key={skill.name}>
              <input type="checkbox" checked={selected.includes(skill.name)}
                disabled={!selected.includes(skill.name) && selected.length >= 12}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setSelected(checked
                    ? [...selected, skill.name]
                    : selected.filter((s) => s !== skill.name));
                }} />
              <span>{skill.name}</span>
              {selected.includes(skill.name) && <small aria-label="Ordem">{selected.indexOf(skill.name) + 1}</small>}
            </label>)}
          </fieldset>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="actions" style={{ marginTop: "14px" }}>
            <button className="primary" type="submit" disabled={saving || selected.length === 0}>
              {saving ? "Salvando…" : (isNew ? "Criar agente" : "Salvar alterações")}
            </button>
            <button type="button" onClick={onClose} disabled={saving}>Cancelar</button>
          </div>
        </form>
      </div>
    </section>
  </div>;
}

// ── SkillsPage ────────────────────────────────────────────────────────────────

export function SkillsPage({ cwd, cwdRef, catalog, save, onNavigateAgent }) {
  const [skills, setSkills] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [origin, setOrigin] = useState("");
  const [chosen, setChosen] = useState(null);
  const [detail, setDetail] = useState(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const helpBtnRef = useRef(null);

  async function fetchSkills(currentCwd, q, cat, orig) {
    if (!currentCwd) return;
    setLoading(true);
    const params = { cwd: currentCwd };
    if (q) params.query = q;
    if (cat) params.category = cat;
    if (orig) params.origin = orig;
    const result = await bridgeRequest("skills.list", params);
    if (cwdRef.current !== currentCwd) { setLoading(false); return; }
    if (result.ok) {
      const list = result.data.skills ?? [];
      setSkills(list);
      setCategories(result.data.categories ?? []);
      setChosen((prev) => {
        if (!list.length) return null;
        return list.find((s) => s.name === prev?.name) ?? list[0];
      });
    }
    setLoading(false);
  }

  useEffect(() => {
    setQuery(""); setCategory(""); setOrigin("");
    fetchSkills(cwd, "", "", "");
  }, [cwd]);

  // Fetch the full detail (body + optional fields) for the chosen skill; the list
  // rows carry only the summary. Guarded against a project switch mid-flight.
  useEffect(() => {
    const name = chosen?.name;
    if (!cwd || !name) { setDetail(null); return; }
    let live = true;
    (async () => {
      const result = await bridgeRequest("skills.detail", { cwd, name });
      if (!live || cwdRef.current !== cwd) return;
      setDetail(result.ok ? result.data : null);
    })();
    return () => { live = false; };
  }, [cwd, chosen?.name]);

  function applyFilters(q, cat, orig) {
    setQuery(q); setCategory(cat); setOrigin(orig);
    fetchSkills(cwd, q, cat, orig);
  }

  function clearFilters() { applyFilters("", "", ""); }

  const originLabel = { bundled: "Gatewright", project: "Projeto" };

  return <>
    <header className="page-heading">
      <div><h1>Biblioteca de skills</h1>
        <p>Encontre um playbook e confira quais agentes usam suas instruções.</p>
      </div>
      <div className="inline-actions">
        <button ref={helpBtnRef} className="icon-button" aria-label="Ajuda da biblioteca de skills"
          title="Ajuda" onClick={() => setHelpOpen(true)}><CircleHelp size={17} /></button>
      </div>
    </header>

    <div className="lib-toolbar" role="search" aria-label="Filtrar skills">
      <label className="lib-search">
        <Search size={15} aria-hidden="true" />
        <span className="sr-only">Buscar skill</span>
        <input type="search" value={query} placeholder="Buscar skill"
          onChange={(event) => applyFilters(event.target.value, category, origin)} />
      </label>
      <select aria-label="Categoria da skill" value={category}
        onChange={(event) => applyFilters(query, event.target.value, origin)}>
        <option value="">Todas as categorias</option>
        {categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
      </select>
      <select aria-label="Origem da skill" value={origin}
        onChange={(event) => applyFilters(query, category, event.target.value)}>
        <option value="">Todos</option>
        <option value="bundled">Gatewright</option>
        <option value="project">Projeto</option>
      </select>
      <span className="lib-count" aria-live="polite">
        {skills.length} skill{skills.length !== 1 ? "s" : ""}
      </span>
      {(query || category || origin) && <button onClick={clearFilters}>Limpar filtros</button>}
    </div>

    <div className="lib-split">
      <section className="surface">
        <header className="panel-heading"><h2>Skills disponíveis</h2></header>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Biblioteca de skills" aria-busy={loading ? "true" : "false"}>
          {skills.length > 0
            ? <table>
              <thead><tr>
                <th scope="col">Nome</th>
                <th scope="col">Categoria</th>
                <th scope="col">Origem</th>
                <th scope="col">Agentes</th>
                <th scope="col"><span className="sr-only">Abrir</span></th>
              </tr></thead>
              <tbody>{skills.map((skill) => <tr key={skill.name}
                style={chosen?.name === skill.name ? { background: "var(--selected)" } : undefined}>
                <th scope="row">
                  <button className="table-action"
                    style={{ justifyContent: "flex-start", fontWeight: "inherit", width: "100%" }}
                    onClick={() => setChosen(skill)}
                    aria-pressed={chosen?.name === skill.name}>
                    <div className="row-title">
                      <FileText size={15} aria-hidden="true" />
                      <div>
                        <strong>
                          {skill.name}
                          {skill.invalid && <span className="lib-warn" aria-label=" skill inválida">
                            {" "}<TriangleAlert size={12} aria-hidden="true" />
                          </span>}
                        </strong>
                        {skill.description && <small>{skill.description}</small>}
                      </div>
                    </div>
                  </button>
                </th>
                <td>{skill.category || "—"}</td>
                <td><span className="soft-pill">{originLabel[skill.origin] ?? skill.origin}</span></td>
                <td>{skill.dependents?.length ?? 0}</td>
                <td>
                  <button className="table-action icon-button" aria-label={`Abrir ${skill.name}`}
                    onClick={() => setChosen(skill)}>
                    <ArrowRight size={14} aria-hidden="true" />
                  </button>
                </td>
              </tr>)}</tbody>
            </table>
            : loading
              ? <p className="table-empty" role="status">Carregando skills…</p>
              : <div className="padded">
                <p>Sem skills com estes filtros.</p>
                {(query || category || origin) && <button
                  style={{ marginTop: "8px", border: 0, background: "transparent", color: "var(--accent)", padding: 0, minHeight: "auto", fontSize: "12px" }}
                  onClick={clearFilters}>Limpar filtros</button>}
              </div>}
        </div>
      </section>

      {chosen
        ? <section className="surface">
          <header className="panel-heading">
            <div>
              <h2>
                {chosen.name}
                {chosen.invalid && <span className="lib-warn" style={{ marginLeft: "7px" }} aria-label=" skill inválida">
                  <TriangleAlert size={13} aria-hidden="true" />
                </span>}
              </h2>
              {chosen.category && <p>{chosen.category}</p>}
            </div>
            <span className="soft-pill">{originLabel[chosen.origin] ?? chosen.origin}</span>
          </header>
          {chosen.description && <div className="padded"><p>{chosen.description}</p></div>}
          {detail?.name === chosen.name && <>
            {detail.responsibilities && <div className="detail-section"><h3>Responsabilidades</h3><p>{detail.responsibilities}</p></div>}
            {detail.expectedInput && <div className="detail-section"><h3>Entrada esperada</h3><p>{detail.expectedInput}</p></div>}
            {detail.expectedOutput && <div className="detail-section"><h3>Saída esperada</h3><p>{detail.expectedOutput}</p></div>}
            {detail.boundaries && <div className="detail-section"><h3>Limites</h3><p>{detail.boundaries}</p></div>}
            {detail.body && <div className="detail-section detail-body">
              <h3>Instruções</h3>
              <pre>{detail.body}</pre>
            </div>}
          </>}
          {chosen.dependents?.length > 0 && <div className="detail-section">
            <h3>Usada por</h3>
            <div className="inline-actions">
              {chosen.dependents.map((agentId) => <button key={agentId}
                onClick={() => onNavigateAgent && onNavigateAgent(agentId)}>
                {agentId}<ArrowRight size={13} aria-hidden="true" />
              </button>)}
            </div>
          </div>}
          {chosen.invalid && <div className="detail-section">
            <p className="lib-warn">
              <TriangleAlert size={13} aria-hidden="true" />
              Esta skill tem um problema de validação.
            </p>
          </div>}
        </section>
        : !loading && <section className="surface">
          <div className="padded"><p>Selecione uma skill para ver os detalhes.</p></div>
        </section>}
    </div>

    {helpOpen && <HelpDrawer title="Ajuda da biblioteca de skills"
      onClose={() => { setHelpOpen(false); helpBtnRef.current?.focus(); }}>
      <h3>Como organizar uma skill</h3>
      <p>Use a categoria para agrupar o catálogo e descreva o momento em que o agente deve usar as instruções.</p>
      <h3>Antes de continuar</h3>
      <p>Uma skill pode participar de vários perfis. Ao atualizar as instruções, confira os agentes dependentes.</p>
    </HelpDrawer>}
  </>;
}

// ── AgentsPage ────────────────────────────────────────────────────────────────

export function AgentsPage({ cwd, cwdRef, catalog, agents, preview, save, useAgent, openSkills, refresh }) {
  const [selected, setSelected] = useState(() => agents[0] ?? null);
  const [tab, setTab] = useState("Ficha");
  const [skillOrder, setSkillOrder] = useState(() => agents[0]?.skills ?? []);
  const [instructions, setInstructions] = useState("");
  const [instrLoading, setInstrLoading] = useState(false);
  const [editDrawer, setEditDrawer] = useState(null); // null | "new" | AgentProfile
  const [helpOpen, setHelpOpen] = useState(false);
  const helpBtnRef = useRef(null);
  const [deleting, setDeleting] = useState(false);
  const [orderSaving, setOrderSaving] = useState(false);
  const [orderError, setOrderError] = useState("");
  const selectedIdRef = useRef(selected?.id ?? null);

  // Keep selected in sync with incoming snapshot updates without remounting forms
  useEffect(() => {
    const id = selectedIdRef.current;
    if (!id) {
      const first = agents[0] ?? null;
      if (first) {
        setSelected(first);
        setSkillOrder(first.skills ?? []);
        selectedIdRef.current = first.id;
      }
      return;
    }
    const updated = agents.find((a) => a.id === id);
    if (updated) {
      setSelected(updated);
      // Only sync skillOrder if we are NOT currently editing it
      if (!orderSaving) setSkillOrder(updated.skills ?? []);
    } else if (!agents.length) {
      setSelected(null);
      selectedIdRef.current = null;
    }
  }, [agents]);

  function selectAgent(agent) {
    setSelected(agent);
    setSkillOrder(agent.skills ?? []);
    setTab("Ficha");
    setInstructions("");
    setOrderError("");
    selectedIdRef.current = agent.id;
  }

  async function openInstructions() {
    if (!selected || !cwd) return;
    setInstrLoading(true);
    setInstructions("");
    const result = await bridgeRequest("agent.preview", { cwd, agent: { ...selected, skills: skillOrder } });
    if (cwdRef.current !== cwd) { setInstrLoading(false); return; }
    if (result.ok) setInstructions(result.data?.instructions ?? "");
    setInstrLoading(false);
  }

  function handleTabChange(newTab) {
    setTab(newTab);
    if (newTab === "Instruções") openInstructions();
  }

  function moveSkill(index, delta) {
    setSkillOrder((prev) => {
      const next = [...prev];
      [next[index], next[index + delta]] = [next[index + delta], next[index]];
      return next;
    });
    setInstructions(""); // instructions stale after reorder
  }

  async function saveOrder() {
    if (!selected || !cwd) return;
    setOrderSaving(true);
    setOrderError("");
    const updated = { ...selected, skills: skillOrder };
    const result = await bridgeRequest("agent.update", { cwd, agent: updated });
    if (cwdRef.current !== cwd) { setOrderSaving(false); return; }
    if (result.ok) {
      setSelected(updated);
      selectedIdRef.current = updated.id;
      if (refresh) await refresh();
    } else {
      setOrderError(result.error || "Erro ao salvar ordem.");
    }
    setOrderSaving(false);
  }

  function handleEditSaved(profile) {
    setEditDrawer(null);
    selectedIdRef.current = profile.id;
    if (refresh) refresh();
  }

  async function handleDelete() {
    if (!selected || !cwd) return;
    setDeleting(true);
    const result = await bridgeRequest("agent.delete", { cwd, id: selected.id });
    if (cwdRef.current !== cwd) { setDeleting(false); return; }
    if (result.ok) {
      setSelected(null);
      selectedIdRef.current = null;
      setSkillOrder([]);
      setInstructions("");
      if (refresh) await refresh();
    }
    setDeleting(false);
  }

  const catalogMap = Object.fromEntries(catalog.map((s) => [s.name, s]));

  return <>
    <header className="page-heading">
      <div><h1>Perfis de agentes</h1>
        <p>Defina responsabilidades e combine skills na ordem de trabalho.</p>
      </div>
      <div className="inline-actions">
        <button type="button" onClick={openSkills}>Abrir skills</button>
        <button type="button" onClick={() => setEditDrawer("new")}>
          <Plus size={14} aria-hidden="true" />Novo perfil
        </button>
        <button ref={helpBtnRef} className="icon-button" aria-label="Ajuda de perfis de agentes"
          title="Ajuda" onClick={() => setHelpOpen(true)}><CircleHelp size={17} /></button>
      </div>
    </header>

    <div className="agent-split">
      <section className="surface">
        <header className="panel-heading"><h2>Perfis do projeto</h2></header>
        {agents.length
          ? <div className="profile-list">{agents.map((agent) => <button
            key={agent.id}
            className={selected?.id === agent.id ? "selected" : ""}
            onClick={() => selectAgent(agent)}>
            <span className="row-title"><Layers size={14} aria-hidden="true" />{agent.name}</span>
            <small>{(agent.skills?.length ?? 0)} skill{(agent.skills?.length ?? 0) !== 1 ? "s" : ""} · Projeto</small>
          </button>)}</div>
          : <p className="table-empty">Os agentes salvos aparecem aqui.</p>}
      </section>

      {selected
        ? <section className="surface">
          <header className="panel-heading">
            <div>
              <h2>{selected.name}</h2>
              {selected.goal && <p style={{ marginTop: "2px", fontSize: "11px" }}>{selected.goal}</p>}
            </div>
            <div className="inline-actions">
              <button type="button" onClick={() => setEditDrawer(selected)}
                aria-label={`Editar ${selected.name}`}>
                <SquarePen size={13} aria-hidden="true" />Editar ficha
              </button>
              <button type="button" className="primary"
                onClick={() => useAgent(selected.id)} disabled={deleting}>
                <Play size={13} aria-hidden="true" />Usar em tarefa
              </button>
            </div>
          </header>

          <nav className="subnav agent-subnav" aria-label="Detalhes do agente">
            {["Ficha", "Skills", "Instruções"].map((t) => <button key={t}
              aria-current={tab === t ? "page" : undefined}
              onClick={() => handleTabChange(t)}>{t}</button>)}
          </nav>

          {tab === "Ficha" && <>
            {selected.responsibilities && <div className="detail-section">
              <h3>Responsabilidades</h3>
              <p style={{ whiteSpace: "pre-line" }}>{selected.responsibilities}</p>
            </div>}
            {(selected.expectedInput || selected.expectedOutput) && <div className="detail-section">
              <dl className="meta-grid">
                {selected.expectedInput && <div>
                  <dt>Entrada esperada</dt><dd>{selected.expectedInput}</dd>
                </div>}
                {selected.expectedOutput && <div>
                  <dt>Resultado esperado</dt><dd>{selected.expectedOutput}</dd>
                </div>}
              </dl>
            </div>}
            {selected.boundaries && <div className="detail-section">
              <h3>Limites de atuação</h3>
              <p>{selected.boundaries}</p>
            </div>}
            <div className="detail-section">
              <h3>Composição de skills</h3>
              <div className="inline-actions">
                {skillOrder.map((name, i) => <span className="soft-pill" key={name}>
                  {i + 1} · {catalogMap[name]?.name ?? name}
                </span>)}
              </div>
              <p style={{ marginTop: "10px" }}>Modelo e provedor são escolhidos ao iniciar a tarefa.</p>
            </div>
            <div className="detail-section">
              <button type="button" className="danger" onClick={handleDelete}
                disabled={deleting}
                aria-label={`Excluir agente ${selected.name}`}>
                {deleting ? "Excluindo…" : "Excluir agente"}
              </button>
            </div>
          </>}

          {tab === "Skills" && <div className="padded">
            <p>O perfil segue a ordem abaixo.</p>
            <ol className="skill-order">
              {skillOrder.map((name, i) => <li key={name}>
                <span className="ordinal">{i + 1}</span>
                <span>{catalogMap[name]?.name ?? name}</span>
                <button type="button" aria-label={`Subir ${name}`}
                  disabled={i === 0 || orderSaving}
                  onClick={() => moveSkill(i, -1)}>
                  <ArrowUp size={13} aria-hidden="true" />
                </button>
                <button type="button" aria-label={`Descer ${name}`}
                  disabled={i === skillOrder.length - 1 || orderSaving}
                  onClick={() => moveSkill(i, 1)}>
                  <ArrowDown size={13} aria-hidden="true" />
                </button>
              </li>)}
            </ol>
            {orderError && <p className="form-error" role="alert">{orderError}</p>}
            <div className="actions" style={{ marginTop: "12px" }}>
              <button type="button" className="primary" onClick={saveOrder} disabled={orderSaving}>
                {orderSaving ? "Salvando…" : "Salvar ordem"}
              </button>
            </div>
            <div className="note">A ordem define como as instruções são compostas no prompt do agente.</div>
          </div>}

          {tab === "Instruções" && <div className="padded detail-body"
            aria-busy={instrLoading ? "true" : "false"}>
            {instrLoading
              ? <p role="status">Gerando prévia das instruções…</p>
              : instructions
                ? <pre>{instructions}</pre>
                : <p>Clique em "Atualizar prévia" para gerar o texto completo.</p>}
            <div className="actions" style={{ marginTop: "10px" }}>
              <button type="button" disabled={instrLoading} onClick={openInstructions}>
                Atualizar prévia
              </button>
            </div>
          </div>}
        </section>
        : <section className="surface">
          <div className="padded">
            <p>Selecione um agente para ver os detalhes ou crie um novo perfil.</p>
          </div>
        </section>}
    </div>

    {editDrawer !== null && <AgentEditDrawer
      key={editDrawer === "new" ? "new" : editDrawer.id}
      agent={editDrawer === "new" ? null : editDrawer}
      catalog={catalog}
      cwd={cwd}
      cwdRef={cwdRef}
      onClose={() => setEditDrawer(null)}
      onSaved={handleEditSaved}
    />}

    {helpOpen && <HelpDrawer title="Ajuda de perfis de agentes"
      onClose={() => { setHelpOpen(false); helpBtnRef.current?.focus(); }}>
      <h3>Como compor um agente</h3>
      <p>A ficha descreve o trabalho esperado. A aba Skills define a ordem de composição.</p>
      <h3>Antes de continuar</h3>
      <p>Confira o texto em Instruções antes de iniciar uma tarefa. As decisões que dependem de aprovação seguem o fluxo do runtime.</p>
    </HelpDrawer>}
  </>;
}
