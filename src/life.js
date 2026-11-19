// Autonomous individual life rules — independent from rendering and the UI.
// Numeric values are gameplay parameters, not a claim of human psychological realism.
export const clampLife = (v, min, max) => Math.max(min, Math.min(max, v));

export const PERSONALITIES = Object.freeze([
  {name: 'Zvídavý', curiosity: 80, sociability: 52, persistence: 57},
  {name: 'Společenská', curiosity: 53, sociability: 89, persistence: 52},
  {name: 'Praktický', curiosity: 46, sociability: 42, persistence: 91},
  {name: 'Empatická', curiosity: 58, sociability: 84, persistence: 68},
  {name: 'Opatrný', curiosity: 37, sociability: 61, persistence: 85},
  {name: 'Samostatná', curiosity: 82, sociability: 46, persistence: 76}
]);

export function initializeLife(agent, index) {
  const traits = PERSONALITIES[index % PERSONALITIES.length];
  agent.personality = { ...traits };
  agent.hunger = 22 + (index * 7) % 28;
  agent.thirst = 24 + (index * 9) % 19;
  agent.socialNeed = 48 + (index * 11) % 29;
  agent.mood = 61 + (index * 3) % 17;
  agent.memories = ['Příchod do nového světa'];
  agent.relationships = {};
  agent.lastInteraction = -100;
  agent.conversation = null;
  agent.lastMeal = -100;
  return agent;
}

export function remember(agent, memory) {
  if (!agent.memories) agent.memories = [];
  if (agent.memories[agent.memories.length - 1] === memory) return;
  agent.memories.push(memory);
  agent.memories = agent.memories.slice(-5);
}

export function updateLife(agent, dt, weather = 'clear') {
  const effort = ['harvest', 'forage', 'building', 'wood', 'berries'].includes(agent.purpose) ? 1.22 : 1;
  agent.hunger = clampLife(agent.hunger + dt * 0.19 * effort, 0, 100);
  agent.thirst = clampLife((agent.thirst ?? 25) + dt * (weather === 'drought' ? .37 : .24) * effort, 0, 100);
  agent.socialNeed = clampLife(agent.socialNeed + dt * 0.27, 0, 100);
  const suffering = agent.hunger > 85 || agent.thirst > 87 || agent.energy < 15;
  const rainStress = weather === 'rain' && agent.purpose !== 'resting' && agent.purpose !== 'eating';
  const recovery = agent.hunger < 55 && agent.energy > 45;
  agent.mood = clampLife(agent.mood + dt * (suffering ? -0.22 : rainStress ? -0.045 : recovery ? 0.026 : -0.005), 0, 100);
}

export function relationshipLabel(score) {
  if (score >= 80) return 'Blízcí přátelé';
  if (score >= 55) return 'Přátelé';
  if (score >= 30) return 'Známí';
  return 'Zatím se neznají';
}

export function socialBond(a, b) {
  a.relationships[b.id] = clampLife((a.relationships[b.id] ?? 18) + 14, 0, 100);
  b.relationships[a.id] = clampLife((b.relationships[a.id] ?? 18) + 14, 0, 100);
  a.socialNeed = Math.max(0, a.socialNeed - 59);
  b.socialNeed = Math.max(0, b.socialNeed - 59);
  a.mood = clampLife(a.mood + 9, 0, 100);
  b.mood = clampLife(b.mood + 9, 0, 100);
  remember(a, 'Povídal si s ' + b.name);
  remember(b, 'Povídal si s ' + a.name);
}

export function needsDecision(agent, sharedFood) {
  if ((agent.thirst ?? 0) >= 67) return 'drink';
  if (agent.hunger >= 70 && sharedFood > 0) return 'eat';
  if (agent.energy < 24) return 'rest';
  // Sociable personalities seek company sooner; independent people tolerate solitude longer.
  const socialThreshold = 85 - (agent.personality?.sociability ?? 50) * 0.27;
  if (agent.socialNeed >= socialThreshold || (agent.mood < 27 && agent.socialNeed >= 44)) return 'social';
  return 'work';
}
