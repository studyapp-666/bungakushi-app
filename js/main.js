const CATEGORIES = [
  {
    id: "jidai",
    title: "時代別古典文学史",
    children: [
      { id: "jidai-nara-heian", title: "奈良時代・平安時代" },
      { id: "jidai-kamakura-muromachi", title: "鎌倉時代・室町時代" },
      { id: "jidai-edo", title: "江戸時代" },
    ],
  },
  {
    id: "genre",
    title: "ジャンル別古典文学史",
    children: [
      { id: "genre-waka", title: "和歌・歌論" },
      { id: "genre-monogatari", title: "物語" },
      { id: "genre-nikki-zuihitsu", title: "日記・随筆" },
      { id: "genre-setsuwa", title: "説話" },
      { id: "genre-renga-haikai", title: "連歌・俳諧" },
      { id: "genre-kinsei-shousetsu", title: "近世小説" },
      { id: "genre-chugoku-bungakushi", title: "中国文学史" },
    ],
  },
  {
    id: "kingendai",
    title: "近現代文学史",
    children: [
      { id: "kingendai-edo-to-kindai", title: "江戸文学から近代文学へ" },
      { id: "kingendai-ougai-souseki", title: "森鷗外と夏目漱石" },
      { id: "kingendai-tanbiha-shirakabaha", title: "耽美派と白樺派" },
      { id: "kingendai-shin-genjitsu-shugi", title: "新現実主義" },
      { id: "kingendai-proletaria", title: "プロレタリア文学と反プロレタリア文学" },
      { id: "kingendai-sengo", title: "戦後の文学" },
      { id: "kingendai-kindai-shiika", title: "近代の詩歌" },
    ],
  },
];

function findChild(pageId) {
  for (const cat of CATEGORIES) {
    const child = cat.children.find((c) => c.id === pageId);
    if (child) return child;
  }
  return null;
}

const BRACKET_OPEN = /[｢「『（]/;
const BRACKET_CLOSE = /[｣」』）]/;

// Full-width bracket glyphs have built-in blank space baked into their
// outer side, which reads as an extra gap next to the text they wrap. Only
// those characters are pulled out into their own span (see .kern-open/
// .kern-close in CSS) so the tightening can't touch 、。 or any other
// punctuation.
function appendKernedText(parent, text) {
  let buffer = "";
  const flush = () => {
    if (buffer) {
      parent.appendChild(document.createTextNode(buffer));
      buffer = "";
    }
  };
  for (const ch of text) {
    if (BRACKET_OPEN.test(ch) || BRACKET_CLOSE.test(ch)) {
      flush();
      const span = document.createElement("span");
      span.className = BRACKET_OPEN.test(ch) ? "kern-open" : "kern-close";
      span.textContent = ch;
      parent.appendChild(span);
    } else {
      buffer += ch;
    }
  }
  flush();
}

// A plain <br> is used here instead of a real <br>: browsers special-case
// <br> in layout (it ignores margin/line-height overrides even with
// display:block set on it), so it can't be given extra clearance for a
// floating .ruby-text on the line below. A <span> with display:block has no
// such special-casing and forces the same line break.
function appendTextWithBreaks(frag, text) {
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    if (i > 0) {
      const lineBreak = document.createElement("span");
      lineBreak.className = "line-break";
      frag.appendChild(lineBreak);
    }
    if (line) appendKernedText(frag, line);
  });
}

function splitTopLevel(text, delimiter) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const ch of text) {
    if (ch === "{" || ch === "[") depth++;
    if (ch === "}" || ch === "]") depth--;
    if (ch === delimiter && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

function stripRubyMarkup(text) {
  return text.replace(/\{([^}|]+)\|([^}]+)\}/g, "$1");
}

