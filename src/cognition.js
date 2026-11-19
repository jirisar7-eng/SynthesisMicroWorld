/**
 * MW-005 — agent-centred perception and learning.
 *
 * IMPORTANT: no function in this file has global knowledge of a source
 * unless the agent is physically close enough to sense it. Remembered
 * estimates may be stale; hearsay is distinguished from observation.
 * All functions are framework-independent and testable in Node.
 */
const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const toCell = (x, z) => `${Math.round(x / 5)}:${Math.round(z / 5)}`;

export function initCognition(agent) {
  agent.cognition = {
    resources: Object.create(null),
    visited: [],
    visitedKeys: Object.create(null),
    episodes: [],
    discoveries: 0,
    received: 0,
    shared: 0,
    lastScan: -Infinity,
    lastDecision: null,
    experience: {
      tree: { success: 0, failed: 0 },
      berry: { success: 0, failed: 0 }
    }
  };
  // The home camp is familiar, but the distant wilderness is not.
  visit(agent, agent.x, agent.z, 0);
  visit(agent, 0, 0, 0);
  return agent;
}

export function visit(agent, x, z, time) {
  const c = agent.cognition;
  const key = toCell(x, z);
  if (!c.visitedKeys[key]) {
    c.visitedKeys[key] = true;
    c.visited.push({ x: Math.round(x / 5) * 5, z: Math.round(z / 5) * 5, time });
  }
}

export function episode(agent, { time, title, cause, outcome, category = 'decision' }) {
  const c = agent.cognition;
  c.episodes.push({ time, title, cause, outcome, category });
  if (c.episodes.length > 14) c.episodes.shift();
}

/**
 * A physical sighting is authoritative for THIS observer and THIS moment only.
 * It does not magically refresh other agents' memories.
 */
export function observeNearby(agent, { trees = [], berries = [] }, time, radius = 7.5) {
  const c = agent.cognition;
  if (time - c.lastScan < 0.55) return [];
  c.lastScan = time;
  visit(agent, agent.x, agent.z, time);
  const found = [];
  for (const [type, sources] of [['tree', trees], ['berry', berries]]) {
    for (const source of sources) {
      if (distance(agent, source) > radius) continue;
      const key = type + ':' + source.id;
      const former = c.resources[key];
      if (!former) {
        c.discoveries++;
        found.push({ type, id: source.id, x: source.x, z: source.z });
        episode(agent, {
          time, title: type === 'tree' ? 'Objevil strom' : 'Objevil jedlé plody',
          cause: 'Při průzkumu se dostal na dohled nového zdroje.',
          outcome: 'Zapamatoval si přibližnou polohu a zásobu.',
          category: 'discovery'
        });
      }
      const confidence = 1;
      c.resources[key] = {
        key, type, id: source.id, x: source.x, z: source.z,
        estimatedStock: source.stock, lastSeen: time,
        origin: 'seen', from: null, confidence,
        avoidUntil: source.stock <= 0 ? time + 60 : 0
      };
    }
  }
  return found;
}

/**
 * Decisions inspect ONLY the agent's own memory, never remote source.stock.
 * Depleted information may eventually be rechecked because plants regrow.
 */
export function chooseKnownResource(agent, type, time) {
  const c = agent.cognition;
  const records = Object.values(c.resources).filter(r => r.type === type);
  const eligible = records.filter(r => time >= (r.avoidUntil || 0));
  if (!eligible.length) return null;
  let best = null, bestScore = -Infinity;
  for (const rec of eligible) {
    const age = Math.max(0, time - rec.lastSeen);
    const unreliable = rec.origin === 'heard' ? 7 : 0;
    const freshnessPenalty = age * .035;
    const stockPenalty = rec.estimatedStock <= 0 ? 13 : 0;
    const familiarity = rec.origin === 'seen' ? 2 : 0;
    const score = 34 - distance(agent, rec) * .85 - unreliable - freshnessPenalty - stockPenalty + familiarity;
    if (score > bestScore) { bestScore = score; best = rec; }
  }
  return best;
}

/**
 * Two people must actually meet for knowledge to flow. Knowledge is a copy
 * of the speaker's last observation, not a live link to global world state.
 */
