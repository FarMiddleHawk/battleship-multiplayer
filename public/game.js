const socket = io();
const SIZE = 10;
const SHIPS = [5, 4, 3, 3, 2];

let state = {
  gameId: null,
  playerId: null,
  phase: "lobby",
  orientation: "horizontal",
  yourGrid: Array.from({ length: SIZE }, () => Array(SIZE).fill(0)),
  enemyGrid: Array.from({ length: SIZE }, () => Array(SIZE).fill(0)),
  yourShips: [],
  currentPlayer: null,
};

// UI
const lobbyScreen = document.getElementById("lobby");
const gameScreen = document.getElementById("gameScreen");
const gameIdInput = document.getElementById("gameIdInput");
const createBtn = document.getElementById("createBtn");
const joinBtn = document.getElementById("joinBtn");
const gameIdDisplay = document.getElementById("gameIdDisplay");
const statusEl = document.getElementById("status");
const orientationEl = document.getElementById("orientation");
const rotateBtn = document.getElementById("rotateBtn");
const randomPlaceBtn = document.getElementById("randomPlaceBtn");
const nextPhaseBtn = document.getElementById("nextPhaseBtn");
const yourBoardEl = document.getElementById("yourBoard");
const enemyBoardEl = document.getElementById("enemyBoard");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlayTitle");
const overlayText = document.getElementById("overlayText");
const overlayBtn = document.getElementById("overlayBtn");

createBtn.onclick = () => {
  console.log("Create game clicked");
  socket.emit("createGame", (res) => {
    console.log("Create game response:", res);
    if (res.error) return alert(res.error);
    state.gameId = res.gameId;
    state.playerId = res.playerId;
    console.log("Game ID:", res.gameId);
    gameIdDisplay.textContent = `Game ID: ${res.gameId} (Share this with your opponent)`;
    gameIdDisplay.style.display = "block";
    console.log("Game ID display set to:", gameIdDisplay.textContent);
    lobbyScreen.classList.add("hidden");
    gameScreen.classList.remove("hidden");
    statusEl.textContent = "Waiting for opponent to join...";
  });
};

joinBtn.onclick = () => {
  const gameId = gameIdInput.value.trim();
  if (!gameId) return alert("Enter a Game ID");
  socket.emit("joinGame", gameId, (res) => {
    if (res.error) return alert(res.error);
    state.gameId = res.gameId;
    state.playerId = res.playerId;
    lobbyScreen.classList.add("hidden");
    gameScreen.classList.remove("hidden");
  });
};

rotateBtn.onclick = () => {
  state.orientation = state.orientation === "horizontal" ? "vertical" : "horizontal";
  orientationEl.value = state.orientation;
};

orientationEl.onchange = () => state.orientation = orientationEl.value;

randomPlaceBtn.onclick = () => {
  state.yourShips = [];
  state.yourGrid = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  for (const len of SHIPS) {
    let placed = false;
    while (!placed) {
      const r = rand(0, SIZE - 1);
      const c = rand(0, SIZE - 1);
      const ori = Math.random() < 0.5 ? "horizontal" : "vertical";
      placed = tryPlaceShip(r, c, len, ori);
    }
  }
  drawYourBoard();
};

nextPhaseBtn.onclick = () => {
  if (state.yourShips.length !== SHIPS.length) return alert("Place all ships first");
  const ships = state.yourShips.map(s => ({ len: s.len, cells: s.cells, hits: 0 }));
  socket.emit("placeShips", { gameId: state.gameId, ships }, (res) => {
    if (res.error) return alert(res.error);
    statusEl.textContent = "Waiting for opponent to confirm placement...";
    nextPhaseBtn.hidden = true;
  });
};

socket.on("gameStart", (data) => {
  state.phase = "placeP1";
  statusEl.textContent = "Place your ships. Opponent is also placing...";
  nextPhaseBtn.hidden = false;
  drawYourBoard();
});

socket.on("phaseUpdate", (data) => {
  state.phase = data.phase;
  if (data.phase === "placeP2") {
    statusEl.textContent = "Opponent placed their ships. Place yours now.";
  } else if (data.phase === "battle") {
    state.currentPlayer = data.currentPlayer;
    statusEl.textContent = state.playerId === data.currentPlayer 
      ? "Your turn! Attack opponent board." 
      : "Opponent's turn. Wait...";
    nextPhaseBtn.hidden = true;
    drawYourBoard();
    drawEnemyBoard();
  }
});

socket.on("attackResult", (data) => {
  state.enemyGrid[data.r][data.c] = data.result === "hit" ? 2 : 3;
  state.currentPlayer = data.nextPlayer;
  statusEl.textContent = state.playerId === data.nextPlayer 
    ? `Attack result: ${data.result.toUpperCase()}! Your turn.` 
    : `Opponent attacked: ${data.result.toUpperCase()}. Their turn.`;
  drawEnemyBoard();
});

socket.on("gameOver", (data) => {
  const winner = data.winner === state.playerId ? "You" : "Opponent";
  statusEl.textContent = `🏆 ${winner} won!`;
  overlay.classList.remove("hidden");
  overlayTitle.textContent = "Game Over";
  overlayText.textContent = `${winner} won the game!`;
});

socket.on("playerDisconnected", () => {
  alert("Opponent disconnected. Game over.");
  location.reload();
});

function tryPlaceShip(r, c, len, orientation) {
  const cells = [];
  for (let i = 0; i < len; i++) {
    const rr = orientation === "vertical" ? r + i : r;
    const cc = orientation === "horizontal" ? c + i : c;
    if (rr < 0 || rr >= SIZE || cc < 0 || cc >= SIZE) return false;
    if (state.yourGrid[rr][cc] !== 0) return false;
    cells.push([rr, cc]);
  }
  for (const [rr, cc] of cells) state.yourGrid[rr][cc] = 1;
  state.yourShips.push({ len, cells, hits: 0 });
  return true;
}

function drawYourBoard() {
  yourBoardEl.innerHTML = "";
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const cell = document.createElement("button");
      cell.className = "cell";
      const val = state.yourGrid[r][c];
      if (val === 1) cell.classList.add("ship");
      if (val === 2) cell.classList.add("hit");
      if (val === 3) cell.classList.add("miss");
      
      if (state.phase.startsWith("place")) {
        cell.onclick = () => onPlaceCell(r, c);
      } else {
        cell.disabled = true;
      }
      yourBoardEl.appendChild(cell);
    }
  }
}

function drawEnemyBoard() {
  enemyBoardEl.innerHTML = "";
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const cell = document.createElement("button");
      cell.className = "cell";
      const val = state.enemyGrid[r][c];
      if (val === 2) cell.classList.add("hit");
      if (val === 3) cell.classList.add("miss");
      
      if (state.phase === "battle" && state.currentPlayer === state.playerId && val !== 2 && val !== 3) {
        cell.onclick = () => onAttack(r, c);
      } else {
        cell.disabled = true;
      }
      enemyBoardEl.appendChild(cell);
    }
  }
}

function onPlaceCell(r, c) {
  const shipLen = SHIPS[state.yourShips.length];
  if (!shipLen) return;
  const ok = tryPlaceShip(r, c, shipLen, state.orientation);
  if (!ok) return;
  drawYourBoard();
}

function onAttack(r, c) {
  socket.emit("attack", { gameId: state.gameId, r, c }, (res) => {
    if (res.error) return alert(res.error);
  });
}

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
