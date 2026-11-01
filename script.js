/* Commander’s Dilemma — Prairie Grove (Herron’s Army, deterministic)
   - “Victory/Tactical Victory” shown when most or all historic choices are taken.
   - Worst outcome capped at “Stalemate” (no “Repulse”).
   - Morale never below “Fair” (floor = 40); Cohesion never below “Together” (floor = 50).
   - Union casualties finish between 400–600; Casualty bar scaled to 600.
   - JPG map loaded inside script via DEFAULT_MAP_SRC or URL ?map= parameter.
   - Two choices per decision; historic choices highlighted.
*/

/* ---------- Map file configuration ---------- */
const DEFAULT_MAP_SRC = "./assets/prairie-grove-historic-base.jpg";

/* ---------- State (Herron’s start conditions) ---------- */
const state = {
  time: 6,      // tempo baseline
  supply: 75,   // High
  morale: 50,   // Fair
  cohesion: 60, // Together
  casualties: 0,
  step: 1,
  path: [],
  phases: [],
  historicCount: 0
};
const STEP_MAX = 7;

/* ---------- DOM refs ---------- */
const dilemmaCard  = document.getElementById("dilemmaCard");
const sceneTitle   = document.getElementById("sceneTitle");
const sceneBody    = document.getElementById("sceneBody");
const choiceList   = document.getElementById("choiceList");
const confirmBtn   = document.getElementById("confirmBtn");
const resetBtn     = document.getElementById("resetBtn");
const shareBtn     = document.getElementById("shareBtn");

const timeBar      = document.getElementById("timeBar");
const supplyBar    = document.getElementById("supplyBar");
const moraleBar    = document.getElementById("moraleBar");
const casualtyBar  = document.getElementById("casualtyBar");
const cohesionBar  = document.getElementById("cohesionBar");

const timeVal      = document.getElementById("timeVal");
const supplyVal    = document.getElementById("supplyVal");
const moraleVal    = document.getElementById("moraleVal");
const casualtyVal  = document.getElementById("casualtyVal");
const cohesionVal  = document.getElementById("cohesionVal");

const stepVal      = document.getElementById("stepVal");
const stepMaxEl    = document.getElementById("stepMax");
const phaseTag     = document.getElementById("phaseTag");
const routeTag     = document.getElementById("routeTag");

const outcomeBox     = document.getElementById("outcomeBox");
const outcomeTitle   = document.getElementById("outcomeTitle");
const outcomeSummary = document.getElementById("outcomeSummary");
const finalMorale    = document.getElementById("finalMorale");
const finalMoraleNum = document.getElementById("finalMoraleNum");
const finalSupply    = document.getElementById("finalSupply");
const finalCohesion  = document.getElementById("finalCohesion");
const finalCohesionNum = document.getElementById("finalCohesionNum");
const finalTime      = document.getElementById("finalTime");
const finalCasualties= document.getElementById("finalCasualties");
const finalPhases    = document.getElementById("finalPhases");
const finalPath      = document.getElementById("finalPath");
const historicCount  = document.getElementById("historicCount");

/* Map elements */
const mapBase        = document.getElementById("mapBase");
const unionLinesGroup= document.getElementById("unionLines");
const confLinesGroup = document.getElementById("confLines");

stepMaxEl.textContent = String(STEP_MAX);

/* ---------- Helpers ---------- */
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/* Labels shown during play (numbers reserved for Outcome) */
function labelTime(val) {
  const pct = (clamp(val,0,12)/12)*100;
  if (pct >= 80) return "Very High";
  if (pct >= 60) return "High";
  if (pct >= 40) return "Moderate";
  if (pct >= 20) return "Low";
  return "Very Low";
}
function labelSupply(val) {
  const pct = clamp(val,0,100);
  if (pct >= 80) return "Very High";
  if (pct >= 60) return "High";
  if (pct >= 40) return "Moderate";
  if (pct >= 20) return "Low";
  return "Very Low";
}
function labelCasualties(val) {
  const pct = (clamp(val,0,600)/600)*100;
  if (pct < 20) return "Very Low";
  if (pct < 40) return "Low";
  if (pct < 60) return "Moderate";
  if (pct < 80) return "High";
  return "Very High";
}

