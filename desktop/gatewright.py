#!/usr/bin/env python3
"""GTK desktop client for the Gatewright local process."""
import json
import os
import subprocess
import sys
from pathlib import Path
from threading import Thread

import gi

gi.require_version("Gtk", "4.0")
from gi.repository import Gio, GLib, Gtk, Gdk

CSS = b"""
window { background: #f5f3ee; color: #252a27; }
headerbar { background: #f5f3ee; color: #252a27; box-shadow: none; border-bottom: 1px solid #dddcd4; }
.sidebar { background: #eaece5; border-right: 1px solid #d7dbd1; }
.brand { font-size: 20px; font-weight: 750; }
.title { font-size: 32px; font-weight: 750; }
.subheading { font-size: 16px; font-weight: 700; }
.muted { color: #505d54; }
list.sidebar { background: transparent; border: 0; }
.sidebar row { background: transparent; color: #252a27; border-radius: 7px; margin: 2px 0; }
.sidebar row:hover { background: #e1e7dd; }
.sidebar row:selected label { color: #173d2c; }
button:not(.titlebutton), entry { background: #fffefa; color: #252a27; border: 1px solid #c5c9c0; box-shadow: none; }
button:not(.titlebutton):hover { background: #e9ede5; }
button:disabled { color: #5f685e; background: #e9ebe6; }
windowcontrols button { background: transparent; border: 0; color: #252a27; box-shadow: none; }
textview, textview text { background: #fffefa; color: #252a27; }
popover contents { background: #fffefa; color: #252a27; }
dropdown popover row { color: #252a27; }
button:focus-visible, entry:focus-visible, row:focus-visible { outline: 2px solid #245740; outline-offset: -2px; }
.sidebar row:selected { background: #d3dfd4; color: #173d2c; }
.panel { background: #fffefa; border: 1px solid #dadbd3; border-radius: 9px; padding: 16px; }
button.suggested-action { background: #245740; color: #fff; }
button.destructive-action { color: #8c271d; }
.status { border-top: 1px solid #dddcd4; background: #f5f3ee; }
.failure { color: #8c271d; font-weight: 650; }
.success { color: #245740; font-weight: 650; }
"""

STATES = {
    "RUNNING": "Em execução", "PASSED": "Concluída", "FAILED": "Falhou",
    "CANCELLED": "Cancelada", "PAUSED": "Pausada", "IDLE": "Pronta",
}
PAGES = [
    ("Projeto", "Abra um repositório e configure os hosts que você usa no terminal."),
    ("Execução", "Escolha um host ou provedor e acompanhe o que ele fez."),
    ("Consumo", "Tokens registrados pelas execuções deste projeto."),
    ("Configuração", "Conecte provedores, projetos, skills e servidores MCP."),
]


def label(text, style=None):
    widget = Gtk.Label(label=text, xalign=0, wrap=True)
    if style:
        widget.add_css_class(style)
    return widget


def button(text, callback, style=None):
    widget = Gtk.Button(label=text)
    widget.connect("clicked", callback)
    if style:
        widget.add_css_class(style)
    return widget


def text_area(editable, height):
    view = Gtk.TextView(editable=editable, wrap_mode=Gtk.WrapMode.WORD_CHAR, monospace=not editable)
    for edge in ("top", "bottom", "left", "right"):
        getattr(view, f"set_{edge}_margin")(12)
    scroll = Gtk.ScrolledWindow(min_content_height=height, vexpand=not editable)
    scroll.set_child(view)
    scroll.add_css_class("frame")
    return view, scroll


def content(view):
    buf = view.get_buffer()
    return buf.get_text(buf.get_start_iter(), buf.get_end_iter(), False).strip()


class Bridge:
    def __init__(self, node, entry, on_event):
        self.process = subprocess.Popen([node, entry, "bridge"], stdin=subprocess.PIPE,
                                        stdout=subprocess.PIPE, text=True, encoding="utf-8")
        self.pending = {}
        self.next_id = 0
        self.on_event = on_event
        Thread(target=self.read, daemon=True).start()

    def send(self, method, params, callback):
        self.next_id += 1
        request_id = self.next_id
        self.pending[request_id] = callback
        try:
            self.process.stdin.write(json.dumps(dict(id=request_id, method=method, params=params)) + "\n")
            self.process.stdin.flush()
        except (BrokenPipeError, OSError):
            self.pending.pop(request_id, None)
            callback(None, "O processo local foi encerrado. Abra o Gatewright novamente.")

    def read(self):
        for line in self.process.stdout:
            try:
                message = json.loads(line)
            except ValueError:
                continue
            GLib.idle_add(self.dispatch, message)
        GLib.idle_add(self.on_event, {"event": "bridge.closed"})

    def dispatch(self, message):
        if "id" in message:
            callback = self.pending.pop(message["id"], None)
            if callback:
                callback(message.get("result"), message.get("error"))
        else:
            self.on_event(message)
        return False

    def close(self):
        self.process.stdin.close()


