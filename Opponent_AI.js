// ════════════════════════════════════════════════════
//  AI OPPONENT  (Player 2)
//  Stephan — AI implementation for Card Battle
//
//  Hooks into the existing game via:
//    - G (global game state)
//    - DEFS (card definitions)
//    - placeCard(pid, row, col)
//    - endTurn()
// ════════════════════════════════════════════════════

const AI_PID = 1;
const HU_PID = 0;

// ────────────────────────────────────────────────────
//  ENTRY POINT
//  Called by switchPlayer() when G.cp === 1
// ────────────────────────────────────────────────────
function aiTakeTurn() {
  if (!G || G.cp !== AI_PID || resolving) return;

  const bestMove = aiFindBestMove();

  // Place each card in the chosen move, with a small delay between
  // placements so it feels natural rather than instantaneous
  let delay = 0;
  for (const placement of bestMove) {
    setTimeout(() => {
      if (G && G.cp === AI_PID) {
        G.sel = placement.handIndex;
        placeCard(AI_PID, placement.row, placement.col);
      }
    }, delay);
    delay += 420;
  }

  // End the AI's turn after all placements
  setTimeout(() => {
    if (G && G.cp === AI_PID) endTurn();
  }, delay + 300);
}

// ────────────────────────────────────────────────────
//  MINIMAX DECISION
//  Tries every valid move, simulates combat, scores
//  the result, returns the move with the highest score
// ────────────────────────────────────────────────────
function aiFindBestMove() {
  const moves = aiGenerateMoves();
  let bestScore = -Infinity;
  let bestMove  = [];

  for (const move of moves) {
    const sim = aiSimulateMove(move);
    const score = aiScore(sim);
    if (score > bestScore) {
      bestScore = score;
      bestMove  = move;
    }
  }

  return bestMove;
}

// ────────────────────────────────────────────────────
//  MOVE GENERATOR
//  Returns an array of moves. Each move is an array of
//  placements: [ { handIndex, row, col }, ... ]
//  Includes the empty move (do nothing).
// ────────────────────────────────────────────────────
function aiGenerateMoves() {
  const p    = G.players[AI_PID];
  const hand = p.hand;
  const mp   = p.mp;

  // All empty cells on the AI's side
  const emptyCells = [];
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 2; col++)
      if (!G.board[AI_PID][row][col])
        emptyCells.push({ row, col });

  // Affordable cards (index into hand)
  const affordable = hand
    .map((ct, i) => ({ handIndex: i, ct, cost: DEFS[ct].mana }))
    .filter(c => c.cost <= mp);

  const results = [];
  results.push([]); // always include the "pass" move

  // Single placements
  for (const card of affordable) {
    for (const cell of emptyCells) {
      results.push([{ handIndex: card.handIndex, row: cell.row, col: cell.col }]);
    }
  }

  // Double placements (two different cards, two different cells)
  for (let i = 0; i < affordable.length; i++) {
    for (let j = i + 1; j < affordable.length; j++) {
      if (affordable[i].cost + affordable[j].cost > mp) continue;
      for (let ci = 0; ci < emptyCells.length; ci++) {
        for (let cj = 0; cj < emptyCells.length; cj++) {
          if (ci === cj) continue;
          results.push([
            { handIndex: affordable[i].handIndex, row: emptyCells[ci].row, col: emptyCells[ci].col },
            { handIndex: affordable[j].handIndex, row: emptyCells[cj].row, col: emptyCells[cj].col },
          ]);
        }
      }
    }
  }

  // Triple placements
  for (let i = 0; i < affordable.length; i++) {
    for (let j = i + 1; j < affordable.length; j++) {
      for (let k = j + 1; k < affordable.length; k++) {
        if (affordable[i].cost + affordable[j].cost + affordable[k].cost > mp) continue;
        for (let ci = 0; ci < emptyCells.length; ci++) {
          for (let cj = 0; cj < emptyCells.length; cj++) {
            for (let ck = 0; ck < emptyCells.length; ck++) {
              if (ci === cj || ci === ck || cj === ck) continue;
              results.push([
                { handIndex: affordable[i].handIndex, row: emptyCells[ci].row, col: emptyCells[ci].col },
                { handIndex: affordable[j].handIndex, row: emptyCells[cj].row, col: emptyCells[cj].col },
                { handIndex: affordable[k].handIndex, row: emptyCells[ck].row, col: emptyCells[ck].col },
              ]);
            }
          }
        }
      }
    }
  }

  return results;
}