/* Floors: Morale ≥ 40 (Fair), Cohesion ≥ 50 (Together) */
function effectiveMorale() {
  const base = clamp(state.morale, 40, 100); // enforce floor
  const casualtyPenalty = Math.floor(state.casualties / 80);      // scaled to 600
  const supplyPenalty   = Math.max(0, Math.floor((50 - state.supply) / 8));
  return clamp(base - casualtyPenalty - supplyPenalty, 40, 100);  // floor stays 40
}
function labelMorale() {
  const m = effectiveMorale();
  if (m >= 80) return "Excellent";
  if (m >= 60) return "Good";
  return "Fair"; // never below Fair
}

function effectiveCohesion() {
  const base = clamp(state.cohesion, 50, 100); // enforce floor
  const casualtyPenalty = Math.floor(state.casualties / 60);      // scaled
  const supplyPenalty   = Math.max(0, Math.floor((40 - state.supply) / 6));
  return clamp(base - casualtyPenalty - supplyPenalty, 50, 100);  // floor stays 50
}
function labelCohesion() {
  const c = effectiveCohesion();
  if (c >= 75) return "Brothers-in-Arms";
  return "Together"; // never below Together
}

/* During play: bars + labels only */
function updateBars() {
  supplyBar.style.width   = `${clamp(state.supply,0,100)}%`;
  moraleBar.style.width   = `${effectiveMorale()}%`;
  timeBar.style.width     = `${(clamp(state.time,0,12)/12)*100}%`;
  cohesionBar.style.width = `${effectiveCohesion()}%`;
  casualtyBar.style.width = `${(clamp(state.casualties,0,600)/600)*100}%`;

  supplyVal.textContent   = labelSupply(state.supply);
  moraleVal.textContent   = labelMorale();
  timeVal.textContent     = labelTime(state.time);
  cohesionVal.textContent = labelCohesion();
  casualtyVal.textContent = labelCasualties(state.casualties);

  stepVal.textContent     = `${state.step}`;
}
function setPhase(label) {
  phaseTag.textContent = `Phase: ${label}`;
  state.phases.push(label);
}

/* ---------- Historic choice mapping (Herron’s perspective) ----------
   Approximate historic path: 1B, 2B, 3A, 4B, 5A, 6B, 7B */
const HISTORIC_CHOICES = {
  "1": "1B",
  "2": "2B",
  "3": "3A",
  "4": "4B",
  "5": "5A",
  "6": "6B",
  "7": "7B"
};

/* ---------- Scenario decisions (two choices per phase) ----------
   Casualty contributions tuned to finish within 400–600.
   Best totals ≈ 400; worst totals ≈ 580. */
