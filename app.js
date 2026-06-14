const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

const els = {
  supportBadge: document.querySelector("#supportBadge"),
  startBtn: document.querySelector("#startBtn"),
  stopBtn: document.querySelector("#stopBtn"),
  clearBtn: document.querySelector("#clearBtn"),
  refreshBtn: document.querySelector("#refreshBtn"),
  exportBtn: document.querySelector("#exportBtn"),
  copyPromptBtn: document.querySelector("#copyPromptBtn"),
  generateBtn: document.querySelector("#generateBtn"),
  pulse: document.querySelector("#pulse"),
  sessionState: document.querySelector("#sessionState"),
  sessionTime: document.querySelector("#sessionTime"),
  statusLine: document.querySelector("#statusLine"),
  interimText: document.querySelector("#interimText"),
  transcriptList: document.querySelector("#transcriptList"),
  utteranceCount: document.querySelector("#utteranceCount"),
  frequentList: document.querySelector("#frequentList"),
  frequentTemplate: document.querySelector("#frequentItemTemplate"),
  apiKey: document.querySelector("#apiKey"),
  modelName: document.querySelector("#modelName"),
  englishOutput: document.querySelector("#englishOutput")
};

const storeKey = "ksej:utterances:v1";
const modelStoreKey = "ksej:model:v1";
const minSentenceLength = 4;

let recognition = null;
let isListening = false;
let startedAt = null;
let timerId = null;
let utterances = loadUtterances();