// Inside a `.blank` pill, ruby readings are pulled out of the box and float
// above its border (see .blank .ruby-text in CSS). Native <ruby>/<rt> render
// that positioning inconsistently across browsers (their internal ruby-base
// box model differs, e.g. WebKit vs Blink), so blanks use plain <span>s
// instead, which behave predictably everywhere. Ruby outside of blanks still
// uses real <ruby>/<rt> for normal in-flow rendering.
function parseTextToFragment(text, insideBlank) {
  const frag = document.createDocumentFragment();
  // Checked in order: [[blank]], then {{term|note}} (a term-note pair, tried
  // before the single-brace ruby pattern since "{{" would otherwise be
  // misread as a ruby base starting with a stray "{"), then {base|reading},
  // then ##text## (a no-line-break group). {{...}} captures its whole
  // content lazily (up to the first "}}") rather than excluding "|"/"}"
  // like the other patterns do, so the term half can itself be a [[blank]]
  // (which needs its own "|") or contain ruby (which needs its own "}");
  // splitTopLevel then finds the top-level "|" that actually separates term
  // from note.
  const regex =
    /\[\[([^\]]+)\]\]|\{\{([\s\S]+?)\}\}|\{([^}|]+)\|([^}]+)\}|##([\s\S]+?)##/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      appendTextWithBreaks(frag, text.slice(lastIndex, match.index));
    }
    if (match[1] !== undefined) {
      const [answer, hint] = splitTopLevel(match[1], "|");
      const span = document.createElement("span");
      span.className = "blank";
      span.dataset.answer = answer;
      span.dataset.hint = hint || "？";
      span.appendChild(parseTextToFragment(span.dataset.hint, true));
      frag.appendChild(span);
    } else if (match[2] !== undefined) {
      // A term with a note pinned directly below it, e.g. reference-book
      // style vermilion supplementary text under a key word — like ruby,
      // but flipped below the base instead of above it. The note is
      // absolutely positioned against an anchor wrapping just the term, so
      // its distance from the left edge follows wherever the term itself
      // lands in the running text, and the rest of the sentence keeps
      // flowing right after the term on the same line. The term can be a
      // [[blank]] itself, so the note ends up pinned under the pill.
      const parts = splitTopLevel(match[2], "|");
      const noteText = parts.pop();
      const termText = parts.join("|");
      const anchor = document.createElement("span");
      anchor.className = "term-note-anchor";
      anchor.appendChild(parseTextToFragment(termText, insideBlank));
      // When the term is a [[blank]] pill, its own left margin (see
      // .blank { margin: 0 2px }) sits inside this anchor too, which would
      // otherwise pull the note leftward under that empty gap instead of
      // under the pill's visible left edge.
      if (
        anchor.firstElementChild &&
        anchor.firstElementChild.classList.contains("blank")
      ) {
        anchor.classList.add("term-note-anchor-blank");
      }
      const note = document.createElement("span");
      note.className = "term-note";
      note.appendChild(parseTextToFragment(noteText, insideBlank));
      anchor.appendChild(note);
      frag.appendChild(anchor);
    } else if (match[5] !== undefined) {
      const nowrap = document.createElement("span");
      nowrap.className = "no-wrap";
      nowrap.appendChild(parseTextToFragment(match[5], insideBlank));
      frag.appendChild(nowrap);
    } else if (insideBlank) {
      const base = document.createElement("span");
      base.className = "ruby-base";
      base.appendChild(document.createTextNode(match[3]));
      const reading = document.createElement("span");
      // A single reading character can't be distributed (nothing to spread
      // it against), so it falls back to plain centering. 2+ character
      // readings get one span per character so flexbox can space them like
      // native ruby-align: space-around — even gaps between characters plus
      // half-size gaps at the two ends, rather than a single justified line
      // (which pulls characters flush to the edges and looks lopsided when
      // there are only 2-3 of them).
      const chars = Array.from(match[4]);
      if (chars.length > 1) {
        reading.className = "ruby-text spread";
        chars.forEach((ch) => {
          const charSpan = document.createElement("span");
          charSpan.textContent = ch;
          reading.appendChild(charSpan);
        });
      } else {
        reading.className = "ruby-text";
        reading.textContent = match[4];
      }
      base.appendChild(reading);
      frag.appendChild(base);
    } else {
      const ruby = document.createElement("ruby");
      ruby.appendChild(document.createTextNode(match[3]));
      const rt = document.createElement("rt");
      rt.textContent = match[4];
      ruby.appendChild(rt);
      frag.appendChild(ruby);
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    appendTextWithBreaks(frag, text.slice(lastIndex));
  }
  return frag;
}

function renderItemBlock(text, hangingSplit) {
  const p = document.createElement("p");
  p.className = "item";
  // Lets data files write text as an array of lines instead of one long
  // string with embedded \n, for readability while editing.
  const joined = Array.isArray(text) ? text.join("\n") : text;
  // "…" marks where a label (e.g. "①『作品』…") ends and its explanation
  // begins. The two parts become separate flex items so the explanation's
  // box starts right after the label; when it wraps, later lines align to
  // that box's own left edge instead of the label's variable-width start.
  const sep = hangingSplit ? joined.indexOf("…") : -1;
  if (sep === -1) {
    p.appendChild(parseTextToFragment(joined));
    return p;
  }
  p.classList.add("item-hanging");
  const label = document.createElement("span");
  label.className = "item-hanging-label";
  label.appendChild(parseTextToFragment(joined.slice(0, sep + 1)));
  const body = document.createElement("span");
  body.className = "item-hanging-body";
  body.appendChild(parseTextToFragment(joined.slice(sep + 1)));
  p.appendChild(label);
  p.appendChild(body);
  return p;
}