// ────────────────────────────────────────────────────
//  SIMULATE A MOVE
//  Deep copies the game state, applies the placements,
//  runs a silent combat resolution, returns the result
// ────────────────────────────────────────────────────
function aiSimulateMove(move) {
  const sim = aiDeepCopy(G);

  // Apply placements to the sim state
  for (const p of move) {
    const ct   = sim.players[AI_PID].hand[p.handIndex];
    const def  = DEFS[ct];
    sim.board[AI_PID][p.row][p.col] = {
      type: ct, hp: def.hp, mhp: def.hp,
      batk: def.atk, owner: AI_PID, resolved: 0, dead: false,
    };
    sim.players[AI_PID].mp -= def.mana;
  }

  // Run silent combat
  aiResolveBoard(sim);

  return sim;
}

// ────────────────────────────────────────────────────
//  SILENT BOARD RESOLUTION
//  Mirrors resolveBoard() but with no animations/DOM
// ────────────────────────────────────────────────────
function aiResolveBoard(sim) {
  const order = [AI_PID, HU_PID];

  for (const pid of order) {
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 2; col++) {
        const u = sim.board[pid][row][col];
        if (!u || u.dead) continue;
        aiActUnit(sim, u, pid, row);
        aiCleanDead(sim);
      }
    }
  }

  // Expire walls and tick resolved counters
  for (let pid = 0; pid < 2; pid++)
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 2; c++) {
        const u = sim.board[pid][r][c];
        if (!u) continue;
        u.resolved++;
        if (u.type === 'DefCard1' && u.resolved >= 2)
          sim.board[pid][r][c] = null;
      }

  aiCleanDead(sim);
}

function aiActUnit(sim, u, pid, row) {
  const opp  = 1 - pid;
  const atk  = aiEffAtk(sim, u);
  const d    = DEFS[u.type];

  switch (d.effect) {
    case 'basic': {
      if (atk <= 0) break;
      const tgts = aiGetTargets(sim, opp, row);
      if (tgts.length) {
        aiDmgUnit(sim, opp, tgts[0].r, tgts[0].c, atk);
      } else {
        sim.players[opp].hp = Math.max(0, sim.players[opp].hp - atk);
      }
      break;
    }
    case 'arch': {
      if (atk <= 0) break;
      sim.players[opp].hp = Math.max(0, sim.players[opp].hp - atk);
      break;
    }
    case 'pierce': {
      if (atk <= 0) break;
      const tgts = aiGetTargets(sim, opp, row);
      let hits = 0;
      for (const t of tgts) {
        const eff = Math.max(0, atk - hits);
        if (eff <= 0) break;
        aiDmgUnit(sim, opp, t.r, t.c, eff);
        hits++;
      }
      const rem = Math.max(0, atk - hits);
      if (rem > 0) sim.players[opp].hp = Math.max(0, sim.players[opp].hp - rem);
      aiCleanDead(sim);
      break;
    }
    case 'heal': {
      sim.players[pid].hp = Math.min(
        sim.players[pid].mhp,
        sim.players[pid].hp + 2
      );
      break;
    }
    case 'wall':
    case 'explode':
    case 'boost':
    case 'curse':
      break;
  }
}

function aiDmgUnit(sim, pid, r, c, dmg) {
  const u = sim.board[pid][r][c];
  if (!u || u.dead || u.type === 'DefCard1') return;
  u.hp -= dmg;
  if (u.hp <= 0) {
    u.dead = true;
    if (u.type === 'DefCard3') aiTriggerExplode(sim, r);
  }
}

