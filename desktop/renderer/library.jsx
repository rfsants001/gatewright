import { useState } from "react";

function identifier(label) {
  return label.normalize("NFD").replace(/\p{Mark}/gu, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^[^a-z]+|-+$/g, "").slice(0, 48).replace(/-+$/, "");
}

export function SkillsPage({ catalog, save }) {
  const [saving, setSaving] = useState(false);
  return <>
    <header className="page-heading"><div><h1>Skills</h1><p>Escreva instruções que você pode usar em vários agentes.</p></div></header>
    <div className="settings-grid">
      <section className="surface">
        <header className="panel-heading"><h2>Nova skill</h2></header>
        <form className="form-panel" onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const fields = new FormData(form);
          setSaving(true);
          try {
            if (await save({
              kind: "skill", name: identifier(fields.get("name")), description: fields.get("description").trim(),
              instructions: fields.get("instructions").trim(),
            })) form.reset();
          } finally { setSaving(false); }
        }}>
          <label>Nome<input name="name" required maxLength={70} placeholder="Revisar contratos de API" /></label>
          <label>Quando usar<input name="description" required maxLength={200} placeholder="Mudanças nos endpoints públicos" /></label>
          <label>Instruções<textarea name="instructions" required rows={6} maxLength={16000} placeholder="Descreva os passos e o resultado esperado." /></label>
          <div className="actions"><button className="primary" disabled={saving}>{saving ? "Salvando…" : "Salvar skill"}</button></div>
        </form>
      </section>
      <section className="surface">
        <header className="panel-heading"><h2>Catálogo do projeto</h2></header>
        <ul className="library-list">{catalog.map((skill) => <li key={skill.name}>
          <strong>{skill.name}</strong><p>{skill.description}</p>
        </li>)}</ul>
      </section>
    </div>
  </>;
}

export function AgentsPage({ catalog, agents, preview, save, useAgent, openSkills }) {
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [selected, setSelected] = useState([]);
  const [instructions, setInstructions] = useState("");
  const [pending, setPending] = useState(false);
  const selection = selected.filter((key) => catalog.some((skill) => skill.name === key));
  const profile = { id: identifier(name), name: name.trim(), goal: goal.trim(), skills: selection };
  const valid = !!profile.id && !!profile.goal && selection.length > 0;

  async function submit(event) {
    event.preventDefault();
    if (!valid) return;
    setPending(true);
    try {
      if (event.nativeEvent.submitter?.value === "preview") {
        setInstructions(await preview(profile) || "");
      } else if (await save(profile)) {
        setName(""); setGoal(""); setSelected([]); setInstructions("");
      }
    } finally { setPending(false); }
  }

  return <>
    <header className="page-heading"><div><h1>Agentes</h1><p>Combine skills em um perfil reutilizável.</p></div>
      <button type="button" onClick={openSkills}>Abrir skills</button>
    </header>
    <div className="settings-grid">
      <section className="surface">
        <header className="panel-heading"><h2>Compor agente</h2></header>
        <form className="form-panel" onSubmit={submit}>
          <label>Nome<input required value={name} maxLength={70} placeholder="Revisor de API" disabled={pending}
            onChange={(event) => { setName(event.target.value); setInstructions(""); }} /></label>
          <label>Objetivo<textarea required value={goal} maxLength={1000} rows={3} disabled={pending}
            onChange={(event) => { setGoal(event.target.value); setInstructions(""); }} /></label>
          <fieldset className="skill-picker" disabled={pending}>
            <legend>Skills</legend>
            <p>As instruções seguem a ordem da seleção.</p>
            {catalog.map((skill) => <label className="check" key={skill.name}>
              <input type="checkbox" checked={selection.includes(skill.name)}
                disabled={!selection.includes(skill.name) && selection.length >= 12}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setSelected(checked ? [...selection, skill.name] : selection.filter((item) => item !== skill.name));
                  setInstructions("");
                }} />
              <span>{skill.name}</span>
              {selection.includes(skill.name) && <small aria-label="Ordem na composição">{selection.indexOf(skill.name) + 1}</small>}
            </label>)}
          </fieldset>
          <div className="actions">
            <button disabled={pending || !valid} type="submit" value="preview">Ver instruções</button>
            <button className="primary" disabled={pending || !valid} type="submit" value="save">Salvar agente</button>
          </div>
        </form>
      </section>
      <div className="library-column">
        <section className="surface">
          <header className="panel-heading"><h2>Instruções combinadas</h2></header>
          <div className="form-panel">
            {instructions ? <pre className="agent-preview" aria-live="polite">{instructions}</pre>
              : <p>Selecione as skills e abra a prévia para revisar as instruções completas.</p>}
          </div>
        </section>
        <section className="surface">
          <header className="panel-heading"><h2>Agentes do projeto</h2></header>
          {agents.length ? <ul className="library-list">{agents.map((agent) => <li key={agent.id}>
            <strong>{agent.name}</strong><p>{agent.goal}</p>
            <button type="button" onClick={() => useAgent(agent.id)}>Usar em uma tarefa</button>
          </li>)}</ul> : <p className="table-empty">Os agentes salvos aparecem aqui.</p>}
        </section>
      </div>
    </div>
  </>;
}
