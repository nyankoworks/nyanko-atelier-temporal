(() => {
  const state = {
    cards: [],
    filtered: [],
    index: 0,
    flipped: false,
    group: "all",
    hidden: new Set(),
    important: new Set(),
    speechMode: "text",
    speechRate: "normal",
    speechParts: {
      question: true,
      answer: true,
      detail: true,
    },
    autoplayThinkTime: 5000,
    autoplayAnswerTime: 5000,
    autoplay: {
      active: false,
      paused: false,
      phase: "question",
      message: "",
      runId: 0,
      timerId: null,
      timerResolve: null,
      wakeLock: null,
    },
  };

  const $ = (id) => document.getElementById(id);
  const STORAGE_KEY = "genai-passport-ch1-card-settings-v2";
  const OLD_STORAGE_KEY = "genai-passport-ch1-card-position";
  const SPEECH_STORAGE_KEY = "genai-passport-ch1-speech-settings-v1";
  const AUTOPLAY_STORAGE_KEY = "genai-passport-ch1-autoplay-settings-v1";
  const AUTOPLAY_DURATIONS = [3000, 5000, 10000];
  const SPEECH_RATES = { slow: 0.75, normal: 1, fast: 1.25 };
  const speechSupported = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  let speechRequestId = 0;
  let speechWaitCancel = null;

  const cardStage = document.querySelector(".card-stage");
  const flashcard = $("flashcard");
  const emptyState = $("emptyState");
  const groupSelect = $("groupSelect");
  const progressLabel = $("progressLabel");
  const progressBar = $("progressBar");
  const frontGroup = $("frontGroup");
  const backGroup = $("backGroup");
  const frontNumber = $("frontNumber");
  const backNumber = $("backNumber");
  const frontTag = $("frontTag");
  const question = $("question");
  const answer = $("answer");
  const answerDetail = $("answerDetail");
  const cardImage = $("cardImage");
  const questionSpeakButton = $("questionSpeakButton");
  const answerSpeakButton = $("answerSpeakButton");
  const flipButton = $("flipButton");
  const prevButton = $("prevButton");
  const nextButton = $("nextButton");
  const importantButton = $("importantButton");
  const hideButton = $("hideButton");
  const sourceButton = $("sourceButton");
  const sourcePanel = $("sourcePanel");
  const sourceCurrent = $("sourceCurrent");
  const clearHiddenButton = $("clearHiddenButton");
  const speechStatus = $("speechStatus");
  const speechModeInputs = [...document.querySelectorAll('input[name="speechMode"]')];
  const speechRateSelect = $("speechRate");
  const speechPartInputs = {
    question: $("speechPartQuestion"),
    answer: $("speechPartAnswer"),
    detail: $("speechPartDetail"),
  };
  const autoplayStatus = $("autoplayStatus");
  const autoplayThinkTimeSelect = $("autoplayThinkTime");
  const autoplayAnswerTimeSelect = $("autoplayAnswerTime");
  const autoplayStartButton = $("autoplayStartButton");
  const autoplayPauseButton = $("autoplayPauseButton");
  const autoplayStopButton = $("autoplayStopButton");

  const cardId = (allIndex) => String(allIndex + 1).padStart(3, "0");
  const currentCard = () => state.filtered[state.index];
  const currentAllIndex = () => state.cards.indexOf(currentCard());
  const splitGroup = (group) => group.replace(/^第1章\s*/, "");

  function saveState() {
    const allIndex = currentAllIndex();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        hidden: [...state.hidden],
        important: [...state.important],
        allIndex: allIndex >= 0 ? allIndex : 0,
        group: state.group,
      }));
    } catch (_) {
      // Safariのプライベートブラウズなど、localStorageが使えない場合も学習は続ける。
    }
  }

  function saveSpeechSettings() {
    try {
      localStorage.setItem(SPEECH_STORAGE_KEY, JSON.stringify({
        mode: state.speechMode,
        rate: state.speechRate,
        parts: state.speechParts,
      }));
    } catch (_) {
      // 設定の保存に失敗しても、現在のページでは設定を使い続ける。
    }
  }

  function saveAutoplaySettings() {
    try {
      localStorage.setItem(AUTOPLAY_STORAGE_KEY, JSON.stringify({
        thinkTime: state.autoplayThinkTime,
        answerTime: state.autoplayAnswerTime,
      }));
    } catch (_) {
      // 設定の保存に失敗しても、現在のページでは設定を使い続ける。
    }
  }

  function loadSpeechSettings() {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(SPEECH_STORAGE_KEY) || "null");
    } catch (_) {
      saved = null;
    }
    if (!saved || typeof saved !== "object") return;

    if (["text", "manual", "auto"].includes(saved.mode)) state.speechMode = saved.mode;
    if (Object.prototype.hasOwnProperty.call(SPEECH_RATES, saved.rate)) state.speechRate = saved.rate;
    if (saved.parts && typeof saved.parts === "object") {
      Object.keys(state.speechParts).forEach((part) => {
        if (typeof saved.parts[part] === "boolean") state.speechParts[part] = saved.parts[part];
      });
    }
  }

  function loadAutoplaySettings() {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(AUTOPLAY_STORAGE_KEY) || "null");
    } catch (_) {
      saved = null;
    }
    if (!saved || typeof saved !== "object") return;

    if (AUTOPLAY_DURATIONS.includes(saved.thinkTime)) state.autoplayThinkTime = saved.thinkTime;
    if (AUTOPLAY_DURATIONS.includes(saved.answerTime)) state.autoplayAnswerTime = saved.answerTime;
  }

  function loadState() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch (_) { saved = null; }
    if (!saved) {
      try {
        const old = JSON.parse(localStorage.getItem(OLD_STORAGE_KEY) || "null");
        if (old) saved = { allIndex: old.allIndex, group: old.group };
      } catch (_) { saved = null; }
    }
    if (!saved) return { allIndex: 0, group: "all" };
    state.hidden = new Set(Array.isArray(saved.hidden) ? saved.hidden : []);
    state.important = new Set(Array.isArray(saved.important) ? saved.important : []);
    return {
      allIndex: Number.isInteger(saved.allIndex) ? saved.allIndex : 0,
      group: typeof saved.group === "string" ? saved.group : "all",
    };
  }

  function currentCardIsHidden() {
    const allIndex = currentAllIndex();
    return allIndex >= 0 && state.hidden.has(cardId(allIndex));
  }

  function speechValue(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function speechTextForPart(card, part) {
    if (!card) return "";
    const chunks = [];
    if (part === "question" && state.speechParts.question) {
      const value = speechValue(card.q);
      if (value) chunks.push(`問題。${value}`);
    }
    if (part === "answer" && state.speechParts.answer) {
      const value = speechValue(card.a);
      if (value) chunks.push(`答え。${value}`);
    }
    if (state.speechParts.detail) {
      const value = speechValue(card.detail);
      if (value) chunks.push(`補足。${value}`);
    }
    return chunks.join("\n");
  }

  function updateSpeechStatus() {
    if (!speechSupported) {
      speechStatus.textContent = "このブラウザでは読み上げを利用できません。";
      return;
    }
    if (state.speechMode === "text") {
      speechStatus.textContent = "文字だけモードです（読み上げオフ）。";
    } else if (state.speechMode === "manual") {
      speechStatus.textContent = "手動読み上げ：カードの🔊ボタンで読みます。";
    } else {
      speechStatus.textContent = "自動読み上げ：カードを開くと問題、めくると答えを読みます。";
    }
  }

  function updateSpeechControls() {
    speechModeInputs.forEach((input) => {
      input.checked = input.value === state.speechMode;
      input.disabled = !speechSupported;
    });
    speechRateSelect.value = state.speechRate;
    speechRateSelect.disabled = !speechSupported;
    Object.entries(speechPartInputs).forEach(([part, input]) => {
      input.checked = state.speechParts[part];
      input.disabled = !speechSupported;
    });

    const card = currentCard();
    const speechDisabled = !speechSupported || state.speechMode === "text" || !card || currentCardIsHidden();
    questionSpeakButton.disabled = speechDisabled || !speechTextForPart(card, "question");
    answerSpeakButton.disabled = speechDisabled || !speechTextForPart(card, "answer");
    updateSpeechStatus();
  }

  function stopSpeech() {
    speechRequestId += 1;
    if (speechWaitCancel) {
      const cancel = speechWaitCancel;
      speechWaitCancel = null;
      cancel();
    }
    if (speechSupported) window.speechSynthesis.cancel();
  }

  function scheduleAutoSpeech(part) {
    if (!speechSupported || state.speechMode !== "auto" || !currentCard() || currentCardIsHidden()) return;
    const requestId = ++speechRequestId;
    window.setTimeout(() => {
      if (requestId !== speechRequestId || state.speechMode !== "auto") return;
      speakPart(part);
    }, 0);
  }

  function speakPart(part, { waitForEnd = false } = {}) {
    const card = currentCard();
    if (!speechSupported || state.speechMode === "text" || !card || currentCardIsHidden()) {
      return waitForEnd ? Promise.resolve(true) : undefined;
    }
    const text = speechTextForPart(card, part);
    if (!text) return waitForEnd ? Promise.resolve(true) : undefined;

    stopSpeech();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ja-JP";
    utterance.rate = SPEECH_RATES[state.speechRate];
    utterance.pitch = 1;
    utterance.volume = 1;
    const requestId = speechRequestId;
    let finish = null;
    const completion = waitForEnd ? new Promise((resolve) => {
      let settled = false;
      finish = (completed) => {
        if (settled) return;
        settled = true;
        if (speechWaitCancel === finish) speechWaitCancel = null;
        resolve(completed);
      };
      speechWaitCancel = () => finish(false);
    }) : null;
    utterance.onend = () => {
      if (requestId === speechRequestId) updateSpeechStatus();
      if (finish) finish(true);
    };
    utterance.onerror = () => {
      if (requestId === speechRequestId) updateSpeechStatus();
      if (finish) finish(false);
    };
    try {
      window.speechSynthesis.speak(utterance);
    } catch (_) {
      updateSpeechStatus();
      if (finish) finish(false);
    }
    return completion || undefined;
  }

  function setSpeechMode(mode) {
    if (!["text", "manual", "auto"].includes(mode)) return;
    if (state.autoplay.active) pauseAutoplay();
    state.speechMode = mode;
    saveSpeechSettings();
    stopSpeech();
    updateSpeechControls();
    if (mode === "auto") scheduleAutoSpeech(state.flipped ? "answer" : "question");
  }

  function setSpeechRate(rate) {
    if (!Object.prototype.hasOwnProperty.call(SPEECH_RATES, rate)) return;
    if (state.autoplay.active) pauseAutoplay();
    state.speechRate = rate;
    saveSpeechSettings();
    stopSpeech();
    updateSpeechControls();
  }

  function setSpeechPart(part, enabled) {
    if (!Object.prototype.hasOwnProperty.call(state.speechParts, part)) return;
    if (state.autoplay.active) pauseAutoplay();
    state.speechParts[part] = enabled;
    saveSpeechSettings();
    stopSpeech();
    updateSpeechControls();
  }

  function isAutoplayRunning(runId = state.autoplay.runId) {
    return state.autoplay.active
      && !state.autoplay.paused
      && state.autoplay.runId === runId;
  }

  function updateAutoplayStatus() {
    if (!currentCard()) {
      autoplayStatus.textContent = "カードがありません。";
    } else if (state.autoplay.active) {
      const phaseLabel = state.autoplay.phase === "answer" ? "答えを表示中" : "問題を表示中";
      autoplayStatus.textContent = `自動めくり中：${phaseLabel}。`;
    } else if (state.autoplay.paused) {
      autoplayStatus.textContent = "一時停止中。▶ 再開で続けます。";
    } else if (state.autoplay.message) {
      autoplayStatus.textContent = state.autoplay.message;
    } else {
      autoplayStatus.textContent = "停止中。";
    }
  }

  function updateAutoplayControls() {
    const hasCard = Boolean(currentCard());
    const { active, paused } = state.autoplay;
    autoplayThinkTimeSelect.value = String(state.autoplayThinkTime);
    autoplayAnswerTimeSelect.value = String(state.autoplayAnswerTime);
    autoplayThinkTimeSelect.disabled = !hasCard || active;
    autoplayAnswerTimeSelect.disabled = !hasCard || active;
    autoplayStartButton.disabled = !hasCard || active || paused;
    autoplayPauseButton.disabled = !active && !paused;
    autoplayPauseButton.textContent = paused ? "▶ 再開" : "⏸ 一時停止";
    autoplayStopButton.disabled = !active && !paused;
    updateAutoplayStatus();
  }

  function cancelAutoplayTimer() {
    if (state.autoplay.timerId !== null) window.clearTimeout(state.autoplay.timerId);
    const resolve = state.autoplay.timerResolve;
    state.autoplay.timerId = null;
    state.autoplay.timerResolve = null;
    if (resolve) resolve(false);
  }

  function waitForAutoplayTimer(duration, runId) {
    if (!isAutoplayRunning(runId)) return Promise.resolve(false);
    return new Promise((resolve) => {
      const finish = (completed) => {
        if (state.autoplay.timerResolve !== finish) return;
        state.autoplay.timerId = null;
        state.autoplay.timerResolve = null;
        resolve(completed);
      };
      state.autoplay.timerResolve = finish;
      state.autoplay.timerId = window.setTimeout(() => finish(isAutoplayRunning(runId)), duration);
    });
  }

  async function waitForAutoplayPhase(part, duration, runId) {
    if (state.speechMode === "auto") {
      const speechFinished = await speakPart(part, { waitForEnd: true });
      if (!speechFinished || !isAutoplayRunning(runId)) return false;
    }
    return waitForAutoplayTimer(duration, runId);
  }

  async function requestWakeLock() {
    if (!("wakeLock" in navigator) || document.visibilityState !== "visible") return;
    if (state.autoplay.wakeLock && !state.autoplay.wakeLock.released) return;
    try {
      const lock = await navigator.wakeLock.request("screen");
      if (!state.autoplay.active) {
        await lock.release();
        return;
      }
      state.autoplay.wakeLock = lock;
      lock.addEventListener("release", () => {
        if (state.autoplay.wakeLock === lock) state.autoplay.wakeLock = null;
      });
    } catch (_) {
      // Wake Lockに対応していない、または許可されない場合も自動めくりは続ける。
    }
  }

  function releaseWakeLock() {
    const lock = state.autoplay.wakeLock;
    state.autoplay.wakeLock = null;
    if (!lock) return;
    try {
      const result = lock.release();
      if (result && typeof result.catch === "function") result.catch(() => {});
    } catch (_) {
      // すでに解放済みの場合も何もしない。
    }
  }

  function stopAutoplay(message = "") {
    state.autoplay.active = false;
    state.autoplay.paused = false;
    state.autoplay.message = message;
    state.autoplay.runId += 1;
    cancelAutoplayTimer();
    stopSpeech();
    releaseWakeLock();
    updateAutoplayControls();
  }

  function pauseAutoplay() {
    if (!state.autoplay.active) return false;
    state.autoplay.active = false;
    state.autoplay.paused = true;
    state.autoplay.message = "";
    state.autoplay.runId += 1;
    cancelAutoplayTimer();
    stopSpeech();
    releaseWakeLock();
    updateAutoplayControls();
    return true;
  }

  function resumeAutoplay() {
    if (!state.autoplay.paused || !currentCard() || currentCardIsHidden()) return;
    state.autoplay.active = true;
    state.autoplay.paused = false;
    state.autoplay.message = "";
    const runId = ++state.autoplay.runId;
    requestWakeLock();
    updateAutoplayControls();
    runAutoplay(runId);
  }

  function nextAutoplayIndex() {
    for (let index = state.index + 1; index < state.filtered.length; index += 1) {
      const allIndex = state.cards.indexOf(state.filtered[index]);
      if (allIndex >= 0 && !state.hidden.has(cardId(allIndex))) return index;
    }
    return -1;
  }

  async function runAutoplay(runId) {
    while (isAutoplayRunning(runId)) {
      if (!currentCard() || currentCardIsHidden()) {
        stopAutoplay("非表示のカードを飛ばして停止しました。");
        return;
      }

      if (state.autoplay.phase === "question") {
        setFlipped(false, { announce: false });
        updateAutoplayControls();
        if (!await waitForAutoplayPhase("question", state.autoplayThinkTime, runId)) return;
        if (!isAutoplayRunning(runId)) return;
        state.autoplay.phase = "answer";
        setFlipped(true, { announce: false });
        updateAutoplayControls();
      }

      if (!isAutoplayRunning(runId)) return;
      if (!await waitForAutoplayPhase("answer", state.autoplayAnswerTime, runId)) return;
      if (!isAutoplayRunning(runId)) return;

      const nextIndex = nextAutoplayIndex();
      if (nextIndex < 0) {
        stopAutoplay("最後のカードまで進みました。");
        return;
      }
      state.index = nextIndex;
      state.autoplay.phase = "question";
      renderCard({ scheduleSpeech: false });
    }
  }

  function startAutoplay() {
    if (!currentCard() || state.autoplay.active || state.autoplay.paused) return;
    const startIndex = state.hidden.has(cardId(currentAllIndex())) ? nextAutoplayIndex() : state.index;
    if (startIndex < 0) {
      state.autoplay.message = "自動めくりできるカードがありません。";
      updateAutoplayControls();
      return;
    }
    state.index = startIndex;
    state.autoplay.active = true;
    state.autoplay.paused = false;
    state.autoplay.phase = "question";
    state.autoplay.message = "";
    const runId = ++state.autoplay.runId;
    renderCard({ scheduleSpeech: false });
    requestWakeLock();
    updateAutoplayControls();
    runAutoplay(runId);
  }

  function setAutoplayTime(setting, value) {
    const duration = Number(value);
    if (!AUTOPLAY_DURATIONS.includes(duration)) return;
    if (state.autoplay.active) pauseAutoplay();
    state[setting] = duration;
    saveAutoplaySettings();
    updateAutoplayControls();
  }

  function filteredCards(group) {
    if (group === "hidden") {
      return state.cards.filter((_, index) => state.hidden.has(cardId(index)));
    }
    if (group === "important") {
      return state.cards.filter((_, index) => state.important.has(cardId(index)) && !state.hidden.has(cardId(index)));
    }
    return state.cards.filter((card, index) => {
      const inGroup = group === "all" || card.group === group;
      return inGroup && !state.hidden.has(cardId(index));
    });
  }

  function setFlipped(flipped, { announce = true } = {}) {
    if (!currentCard()) return;
    state.flipped = flipped;
    flashcard.classList.toggle("is-flipped", flipped);
    flashcard.setAttribute("aria-label", `${flipped ? "答え" : "問題"}を表示中。カードをめくる`);
    document.querySelector(".card-face--front").setAttribute("aria-hidden", String(flipped));
    document.querySelector(".card-face--back").setAttribute("aria-hidden", String(!flipped));
    flipButton.textContent = flipped ? "問題に戻る" : "答えを見る";
    if (announce) scheduleAutoSpeech(flipped ? "answer" : "question");
  }

  function flipFromUser() {
    if (state.autoplay.active) pauseAutoplay();
    setFlipped(!state.flipped);
    if (state.autoplay.paused) state.autoplay.phase = state.flipped ? "answer" : "question";
  }

  function setButtonsDisabled(disabled) {
    [flipButton, prevButton, nextButton, importantButton, hideButton, sourceButton].forEach((button) => {
      button.disabled = disabled;
    });
    if (disabled) {
      questionSpeakButton.disabled = true;
      answerSpeakButton.disabled = true;
    } else {
      updateSpeechControls();
    }
    updateAutoplayControls();
  }

  function updateActionLabels(allIndex) {
    const id = cardId(allIndex);
    const marked = state.important.has(id);
    const isHiddenView = state.group === "hidden";
    importantButton.textContent = marked ? "★ 重要を外す" : "☆ 重要にする";
    importantButton.classList.toggle("is-active", marked);
    hideButton.textContent = isHiddenView ? "隠し解除" : "このカードを隠す";
    hideButton.classList.toggle("is-active", isHiddenView);
  }

  function renderEmpty() {
    if (state.autoplay.active || state.autoplay.paused) stopAutoplay();
    stopSpeech();
    cardStage.hidden = true;
    emptyState.hidden = false;
    progressLabel.textContent = "0 / 0枚";
    progressBar.style.width = "0%";
    setButtonsDisabled(true);
    sourcePanel.hidden = true;
    clearHiddenButton.disabled = state.hidden.size === 0;
    updateAutoplayControls();
  }

  function renderCard({ scheduleSpeech = true } = {}) {
    const card = currentCard();
    if (!card) {
      renderEmpty();
      return;
    }

    stopSpeech();
    cardStage.hidden = false;
    emptyState.hidden = true;
    setButtonsDisabled(false);
    const allIndex = currentAllIndex();
    const number = cardId(allIndex);
    const groupText = splitGroup(card.group);
    frontGroup.textContent = groupText;
    backGroup.textContent = groupText;
    frontNumber.textContent = number;
    backNumber.textContent = number;
    frontTag.textContent = card.tag || "問題";
    question.textContent = card.q;
    answer.textContent = card.a;
    answerDetail.textContent = card.detail || "";
    cardImage.src = `./assets/card_${number}.png`;
    cardImage.alt = `${card.q}を連想するイラスト`;
    progressLabel.textContent = `${state.index + 1} / ${state.filtered.length}枚`;
    progressBar.style.width = `${((state.index + 1) / state.filtered.length) * 100}%`;
    prevButton.disabled = state.index === 0;
    nextButton.disabled = state.index === state.filtered.length - 1;
    updateActionLabels(allIndex);
    sourceCurrent.textContent = `${card.group}｜カード ${number}`;
    setFlipped(false, { announce: false });
    clearHiddenButton.disabled = state.hidden.size === 0;
    updateSpeechControls();
    saveState();
    updateAutoplayControls();
    if (scheduleSpeech) scheduleAutoSpeech("question");
  }

  function populateGroups() {
    const groups = [...new Set(state.cards.map((card) => card.group))];
    const previous = state.group;
    groupSelect.replaceChildren();

    const allOption = document.createElement("option");
    allOption.value = "all";
    allOption.textContent = `第1章 全体（${filteredCards("all").length}枚）`;
    groupSelect.appendChild(allOption);

    const personalGroup = document.createElement("optgroup");
    personalGroup.label = "自分用のカード";
    const importantOption = document.createElement("option");
    importantOption.value = "important";
    importantOption.textContent = `★ 重要カード（${filteredCards("important").length}枚）`;
    personalGroup.appendChild(importantOption);
    const hiddenOption = document.createElement("option");
    hiddenOption.value = "hidden";
    hiddenOption.textContent = `隠したカード（${filteredCards("hidden").length}枚）`;
    personalGroup.appendChild(hiddenOption);
    groupSelect.appendChild(personalGroup);

    const sectionGroup = document.createElement("optgroup");
    sectionGroup.label = "教材の章・節";
    groups.forEach((group) => {
      const option = document.createElement("option");
      option.value = group;
      option.textContent = `${splitGroup(group)}（${filteredCards(group).length}枚）`;
      sectionGroup.appendChild(option);
    });
    groupSelect.appendChild(sectionGroup);
    groupSelect.value = [...groupSelect.options].some((option) => option.value === previous) ? previous : "all";
  }

  function applyGroup(group, preferredAllIndex = 0) {
    if (state.autoplay.active) pauseAutoplay();
    state.autoplay.message = "";
    state.group = group;
    state.filtered = filteredCards(group);
    const preferredIndex = state.filtered.findIndex((card) => state.cards.indexOf(card) === preferredAllIndex);
    state.index = preferredIndex >= 0 ? preferredIndex : 0;
    groupSelect.value = group;
    renderCard();
  }

  function refreshCurrentGroup(preferredAllIndex = 0) {
    if (state.autoplay.active) pauseAutoplay();
    state.autoplay.message = "";
    state.filtered = filteredCards(state.group);
    const preferredIndex = state.filtered.findIndex((card) => state.cards.indexOf(card) >= preferredAllIndex);
    state.index = preferredIndex >= 0 ? preferredIndex : Math.max(0, state.filtered.length - 1);
    populateGroups();
    groupSelect.value = state.group;
    renderCard();
  }

  function move(delta) {
    if (state.autoplay.active) pauseAutoplay();
    if (!state.filtered.length) return;
    const next = Math.max(0, Math.min(state.filtered.length - 1, state.index + delta));
    if (next === state.index) return;
    state.autoplay.phase = "question";
    state.autoplay.message = "";
    state.index = next;
    renderCard();
  }

  function toggleImportant() {
    if (state.autoplay.active) pauseAutoplay();
    const allIndex = currentAllIndex();
    if (allIndex < 0) return;
    const id = cardId(allIndex);
    const wasMarked = state.important.has(id);
    if (wasMarked) state.important.delete(id);
    else state.important.add(id);
    if (state.group === "important" && wasMarked) refreshCurrentGroup(allIndex);
    else {
      populateGroups();
      groupSelect.value = state.group;
      renderCard();
    }
  }

  function toggleHidden() {
    if (state.autoplay.active) pauseAutoplay();
    const allIndex = currentAllIndex();
    if (allIndex < 0) return;
    const id = cardId(allIndex);
    if (state.hidden.has(id)) state.hidden.delete(id);
    else state.hidden.add(id);
    refreshCurrentGroup(allIndex);
  }

  function clearHidden() {
    if (state.autoplay.active) pauseAutoplay();
    if (!state.hidden.size) return;
    state.hidden.clear();
    if (state.group === "hidden") state.group = "all";
    refreshCurrentGroup(0);
  }

  function resetPosition() {
    if (state.autoplay.active) pauseAutoplay();
    state.autoplay.phase = "question";
    state.autoplay.message = "";
    state.index = 0;
    renderCard();
  }

  function toggleSource(force) {
    sourcePanel.hidden = typeof force === "boolean" ? !force : !sourcePanel.hidden;
    if (!sourcePanel.hidden && currentCard()) {
      sourceCurrent.textContent = `${currentCard().group}｜カード ${cardId(currentAllIndex())}`;
    }
  }

  function start() {
    loadSpeechSettings();
    loadAutoplaySettings();
    updateSpeechControls();
    updateAutoplayControls();
    fetch("./cards.json")
      .then((response) => {
        if (!response.ok) throw new Error("cards.json could not be loaded");
        return response.json();
      })
      .then((cards) => {
        state.cards = cards;
        const saved = loadState();
        populateGroups();
        applyGroup(saved.group, saved.allIndex);
      })
      .catch(() => {
        question.textContent = "カードを読み込めませんでした";
        frontTag.textContent = "エラー";
        updateAutoplayControls();
      });
  }

  flashcard.addEventListener("click", flipFromUser);
  flashcard.addEventListener("keydown", (event) => {
    if (event.target !== flashcard) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      flipFromUser();
    }
  });
  flipButton.addEventListener("click", flipFromUser);
  questionSpeakButton.addEventListener("click", (event) => {
    event.stopPropagation();
    if (state.autoplay.active) pauseAutoplay();
    speakPart("question");
  });
  answerSpeakButton.addEventListener("click", (event) => {
    event.stopPropagation();
    if (state.autoplay.active) pauseAutoplay();
    speakPart("answer");
  });
  prevButton.addEventListener("click", () => move(-1));
  nextButton.addEventListener("click", () => move(1));
  importantButton.addEventListener("click", toggleImportant);
  hideButton.addEventListener("click", toggleHidden);
  sourceButton.addEventListener("click", () => toggleSource());
  $("sourceCloseButton").addEventListener("click", () => toggleSource(false));
  groupSelect.addEventListener("change", (event) => applyGroup(event.target.value));
  $("resetButton").addEventListener("click", resetPosition);
  clearHiddenButton.addEventListener("click", clearHidden);
  $("emptyResetButton").addEventListener("click", clearHidden);
  speechModeInputs.forEach((input) => {
    input.addEventListener("change", (event) => setSpeechMode(event.target.value));
  });
  speechRateSelect.addEventListener("change", (event) => setSpeechRate(event.target.value));
  Object.entries(speechPartInputs).forEach(([part, input]) => {
    input.addEventListener("change", (event) => setSpeechPart(part, event.target.checked));
  });
  autoplayThinkTimeSelect.addEventListener("change", (event) => setAutoplayTime("autoplayThinkTime", event.target.value));
  autoplayAnswerTimeSelect.addEventListener("change", (event) => setAutoplayTime("autoplayAnswerTime", event.target.value));
  autoplayStartButton.addEventListener("click", startAutoplay);
  autoplayPauseButton.addEventListener("click", () => {
    if (state.autoplay.active) pauseAutoplay();
    else resumeAutoplay();
  });
  autoplayStopButton.addEventListener("click", () => stopAutoplay("停止しました。"));
  document.addEventListener("visibilitychange", () => {
    if (state.autoplay.active && document.visibilityState === "visible") requestWakeLock();
  });

  document.addEventListener("keydown", (event) => {
    if (event.target.matches("select, input, textarea, button, a")) return;
    if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); }
    if (event.key === "ArrowRight") { event.preventDefault(); move(1); }
    if (event.key === " ") { event.preventDefault(); flipFromUser(); }
    if (event.key === "Escape") toggleSource(false);
  });

  start();
})();