const NODES = {
  "1": {
    id: "1",
    title: "08:30–09:00 • Cavalry Contact near Prairie Grove Church",
    body: "Confederate cavalry presses your screens back toward the Illinois River. You’re forming in the prairie.",
    phase: "08:30–09:00 • Contact near Prairie Grove Church",
    choices: [
      { id: "1A", label: "Hold screens, stabilize line",
        desc: "Conserve energy; slower tempo; steadier cohesion.",
        effects: s => { s.time -= 0; s.cohesion += 3; s.morale += 1; s.supply -= 2; s.casualties += 40; } },
      { id: "1B", label: "Push forward to regain ground",
        desc: "Better initiative; risk cohesion and tempo.",
        effects: s => { s.time -= 1; s.cohesion -= 4; s.morale += 1; s.supply -= 4; s.casualties += 60; } }
    ],
    next: "2"
  },
  "2": {
    id: "2",
    title: "10:00–11:00 • Deploy Artillery opposite the Ridge",
    body: "Bring up guns across the Illinois River and duel Confederate batteries.",
    phase: "10:00–11:00 • Artillery Duel",
    choices: [
      { id: "2A", label: "Spread batteries across the front",
        desc: "Broader coverage; less massed fire.",
        effects: s => { s.morale += 2; s.time -= 1; s.casualties += 60; s.supply -= 6; } },
      { id: "2B", label: "Concentrate for counterbattery",
        desc: "Stronger massed fire; higher exposure per unit.",
        effects: s => { s.morale += 3; s.time -= 1; s.casualties += 80; s.supply -= 8; } }
    ],
    next: "3"
  },
  "3": {
    id: "3",
    title: "~13:00 • First Assault up the Ridge",
    body: "Your infantry attacks the slope toward the Confederate crest.",
    phase: "~13:00 • First Assault",
    choices: [
      { id: "3A", label: "Commit reserves to thicken the assault",
        desc: "Heavier push; more losses; tempo slows.",
        effects: s => { s.cohesion += 6; s.time -= 1; s.casualties += 80; s.morale += 2; s.supply -= 6; } },
      { id: "3B", label: "Conserve ammunition; steady advance",
        desc: "Lower immediate losses; cohesion drifts.",
        effects: s => { s.casualties += 110; s.cohesion -= 4; s.morale += 1; s.supply -= 3; } }
    ],
    next: "4"
  },
  "4": {
    id: "4",
    title: "~14:00–15:00 • Renewed Push & Counterfire",
    body: "You press again; counterattacks and canister check the advance.",
    phase: "~14:00–15:00 • Renewed Push",
    choices: [
      { id: "4A", label: "Stabilize line; limited counter",
        desc: "Cohesion steadies; fewer losses.",
        effects: s => { s.cohesion += 4; s.casualties += 70; s.morale += 2; s.time -= 0; s.supply -= 5; } },
      { id: "4B", label: "Drive harder to exploit openings",
        desc: "Greater shock; higher casualties; tempo cost.",
        effects: s => { s.cohesion -= 2; s.casualties += 100; s.morale += 3; s.time -= 1; s.supply -= 8; } }
    ],
    next: "5"
  },
  "5": {
    id: "5",
    title: "~15:00–16:00 • Blunt Arrives North of the Ridge",
    body: "Blunt’s men arrive on your left, north of the Confederate ridge near Borden House.",
    phase: "~15:00–16:00 • Blunt on the Left (North of Ridge)",
    choices: [
      { id: "5A", label: "Shift brigades left to coordinate",
        desc: "Check flank; center thins slightly.",
        effects: s => { s.cohesion += 2; s.casualties += 60; s.morale += 1; s.time -= 0; s.supply -= 7; } },
      { id: "5B", label: "Hold center; accept pressure left",
        desc: "Center steady; losses rise on the flank.",
        effects: s => { s.cohesion += 1; s.casualties += 90; s.morale += 0; s.time -= 0; s.supply -= 5; } }
    ],
    next: "6"
  },
  "6": {
    id: "6",
    title: "Late Afternoon • Ammunition Running Low",
    body: "Decide whether to husband ammunition or press locally near sunset.",
    phase: "Late Afternoon • Ammunition Low",
    choices: [
      { id: "6A", label: "Husband ammunition; shorten line",
        desc: "Lower immediate losses; cohesion improves; tempo slows.",
        effects: s => { s.casualties += 50; s.cohesion += 4; s.time -= 1; s.morale += 1; s.supply -= 10; } },
      { id: "6B", label: "Press with bayonet locally",
        desc: "Higher losses; morale uptick; cohesion variable.",
        effects: s => { s.casualties += 80; s.morale += 3; s.cohesion -= 1; s.time -= 0; s.supply -= 12; } }
    ],
    next: "7"
  },
  "7": {
    id: "7",
    title: "After Dusk • Hold the Field",
    body: "Night settles. Hold positions or adjust for overnight risk.",
    phase: "After Dusk • Night Positions",
    choices: [
      { id: "7A", label: "Consolidate & step back to stronger posts",
        desc: "Concedes ground; preserves force.",
        effects: s => { s.time -= 0; s.morale -= 1; s.cohesion += 2; s.casualties += 40; s.supply -= 5; } },
      { id: "7B", label: "Hold positions overnight",
        desc: "Maintain field; supply remains critical.",
        effects: s => { s.time -= 0; s.morale += 1; s.supply -= 8; s.casualties += 60; } }
    ],
    next: "END"
  }
};

/* ---------- Outcome ---------- */
function labelSupplyScore(val){ return clamp(val,0,100); }

/* Outcome logic:
   - If historicCount >= 6 → Victory
   - Else if historicCount >= 5 → Tactical Victory
   - Else score-based: Floor at Stalemate (no Repulse)
*/
function computeOutcome(s) {
  const tempo = Math.max(0, s.time) * 2;
  const score = effectiveMorale() + labelSupplyScore(s.supply) + effectiveCohesion() + tempo - Math.min(s.casualties / 6, 100); // scaled to 600

  if (s.historicCount >= 6) {
    return { score, title: "Victory", summary: "Your historic course held the prairie and forced the enemy to leave the field." };
  }
  if (s.historicCount >= 5) {
    return { score, title: "Tactical Victory", summary: "You achieved tactical success; the enemy yielded the ground." };
  }

  // Score tiers — floor at Stalemate
  if (score >= 140) {
    return { score, title: "Tactical Victory", summary: "You pressed with coordination and held the field at a cost." };
  } else if (score >= 110) {
    return { score, title: "Marginal Success", summary: "Progress with trade-offs; coordination and steady positions preserved the line." };
  } else {
    return { score, title: "Stalemate", summary: "Positions held; losses and fatigue prevented a clearer result." };
  }
}

