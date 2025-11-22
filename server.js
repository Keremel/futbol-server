import { WebSocketServer } from "ws";
import http from "http";

const PORT = process.env.PORT || 8080;

// Basit bir HTTP server (Railway bunu istiyor)
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("WebSocket Server is running.");
});

// WebSocket serverı HTTP server'a bağla
const wss = new WebSocketServer({ server });

let lobbies = {};

wss.on("connection", (ws) => {
  ws.on("message", (message) => {
    const data = JSON.parse(message);

    if (data.action === "createLobby") {
      const lobbyId = Math.random().toString(36).substring(2, 8);
      lobbies[lobbyId] = {
        host: ws,
        guest: null,
        scores: { host: 0, guest: 0 },
        ready: { host: false, guest: false }
      };

      ws.send(JSON.stringify({ action: "lobbyCreated", lobbyId }));
    }

    if (data.action === "joinLobby") {
      const lobby = lobbies[data.lobbyId];
      if (!lobby) return;

      lobby.guest = ws;

      ws.send(JSON.stringify({ action: "joinedLobby" }));
      lobby.host.send(JSON.stringify({ action: "guestJoined" }));
    }

    if (data.action === "ready") {
      const lobby = lobbies[data.lobbyId];
      lobby.ready[data.role] = true;

      lobby.host.send(JSON.stringify({ action: "readyState", ready: lobby.ready }));
      lobby.guest?.send(JSON.stringify({ action: "readyState", ready: lobby.ready }));
    }

    if (data.action === "triggerStart") {
      const lobby = lobbies[data.lobbyId];
      lobby.host.send(JSON.stringify({ action: "startGame" }));
      lobby.guest.send(JSON.stringify({ action: "startGame" }));
    }

    if (data.action === "guess") {
      const lobby = lobbies[data.lobbyId];

      if (data.correct) {
        lobby.scores[data.role] += 1;

        if (lobby.scores[data.role] >= 3) {
          lobby.host.send(JSON.stringify({ action: "gameOver", winner: data.role }));
          lobby.guest.send(JSON.stringify({ action: "gameOver", winner: data.role }));
          return;
        }
      }

      lobby.host.send(JSON.stringify({ action: "scoreUpdate", scores: lobby.scores }));
      lobby.guest.send(JSON.stringify({ action: "scoreUpdate", scores: lobby.scores }));

      lobby.host.send(JSON.stringify({ action: "nextRound" }));
      lobby.guest.send(JSON.stringify({ action: "nextRound" }));
    }
  });
});

server.listen(PORT, () => {
  console.log("Server ready on port:", PORT);
});
