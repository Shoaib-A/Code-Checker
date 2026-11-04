import { ask } from "./api";
import { getCode, highlightLine, setLineClickHandler } from "./editor";
import { Playback, runWithTrace, type TraceFrame } from "./runner";
import { RUNNABLE_SAMPLE } from "./sample";
import mermaid from "mermaid";

mermaid.initialize({ startOnLoad: false, theme: "dark", securityLevel: "loose" });

type Depth = "beginner" | "exam" | "senior";

interface ExplainLine {
  line: number;
  explanation: string;
}

const playback = new Playback();
let explanations: ExplainLine[] = [];
let currentDepth: Depth = "exam";

export function mountUnderstand(root: HTMLElement): void {
  root.innerHTML = `
    <div class="panel-header">
      <h2>Understand</h2>
      <p class="muted">Explain every line, watch it run, see the flow.</p>
    </div>
    <div class="depth-row">
      <label>Depth</label>
      <input type="range" id="depth-slider" min="0" max="2" value="1" />
      <span id="depth-label" class="pill">Exam level</span>
    </div>
    <div class="btn-row">
      <button class="btn primary" id="btn-explain">Explain code</button>
      <button class="btn" id="btn-flow">See the flow</button>
      <button class="btn" id="btn-run">Watch it run</button>
    </div>
    <div id="understand-status" class="status" hidden></div>
    <div id="explain-box" class="card explain-card" hidden>
      <div class="explain-meta">Click a line in the editor</div>
      <p id="explain-text">Explanations will appear here.</p>
    </div>
    <div id="flow-box" class="card" hidden>
      <h3>Call / request flow</h3>
      <div id="mermaid-out" class="mermaid-out"></div>
    </div>
    <div id="run-box" class="card" hidden>
      <h3>Watch it run</h3>
      <div id="run-msg" class="muted"></div>
      <div class="playback-controls">
        <button class="btn tiny" id="pb-back">◀</button>
        <button class="btn tiny primary" id="pb-play">Play</button>
        <button class="btn tiny" id="pb-pause">Pause</button>
        <button class="btn tiny" id="pb-fwd">▶</button>
        <input type="range" id="pb-timeline" min="0" max="0" value="0" />
      </div>
      <div id="var-boxes" class="var-boxes"></div>
      <pre id="run-stdout" class="stdout"></pre>
    </div>
  `;

  const depths: { key: Depth; label: string }[] = [
    { key: "beginner", label: "New to programming" },
    { key: "exam", label: "Exam level" },
    { key: "senior", label: "Senior engineer" },
  ];
  const slider = root.querySelector("#depth-slider") as HTMLInputElement;
  const depthLabel = root.querySelector("#depth-label") as HTMLElement;
  slider.addEventListener("input", () => {
    const d = depths[Number(slider.value)];
    currentDepth = d.key;
    depthLabel.textContent = d.label;
  });

  root.querySelector("#btn-explain")!.addEventListener("click", () => void doExplain(root));
  root.querySelector("#btn-flow")!.addEventListener("click", () => void doFlow(root));
  root.querySelector("#btn-run")!.addEventListener("click", () => void doRun(root));
  root.querySelector("#pb-play")!.addEventListener("click", () => playback.play());
  root.querySelector("#pb-pause")!.addEventListener("click", () => playback.pause());
  root.querySelector("#pb-fwd")!.addEventListener("click", () => playback.stepForward());
  root.querySelector("#pb-back")!.addEventListener("click", () => playback.stepBack());
  (root.querySelector("#pb-timeline") as HTMLInputElement).addEventListener("input", (e) => {
    playback.seek(Number((e.target as HTMLInputElement).value));
  });

  setLineClickHandler((line) => showExplanation(root, line));
}

function setStatus(root: HTMLElement, text: string | null, kind: "info" | "error" = "info"): void {
  const el = root.querySelector("#understand-status") as HTMLElement;
  if (!text) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.className = `status ${kind}`;
  el.textContent = text;
}