function renderBlock(block) {
  if (block.type === "heading") {
    const h = document.createElement("h2");
    h.className = "section-heading";
    appendKernedText(h, block.text);
    return h;
  }
  if (block.type === "item") {
    return renderItemBlock(block.text);
  }
  if (block.type === "box") {
    const div = document.createElement("div");
    div.className = "box";
    if (block.title) {
      const h3 = document.createElement("h3");
      h3.className = "box-title";
      const sep = block.title.indexOf("|");
      if (sep === -1) {
        appendKernedText(h3, block.title);
      } else {
        const main = document.createElement("span");
        appendKernedText(main, block.title.slice(0, sep));
        h3.appendChild(main);
        const sepSpan = document.createElement("span");
        sepSpan.className = "box-title-sep";
        sepSpan.textContent = "｜";
        h3.appendChild(sepSpan);
        const note = document.createElement("span");
        note.className = "box-title-note";
        appendKernedText(note, block.title.slice(sep + 1));
        h3.appendChild(note);
      }
      div.appendChild(h3);
    }
    (block.items || []).forEach((item) => {
      div.appendChild(renderItemBlock(item.text, true));
    });
    return div;
  }
  const fallback = document.createElement("div");
  return fallback;
}

function fixBlankWidths(container) {
  container.querySelectorAll(".blank").forEach((span) => {
    const len = Math.max(
      stripRubyMarkup(span.dataset.answer).length,
      stripRubyMarkup(span.dataset.hint).length
    );
    span.style.width = `calc(${len}em + 24px)`;
  });
}

function setBlankState(span, revealed) {
  span.classList.toggle("revealed", revealed);
  span.textContent = "";
  span.appendChild(parseTextToFragment(revealed ? span.dataset.answer : span.dataset.hint, true));
}

function toggleAllBlanks(container, btn) {
  const willReveal = btn.dataset.state !== "revealed";
  container.querySelectorAll(".blank").forEach((span) => setBlankState(span, willReveal));
  btn.dataset.state = willReveal ? "revealed" : "hidden";
  btn.textContent = willReveal ? "解答非表示" : "解答表示";
}

// Views stay built in the DOM across visits (see renderDetailPage's revisit
// fast path below), so a page left in the revealed state would otherwise
// still show answers next time it's opened. Called on every re-entry to put
// it back to the same hidden state a fresh visit would start in.
function resetBlanks(container, btn) {
  container.querySelectorAll(".blank").forEach((span) => setBlankState(span, false));
  btn.dataset.state = "hidden";
  btn.textContent = "解答表示";
}

function showHomeChrome() {
  document.getElementById("header-home").hidden = false;
  document.getElementById("header-detail").hidden = true;
  document.getElementById("toggle-fab-slot").hidden = true;
}

function showDetailChrome(titleText, showToggle) {
  document.getElementById("header-home").hidden = true;
  document.getElementById("header-detail").hidden = false;
  document.getElementById("header-detail-label").textContent = titleText;
  document.getElementById("toggle-fab-slot").hidden = !showToggle;
}

function addToggleFab() {
  const slot = document.getElementById("toggle-fab-slot");
  slot.innerHTML = "";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "toggle-fab";
  btn.textContent = "解答表示";
  btn.dataset.state = "hidden";
  slot.appendChild(btn);
  return btn;
}

let homeBuilt = false;

function buildHome() {
  const view = document.getElementById("view-home");

  let number = 1;
  CATEGORIES.forEach((cat) => {
    const heading = document.createElement("h2");
    heading.className = "section-heading";
    heading.textContent = cat.title;
    view.appendChild(heading);

    const nav = document.createElement("div");
    nav.className = "card-list";
    cat.children.forEach((child) => {
      const a = document.createElement("a");
      a.href = `#/page/${child.id}`;
      a.className = "card numbered-card";

      const num = document.createElement("span");
      num.className = "card-number";
      num.textContent = number;

      const label = document.createElement("span");
      label.className = "card-label";
      label.textContent = child.title;

      a.appendChild(num);
      a.appendChild(label);
      nav.appendChild(a);
      number++;
    });
    view.appendChild(nav);
  });

  homeBuilt = true;
}

// Restarts the CSS animation on `el` even if it was already played before
// (classList.add alone is a no-op if the class is already present).
function playViewTransition(el) {
  el.classList.remove("view-enter");
  void el.offsetWidth;
  el.classList.add("view-enter");
}

// Views stay in the DOM permanently and are only ever hidden/shown, never
// torn down and rebuilt, so there's no intermediate blank frame for iOS's
// native swipe-back transition to race against.
function renderHome(skipAnim) {
  if (!homeBuilt) buildHome();
  showHomeChrome();
  document.getElementById("view-detail").hidden = true;
  const view = document.getElementById("view-home");
  view.hidden = false;
  if (!skipAnim) playViewTransition(view);
}

const pageDataCache = new Map();
let builtDetailPageId = null;

