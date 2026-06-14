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
  runDailyBtn: document.querySelector("#runDailyBtn"),
  copyDailyBtn: document.querySelector("#copyDailyBtn"),
  pulse: document.querySelector("#pulse"),
  sessionState: document.querySelector("#sessionState"),
  sessionTime: document.querySelector("#sessionTime"),
  statusLine: document.querySelector("#statusLine"),
  scheduleStatus: document.querySelector("#scheduleStatus"),
  interimText: document.querySelector("#interimText"),
  transcriptList: document.querySelector("#transcriptList"),
  utteranceCount: document.querySelector("#utteranceCount"),
  frequentList: document.querySelector("#frequentList"),
  frequentTemplate: document.querySelector("#frequentItemTemplate"),
  apiKey: document.querySelector("#apiKey"),
  modelName: document.querySelector("#modelName"),
  englishOutput: document.querySelector("#englishOutput"),
  dailyOutput: document.querySelector("#dailyOutput")
};

const storeKey = "ksej:utterances:v1";
const modelStoreKey = "ksej:model:v1";
const dailySummaryStoreKey = "ksej:daily-summary:v2";
const lastAutoSummaryDateKey = "ksej:last-auto-summary-date:v1";
const minSentenceLength = 4;
const autoSummaryHour = 23;

const lifeExpressionMarkers = [
  "안녕",
  "고마",
  "미안",
  "괜찮",
  "좋아",
  "싫어",
  "주세요",
  "부탁",
  "먹",
  "마시",
  "가자",
  "가야",
  "갈게",
  "왔",
  "전화",
  "문자",
  "카톡",
  "나중",
  "오늘",
  "내일",
  "어제",
  "지금",
  "잠깐",
  "빨리",
  "천천",
  "어디",
  "언제",
  "뭐",
  "왜",
  "어떻게",
  "얼마",
  "피곤",
  "배고",
  "졸려",
  "춥",
  "덥",
  "아파",
  "도와",
  "필요",
  "할게",
  "해야",
  "할 수"
];

let recognition = null;
let isListening = false;
let startedAt = null;
let timerId = null;
let scheduleTimerId = null;
let utterances = loadUtterances();
let lastDailySummary = loadDailySummary();

