import "./style.css";
import { initEditor, setCode, fetchGithubFile } from "./editor";
import { SAMPLE_CODE } from "./sample";
import { mountUnderstand } from "./understand";
import { mountPractice } from "./practice";
import { mountDefend } from "./defend";

type Stage = "understand" | "practice" | "defend";

const app = document.getElementById("app")!;

app.innerHTML = `
  <div class="atmosphere" aria-hidden="true">
    <div class="orb orb-a"></div>
    <div class="orb orb-b"></div>
    <div class="grid-wash"></div>
  </div>

  <div class="shell">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">
          <span class="brand-mark-inner">D</span>
        </span>
        <div class="brand-copy">
          <div class="brand-name">Defend</div>
          <div class="brand-tag">private examiner for any code</div>
        </div>
      </div>

      <nav class="stages" role="tablist" aria-label="Stages">
        <span class="stage-pill" id="stage-pill" aria-hidden="true"></span>
        <button class="stage active" data-stage="understand" data-i="0">Understand</button>
        <button class="stage" data-stage="practice" data-i="1">Practice</button>
        <button class="stage" data-stage="defend" data-i="2">Defend</button>
      </nav>

      <div class="top-actions">
        <button class="btn ghost" id="btn-sample">Load sample</button>
      </div>
    </header>

    <main class="workspace">
      <section class="code-pane panel">
        <div class="code-toolbar">
          <div class="pane-heading">
            <span class="pane-dot"></span>
            <span class="pane-title">Your code</span>
          </div>
          <div class="github-row">
            <input id="github-url" class="text-input compact" placeholder="GitHub file URL" />
            <button class="btn tiny" id="btn-github">Fetch</button>
          </div>
        </div>
        <div class="editor-wrap">
          <div id="code-gutter" class="code-gutter" aria-hidden="true"></div>
          <div class="code-stack">
            <textarea id="code-input" spellcheck="false" placeholder="# Paste Python here…"></textarea>
            <pre id="code-viewer" class="code-viewer" aria-hidden="true"></pre>
          </div>
        </div>
      </section>

      <section class="stage-pane panel">
        <div id="stage-root" class="stage-root"></div>
      </section>
    </main>
  </div>
`;

initEditor();
setCode(SAMPLE_CODE);

const stageRoot = document.getElementById("stage-root")!;
const stagePill = document.getElementById("stage-pill")!;

function movePill(btn: HTMLElement): void {
  stagePill.style.width = `${btn.offsetWidth}px`;
  stagePill.style.transform = `translateX(${btn.offsetLeft}px)`;
}

function showStage(stage: Stage): void {
  const buttons = Array.from(document.querySelectorAll(".stage")) as HTMLElement[];
  buttons.forEach((btn) => {
    const on = btn.dataset.stage === stage;
    btn.classList.toggle("active", on);
    if (on) movePill(btn);
  });

  stageRoot.classList.remove("enter");
  void stageRoot.offsetWidth;
  stageRoot.classList.add("enter");

  if (stage === "understand") mountUnderstand(stageRoot);
  else if (stage === "practice") mountPractice(stageRoot);
  else mountDefend(stageRoot);
}

document.querySelectorAll(".stage").forEach((btn) => {
  btn.addEventListener("click", () => {
    showStage((btn as HTMLElement).dataset.stage as Stage);
  });
});

document.getElementById("btn-sample")!.addEventListener("click", () => {
  setCode(SAMPLE_CODE);
});

document.getElementById("btn-github")!.addEventListener("click", async () => {
  const input = document.getElementById("github-url") as HTMLInputElement;
  try {
    setCode(await fetchGithubFile(input.value));
  } catch (e) {
    alert(String(e));
  }
});

window.addEventListener("resize", () => {
  const active = document.querySelector(".stage.active") as HTMLElement | null;
  if (active) movePill(active);
});

showStage("understand");
requestAnimationFrame(() => {
  const active = document.querySelector(".stage.active") as HTMLElement | null;
  if (active) movePill(active);
});
