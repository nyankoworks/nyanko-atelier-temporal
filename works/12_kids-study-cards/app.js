(() => {
  const state = {
    cards: [],
    filtered: [],
    index: 0,
    flipped: false,
    group: "all",
    hidden: new Set(),
    important: new Set(),
  };

  const $ = (id) => document.getElementById(id);
  const STORAGE_KEY = "genai-passport-ch1-card-settings-v2";
  const OLD_STORAGE_KEY = "genai-passport-ch1-card-position";

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
  const flipButton = $("flipButton");
  const prevButton = $("prevButton");
  const nextButton = $("nextButton");
  const importantButton = $("importantButton");
  const hideButton = $("hideButton");
  const sourceButton = $("sourceButton");
  const sourcePanel = $("sourcePanel");
  const sourceCurrent = $("sourceCurrent");
  const clearHiddenButton = $("clearHiddenButton");

  const cardId = (allIndex) => String(allIndex + 1).padStart(3, "0");
  const currentCard = () => state.filtered[state.index];
  const currentAllIndex = () => state.cards.indexOf(currentCard());
  const splitGroup = (group) => group.replace(/^第1章\s*/, "");

  function saveState() {
    const allIndex = currentAllIndex();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      hidden: [...state.hidden],
      important: [...state.important],
      allIndex: allIndex >= 0 ? allIndex : 0,
      group: state.group,
    }));
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

  function setFlipped(flipped) {
    if (!currentCard()) return;
    state.flipped = flipped;
    flashcard.classList.toggle("is-flipped", flipped);
    flashcard.setAttribute("aria-label", `${flipped ? "答え" : "問題"}を表示中。カードをめくる`);
    document.querySelector(".card-face--front").setAttribute("aria-hidden", String(flipped));
    document.querySelector(".card-face--back").setAttribute("aria-hidden", String(!flipped));
    flipButton.textContent = flipped ? "問題に戻る" : "答えを見る";
  }

  function setButtonsDisabled(disabled) {
    [flipButton, prevButton, nextButton, importantButton, hideButton, sourceButton].forEach((button) => {
      button.disabled = disabled;
    });
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
    cardStage.hidden = true;
    emptyState.hidden = false;
    progressLabel.textContent = "0 / 0枚";
    progressBar.style.width = "0%";
    setButtonsDisabled(true);
    sourcePanel.hidden = true;
    clearHiddenButton.disabled = state.hidden.size === 0;
  }

  function renderCard() {
    const card = currentCard();
    if (!card) {
      renderEmpty();
      return;
    }

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
    setFlipped(false);
    clearHiddenButton.disabled = state.hidden.size === 0;
    saveState();
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
    state.group = group;
    state.filtered = filteredCards(group);
    const preferredIndex = state.filtered.findIndex((card) => state.cards.indexOf(card) === preferredAllIndex);
    state.index = preferredIndex >= 0 ? preferredIndex : 0;
    groupSelect.value = group;
    renderCard();
  }

  function refreshCurrentGroup(preferredAllIndex = 0) {
    state.filtered = filteredCards(state.group);
    const preferredIndex = state.filtered.findIndex((card) => state.cards.indexOf(card) >= preferredAllIndex);
    state.index = preferredIndex >= 0 ? preferredIndex : Math.max(0, state.filtered.length - 1);
    populateGroups();
    groupSelect.value = state.group;
    renderCard();
  }

  function move(delta) {
    if (!state.filtered.length) return;
    const next = Math.max(0, Math.min(state.filtered.length - 1, state.index + delta));
    if (next === state.index) return;
    state.index = next;
    renderCard();
  }

  function toggleImportant() {
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
    const allIndex = currentAllIndex();
    if (allIndex < 0) return;
    const id = cardId(allIndex);
    if (state.hidden.has(id)) state.hidden.delete(id);
    else state.hidden.add(id);
    refreshCurrentGroup(allIndex);
  }

  function clearHidden() {
    if (!state.hidden.size) return;
    state.hidden.clear();
    if (state.group === "hidden") state.group = "all";
    refreshCurrentGroup(0);
  }

  function resetPosition() {
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
      });
  }

  flashcard.addEventListener("click", () => setFlipped(!state.flipped));
  flashcard.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setFlipped(!state.flipped);
    }
  });
  flipButton.addEventListener("click", () => setFlipped(!state.flipped));
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

  document.addEventListener("keydown", (event) => {
    if (event.target.matches("select, input, textarea, button, a")) return;
    if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); }
    if (event.key === "ArrowRight") { event.preventDefault(); move(1); }
    if (event.key === " ") { event.preventDefault(); setFlipped(!state.flipped); }
    if (event.key === "Escape") toggleSource(false);
  });

  start();
})();