function aiTriggerExplode(sim, row) {
  for (let pid = 0; pid < 2; pid++)
    for (let c = 0; c < 2; c++)
      sim.board[pid][row][c] = null;
}

function aiCleanDead(sim) {
  for (let pid = 0; pid < 2; pid++)
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 2; c++) {
        const u = sim.board[pid][r][c];
        if (u && u.dead) sim.board[pid][r][c] = null;
      }
}

function aiGetTargets(sim, pid, row) {
  const cols = pid === 0 ? [1, 0] : [0, 1]; // front first
  const out  = [];
  for (const c of cols)
    if (sim.board[pid][row][c])
      out.push({ r: row, c, unit: sim.board[pid][row][c] });
  return out;
}

function aiEffAtk(sim, unit) {
  let a = unit.batk;
  sim.board[unit.owner].forEach(r => r.forEach(c => { if (c && c.type === 'SupCard2') a++; }));
  sim.board[1 - unit.owner].forEach(r => r.forEach(c => { if (c && c.type === 'SupCard3') a--; }));
  return Math.max(0, a);
}

// ────────────────────────────────────────────────────
//  SCORING FUNCTION
//  Evaluates a simulated state from the AI's perspective.
//  Higher score = better for AI.
// ────────────────────────────────────────────────────
function aiScore(sim) {
  let score = 0;

  const ai = sim.players[AI_PID];
  const hu = sim.players[HU_PID];

  // ── Win / loss conditions (heavily weighted)
  if (hu.hp <= 0) return 10000;
  if (ai.hp <= 0) return -10000;

  // ── HP difference — most important factor
  score += (ai.hp - hu.hp) * 4;

  // ── Board presence per row
  for (let row = 0; row < 3; row++) {
    const aiHasCard = sim.board[AI_PID][row].some(c => c !== null);
    const huHasCard = sim.board[HU_PID][row].some(c => c !== null);

    // AI has a card in a row the human left undefended = direct damage threat
    if (aiHasCard && !huHasCard) score += 3;

    // AI has defense in a row where human is attacking
    if (huHasCard && aiHasCard) score += 2;

    // Human has an undefended row that can hit AI directly — bad
    if (huHasCard && !aiHasCard) score -= 3;

    // Bonus for card quality (mana cost as proxy for power)
    for (let col = 0; col < 2; col++) {
      const aiCard = sim.board[AI_PID][row][col];
      const huCard = sim.board[HU_PID][row][col];
      if (aiCard) score += DEFS[aiCard.type].mana * 0.5;
      if (huCard) score -= DEFS[huCard.type].mana * 0.5;
    }
  }

  // ── Special card bonuses
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 2; col++) {
      const u = sim.board[AI_PID][row][col];
      if (!u) continue;
      if (u.type === 'SupCard1') score += 3;  // Priest healing every turn
      if (u.type === 'SupCard2') score += 3;  // Coach boosting all units
      if (u.type === 'SupCard3') score += 2;  // Malice cursing enemy
      if (u.type === 'AtkCard3') score += 2;  // Mage bypasses — always threatens player
      if (u.type === 'DefCard1') score += 2;  // Wall blocking a row
    }
  }

  return score;
}

// ────────────────────────────────────────────────────
//  DEEP COPY
//  Returns a clean copy of the game state for simulation
// ────────────────────────────────────────────────────
function aiDeepCopy(state) {
  return {
    cp: state.cp,
    winner: state.winner,
    roundStarter: state.roundStarter,
    placementPhase: state.placementPhase,
    players: state.players.map(p => ({
      hp: p.hp, mhp: p.mhp,
      mp: p.mp, mmp: p.mmp,
      hand: [...p.hand],
      pool: [...p.pool],
      bonus: p.bonus,
    })),
    board: state.board.map(side =>
      side.map(row =>
        row.map(cell => cell ? { ...cell } : null)
      )
    ),
    sel: null,
    deleteTarget: null,
  };
}