async function doExplain(root: HTMLElement): Promise<void> {
  setStatus(root, "AI is reading your code…");
  try {
    const data = await ask("explain", getCode(), { depth: currentDepth });
    explanations = (data.lines as ExplainLine[]) || [];
    (root.querySelector("#explain-box") as HTMLElement).hidden = false;
    (root.querySelector("#explain-text") as HTMLElement).textContent =
      explanations.length > 0
        ? "Click any line on the left to see its explanation."
        : "No explanations returned.";
    setStatus(root, null);
  } catch (e) {
    setStatus(root, String(e), "error");
  }
}

function showExplanation(root: HTMLElement, line: number): void {
  const box = root.querySelector("#explain-box") as HTMLElement;
  if (box.hidden || !explanations.length) return;
  const found =
    explanations.find((e) => e.line === line) ||
    explanations.find((e) => e.line <= line && e.line + 2 >= line);
  (root.querySelector(".explain-meta") as HTMLElement).textContent = `Line ${line}`;
  (root.querySelector("#explain-text") as HTMLElement).textContent =
    found?.explanation || "No explanation for this line yet — run Explain code first.";
}

async function doFlow(root: HTMLElement): Promise<void> {
  setStatus(root, "Building flowchart…");
  try {
    const data = await ask("flow", getCode());
    const out = root.querySelector("#mermaid-out") as HTMLElement;
    (root.querySelector("#flow-box") as HTMLElement).hidden = false;
    out.innerHTML = "";
    const { svg } = await mermaid.render("flow-" + Date.now(), String(data.mermaid || ""));
    out.innerHTML = svg;
    setStatus(root, null);
  } catch (e) {
    setStatus(root, String(e), "error");
  }
}

async function doRun(root: HTMLElement): Promise<void> {
  const box = root.querySelector("#run-box") as HTMLElement;
  const msg = root.querySelector("#run-msg") as HTMLElement;
  const stdout = root.querySelector("#run-stdout") as HTMLElement;
  const vars = root.querySelector("#var-boxes") as HTMLElement;
  box.hidden = false;
  msg.textContent = "Loading Pyodide…";
  vars.innerHTML = "";
  stdout.textContent = "";

  let result = await runWithTrace(getCode());
  if (result.needsServer) {
    msg.innerHTML =
      `This file needs a server to run. Explore explanations and flow instead — or ` +
      `<button class="linkish" id="use-runnable">try a built-in sample</button>.`;
    stdout.textContent = result.error || "";
    root.querySelector("#use-runnable")?.addEventListener("click", async () => {
      msg.textContent = "Running sample…";
      result = await runWithTrace(RUNNABLE_SAMPLE);
      setupPlayback(root, result, msg, stdout, vars);
    });
    return;
  }
  if (!result.ok) {
    msg.textContent = "Runtime error — see output below.";
    stdout.textContent = result.error || "";
    return;
  }
  setupPlayback(root, result, msg, stdout, vars);
}

function setupPlayback(
  root: HTMLElement,
  result: Awaited<ReturnType<typeof runWithTrace>>,
  msg: HTMLElement,
  stdout: HTMLElement,
  vars: HTMLElement
): void {
  msg.textContent = `Recorded ${result.frames.length} steps. Press Play.`;
  stdout.textContent = result.stdout || "(no print output)";
  const timeline = root.querySelector("#pb-timeline") as HTMLInputElement;
  timeline.max = String(Math.max(0, result.frames.length - 1));
  timeline.value = "0";
  playback.onUpdate = (frame: TraceFrame | null, index: number) => {
    timeline.value = String(index);
    if (!frame) return;
    highlightLine(frame.line);
    vars.innerHTML =
      Object.entries(frame.locals)
        .map(
          ([k, v]) =>
            `<div class="var-box"><span class="var-name">${esc(k)}</span>` +
            `<span class="var-val">${esc(v)}</span></div>`
        )
        .join("") || `<div class="muted">No locals yet</div>`;
  };
  playback.load(result.frames);
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
