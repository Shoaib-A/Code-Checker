import os
import json
import re
from pathlib import Path
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

app = Flask(__name__)
CORS(app)

GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")
MAX_LINES = 300

modes = [
    {
        "name": "explain",
        "description": "Line-by-line explanations at a chosen depth",
        "instructions": (
            "Explain the code. Group into small blocks when lines belong together. "
            "Keep each explanation to 1 short sentence. Depth in extra.depth: beginner|exam|senior. "
            "Return COMPLETE valid JSON only, no markdown. "
            "Shape: {\"lines\":[{\"line\":1,\"code\":\"...\",\"explanation\":\"...\"}]}"
        ),
        "returns": "JSON list of {line, code, explanation}",
    },
    {
        "name": "flow",
        "description": "Mermaid flowchart of how calls travel through functions",
        "instructions": "Make a Mermaid flowchart of calls/requests through the functions. ONLY JSON: {\"mermaid\":\"flowchart TD\\n A-->B\"}",
        "returns": "JSON with mermaid string",
    },
    {
        "name": "predict",
        "description": "Ask what a variable will be at a given line",
        "instructions": "Pick one line; ask what a variable is there. ONLY JSON: {\"line\":5,\"variable\":\"x\",\"question\":\"...\",\"expected\":\"...\"}",
        "returns": "JSON with line, variable, question, expected",
    },
    {
        "name": "bug",
        "description": "Secretly change ONE thing; user must find the bug",
        "instructions": "Change EXACTLY ONE thing to plant a subtle bug. ONLY JSON: {\"modified_code\":\"...\",\"bug_line\":12,\"explanation\":\"...\"}",
        "returns": "JSON with modified_code, bug_line, explanation",
    },
    {
        "name": "check_bug",
        "description": "Check if the user found the right buggy line",
        "instructions": "extra has bug_line, user_line, user_reason, explanation. Decide if correct. ONLY JSON: {\"correct\":true,\"feedback\":\"...\"}",
        "returns": "JSON with correct and feedback",
    },
    {
        "name": "whatif",
        "description": "Edge-case questions about the code",
        "instructions": "If no extra.user_answer: ask one edge-case. ONLY JSON: {\"question\":\"...\"}. Else feedback. ONLY JSON: {\"feedback\":\"...\",\"good\":true}",
        "returns": "JSON with question, or feedback + good",
    },
    {
        "name": "examine",
        "description": "Oral exam: next or follow-up question about THEIR code",
        "instructions": "Strict but fair examiner. Dig deeper if vague. extra.history = [{role,content}]. Max ~8 Qs. Next: {\"done\":false,\"question\":\"...\"}. Done: {\"done\":true,\"message\":\"...\"}",
        "returns": "JSON with done + question or message",
    },
    {
        "name": "report",
        "description": "Readiness report with scores per concept",
        "instructions": "From code + extra.history, score concepts that appear in the code. ONLY JSON: {\"score\":0-100,\"concepts\":[{\"name\":\"...\",\"score\":0-100}],\"strengths\":[\"...\"],\"review\":[\"...\"]}",
        "returns": "JSON with score, concepts, strengths, review",
    },
]


def find_mode(name):
    for mode in modes:
        if mode["name"] == name:
            return mode
    return None


def build_prompt(mode, code, extra):
    prompt = "Help a student defend their code.\n"
    prompt += "Reply with ONE complete JSON object only. No markdown fences. No text before/after.\n"
    prompt += "Finish the whole JSON — do not stop mid-string.\n\n"
    prompt += "MODE: " + mode["name"] + "\n"
    prompt += "INSTRUCTIONS: " + mode["instructions"] + "\n\n"
    prompt += "CODE:\n" + code + "\n\n"
    if extra:
        prompt += "EXTRA DATA (JSON):\n" + json.dumps(extra) + "\n"
    return prompt


def ask_ai(prompt):
    token = os.getenv("GROQ_API_KEY")
    if not token:
        return None, "Missing GROQ_API_KEY. Add it to backend/.env"

    try:
        payload = {
            "model": GROQ_MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 8192,
            "temperature": 0.2,
            "response_format": {"type": "json_object"},
        }
        res = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": "Bearer " + token,
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=120,
        )
        if res.status_code == 400 and "response_format" in res.text:
            payload.pop("response_format", None)
            res = requests.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": "Bearer " + token,
                    "Content-Type": "application/json",
                },
                json=payload,
                timeout=120,
            )
        if res.status_code != 200:
            return None, "AI error: " + res.text[:300]
        data = res.json()
        text = data["choices"][0]["message"]["content"]
        return text, None
    except Exception as e:
        return None, "AI error: " + str(e)


def salvage_partial_json(text):
    """If the model got cut off, keep complete line objects when possible."""
    objs = re.findall(
        r'\{\s*"line"\s*:\s*\d+\s*,\s*"code"\s*:\s*"(?:\\.|[^"\\])*"\s*,\s*"explanation"\s*:\s*"(?:\\.|[^"\\])*"\s*\}',
        text,
    )
    if objs:
        lines = []
        for chunk in objs:
            try:
                lines.append(json.loads(chunk))
            except Exception:
                pass
        if lines:
            return {"lines": lines}

    fixed = text.rstrip()
    if fixed.count('"') % 2 == 1:
        fixed += '"'
    open_curly = fixed.count("{") - fixed.count("}")
    open_square = fixed.count("[") - fixed.count("]")
    fixed += "]" * max(0, open_square)
    fixed += "}" * max(0, open_curly)
    try:
        return json.loads(fixed)
    except Exception:
        return None


def parse_json(text):
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    if not cleaned.startswith("{"):
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start != -1 and end != -1 and end > start:
            cleaned = cleaned[start : end + 1]
    try:
        return json.loads(cleaned)
    except Exception:
        saved = salvage_partial_json(cleaned)
        if saved is not None:
            return saved
        return {"error": "Could not parse AI response as JSON", "raw": text[:500]}


@app.route("/api/modes", methods=["GET"])
def get_modes():
    result = []
    for mode in modes:
        result.append({"name": mode["name"], "description": mode["description"]})
    return jsonify(result)


@app.route("/api/ask", methods=["POST"])
def ask():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    mode_name = data.get("mode")
    code = data.get("code", "")
    extra = data.get("extra") or {}

    if not code or not str(code).strip():
        return jsonify({"error": "Code is empty. Paste some code first."}), 400

    line_count = len(str(code).splitlines())
    if line_count > MAX_LINES:
        return jsonify({"error": f"Code is too long ({line_count} lines). Limit is {MAX_LINES}."}), 400

    mode = find_mode(mode_name)
    if mode is None:
        return jsonify({"error": f"Unknown mode: {mode_name}"}), 400

    text, err = ask_ai(build_prompt(mode, code, extra))
    if err:
        status = 500 if "AI error" in err else 400
        return jsonify({"error": err}), status

    return jsonify(parse_json(text))


if __name__ == "__main__":
    app.run(debug=True, port=5001)