async function buildDetailContent(pageId, child) {
  const view = document.getElementById("view-detail");
  view.innerHTML = "";

  const toggleBtn = addToggleFab();
  const content = document.createElement("div");
  content.className = "content";

  try {
    let blocks = pageDataCache.get(pageId);
    if (!blocks) {
      const res = await fetch(`data/${pageId}.json`);
      if (!res.ok) throw new Error(`status ${res.status}`);
      blocks = await res.json();
      pageDataCache.set(pageId, blocks);
    }
    if (!Array.isArray(blocks) || blocks.length === 0) {
      const p = document.createElement("p");
      p.className = "empty-notice";
      p.textContent = "このページの内容は準備中です。";
      content.appendChild(p);
    } else {
      blocks.forEach((block) => content.appendChild(renderBlock(block)));
    }
  } catch (e) {
    const p = document.createElement("p");
    p.className = "error-notice";
    p.textContent = "データの読み込みに失敗しました。";
    content.appendChild(p);
  }

  toggleBtn.addEventListener("click", () => toggleAllBlanks(content, toggleBtn));
  view.appendChild(content);
  fixBlankWidths(content);
}

// Fades in the detail view and, when it's visible, the answer-toggle button
// alongside it — they live in different parts of the DOM (the button sits in
// the fixed top-bar, not inside #view-detail) so each needs its own trigger.
function playDetailTransition(view, showToggle) {
  playViewTransition(view);
  if (showToggle) playViewTransition(document.getElementById("toggle-fab-slot"));
}

async function renderDetailPage(pageId, skipAnim) {
  const child = findChild(pageId);
  showDetailChrome(child ? child.title : "ページが見つかりません", !!child);

  document.getElementById("view-home").hidden = true;
  const view = document.getElementById("view-detail");
  view.hidden = false;

  if (!child) {
    builtDetailPageId = null;
    view.innerHTML = "";
    if (!skipAnim) playDetailTransition(view, false);
    return;
  }

  // Already built and visible for this page (e.g. revisited via back/forward)
  // — nothing to rebuild, so it shows instantly with no fetch/render gap.
  if (builtDetailPageId === pageId) {
    const toggleBtn = document.querySelector(".toggle-fab");
    if (toggleBtn) resetBlanks(view, toggleBtn);
    if (!skipAnim) playDetailTransition(view, true);
    return;
  }

  const requestedHash = location.hash;
  builtDetailPageId = pageId;
  await buildDetailContent(pageId, child);

  // route() may have moved on while the fetch was in flight; discard stale results.
  if (location.hash !== requestedHash) return;
  if (!skipAnim) playDetailTransition(view, true);
}

// Only an explicit tap on a home card should play our fade-in — back
// navigation (in-app back link or the OS swipe-back gesture) already carries
// iOS's own native transition, so stacking ours on top just adds noise.
// (popstate was tried to detect this instead, but iOS/WebKit can fire a
// spurious popstate right after page load with no real navigation behind
// it, which silently ate the animation on the very first forward tap.)
let pendingForwardAnim = false;
document.getElementById("view-home").addEventListener("click", (e) => {
  if (e.target.closest("a.card")) pendingForwardAnim = true;
});

function route() {
  window.scrollTo(0, 0);

  const skipAnim = !pendingForwardAnim;
  pendingForwardAnim = false;

  const hash = location.hash.replace(/^#\/?/, "");
  const parts = hash.split("/").filter(Boolean);

  if (parts.length === 0) {
    renderHome(skipAnim);
  } else if (parts[0] === "page" && parts[1]) {
    renderDetailPage(parts[1], skipAnim);
  } else {
    renderHome(skipAnim);
  }
}

document.getElementById("app").addEventListener("click", (e) => {
  const span = e.target.closest(".blank");
  if (!span) return;
  setBlankState(span, !span.classList.contains("revealed"));
});

// The detail page's back link pops the existing history entry instead of
// pushing a new "home" entry, so it stays aligned with the native
// swipe-back gesture's history depth rather than growing it indefinitely.
document.addEventListener("click", (e) => {
  const back = e.target.closest("a[data-back]");
  if (!back) return;
  e.preventDefault();
  history.back();
});

// .top-bar is `position: fixed` (not sticky) so it never has to re-stick
// during a scroll jump — that re-sticking was what caused it to blank out
// for a frame on both forward navigation (scrollTo(0,0)) and back
// navigation. #app's top padding is kept in sync with its real height here
// so content never starts underneath it.
function syncHeaderHeight() {
  const height = document.querySelector(".top-bar").getBoundingClientRect().height;
  document.documentElement.style.setProperty("--header-height", `${height}px`);
}

window.addEventListener("hashchange", route);
window.addEventListener("DOMContentLoaded", () => {
  syncHeaderHeight();
  route();
});
window.addEventListener("resize", syncHeaderHeight);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
