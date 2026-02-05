/* Minimal Flashcards app: decks, cards, study mode, LocalStorage */
(function () {
  const STORAGE_KEY = "flashcards:v1";

  // DOM refs
  const refs = {};
  function $id(id) {
    return document.getElementById(id);
  }

  function qs(sel, root = document) {
    return root.querySelector(sel);
  }

  // App state
  let state = {
    decks: [], // {id,name,createdAt}
    cardsByDeckId: {}, // deckId -> [cards]
    activeDeckId: null,
    ui: { activeCardIndex: 0, isFlipped: false },
  };

  // ---------- Storage helpers ----------
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      Object.assign(state, parsed);
    } catch (e) {
      console.warn("Failed to load state", e);
    }
  }
  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("Failed to save", e);
    }
  }

  // ---------- Utils ----------
  function uid(prefix = "id") {
    return (
      prefix +
      "-" +
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 8)
    );
  }

  // ---------- Rendering ----------
  function renderDecks() {
    const ul = refs.decksList;
    ul.innerHTML = "";
    if (state.decks.length === 0) {
      refs.noDecksMsg.style.display = "block";
    } else {
      refs.noDecksMsg.style.display = "none";
    }
    state.decks.forEach((deck) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.textContent = deck.name;
      btn.dataset.id = deck.id;
      btn.className = "deck-btn";
      if (deck.id === state.activeDeckId)
        btn.setAttribute("aria-current", "true");
      btn.addEventListener("click", () => {
        selectDeck(deck.id);
      });
      // small context menu: edit, delete on longpress (simple double button)
      const ctrl = document.createElement("div");
      ctrl.style.float = "right";
      const edit = document.createElement("button");
      edit.textContent = "⋯";
      edit.title = "Edit deck";
      edit.addEventListener("click", (e) => {
        e.stopPropagation();
        openDeckModal(deck);
      });
      const del = document.createElement("button");
      del.textContent = "✖";
      del.title = "Delete deck";
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteDeck(deck.id);
      });
      ctrl.appendChild(edit);
      ctrl.appendChild(del);
      btn.appendChild(ctrl);
      li.appendChild(btn);
      ul.appendChild(li);
    });
  }

  function renderMain() {
    const title = refs.deckTitle;
    const deck = state.decks.find((d) => d.id === state.activeDeckId);
    if (!deck) {
      title.textContent = "Select a deck";
      showEmptyStudy(true);
      return;
    }
    title.textContent = deck.name;
    // update stats
    refs.deckStats.textContent = `Cards: ${getActiveCards().length}`;
    const cards = getFilteredCards();
    if (cards.length === 0) {
      showEmptyStudy(true);
      renderCardsList();
      return;
    }
    showEmptyStudy(false);
    const idx = (state.ui.activeCardIndex = Math.max(
      0,
      Math.min(state.ui.activeCardIndex, cards.length - 1),
    ));
    const card = cards[idx];
    refs.cardFront.textContent = card.front;
    refs.cardBack.textContent = card.back;
    refs.studyCard.classList.toggle("is-flipped", !!state.ui.isFlipped);
    renderCardsList();
  }

  // render cards list with edit/delete actions
  function renderCardsList() {
    const ul = refs.cardsList;
    ul.innerHTML = "";
    const cards = getActiveCards();
    refs.cardsEmpty.style.display = cards.length === 0 ? "block" : "none";
    cards.forEach((c) => {
      const li = document.createElement("li");
      li.className = "card-row";
      const meta = document.createElement("div");
      const rc = c.reviewCount ? ` • reviewed ${c.reviewCount}×` : "";
      meta.innerHTML = `<div><strong>${escapeHtml((c.front || "").slice(0, 60))}</strong><span class="meta">${rc}</span></div><div class="meta">${escapeHtml((c.back || "").slice(0, 60))}</div>`;
      const actions = document.createElement("div");
      const edit = document.createElement("button");
      edit.textContent = "Edit";
      edit.className = "btn";
      edit.addEventListener("click", () => openCardModal(c));
      const del = document.createElement("button");
      del.textContent = "Delete";
      del.className = "btn";
      del.addEventListener("click", () => {
        if (confirm("Delete this card?")) deleteCard(state.activeDeckId, c.id);
      });
      actions.appendChild(edit);
      actions.appendChild(del);
      li.appendChild(meta);
      li.appendChild(actions);
      ul.appendChild(li);
    });
  }

  function escapeHtml(s) {
    return String(s).replace(
      /[&"'<>]/g,
      (c) =>
        ({
          "&": "&amp;",
          '"': "&quot;",
          "'": "&#39;",
          "<": "&lt;",
          ">": "&gt;",
        })[c] || c,
    );
  }

  // Export / Import
  function exportState() {
    try {
      const data = JSON.stringify(
        {
          decks: state.decks,
          cardsByDeckId: state.cardsByDeckId,
          activeDeckId: state.activeDeckId,
        },
        null,
        2,
      );
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "flashcards-export.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Export failed");
    }
  }

  function handleImportFile(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed) throw new Error("Invalid file");
        if (
          confirm(
            "Replace current data with imported file? This will overwrite current decks.",
          )
        ) {
          importState(parsed);
        }
      } catch (err) {
        alert("Import failed: " + err.message);
      }
    };
    reader.readAsText(f);
    // reset input so same file can be reselected later
    e.target.value = "";
  }

  function importState(parsed) {
    if (parsed.decks && typeof parsed.decks === "object")
      state.decks = parsed.decks;
    if (parsed.cardsByDeckId && typeof parsed.cardsByDeckId === "object")
      state.cardsByDeckId = parsed.cardsByDeckId;
    state.activeDeckId =
      parsed.activeDeckId || (state.decks[0] && state.decks[0].id) || null;
    state.ui = state.ui || { activeCardIndex: 0, isFlipped: false };
    saveState();
    renderDecks();
    renderMain();
  }

  function showEmptyStudy(flag) {
    refs.studyEmpty.style.display = flag ? "block" : "none";
    refs.cardScene.style.display = flag ? "none" : "block";
  }

  // ---------- CRUD ----------
  function createDeck(name) {
    if (!name || !name.trim()) return;
    const deck = { id: uid("deck"), name: name.trim(), createdAt: Date.now() };
    state.decks.push(deck);
    state.cardsByDeckId[deck.id] = [];
    state.activeDeckId = deck.id;
    saveState();
    renderDecks();
    renderMain();
  }

  function updateDeck(deckId, name) {
    const d = state.decks.find((x) => x.id === deckId);
    if (!d) return;
    d.name = name;
    saveState();
    renderDecks();
    renderMain();
  }

  function deleteDeck(deckId) {
    if (!confirm("Delete deck and its cards?")) return;
    state.decks = state.decks.filter((d) => d.id !== deckId);
    delete state.cardsByDeckId[deckId];
    if (state.activeDeckId === deckId)
      state.activeDeckId = state.decks[0]?.id || null;
    saveState();
    renderDecks();
    renderMain();
  }

  function addOrUpdateCard(deckId, card) {
    const list =
      state.cardsByDeckId[deckId] || (state.cardsByDeckId[deckId] = []);
    if (card.id) {
      // update
      const ix = list.findIndex((c) => c.id === card.id);
      if (ix > -1) list[ix] = card;
    } else {
      card.id = uid("card");
      card.updatedAt = Date.now();
      list.push(card);
    }
    saveState();
    renderMain();
  }

  function deleteCard(deckId, cardId) {
    const list = state.cardsByDeckId[deckId] || [];
    state.cardsByDeckId[deckId] = list.filter((c) => c.id !== cardId);
    saveState();
    renderMain();
  }

  // ---------- Selection & Study ----------
  function selectDeck(deckId) {
    state.activeDeckId = deckId;
    state.ui.activeCardIndex = 0;
    state.ui.isFlipped = false;
    saveState();
    renderDecks();
    renderMain();
  }

  function getActiveCards() {
    return state.cardsByDeckId[state.activeDeckId] || [];
  }

  let searchQuery = "";
  function getFilteredCards() {
    const cards = getActiveCards();
    if (!searchQuery) return cards;
    const q = searchQuery.toLowerCase();
    return cards.filter(
      (c) =>
        (c.front || "").toLowerCase().includes(q) ||
        (c.back || "").toLowerCase().includes(q),
    );
  }

  function prevCard() {
    const cards = getFilteredCards();
    if (cards.length === 0) return;
    state.ui.activeCardIndex =
      (state.ui.activeCardIndex - 1 + cards.length) % cards.length;
    state.ui.isFlipped = false;
    renderMain();
  }
  function nextCard() {
    const cards = getFilteredCards();
    if (cards.length === 0) return;
    state.ui.activeCardIndex = (state.ui.activeCardIndex + 1) % cards.length;
    state.ui.isFlipped = false;
    renderMain();
  }
  function flipCard() {
    state.ui.isFlipped = !state.ui.isFlipped;
    refs.studyCard.classList.toggle("is-flipped", state.ui.isFlipped);
  }

  // simple spaced repetition: rate current card and move on
  function rateCard(level) {
    const cards = getActiveCards();
    if (cards.length === 0) return;
    const idx = state.ui.activeCardIndex;
    const card = cards[idx];
    card.reviewCount = (card.reviewCount || 0) + 1;
    card.lastReviewed = Date.now();
    // simple interval heuristic
    if (level === "again") card.interval = 0;
    else if (level === "good") card.interval = (card.interval || 0) + 1;
    else if (level === "easy") card.interval = (card.interval || 0) + 2;
    saveState();
    nextCard();
  }

  function shuffleDeck() {
    const cards = getActiveCards();
    if (!cards || cards.length <= 1) return;
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    state.ui.activeCardIndex = 0;
    state.ui.isFlipped = false;
    saveState();
    renderMain();
  }

  // ---------- Modals & UI helpers ----------
  function openDeckModal(deck) {
    const tpl = $id("deck-modal-template").content.cloneNode(true);
    const modal = tpl.querySelector(".modal");
    const input = modal.querySelector("#deck-name");
    const title = modal.querySelector("#modal-title");
    title.textContent = deck ? "Edit Deck" : "New Deck";
    input.value = deck ? deck.name : "";
    mountModal(modal, (action) => {
      if (action === "save") {
        const val = input.value.trim();
        if (!val) return alert("Name required");
        if (deck) updateDeck(deck.id, val);
        else createDeck(val);
      }
    });
  }

  function openCardModal(card) {
    if (!state.activeDeckId) return alert("Select a deck first");
    const tpl = $id("card-modal-template").content.cloneNode(true);
    const modal = tpl.querySelector(".modal");
    const front = modal.querySelector("#card-front-input");
    const back = modal.querySelector("#card-back-input");
    const title = modal.querySelector("#card-modal-title");
    title.textContent = card ? "Edit Card" : "New Card";
    front.value = card ? card.front : "";
    back.value = card ? card.back : "";
    mountModal(modal, (action) => {
      if (action === "save") {
        const f = front.value.trim(),
          b = back.value.trim();
        if (!f || !b) return alert("Front and Back are required");
        addOrUpdateCard(
          state.activeDeckId,
          Object.assign({}, card || {}, {
            front: f,
            back: b,
            updatedAt: Date.now(),
          }),
        );
      }
    });
  }

  function mountModal(modalEl, onClose) {
    const root = $id("modal-root");
    const appEl = document.querySelector(".app");
    root.innerHTML = "";
    root.appendChild(modalEl);
    root.style.display = "block";
    root.setAttribute("aria-hidden", "false");
    // hide main app for screen readers
    if (appEl) appEl.setAttribute("aria-hidden", "true");

    const btns = modalEl.querySelectorAll("[data-action]");
    const focusableSelector =
      'a[href], area[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])';
    const focusable = Array.from(modalEl.querySelectorAll(focusableSelector));
    let first = focusable[0];
    let last = focusable[focusable.length - 1];
    const previouslyFocused = document.activeElement;

    function cleanup() {
      root.innerHTML = "";
      root.style.display = "none";
      root.setAttribute("aria-hidden", "true");
      document.removeEventListener("keydown", onKeyDown);
      if (appEl) appEl.removeAttribute("aria-hidden");
      if (previouslyFocused && previouslyFocused.focus)
        previouslyFocused.focus();
    }

    function onKeyDown(e) {
      if (e.key === "Escape") {
        cleanup();
        onClose && onClose("cancel");
        return;
      }
      if (e.key === "Tab") {
        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }
        const active = document.activeElement;
        if (e.shiftKey) {
          if (active === first || active === modalEl) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (active === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }

    btns.forEach((b) =>
      b.addEventListener("click", () => {
        const act = b.dataset.action;
        if (act === "cancel") {
          cleanup();
          onClose && onClose("cancel");
          return;
        }
        if (act === "save") {
          cleanup();
          onClose && onClose("save");
          return;
        }
      }),
    );

    // focus first focusable control
    setTimeout(() => {
      if (first) first.focus();
      else modalEl.focus();
    }, 10);
    document.addEventListener("keydown", onKeyDown);
  }

  // ---------- Keyboard shortcuts ----------
  function onKey(e) {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    if (e.code === "Space") {
      e.preventDefault();
      flipCard();
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      prevCard();
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      nextCard();
    }
  }

  // ---------- Search debounce ----------
  function debounce(fn, wait = 300) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  // ---------- Init ----------
  function init() {
    // refs
    refs.decksList = $id("decks-list");
    refs.noDecksMsg = $id("no-decks-msg");
    refs.deckTitle = $id("deck-title");
    refs.cardFront = $id("card-front");
    refs.cardBack = $id("card-back");
    refs.studyCard = $id("study-card");
    refs.cardScene = $id("card-scene");
    refs.studyEmpty = $id("study-empty");
    refs.cardsList = $id("cards-list");
    refs.cardsEmpty = $id("cards-empty");
    refs.deckStats = $id("deck-stats");
    refs.importFile = $id("import-file");

    // load
    loadState();

    // events
    $id("new-deck-btn").addEventListener("click", () => openDeckModal());
    $id("new-card-btn").addEventListener("click", () => openCardModal());
    $id("flip-btn").addEventListener("click", flipCard);
    $id("prev-btn").addEventListener("click", prevCard);
    $id("next-btn").addEventListener("click", nextCard);
    $id("shuffle-btn").addEventListener("click", shuffleDeck);
    $id("srs-again").addEventListener("click", () => rateCard("again"));
    $id("srs-good").addEventListener("click", () => rateCard("good"));
    $id("srs-easy").addEventListener("click", () => rateCard("easy"));
    $id("export-btn").addEventListener("click", exportState);
    $id("import-btn").addEventListener("click", () => refs.importFile.click());
    refs.importFile.addEventListener("change", handleImportFile);

    document.addEventListener("keydown", onKey);

    // search
    const deb = debounce((e) => {
      searchQuery = e.target.value || "";
      state.ui.activeCardIndex = 0;
      renderMain();
    }, 250);
    $id("card-search").addEventListener("input", deb);

    // deck filter not implemented fully (left as simple hint)
    $id("deck-filter").addEventListener("input", (e) => {
      const q = e.target.value.toLowerCase().trim();
      Array.from(refs.decksList.children).forEach((li) => {
        const btn = li.querySelector("button");
        btn.style.display =
          q && !btn.textContent.toLowerCase().includes(q) ? "none" : "";
      });
    });

    // initial render
    renderDecks();
    renderMain();
  }

  // kick off
  document.addEventListener("DOMContentLoaded", init);

  // expose for debugging
  window._flash = { state };
})();
