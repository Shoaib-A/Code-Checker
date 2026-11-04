import { ask } from "./api";
import { getCode, highlightLine, setCode, setLineClickHandler } from "./editor";
import { runWithTrace } from "./runner";

interface PredictData {
  line: number;
  variable: string;
  question: string;
  expected: string;
}

interface BugData {
  modified_code: string;
  bug_line: number;
  explanation: string;
}

let predict: PredictData | null = null;
let bug: BugData | null = null;
let selectedBugLine = 0;

export function mountPractice(root: HTMLElement): void {
  root.innerHTML = `
    <div class="panel-header">
      <h2>Practice</h2>
      <p class="muted">Predict, spot the bug, and answer what-if questions.</p>
    </div>
    <div class="tabs">
      <button class="tab active" data-tab="predict">Predict output</button>
      <button class="tab" data-tab="bug">Spot the bug</button>
      <button class="tab" data-tab="whatif">What if…</button>
    </div>
    <div id="practice-status" class="status" hidden></div>
    <section class="practice-pane" data-pane="predict">
      <button class="btn primary" id="btn-predict">Get a question</button>
      <p id="predict-q" class="prompt-text"></p>
      <input id="predict-answer" class="text-input" placeholder="Your prediction…" />
      <button class="btn" id="btn-check-predict" disabled>Check with Pyodide</button>
      <div id="predict-feedback" class="feedback"></div>
    </section>
    <section class="practice-pane" data-pane="bug" hidden>
      <button class="btn primary" id="btn-bug">Introduce a secret bug</button>
      <p class="muted">Click the line you think is broken, then explain why.</p>
      <textarea id="bug-reason" class="text-area" rows="3" placeholder="Why is this line wrong?"></textarea>
      <button class="btn" id="btn-check-bug" disabled>Submit my guess</button>
      <div id="bug-feedback" class="feedback"></div>
    </section>
    <section class="practice-pane" data-pane="whatif" hidden>
      <button class="btn primary" id="btn-whatif">Ask a what-if</button>
      <p id="whatif-q" class="prompt-text"></p>
      <textarea id="whatif-answer" class="text-area" rows="3" placeholder="Your answer…"></textarea>
      <button class="btn" id="btn-check-whatif" disabled>Get feedback</button>
      <div id="whatif-feedback" class="feedback"></div>
    </section>
  `;

  root.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      root.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const name = (tab as HTMLElement).dataset.tab;
      root.querySelectorAll(".practice-pane").forEach((pane) => {
        (pane as HTMLElement).hidden = (pane as HTMLElement).dataset.pane !== name;
      });
      setLineClickHandler(name === "bug" ? (line) => (selectedBugLine = line) : null);
    });
  });

  root.querySelector("#btn-predict")!.addEventListener("click", () => void startPredict(root));
  root.querySelector("#btn-check-predict")!.addEventListener("click", () => void checkPredict(root));
  root.querySelector("#btn-bug")!.addEventListener("click", () => void startBug(root));
  root.querySelector("#btn-check-bug")!.addEventListener("click", () => void checkBug(root));
  root.querySelector("#btn-whatif")!.addEventListener("click", () => void startWhatIf(root));
  root.querySelector("#btn-check-whatif")!.addEventListener("click", () => void checkWhatIf(root));
}

function setStatus(root: HTMLElement, text: string | null, kind: "info" | "error" = "info"): void {
  const el = root.querySelector("#practice-status") as HTMLElement;
  if (!text) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.className = `status ${kind}`;
  el.textContent = text;
}

async function startPredict(root: HTMLElement): Promise<void> {
  setStatus(root, "AI is picking a line…");
  try {
    const data = (await ask("predict", getCode())) as unknown as PredictData;
    predict = data;
    (root.querySelector("#predict-q") as HTMLElement).textContent =
      `Line ${data.line} — ${data.question}`;
    highlightLine(data.line);
    (root.querySelector("#btn-check-predict") as HTMLButtonElement).disabled = false;
    (root.querySelector("#predict-feedback") as HTMLElement).textContent = "";
    setStatus(root, null);
  } catch (e) {
    setStatus(root, String(e), "error");
  }
}