/* Reveal numbers only in Outcome */
function showOutcome() {
  updateBars();
  confirmBtn.disabled = true;

  const result = computeOutcome(state);
  outcomeTitle.textContent   = result.title;
  outcomeSummary.textContent = result.summary;

  finalMorale.textContent     = labelMorale();
  finalMoraleNum.textContent  = `${effectiveMorale()}`;
  finalSupply.textContent     = `${state.supply}`;
  finalCohesion.textContent   = labelCohesion();
  finalCohesionNum.textContent= `${effectiveCohesion()}`;
  finalTime.textContent       = `${Math.max(0, state.time)}`;
  finalCasualties.textContent = `${state.casualties}`;
  historicCount.textContent   = `${state.historicCount}`;
  finalPhases.textContent     = state.phases.join(" → ");
  finalPath.textContent       = state.path.join(" → ");

  outcomeBox.classList.remove("hidden");
}

/* ---------- Troop lines (SVG overlay on JPG base map) ----------
   Normalized 0–100 coords aligned to a battlefield depiction.
   Decision 5: Blunt’s line drawn north (smaller Y) of the Confederate ridge. */
const TROOP_LINES = {
  "1": { // union forming; conf ridge
    union: [ [[62,44],[70,42],[78,40]] ],          // guns forming near river
    conf:  [ [[18,60],[32,58],[45,58],[60,59],[78,62]] ]  // ridge crest arc
  },
  "2": { // artillery duel
    union: [ [[62,44],[70,42],[78,40]] ],
    conf:  [ [[18,60],[32,58],[45,58],[60,59],[78,62]] ]
  },
  "3": { // first assault forming
    union: [ [[55,60],[62,59],[70,58]] ],
    conf:  [ [[18,60],[32,58],[45,58],[60,59],[78,62]] ]
  },
  "4": { // renewed push & counters
    union: [ [[56,62],[63,61],[71,60]] ],
    conf:  [ [[20,60],[34,58],[48,57],[62,58],[78,62]] ]
  },
  "5": { // Blunt north of ridge
    union: [
      [[30,50],[40,52]],             // Blunt north of ridge (smaller Y)
      [[58,60],[66,59],[74,58]]      // Herron mid/front
    ],
    conf:  [ [[20,60],[34,58],[48,57],[62,58],[78,62]] ]
  },
  "6": { // shortened line near dusk
    union: [
      [[30,50],[42,52]],             // Blunt holding north
      [[56,62],[63,61],[69,60]]      // Herron line
    ],
    conf:  [ [[24,61],[46,59],[68,61]] ]
  },
  "7": { // overnight positions
    union: [
      [[30,50],[42,52]],             // Blunt north flank
      [[55,60],[62,59],[70,58]]      // Herron line holding prairie
    ],
    conf:  [ [[16,78],[12,88]] ]     // Confederate withdrawal axis
  }
};

/* Choice-based nudges (visual variation only) */
function adjustForChoice(phaseId, choiceId) {
  const lines = JSON.parse(JSON.stringify(TROOP_LINES[phaseId])); // copy
  if (!choiceId) return lines;

  if (phaseId === "5") {
    if (choiceId === "5A") { // coordinate with Blunt
      lines.union[0] = [[28,49],[40,51]];
      lines.union[1] = [[56,60],[64,59],[72,58]];
    } else if (choiceId === "5B") { // hold center
      lines.union[0] = [[32,51],[44,53]];
    }
  }
  if (phaseId === "6") {
    if (choiceId === "6A") { // shorten further
      lines.union[1] = [[56,62],[63,61],[69,60]];
    } else if (choiceId === "6B") { // press locally
      lines.union[1] = [[57,61],[65,60],[73,59]];
    }
  }
  return lines;
}

/* SVG drawing */
function drawTroopLines(phaseId, choiceId = null) {
  const { union, conf } = adjustForChoice(phaseId, choiceId);
  unionLinesGroup.replaceChildren();
  confLinesGroup.replaceChildren();

  union.forEach(points => {
    const pl = document.createElementNS("http://www.w3.org/2000/svg","polyline");
    pl.setAttribute("points", points.map(p => `${p[0]},${p[1]}`).join(" "));
    unionLinesGroup.appendChild(pl);
  });
  conf.forEach(points => {
    const pl = document.createElementNS("http://www.w3.org/2000/svg","polyline");
    pl.setAttribute("points", points.map(p => `${p[0]},${p[1]}`).join(" "));
    confLinesGroup.appendChild(pl);
  });
}