class Gatewright(Gtk.Application):
    def __init__(self, node, entry, initial):
        super().__init__(application_id="io.gatewright.Desktop", flags=Gio.ApplicationFlags.NON_UNIQUE)
        self.node, self.entry, self.initial = node, entry, initial
        self.cwd = None
        self.run_id = None
        self.running = False
        self.in_flow = False
        self.selection = []
        self.providers = []
        self.hosts = []
        self.project_ids = []
        self.bridge = None

    def do_activate(self):
        style = Gtk.CssProvider()
        style.load_from_data(CSS)
        Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default(), style, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)
        self.window = Gtk.ApplicationWindow(application=self, title="Gatewright", default_width=1120, default_height=760)
        self.window.set_size_request(850, 620)
        self.window.connect("close-request", self.close_window)
        top = Gtk.HeaderBar()
        top.set_title_widget(label("Gatewright", "brand"))
        self.open_button = button("Abrir pasta…", self.choose_folder)
        top.pack_start(self.open_button)
        top.pack_end(button("Atualizar", lambda *_: self.refresh()))
        self.window.set_titlebar(top)
        root = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
        body = Gtk.Box(vexpand=True)
        sidebar = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, width_request=206, spacing=12)
        sidebar.add_css_class("sidebar")
        navigation = Gtk.ListBox(selection_mode=Gtk.SelectionMode.SINGLE)
        navigation.add_css_class("sidebar")
        navigation.set_margin_top(18)
        navigation.set_margin_start(12)
        navigation.set_margin_end(12)
        for index, (name, _) in enumerate(PAGES):
            row = Gtk.ListBoxRow()
            item = label(name)
            for edge in ("top", "bottom", "start", "end"):
                getattr(item, f"set_margin_{edge}")(10)
            row.set_child(item)
            navigation.append(row)
        navigation.connect("row-selected", lambda _, row: self.stack.set_visible_child_name(str(row.get_index())) if row else None)
        sidebar.append(navigation)
        body.append(sidebar)
        self.stack = Gtk.Stack(hexpand=True, vexpand=True)
        body.append(self.stack)
        for index, (title, subtitle) in enumerate(PAGES):
            section = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=14)
            for edge in ("top", "bottom", "start", "end"):
                getattr(section, f"set_margin_{edge}")(26)
            section.append(label(title, "title"))
            section.append(label(subtitle, "muted"))
            getattr(self, f"build_{index}")(section)
            scroll = Gtk.ScrolledWindow(hscrollbar_policy=Gtk.PolicyType.NEVER, vexpand=True)
            scroll.set_child(section)
            self.stack.add_named(scroll, str(index))
        navigation.select_row(navigation.get_row_at_index(0))
        self.status = label("Abra uma pasta de projeto.", "muted")
        self.status.set_margin_start(20)
        self.status.set_margin_top(8)
        self.status.set_margin_bottom(8)
        status_bar = Gtk.Box()
        status_bar.add_css_class("status")
        status_bar.append(self.status)
        root.append(body)
        root.append(status_bar)
        self.window.set_child(root)
        self.bridge = Bridge(self.node, self.entry, self.on_event)
        self.window.present()
        self.request("projects", {}, self.show_projects)
        if self.initial:
            self.open_project(self.initial)
        if os.environ.get("GATEWRIGHT_DESKTOP_SMOKE") == "1":
            GLib.timeout_add(900, self.smoke_done)

    def smoke_done(self):
        print("Gatewright GTK ready", flush=True)
        self.window.close()
        return False

    def build_0(self, section):
        project_panel = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=10)
        project_panel.add_css_class("panel")
        self.project = label("Nenhum projeto aberto", "subheading")
        self.project.set_selectable(True)
        project_panel.append(self.project)
        project_row = Gtk.Box(spacing=8)
        self.project_menu = Gtk.DropDown.new_from_strings([])
        self.project_menu.set_hexpand(True)
        project_row.append(self.project_menu)
        project_row.append(button("Abrir recente", self.open_recent))
        project_panel.append(project_row)
        section.append(project_panel)
        section.append(label("Hosts do terminal", "subheading"))
        self.host_rows = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=8)
        self.host_rows.append(label("Abra um projeto para detectar os hosts.", "muted"))
        section.append(self.host_rows)

    def build_1(self, section):
        choices = Gtk.Box(spacing=8)
        self.engine = Gtk.DropDown.new_from_strings([])
        self.engine.set_hexpand(True)
        self.model = Gtk.Entry(placeholder_text="ID do modelo (opcional para hosts)", hexpand=True)
        choices.append(self.engine)
        choices.append(self.model)
        section.append(choices)
        section.append(label("Tarefa", "subheading"))
        self.prompt, area = text_area(True, 82)
        section.append(area)
        actions = Gtk.Box(spacing=8)
        self.start = button("Iniciar execução", self.start_run, "suggested-action")
        self.start_flow = button("Iniciar fluxo SDD", lambda *_: self.start_run(flow=True))
        self.cancel = button("Cancelar execução", self.cancel_run, "destructive-action")
        self.review = button("Revisar diff", self.review_run)
        for widget in (self.start, self.start_flow, self.cancel, self.review):
            widget.set_sensitive(False)
            actions.append(widget)
        section.append(actions)
        self.run_status = label("Aguardando uma tarefa", "subheading")
        section.append(self.run_status)
        self.log, output = text_area(False, 250)
        section.append(output)

    def build_2(self, section):
        self.usage = label("Abra um projeto para ver seu consumo.", "panel")
        section.append(self.usage)
        self.models = label("", "muted")
        self.models.set_selectable(True)
        section.append(self.models)
        section.append(label("Execuções com medição", "subheading"))
        self.usage_runs = label("", "muted")
        self.usage_runs.set_selectable(True)
        section.append(self.usage_runs)

    def build_3(self, section):
        section.append(label("Provedor compatível com OpenAI", "subheading"))
        row = Gtk.Box(spacing=8)
        self.fields = [Gtk.Entry(placeholder_text=item, hexpand=True) for item in
                       ("ID", "URL base /v1", "Modelo", "Variável da chave")]
        for field in self.fields:
            row.append(field)
        section.append(row)
        section.append(button("Salvar provedor", self.save_provider))
        section.append(label("Propor mudança com IA", "subheading"))
        section.append(label("Use um provedor configurado. A proposta fica disponível para revisão antes de escrever no projeto.", "muted"))
        custom = Gtk.Box(spacing=8)
        self.custom_provider = Gtk.DropDown.new_from_strings([])
        self.custom_provider.set_hexpand(True)
        self.custom_model = Gtk.Entry(placeholder_text="Modelo (necessário para Ollama)", hexpand=True)
        custom.append(self.custom_provider)
        custom.append(self.custom_model)
        section.append(custom)
        self.custom_prompt, area = text_area(True, 80)
        section.append(area)
        self.propose = button("Gerar proposta", self.propose_change, "suggested-action")
        section.append(self.propose)
        self.assets = label("", "muted")
        section.append(self.assets)

    def status_text(self, text, style=None):
        for name in ("muted", "success", "failure"):
            self.status.remove_css_class(name)
        self.status.add_css_class(style or "muted")
        self.status.set_text(text)

    def request(self, method, params, success, failed=None):
        def received(result, error):
            if error:
                self.status_text(error, "failure")
                if failed:
                    failed()
            else:
                success(result)
        self.bridge.send(method, params, received)

    def project_request(self, method, params, success, failed=None):
        if not self.cwd:
            self.status_text("Abra uma pasta de projeto primeiro.", "failure")
            if failed:
                failed()
            return
        self.request(method, {"cwd": self.cwd, **params}, success, failed)

    def choose_folder(self, *_):
        dialog = Gtk.FileChooserNative(title="Abrir pasta de projeto", transient_for=self.window,
                                       action=Gtk.FileChooserAction.SELECT_FOLDER, accept_label="Abrir", cancel_label="Cancelar")
        dialog.connect("response", self.folder_chosen)
        dialog.show()

    def folder_chosen(self, dialog, response):
        if response == Gtk.ResponseType.ACCEPT:
            self.open_project(dialog.get_file().get_path())
        dialog.destroy()

    def show_projects(self, projects):
        self.project_ids = [entry["path"] for entry in projects]
        self.project_menu.set_model(Gtk.StringList.new(self.project_ids))

    def open_recent(self, *_):
        index = self.project_menu.get_selected()
        if index < len(self.project_ids):
            self.open_project(self.project_ids[index])

    def open_project(self, path):
        if self.running or self.in_flow:
            self.status_text("Aguarde ou cancele a execução antes de trocar de projeto.", "failure")
            return
        self.request("open", {"cwd": path}, self.project_opened)

    def project_opened(self, result):
        self.cwd = result["cwd"]
        self.run_id = None
        self.log.get_buffer().set_text("")
        self.review.set_sensitive(False)
        self.run_status.set_text("Aguardando uma tarefa")
        self.project.set_text(self.cwd)
        self.status_text("Projeto aberto.")
        self.request("projects", {}, self.show_projects)
        self.refresh()

    def refresh(self):
        if self.cwd:
            cwd = self.cwd
            self.project_request("snapshot", {}, lambda result: self.update_snapshot(result) if cwd == self.cwd else None)

    def update_snapshot(self, data):
        child = self.host_rows.get_first_child()
        while child:
            self.host_rows.remove(child)
            child = self.host_rows.get_first_child()
        for host in data["hosts"]:
            row = Gtk.Box(spacing=12)
            row.add_css_class("panel")
            col = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, hexpand=True, spacing=4)
            col.append(label(host["name"], "subheading"))
            state = host.get("version") or "Binário não encontrado"
            coverage = "MCP e hooks" if host["hooks"] else "MCP"
            col.append(label(f"{state} · Configuração disponível: {coverage}", "muted"))
            row.append(col)
            row.append(button("Revisar conexão…", lambda _, name=host["id"]: self.terminal_preview(name)))
            self.host_rows.append(row)
        old = self.engine.get_selected_item()
        old_name = old.get_string() if old else None
        self.providers = data["providers"]
        self.selection = [(item["id"], item["name"]) for item in data["hosts"] if item["installed"]]
        self.selection.extend((f'provider:{item["id"]}', item["id"]) for item in self.providers)
        names = [name for _, name in self.selection]
        self.engine.set_model(Gtk.StringList.new(names))
        if old_name in names:
            self.engine.set_selected(names.index(old_name))
        self.start.set_sensitive(bool(names) and not (self.running or self.in_flow))
        self.start_flow.set_sensitive(any(not key.startswith("provider:") for key, _ in self.selection) and not (self.running or self.in_flow))
        self.custom_provider.set_model(Gtk.StringList.new([item["id"] for item in self.providers]))
        usage = data["usage"]
        if usage["byRun"]:
            cost = usage.get("totalCostBrl")
            money = f"R$ {cost:,.4f} · custo registrado ou estimado" if cost is not None else "Custo indisponível"
            self.usage.set_text(f'{usage["totalTokensIn"]:,} entrada  ·  {usage["totalTokensOut"]:,} saída  ·  {usage["totalCacheRead"]:,} cache\n{money}')
        else:
            self.usage.set_text("Ainda não há consumo registrado neste projeto.")
        self.models.set_text("\n".join(f'{row["model"]}  ·  {row["totalTokensIn"]:,} entrada  ·  {row["totalTokensOut"]:,} saída' for row in usage["byModel"]))
        self.usage_runs.set_text("\n".join(
            f'{row["runSlug"]}  ·  {row["totalTokensIn"]:,} entrada  ·  {row["totalTokensOut"]:,} saída'
            for row in reversed(usage["byRun"][-10:])
        ) or "Sem dados de execução.")
        self.assets.set_text(f'{len(data["skills"])} skills disponíveis\nProjetos vinculados: ' +
                             (", ".join(data["linkedProjects"]) or "nenhum"))

    def terminal_preview(self, host):
        def show(data):
            text = "\n\n".join(f'{row["summary"]}\n{row["path"]}' for row in data["changes"])
            self.confirm("Conectar terminal", text, "Aplicar configuração",
                         lambda: self.project_request("terminal.apply", {"host": host, "revision": data["revision"]},
                                                      lambda _: self.status_text("Configuração gravada. Reinicie o host para verificar a conexão.", "success")))
        self.project_request("terminal.preview", {"host": host}, show)

    def start_run(self, *_, flow=False):
        idx = self.engine.get_selected()
        task = content(self.prompt)
        if not task:
            self.status_text("Escreva uma tarefa para iniciar.", "failure")
            self.prompt.grab_focus()
            return
        if idx >= len(self.selection):
            return
        engine = self.selection[idx][0]
        if flow and engine.startswith("provider:"):
            self.status_text("Selecione um agente de terminal para o fluxo SDD.", "failure")
            return
        self.run_id = None
        self.in_flow = flow
        self.set_running(True)
        self.log.get_buffer().set_text("")
        def failed():
            self.in_flow = False
            self.set_running(False)
        self.project_request("flow.start" if flow else "run", {"engine": engine, "model": self.model.get_text().strip(), "prompt": task},
                             self.run_started, failed)

    def run_started(self, result):
        if result.get("runId"):
            self.run_id = result["runId"]
        self.set_running(self.running)

    def set_running(self, running):
        self.running = running
        busy = running or self.in_flow
        self.start.set_sensitive(not busy and bool(self.selection))
        self.start_flow.set_sensitive(not busy and any(not key.startswith("provider:") for key, _ in self.selection))
        self.cancel.set_sensitive(self.in_flow or (running and self.run_id is not None))
        self.open_button.set_sensitive(not busy)
        self.review.set_sensitive(not busy and self.run_id is not None)

    def cancel_run(self, *_):
        if self.in_flow:
            self.project_request("flow.stop", {}, lambda _: self.status_text("Fluxo encerrado."))
        else:
            self.request("cancel", {"runId": self.run_id}, lambda _: self.status_text("Cancelamento solicitado."))

    def on_event(self, message):
        if message["event"] == "bridge.closed":
            self.in_flow = False
            self.set_running(False)
            self.status_text("O processo local foi encerrado.", "failure")
        elif message.get("cwd") == self.cwd:
            if message["event"] in ("flow.done", "flow.error"):
                self.in_flow = False
                self.set_running(self.running)
                self.status_text(message["data"] or "Fluxo concluído. Revise o diff para registrar a decisão final.",
                                 "failure" if message["event"] == "flow.error" else "success")
            elif message["event"] == "flow.run":
                self.run_started({"runId": message["data"]})
            elif message["event"] == "flow.ask":
                self.flow_question(message["data"])
            elif message["event"] == "run.state":
                state = message["data"]
                self.run_status.set_text(STATES.get(state, state))
                self.set_running(state == "RUNNING")
                if not self.running:
                    self.refresh()
            elif message["event"] == "run.log":
                event = message["data"]
                text = event.get("text") or event.get("tool")
                if text:
                    buf = self.log.get_buffer()
                    buf.insert(buf.get_end_iter(), text + "\n")
        return False

    def flow_question(self, data):
        text = (data["output"] or "Sem resposta de texto.") + "\n\n" + (data["diff"] or "Sem alterações.")
        dialog, _ = self.preview_dialog(data["title"], text)
        questions = data["questions"]
        widgets = {}
        area = dialog.get_content_area()
        for question in questions:
            area.append(label(question["prompt"], "subheading"))
            kind = question["type"]
            values = question.get("options") or []
            if kind == "confirm":
                widget = Gtk.CheckButton(label="Aprovo esta etapa")
                area.append(widget)
            elif kind == "select":
                widget = Gtk.DropDown.new_from_strings(values)
                area.append(widget)
            elif kind == "multiselect":
                widget = [(option, Gtk.CheckButton(label=option)) for option in values]
                for _, check in widget:
                    area.append(check)
            else:
                widget = Gtk.Entry()
                area.append(widget)
            widgets[question["id"]] = (kind, values, widget)
        dialog.add_button("Encerrar fluxo", Gtk.ResponseType.REJECT)
        dialog.add_button("Continuar", Gtk.ResponseType.ACCEPT)
        def answer(_, response):
            dialog.destroy()
            if response != Gtk.ResponseType.ACCEPT:
                self.project_request("flow.stop", {}, lambda _: None)
                return
            answers = {}
            for name, (kind, values, widget) in widgets.items():
                if kind == "confirm":
                    answers[name] = widget.get_active()
                elif kind == "select":
                    index = widget.get_selected()
                    answers[name] = values[index] if index < len(values) else ""
                elif kind == "multiselect":
                    answers[name] = [option for option, check in widget if check.get_active()]
                else:
                    answers[name] = widget.get_text()
            self.project_request("flow.answer", {"token": data["token"], "answers": answers},
                                 self.run_started, lambda: self.flow_question(data))
        dialog.connect("response", answer)
        dialog.present()

    def review_run(self, *_):
        def show(data):
            dialog, area = self.preview_dialog("Revisar alterações", data["status"] + "\n" + (data["diff"] or "Sem alterações rastreadas."))
            dialog.add_button("Voltar", Gtk.ResponseType.CLOSE)
            dialog.add_button("Recusar", Gtk.ResponseType.REJECT)
            dialog.add_button("Aprovar revisão", Gtk.ResponseType.ACCEPT)
            def decide(_, response):
                dialog.destroy()
                if response in (Gtk.ResponseType.ACCEPT, Gtk.ResponseType.REJECT):
                    self.project_request("review.decide", {"revision": data["revision"], "approved": response == Gtk.ResponseType.ACCEPT},
                                         lambda _: self.status_text("Decisão registrada na execução.", "success"))
            dialog.connect("response", decide)
            dialog.present()
        self.project_request("review", {"runId": self.run_id}, show)

    def save_provider(self, *_):
        identifier, endpoint, model, key = [field.get_text().strip() for field in self.fields]
        provider = dict(id=identifier, endpoint=endpoint, model=model)
        if key:
            provider["keyEnv"] = key
        def saved(_):
            for field in self.fields:
                field.set_text("")
            self.status_text("Provedor salvo para este projeto.", "success")
            self.refresh()
        self.project_request("provider.save", {"provider": provider}, saved)

    def propose_change(self, *_):
        idx = self.custom_provider.get_selected()
        if idx >= len(self.providers):
            self.status_text("Escolha um provedor antes de gerar a proposta.", "failure")
            return
        task = content(self.custom_prompt)
        if not task:
            self.status_text("Descreva a mudança que você quer fazer.", "failure")
            return
        self.propose.set_sensitive(False)
        self.status_text("Gerando proposta…")
        def show(data):
            self.propose.set_sensitive(True)
            if "revision" not in data:
                self.confirm("Detalhes necessários", data.get("message", "O provedor não retornou uma proposta válida."))
                return
            self.status_text("Proposta pronta para revisão.")
            proposal = data["change"]
            details = json.dumps(proposal, indent=2, ensure_ascii=False)
            if proposal["kind"] == "opencode-plugin":
                details = "O OpenCode poderá baixar e executar este pacote na próxima inicialização. Confira a origem e a versão.\n\n" + details
            self.confirm("Revisar proposta", details,
                         "Aplicar mudança", lambda: self.project_request("customize.apply", {"revision": data["revision"]},
                                                                         lambda _: self.change_applied()))
        self.project_request("customize.propose", {"providerId": self.providers[idx]["id"], "model": self.custom_model.get_text().strip(), "prompt": task},
                             show, lambda: self.propose.set_sensitive(True))

    def change_applied(self):
        self.status_text("Mudança aplicada ao projeto.", "success")
        self.refresh()

    def preview_dialog(self, title, text):
        dialog = Gtk.Dialog(title=title, transient_for=self.window, modal=True, default_width=700, default_height=430)
        view, area = text_area(False, 280)
        view.get_buffer().set_text(text)
        dialog.get_content_area().append(area)
        return dialog, area

    def confirm(self, title, text, action=None, callback=None):
        dialog, _ = self.preview_dialog(title, text)
        dialog.add_button("Voltar", Gtk.ResponseType.CLOSE)
        if action:
            dialog.add_button(action, Gtk.ResponseType.ACCEPT)
        def done(_, response):
            dialog.destroy()
            if response == Gtk.ResponseType.ACCEPT and callback:
                callback()
        dialog.connect("response", done)
        dialog.present()

    def close_window(self, *_):
        if self.running or self.in_flow:
            self.status_text("Cancele a execução ou aguarde o término antes de fechar.", "failure")
            return True
        if self.bridge:
            self.bridge.close()
        return False


if __name__ == "__main__":
    if not Gdk.Display.get_default():
        sys.exit("Gatewright Desktop precisa de uma sessão gráfica Linux disponível (Wayland ou X11).")
    Gtk.Settings.get_default().set_property("gtk-application-prefer-dark-theme", False)
    sys.exit(Gatewright(sys.argv[1], sys.argv[2], str(Path(sys.argv[3]).resolve()) if len(sys.argv) > 3 else None).run([]))