async function checkPredict(root: HTMLElement): Promise<void> {
  if (!predict) return;
  const answer = (root.querySelector("#predict-answer") as HTMLInputElement).value.trim();
  const fb = root.querySelector("#predict-feedback") as HTMLElement;
  const expected = String(predict.expected).toLowerCase();
  const okGuess =
    answer.length > 0 &&
    (expected.includes(answer.toLowerCase()) || answer.toLowerCase().includes(expected));
  fb.textContent = "Running code in the browser…";
  const result = await runWithTrace(getCode());
  if (result.needsServer) {
    fb.innerHTML =
      `<strong>${okGuess ? "Looks plausible." : "Not quite."}</strong> Expected: ${esc(predict.expected)}.`;
    return;
  }
  const near = result.frames.find((f) => f.line === predict!.line);
  const actual = near?.locals[predict.variable];
  fb.innerHTML =
    `<strong>${okGuess ? "Nice prediction." : "Keep thinking."}</strong> ` +
    `Expected: <code>${esc(predict.expected)}</code>` +
    (actual
      ? ` · At line ${predict.line}, <code>${esc(predict.variable)}</code> was <code>${esc(actual)}</code>.`
      : "");
}

async function startBug(root: HTMLElement): Promise<void> {
  setStatus(root, "AI is planting one subtle bug…");
  try {
    const data = (await ask("bug", getCode())) as unknown as BugData;
    bug = data;
    selectedBugLine = 0;
    setCode(data.modified_code);
    setLineClickHandler((line) => (selectedBugLine = line));
    (root.querySelector("#btn-check-bug") as HTMLButtonElement).disabled = false;
    (root.querySelector("#bug-feedback") as HTMLElement).textContent =
      "Click the buggy line, then explain why.";
    setStatus(root, null);
  } catch (e) {
    setStatus(root, String(e), "error");
  }
}

async function checkBug(root: HTMLElement): Promise<void> {
  if (!bug) return;
  const reason = (root.querySelector("#bug-reason") as HTMLTextAreaElement).value.trim();
  if (!selectedBugLine) {
    setStatus(root, "Click a line first.", "error");
    return;
  }
  setStatus(root, "Checking your guess…");
  try {
    const data = await ask("check_bug", getCode(), {
      bug_line: bug.bug_line,
      user_line: selectedBugLine,
      user_reason: reason,
      explanation: bug.explanation,
    });
    (root.querySelector("#bug-feedback") as HTMLElement).innerHTML =
      `<strong>${data.correct ? "You found it." : "Not that line."}</strong> ` +
      esc(String(data.feedback || ""));
    highlightLine(bug.bug_line);
    setStatus(root, null);
  } catch (e) {
    setStatus(root, String(e), "error");
  }
}

async function startWhatIf(root: HTMLElement): Promise<void> {
  setStatus(root, "AI is inventing an edge case…");
  try {
    const data = await ask("whatif", getCode(), {});
    (root.querySelector("#whatif-q") as HTMLElement).textContent = String(data.question || "");
    (root.querySelector("#btn-check-whatif") as HTMLButtonElement).disabled = false;
    (root.querySelector("#whatif-feedback") as HTMLElement).textContent = "";
    setStatus(root, null);
  } catch (e) {
    setStatus(root, String(e), "error");
  }
}

async function checkWhatIf(root: HTMLElement): Promise<void> {
  const question = (root.querySelector("#whatif-q") as HTMLElement).textContent || "";
  const user_answer = (root.querySelector("#whatif-answer") as HTMLTextAreaElement).value.trim();
  setStatus(root, "Getting feedback…");
  try {
    const data = await ask("whatif", getCode(), { question, user_answer });
    (root.querySelector("#whatif-feedback") as HTMLElement).innerHTML =
      `<strong>${data.good ? "Solid." : "Room to grow."}</strong> ` +
      esc(String(data.feedback || ""));
    setStatus(root, null);
  } catch (e) {
    setStatus(root, String(e), "error");
  }
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