/* ---------- Rendering ---------- */
function focusSceneTitle() { sceneTitle.setAttribute("tabindex","-1"); sceneTitle.focus(); }

function renderNode(nodeId) {
  const node = NODES[nodeId];
  if (!node) return;

  outcomeBox.classList.add("hidden");
  confirmBtn.disabled = false;

  sceneTitle.innerHTML = node.title;
  sceneBody.innerHTML  = node.body;
  setPhase(node.phase);

  // Build exactly two choices
  choiceList.replaceChildren();
  node.choices.forEach((ch, i) => {
    const wrap = document.createElement("div");
    wrap.className = "choice";
    wrap.dataset.choiceId = ch.id;

    const radio = document.createElement("input");
    radio.type = "radio"; radio.name = "choice"; radio.id = ch.id; radio.value = ch.id;
    radio.setAttribute("aria-label", ch.label);
    if (i === 0) {
      radio.checked = true;
      wrap.classList.add("selected");
    }

    const title = document.createElement("h4");
    title.textContent = ch.label;

    // Historic badge
    if (HISTORIC_CHOICES[nodeId] === ch.id) {
      const badge = document.createElement("span");
      badge.className = "badge historic";
      badge.textContent = "Historic Choice";
      title.appendChild(badge);
    }

    const desc = document.createElement("p"); desc.textContent = ch.desc;

    // Tap the whole card to select
    wrap.addEventListener("click", () => {
      radio.checked = true;
      choiceList.querySelectorAll(".choice").forEach(c => c.classList.remove("selected"));
      wrap.classList.add("selected");
    });

    wrap.appendChild(radio);
    wrap.appendChild(title);
    wrap.appendChild(desc);
    choiceList.appendChild(wrap);
  });

  // Draw troop lines for phase preview
  drawTroopLines(nodeId);

  updateBars();
  focusSceneTitle();
  routeTag.classList.add("hidden");
}

function getCheckedChoiceId() {
  const checked = choiceList.querySelector('input[type="radio"]:checked');
  return checked?.value || null;
}

function applyChoice(choiceId) {
  const nodeId = currentNodeId();
  const node   = NODES[nodeId];
  const choice = node.choices.find(c => c.id === choiceId);
  if (!choice) return;

  // Apply effects
  choice.effects(state);

  // Clamp & floors
  state.supply     = clamp(state.supply, 0, 100);
  state.morale     = clamp(state.morale, 40, 100);   // morale floor
  state.cohesion   = clamp(state.cohesion, 50, 100); // cohesion floor
  state.casualties = clamp(state.casualties, 0, 600); // scaled cap
  state.time       = clamp(state.time, 0, 12);

  // Historic vs alternate banner
  const isHistoric = HISTORIC_CHOICES[nodeId] === choiceId;
  if (isHistoric) {
    state.historicCount++;
    routeTag.textContent = "Historic Route";
    routeTag.classList.remove("alt","hidden"); routeTag.classList.add("historic");
  } else {
    routeTag.textContent = "Alternate Route";
    routeTag.classList.remove("historic","hidden"); routeTag.classList.add("alt");
  }

  // Draw lines reflecting this choice
  drawTroopLines(nodeId, choiceId);

  // Advance
  state.path.push(choiceId);
  const nextId = node.next;
  if (nextId === "END") {
    updateBars(); // ensure final labels reflect last state
    showOutcome();
  } else {
    state.step++;
    setCurrentNode(nextId);
    renderNode(nextId);
  }
}

/* ---------- Navigation & sharing ---------- */
let _currentNode = "1";
function currentNodeId() { return _currentNode; }
function setCurrentNode(id) { _currentNode = id; }

function confirmSelection() {
  const choiceId = getCheckedChoiceId();
  if (!choiceId) return;
  applyChoice(choiceId);
}

function resetScenario() {
  Object.assign(state, {
    time: 6, supply: 75, morale: 50, cohesion: 60,
    casualties: 0, step: 1, path: [], phases: [], historicCount: 0
  });
  setCurrentNode("1");
  outcomeBox.classList.add("hidden");
  renderNode("1");

  // Clear scenario-sharing parameters without discarding a custom map selection.
  const params = new URLSearchParams(location.search);
  params.delete("path");
  params.delete("ph");
  params.delete("hc");
  const query = params.toString();
  history.replaceState(null, "", `${location.pathname}${query ? `?${query}` : ""}${location.hash}`);
}