function loadUtterances() {
  try {
    const parsed = JSON.parse(localStorage.getItem(storeKey) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveUtterances() {
  localStorage.setItem(storeKey, JSON.stringify(utterances));
}

function normalizeSentence(text) {
  return text
    .replace(/\s+/g, " ")
    .replace(/[“”"']/g, "")
    .replace(/[.?!。！？]+$/g, "")
    .trim();
}

function splitSentences(text) {
  return text
    .split(/(?<=[.?!。！？])\s+|[\n\r]+/g)
    .map(normalizeSentence)
    .filter((sentence) => sentence.length >= minSentenceLength);
}

function formatClock(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function updateTimer() {
  els.sessionTime.textContent = startedAt ? formatClock(Date.now() - startedAt) : "00:00:00";
}

function setListeningState(nextState) {
  isListening = nextState;
  els.startBtn.disabled = nextState || !SpeechRecognition;
  els.stopBtn.disabled = !nextState;
  els.pulse.classList.toggle("active", nextState);
  els.sessionState.textContent = nextState ? "듣는 중" : "대기 중";

  if (nextState) {
    startedAt = Date.now();
    timerId = window.setInterval(updateTimer, 500);
  } else {
    window.clearInterval(timerId);
    timerId = null;
    startedAt = null;
    updateTimer();
  }
}

function addUtterance(text) {
  const sentences = splitSentences(text);
  const now = new Date().toISOString();

  sentences.forEach((sentence) => {
    utterances.unshift({
      id: crypto.randomUUID(),
      text: sentence,
      normalized: normalizeSentence(sentence).toLocaleLowerCase("ko-KR"),
      createdAt: now
    });
  });

  if (sentences.length > 0) {
    utterances = utterances.slice(0, 1000);
    saveUtterances();
    render();
  }
}

function buildFrequency() {
  const grouped = new Map();

  utterances.forEach((item) => {
    if (!grouped.has(item.normalized)) {
      grouped.set(item.normalized, {
        text: item.text,
        count: 0,
        latest: item.createdAt
      });
    }

    const entry = grouped.get(item.normalized);
    entry.count += 1;
    if (item.createdAt > entry.latest) entry.latest = item.createdAt;
  });

  return Array.from(grouped.values()).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return b.latest.localeCompare(a.latest);
  });
}

function getTopSentences(limit = 10) {
  return buildFrequency().slice(0, limit);
}

function renderTranscript() {
  els.transcriptList.replaceChildren();
  els.utteranceCount.textContent = `${utterances.length}개 문장`;

  utterances.slice(0, 80).forEach((item) => {
    const li = document.createElement("li");
    const text = document.createElement("span");
    const time = document.createElement("time");

    text.textContent = item.text;
    time.dateTime = item.createdAt;
    time.textContent = new Intl.DateTimeFormat("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).format(new Date(item.createdAt));

    li.append(text, time);
    els.transcriptList.append(li);
  });
}

function renderFrequent() {
  els.frequentList.replaceChildren();
  const topSentences = getTopSentences(10);

  if (topSentences.length === 0) {
    const empty = document.createElement("p");
    empty.className = "status-line";
    empty.textContent = "아직 분석할 문장이 없습니다.";
    els.frequentList.append(empty);
    return;
  }

  topSentences.forEach((item) => {
    const node = els.frequentTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector("strong").textContent = item.text;
    node.querySelector("span").textContent = `${item.count}회`;
    node.querySelector("button").addEventListener("click", () => {
      els.englishOutput.textContent = buildPrompt([item]);
    });
    els.frequentList.append(node);
  });
}

function render() {
  renderTranscript();
  renderFrequent();
}

function setupRecognition() {
  if (!SpeechRecognition) {
    els.supportBadge.textContent = "음성 인식 미지원";
    els.statusLine.textContent = "이 브라우저는 음성 인식을 지원하지 않습니다. 갤럭시의 Chrome 또는 Samsung Internet에서 HTTPS 주소로 열어 주세요.";
    els.startBtn.disabled = true;
    return;
  }

  els.supportBadge.textContent = "음성 인식 가능";
  recognition = new SpeechRecognition();
  recognition.lang = "ko-KR";
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    let interim = "";

    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const transcript = result[0]?.transcript || "";

      if (result.isFinal) {
        addUtterance(transcript);
      } else {
        interim += transcript;
      }
    }

    els.interimText.textContent = interim.trim();
  };

  recognition.onerror = (event) => {
    els.statusLine.textContent = `음성 인식 오류: ${event.error}`;
  };

  recognition.onend = () => {
    els.interimText.textContent = "";
    if (isListening) {
      window.setTimeout(() => {
        try {
          recognition.start();
        } catch {
          setListeningState(false);
        }
      }, 400);
    }
  };
}

function startListening() {
  if (!recognition) return;

  try {
    recognition.start();
    setListeningState(true);
    els.statusLine.textContent = "말하면 자동으로 한국어 문장을 기록합니다. 화면이 꺼지면 브라우저가 인식을 멈출 수 있습니다.";
  } catch {
    els.statusLine.textContent = "이미 음성 인식이 실행 중입니다.";
  }
}

function stopListening() {
  if (!recognition) return;
  setListeningState(false);
  recognition.stop();
  els.statusLine.textContent = "정지했습니다. 오늘 자주 쓴 문장을 확인해 보세요.";
}

function buildPrompt(sentences = getTopSentences(10)) {
  const lines = sentences.map((item, index) => `${index + 1}. ${item.text} (${item.count}회)`).join("\n");
  return `아래는 오늘 내가 한국어로 자주 말한 문장입니다.

각 문장을 자연스러운 영어로 바꾸고, 너무 직역하지 말고 실제 회화에서 쓸 표현으로 정리해 주세요.
출력 형식:
- 한국어
- 자연스러운 영어
- 더 공손한 표현
- 짧은 발음/사용 팁

문장:
${lines || "아직 문장이 없습니다."}`;
}

async function copyPrompt() {
  const prompt = buildPrompt();
  await navigator.clipboard.writeText(prompt);
  els.statusLine.textContent = "영작 프롬프트를 복사했습니다.";
}

async function generateEnglish() {
  const apiKey = els.apiKey.value.trim();
  const model = els.modelName.value.trim();
  const sentences = getTopSentences(10);

  if (sentences.length === 0) {
    els.englishOutput.textContent = "먼저 한국어 문장을 기록해 주세요.";
    return;
  }

  if (!apiKey || !model) {
    els.englishOutput.textContent = buildPrompt(sentences);
    els.statusLine.textContent = "API 키나 모델명이 비어 있어 프롬프트만 만들었습니다.";
    return;
  }

  localStorage.setItem(modelStoreKey, model);
  els.generateBtn.disabled = true;
  els.englishOutput.textContent = "영어 문장을 만드는 중입니다...";

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        input: buildPrompt(sentences)
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || response.statusText);
    }

    const data = await response.json();
    const text = extractResponseText(data);
    els.englishOutput.textContent = text || "응답을 읽지 못했습니다. 프롬프트 복사 기능을 사용해 주세요.";
    els.statusLine.textContent = "영어 문장 정리가 끝났습니다.";
  } catch (error) {
    els.englishOutput.textContent = `영작 요청에 실패했습니다.\n\n${error.message}\n\n아래 프롬프트를 복사해서 다른 AI 도구에 붙여 넣을 수 있습니다.\n\n${buildPrompt(sentences)}`;
    els.statusLine.textContent = "영작 요청 실패";
  } finally {
    els.generateBtn.disabled = false;
  }
}

function extractResponseText(data) {
  if (typeof data.output_text === "string") return data.output_text;
  if (!Array.isArray(data.output)) return "";

  return data.output
    .flatMap((item) => item.content || [])
    .map((content) => content.text || "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

function exportData() {
  const payload = {
    exportedAt: new Date().toISOString(),
    utterances,
    frequentSentences: getTopSentences(30)
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `korean-speech-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function clearToday() {
  const confirmed = window.confirm("오늘 저장된 문장을 모두 삭제할까요?");
  if (!confirmed) return;
  utterances = [];
  saveUtterances();
  els.englishOutput.textContent = "기록을 삭제했습니다.";
  render();
}

function restoreSettings() {
  els.modelName.value = localStorage.getItem(modelStoreKey) || els.modelName.value;
}

function bindEvents() {
  els.startBtn.addEventListener("click", startListening);
  els.stopBtn.addEventListener("click", stopListening);
  els.refreshBtn.addEventListener("click", renderFrequent);
  els.clearBtn.addEventListener("click", clearToday);
  els.exportBtn.addEventListener("click", exportData);
  els.copyPromptBtn.addEventListener("click", copyPrompt);
  els.generateBtn.addEventListener("click", generateEnglish);
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

restoreSettings();
setupRecognition();
bindEvents();
render();
