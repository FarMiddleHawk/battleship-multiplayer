const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(cors());
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
const SIZE = 10;
const SHIPS = [5, 4, 3, 3, 2];

let games = {}; // gameId -> { p1, p2, phase, ... }
let players = {}; // socketId -> { gameId, playerId }

// Serve frontend
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  socket.on("createGame", (callback) => {
    const gameId = Math.random().toString(36).substring(7);
    games[gameId] = {
      gameId,
      p1: null,
      p2: null,
      phase: "waiting", // waiting, placeP1, placeP2, battle, gameOver
      currentPlayer: 1,
      p1Data: newPlayerData(),
      p2Data: newPlayerData(),
    };
    players[socket.id] = { gameId, playerId: 1 };
    games[gameId].p1 = socket.id;
    socket.join(gameId);
    callback({ gameId, playerId: 1 });
    console.log("Game created:", gameId);
  });

  socket.on("joinGame", (gameId, callback) => {
    if (!games[gameId]) return callback({ error: "Game not found" });
    if (games[gameId].p2) return callback({ error: "Game full" });

    players[socket.id] = { gameId, playerId: 2 };
    games[gameId].p2 = socket.id;
    socket.join(gameId);
    games[gameId].phase = "placeP1";

    io.to(gameId).emit("gameStart", {
      gameId,
      p1Id: games[gameId].p1,
      p2Id: games[gameId].p2,
      phase: "placeP1",
    });

    callback({ gameId, playerId: 2 });
    console.log("Player 2 joined game:", gameId);
  });

  socket.on("placeShips", (data, callback) => {
    const { gameId, ships } = data;
    const game = games[gameId];
    if (!game) return callback({ error: "Game not found" });

    const playerId = players[socket.id]?.playerId;
    if (playerId === 1) {
      game.p1Data.ships = ships;
      game.p1Data.grid = buildGrid(ships);
      game.p1Data.placedCount = SHIPS.length;

      if (game.phase === "placeP1" && game.p2) {
        game.phase = "placeP2";
        io.to(gameId).emit("phaseUpdate", { phase: "placeP2" });
      }
    } else if (playerId === 2) {
      game.p2Data.ships = ships;
      game.p2Data.grid = buildGrid(ships);
      game.p2Data.placedCount = SHIPS.length;

      if (game.phase === "placeP2") {
        game.phase = "battle";
        game.currentPlayer = 1;
        io.to(gameId).emit("phaseUpdate", { phase: "battle", currentPlayer: 1 });
      }
    }

    callback({ ok: true });
  });

  socket.on("attack", (data, callback) => {
    const { gameId, r, c } = data;
    const game = games[gameId];
    if (!game || game.phase !== "battle") return callback({ error: "Invalid state" });

    const playerId = players[socket.id]?.playerId;
    const isValidAttacker =
      (playerId === 1 && game.currentPlayer === 1) ||
      (playerId === 2 && game.currentPlayer === 2);

    if (!isValidAttacker) return callback({ error: "Not your turn" });

    const targetData = playerId === 1 ? game.p2Data : game.p1Data;
    const val = targetData.grid[r]?.[c];

    if (val === 2 || val === 3) return callback({ error: "Already attacked" });

    let result = "miss";
    if (val === 1) {
      targetData.grid[r][c] = 2;
      result = "hit";
      markShipHit(targetData, r, c);
    } else {
      targetData.grid[r][c] = 3;
    }

    const allSunk = targetData.ships.every((s) => s.hits >= s.len);
    if (allSunk) {
      game.phase = "gameOver";
      io.to(gameId).emit("gameOver", { winner: playerId });
    } else {
      game.currentPlayer = playerId === 1 ? 2 : 1;
      io.to(gameId).emit("attackResult", {
        r,
        c,
        result,
        nextPlayer: game.currentPlayer,
        targetPlayerId: playerId === 1 ? 2 : 1,
      });
    }

    callback({ result });
  });

  socket.on("disconnect", () => {
    const player = players[socket.id];
    if (player) {
      const game = games[player.gameId];
      if (game) {
        io.to(player.gameId).emit("playerDisconnected", {
          playerId: player.playerId,
        });
        delete games[player.gameId];
      }
      delete players[socket.id];
    }
    console.log("Player disconnected:", socket.id);
  });
});

function newPlayerData() {
  return {
    ships: [],
    grid: Array.from({ length: SIZE }, () => Array(SIZE).fill(0)),
    placedCount: 0,
  };
}

function buildGrid(ships) {
  const grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  for (const ship of ships) {
    for (const [r, c] of ship.cells) {
      grid[r][c] = 1;
    }
  }
  return grid;
}

function markShipHit(playerData, r, c) {
  for (const ship of playerData.ships) {
    for (const [sr, sc] of ship.cells) {
      if (sr === r && sc === c) {
        ship.hits++;
        return;
      }
    }
  }
}

server.listen(PORT, () => {
  console.log(`🚀 Battleship server running on port ${PORT}`);
});