function copyShareLink() {
  const params = new URLSearchParams();
  const map = new URLSearchParams(location.search).get("map");
  if (map) params.set("map", map);
  if (state.path.length) params.set("path", state.path.join(","));
  const query = params.toString();
  const url = `${location.origin}${location.pathname}${query ? `?${query}` : ""}`;

  if (!navigator.clipboard?.writeText) {
    toast("Clipboard unavailable. You can share the URL in your address bar.");
    return;
  }
  navigator.clipboard.writeText(url)
    .then(() => toast("Share link copied to clipboard."))
    .catch(() => toast("Unable to copy. You can share the URL in your address bar."));
}

function toast(msg) {
  const box = document.createElement("div");
  box.className = "result-message";
  box.style.position = "fixed"; box.style.bottom = "16px"; box.style.left = "16px"; box.style.right = "16px";
  box.style.zIndex = "1000"; box.style.background = "#fff"; box.style.border = "1px solid var(--border-color)";
  box.style.borderRadius = "10px"; box.style.padding = "10px 12px";
  box.textContent = msg;
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 1800);
}

/* ---------- Touch & keyboard UX ---------- */
function pressHandlerDown(e) {
  const btn = e.target.closest('button.primary-btn, button.secondary-btn, a.text-btn');
  if (btn) btn.classList.add('is-pressed');
}
function pressHandlerUp() { document.querySelectorAll('.is-pressed').forEach(b => b.classList.remove('is-pressed')); }
document.addEventListener('pointerdown', pressHandlerDown);
document.addEventListener('pointerup', pressHandlerUp);
document.addEventListener('pointercancel', pressHandlerUp);
window.addEventListener('blur', pressHandlerUp);

function selectChoiceByOffset(offset) {
  const radios = Array.from(choiceList.querySelectorAll('input[type="radio"]'));
  if (!radios.length) return;
  const currentIdx = radios.findIndex(r => r.checked);
  const idx = currentIdx >= 0 ? currentIdx : 0;
  const nextIdx = Math.max(0, Math.min(radios.length - 1, idx + offset));
  radios[nextIdx].checked = true;
  radios[nextIdx].focus();
  choiceList.querySelectorAll(".choice").forEach(c => c.classList.remove("selected"));
  radios[nextIdx].closest(".choice")?.classList.add("selected");
}
function handleKeydown(e) {
  if (!document.activeElement || !dilemmaCard.contains(document.activeElement)) return;
  const key = e.key.toLowerCase();
  if (key === "arrowdown") { e.preventDefault(); selectChoiceByOffset(+1); }
  else if (key === "arrowup") { e.preventDefault(); selectChoiceByOffset(-1); }
  else if (key === "enter" || key === " ") { e.preventDefault(); confirmSelection(); }
  else if (key === "escape") { choiceList.querySelector('input[type="radio"]')?.focus(); }
}
document.addEventListener("keydown", handleKeydown);

/* ---------- Map loader (JPG) ---------- */
function loadMapImage() {
  const p = new URLSearchParams(location.search);
  const MAP_SRC = p.get("map") ? `./assets/${p.get("map")}` : DEFAULT_MAP_SRC;
  mapBase.src = MAP_SRC;
  mapBase.addEventListener("error", () => {
    toast("Map JPG not found. Place your file in ./assets/ and set DEFAULT_MAP_SRC or use ?map=filename.jpg");
  });
}

/* ---------- Init & deep-link hydration ---------- */
confirmBtn.addEventListener("click", confirmSelection);
resetBtn.addEventListener("click", resetScenario);
shareBtn.addEventListener("click", copyShareLink);

function init() {
  loadMapImage();
  renderNode("1");
  hydrateFromURL();
}
document.addEventListener("DOMContentLoaded", init);

function hydrateFromURL() {
  const p = new URLSearchParams(location.search);
  const path = p.get("path")?.split(",").filter(Boolean) || [];
  if (path.length) {
    resetScenario();
    for (const choiceId of path) {
      const nodeId = currentNodeId();
      const node = NODES[nodeId];
      const choice = node?.choices.find(c => c.id === choiceId);
      if (!choice) break;
      applyChoice(choiceId);
    }
  }
}