export function exchangeKnowledge(speaker, listener, time, limit = 3) {
  const entries = Object.values(speaker.cognition.resources)
    .sort((a, b) => b.lastSeen - a.lastSeen);
  const delivered = [];
  for (const rec of entries) {
    if (delivered.length >= limit) break;
    const previous = listener.cognition.resources[rec.key];
    // Do not replace direct evidence with gossip, and reject older rumours.
    if (previous && (previous.origin === 'seen' || previous.lastSeen >= rec.lastSeen)) continue;
    const copy = {
      ...rec,
      origin: 'heard',
      from: speaker.name,
      confidence: Math.min(rec.confidence ?? 1, .65),
      lastSeen: rec.lastSeen // never stamp a rumour as freshly observed
    };
    listener.cognition.resources[rec.key] = copy;
    listener.cognition.received++;
    speaker.cognition.shared++;
    delivered.push(copy);
  }
  if (delivered.length) {
    episode(listener, {
      time, title: 'Dozvěděl se o ' + delivered.length + ' zdrojích',
      cause: speaker.name + ' mu při osobním rozhovoru předal vlastní zkušenosti.',
      outcome: 'Získal nové, zatím neověřené informace o krajině.',
      category: 'hearsay'
    });
  }
  return delivered;
}

export function learnOutcome(agent, type, source, amount, time) {
  const c = agent.cognition;
  const record = c.resources[type + ':' + source.id];
  const success = amount > 0;
  c.experience[type][success ? 'success' : 'failed']++;
  if (record) {
    record.estimatedStock = source.stock;
    record.lastSeen = time;
    record.origin = 'seen';
    record.from = null;
    record.confidence = 1;
    record.avoidUntil = success ? (source.stock <= 0 ? time + 60 : 0) : time + 70;
  }
  episode(agent, {
    time,
    title: success ? 'Úspěšné získání surovin' : 'Neúspěšná cesta ke zdroji',
    cause: success ? 'Ověřil nalezené místo vlastní prací.' : 'Očekávaný zdroj byl vyčerpaný.',
    outcome: success ? 'Získal ' + amount + ' jednotek a opravil si odhad zásob.' :
      'Příště tomuto místu nějakou dobu nebude důvěřovat.',
    category: 'experience'
  });
}

export function chooseExplorationTarget(agent, time, rng = Math.random) {
  // Candidate targets are generated around the person's CURRENT position.
  // No trees, berries, or concealed world coordinates are consulted.
  const c = agent.cognition;
  let best = null, bestScore = -Infinity;
  for (let i = 0; i < 28; i++) {
    const theta = rng() * Math.PI * 2;
    const step = 8 + rng() * 10;
    const x = agent.x + Math.cos(theta) * step;
    const z = agent.z + Math.sin(theta) * step;
    if (Math.hypot(x, z) > 32.8) continue;
    const key = toCell(x, z);
    const nearby = c.visited.reduce((n, p) => n + (Math.hypot(p.x - x, p.z - z) < 7.8 ? 1 : 0), 0);
    const score = (c.visitedKeys[key] ? -60 : 0) - nearby * 8 + step * .24 + rng() * 2;
    if (score > bestScore) { bestScore = score; best = { x, z }; }
  }
  if (!best) {
    // Defensive fallback uses only the physical camp, not hidden resources.
    const theta = rng() * Math.PI * 2;
    best = { x: Math.cos(theta) * 13, z: Math.sin(theta) * 13 };
  }
  episode(agent, {
    time,
    title: 'Naplánoval průzkum neznámé oblasti',
    cause: 'Nemá spolehlivý známý zdroj nebo ho zajímá neprozkoumané území.',
    outcome: 'Zvolil cestu do oblasti, kde dosud nebyl.',
    category: 'plan'
  });
  return best;
}

export function decision(agent, time, goal, cause, source = 'own') {
  agent.cognition.lastDecision = { time, goal, cause, source };
}

export function knowledgeSummary(agent) {
  const c = agent.cognition;
  const list = Object.values(c.resources);
  return {
    trees: list.filter(v => v.type === 'tree').length,
    berries: list.filter(v => v.type === 'berry').length,
    seen: list.filter(v => v.origin === 'seen').length,
    heard: list.filter(v => v.origin === 'heard').length,
    places: c.visited.length,
    discoveries: c.discoveries,
    received: c.received,
    shared: c.shared,
    lastDecision: c.lastDecision,
    lastEpisode: c.episodes.at(-1) || null,
    visited: c.visited,
    resources: list
  };
}