function loadUtterances() {
  try {
    const parsed = JSON.parse(localStorage.getItem(storeKey) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadDailySummary() {
  try {
    const parsed = JSON.parse(localStorage.getItem(dailySummaryStoreKey) || "null");
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function saveUtterances() {
  localStorage.setItem(storeKey, JSON.stringify(utterances));
}

function saveDailySummary(summary) {
  lastDailySummary = summary;
  localStorage.setItem(dailySummaryStoreKey, JSON.stringify(summary));
}

function todayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isToday(isoDate, date = new Date()) {
  return todayKey(new Date(isoDate)) === todayKey(date);
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
    utterances = utterances.slice(0, 2000);
    saveUtterances();
    render();
  }
}

function buildFrequency(items = utterances) {
  const grouped = new Map();

  items.forEach((item) => {
    if (!grouped.has(item.normalized)) {
      grouped.set(item.normalized, {
        text: item.text,
        count: 0,
        latest: item.createdAt,
        score: 0,
        reason: ""
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

function scoreLifeExpression(text) {
  const compactText = text.replace(/\s+/g, "");
  const markerScore = lifeExpressionMarkers.reduce((score, marker) => score + (text.includes(marker) ? 1 : 0), 0);
  const lengthScore = compactText.length >= 4 && compactText.length <= 28 ? 2 : 0;
  const questionScore = /[?？]$|^(어디|언제|뭐|왜|어떻게|얼마)/.test(text) ? 1 : 0;
  return markerScore + lengthScore + questionScore;
}

function getRepresentativeSentences(limit = 12, date = new Date()) {
  const todaysItems = utterances.filter((item) => isToday(item.createdAt, date));
  const sourceItems = todaysItems.length > 0 ? todaysItems : utterances;
  const grouped = buildFrequency(sourceItems);

  return grouped
    .map((item) => {
      const lifeScore = scoreLifeExpression(item.text);
      const repeatScore = item.count * 3;
      const score = repeatScore + lifeScore;
      const reasonParts = [];
      if (item.count > 1) reasonParts.push(`${item.count}회 반복`);
      if (lifeScore >= 2) reasonParts.push("생활 표현");
      if (reasonParts.length === 0) reasonParts.push("최근 기록");
      return { ...item, score, reason: reasonParts.join(", ") };
    })
    .filter((item) => item.count > 1 || scoreLifeExpression(item.text) >= 2)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.latest.localeCompare(a.latest);
    })
    .slice(0, limit);
}

function renderTranscript() {
  els.transcriptList.replaceChildren();
  els.utteranceCount.textContent = `${utterances.length}개 문장`;

  utterances.slice(0, 100).forEach((item) => {
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

function renderRepresentativeList() {
  els.frequentList.replaceChildren();
  const representativeSentences = getRepresentativeSentences(10);

  if (representativeSentences.length === 0) {
    const empty = document.createElement("p");
    empty.className = "status-line";
    empty.textContent = "아직 대표 후보로 고를 문장이 없습니다. 말을 조금 더 저장해 주세요.";
    els.frequentList.append(empty);
    return;
  }

  representativeSentences.forEach((item) => {
    const node = els.frequentTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector("strong").textContent = item.text;
    node.querySelector("span").textContent = item.reason;
    node.querySelector("button").addEventListener("click", () => {
      els.englishOutput.textContent = buildPrompt([item]);
    });
    els.frequentList.append(node);
  });
}

function renderDailySummary() {
  if (!lastDailySummary) {
    els.dailyOutput.textContent =
      "앱이 열려 있으면 23:00에 자동으로 대표 문장을 정리합니다. 앱이 닫혀 있으면 다음에 앱을 열 때 23시 이후인지 확인해 정리합니다.";
    return;
  }

  els.dailyOutput.textContent = lastDailySummary.text;
}

function renderScheduleStatus() {
  const now = new Date();
  const lastDate = localStorage.getItem(lastAutoSummaryDateKey);

  if (lastDate === todayKey(now)) {
    els.scheduleStatus.textContent = "오늘 23시 정리를 완료했습니다.";
    return;
  }

  if (now.getHours() >= autoSummaryHour) {
    els.scheduleStatus.textContent = "23시가 지났습니다. 앱이 열려 있으므로 자동 정리를 실행할 수 있습니다.";
    return;
  }

  els.scheduleStatus.textContent = "오늘 23:00에 자동 정리를 준비합니다.";
}

function render() {
  renderTranscript();
  renderRepresentativeList();
  renderDailySummary();
  renderScheduleStatus();
}

function setupRecognition() {
  if (!SpeechRecognition) {
    els.supportBadge.textContent = "음성 인식 미지원";
    els.statusLine.textContent =
      "이 브라우저는 음성 인식을 지원하지 않습니다. 갤럭시의 Chrome 또는 Samsung Internet에서 HTTPS 주소로 열어 주세요.";
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
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      els.statusLine.textContent = "마이크 권한이 필요합니다. 브라우저 주소창의 권한 설정에서 마이크를 허용해 주세요.";
      setListeningState(false);
      return;
    }

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
    els.statusLine.textContent =
      "한국어 말을 텍스트로 저장합니다. 번역은 바로 하지 않고, 대표 후보 문장만 23시에 정리합니다.";
  } catch {
    els.statusLine.textContent = "이미 음성 인식이 실행 중입니다.";
  }
}

function stopListening() {
  if (!recognition) return;
  setListeningState(false);
  recognition.stop();
  els.statusLine.textContent = "정지했습니다. 저장된 말은 23시 정리 대상 후보로 남아 있습니다.";
}

function buildPrompt(sentences = getRepresentativeSentences(12)) {
  const lines = sentences.map((item, index) => `${index + 1}. ${item.text} (${item.reason || `${item.count}회`})`).join("\n");
  return `아래는 오늘 내가 한국어로 말한 내용 중 대표 후보만 고른 목록입니다.

모든 말을 번역하지 말고, 실제 생활에서 다시 쓸 만한 표현만 자연스러운 영어 회화 문장으로 정리해 주세요.
너무 직역하지 말고, 내가 실제로 말할 수 있는 짧고 자연스러운 표현을 우선해 주세요.

출력 형식:
- 한국어
- 자연스러운 영어
- 더 공손한 표현
- 짧은 사용 팁

대표 후보:
${lines || "아직 대표 후보 문장이 없습니다."}`;
}

async function copyPrompt() {
  const prompt = buildPrompt();
  await navigator.clipboard.writeText(prompt);
  els.statusLine.textContent = "대표 후보 문장용 영작 프롬프트를 복사했습니다.";
}

async function requestEnglishSummary(sentences, options = {}) {
  const apiKey = els.apiKey.value.trim();
  const model = els.modelName.value.trim();
  const prompt = buildPrompt(sentences);

  if (sentences.length === 0) {
    return {
      mode: "empty",
      text: "정리할 대표 후보 문장이 없습니다. 먼저 한국어 말을 더 저장해 주세요."
    };
  }

  if (!apiKey || !model) {
    return {
      mode: "prompt",
      text: `${options.auto ? "23시 자동 정리 시간이 되었지만 API 키가 없어 번역 요청은 보내지 않았습니다." : "API 키나 모델명이 비어 있어 프롬프트만 만들었습니다."}\n\n${prompt}`
    };
  }

  localStorage.setItem(modelStoreKey, model);

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      input: prompt
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || response.statusText);
  }

  const data = await response.json();
  const text = extractResponseText(data);
  return {
    mode: "translated",
    text: text || "응답을 읽지 못했습니다. 프롬프트 복사 기능을 사용해 주세요."
  };
}

async function generateEnglish() {
  const sentences = getRepresentativeSentences(12);
  els.generateBtn.disabled = true;
  els.englishOutput.textContent = "대표 후보 문장을 정리하는 중입니다...";

  try {
    const result = await requestEnglishSummary(sentences);
    els.englishOutput.textContent = result.text;
    els.statusLine.textContent = result.mode === "translated" ? "대표 후보 문장 영어 정리가 끝났습니다." : "대표 후보 문장 프롬프트를 만들었습니다.";
  } catch (error) {
    els.englishOutput.textContent = `영작 요청에 실패했습니다.\n\n${error.message}\n\n아래 프롬프트를 복사해서 다른 AI 도구에 붙여 넣을 수 있습니다.\n\n${buildPrompt(sentences)}`;
    els.statusLine.textContent = "영작 요청 실패";
  } finally {
    els.generateBtn.disabled = false;
  }
}

async function runDailySummary(options = {}) {
  const sentences = getRepresentativeSentences(12);
  els.runDailyBtn.disabled = true;
  els.dailyOutput.textContent = "23시 정리 대상 문장을 고르는 중입니다...";

  try {
    const result = await requestEnglishSummary(sentences, options);
    const summary = {
      date: todayKey(),
      createdAt: new Date().toISOString(),
      mode: result.mode,
      candidateCount: sentences.length,
      text: result.text
    };

    saveDailySummary(summary);

    if (options.auto) {
      localStorage.setItem(lastAutoSummaryDateKey, todayKey());
    }

    els.dailyOutput.textContent = result.text;
    els.scheduleStatus.textContent =
      result.mode === "translated" ? "23시 자동 영어 정리를 완료했습니다." : "23시 정리 프롬프트를 만들어 두었습니다.";
  } catch (error) {
    const fallbackText = `23시 정리 요청에 실패했습니다.\n\n${error.message}\n\n아래 프롬프트를 복사해서 다른 AI 도구에 붙여 넣을 수 있습니다.\n\n${buildPrompt(sentences)}`;
    saveDailySummary({
      date: todayKey(),
      createdAt: new Date().toISOString(),
      mode: "error",
      candidateCount: sentences.length,
      text: fallbackText
    });
    els.dailyOutput.textContent = fallbackText;
    els.scheduleStatus.textContent = "23시 정리 요청에 실패했습니다.";
  } finally {
    els.runDailyBtn.disabled = false;
    renderScheduleStatus();
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
    representativeSentences: getRepresentativeSentences(30),
    lastDailySummary
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

async function copyDailySummary() {
  const text = lastDailySummary?.text || els.dailyOutput.textContent.trim();
  await navigator.clipboard.writeText(text);
  els.scheduleStatus.textContent = "마지막 23시 정리 내용을 복사했습니다.";
}

function checkDailySchedule() {
  renderScheduleStatus();

  const now = new Date();
  const lastDate = localStorage.getItem(lastAutoSummaryDateKey);
  const shouldRun = now.getHours() >= autoSummaryHour && lastDate !== todayKey(now);

  if (shouldRun) {
    runDailySummary({ auto: true });
  }
}

function startDailyScheduler() {
  checkDailySchedule();
  scheduleTimerId = window.setInterval(checkDailySchedule, 60 * 1000);
}

function restoreSettings() {
  els.modelName.value = localStorage.getItem(modelStoreKey) || els.modelName.value;
}

function bindEvents() {
  els.startBtn.addEventListener("click", startListening);
  els.stopBtn.addEventListener("click", stopListening);
  els.refreshBtn.addEventListener("click", renderRepresentativeList);
  els.clearBtn.addEventListener("click", clearToday);
  els.exportBtn.addEventListener("click", exportData);
  els.copyPromptBtn.addEventListener("click", copyPrompt);
  els.generateBtn.addEventListener("click", generateEnglish);
  els.runDailyBtn.addEventListener("click", () => runDailySummary({ auto: false }));
  els.copyDailyBtn.addEventListener("click", copyDailySummary);
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

restoreSettings();
setupRecognition();
bindEvents();
render();
startDailyScheduler();
