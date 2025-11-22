import { WebSocketServer } from "ws";
import http from "http";

const PORT = process.env.PORT || 8080;

// HTTP server
const server = http.createServer();
server.listen(PORT, () => {
  console.log("Server ready on port:", PORT);
});

// WebSocket server
const wss = new WebSocketServer({ server });

let lobbies = {};

// ---- KEEP ALIVE ----
function heartbeat() {
  this.isAlive = true;
}

wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.on("pong", heartbeat);   // client "pong" gönderince alive kabul ediliyor

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

  ws.on("close", () => {
    ws.isAlive = false;
  });
});

// ---- PING at ----
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();  // cevap yoksa bağlantı öldür
    ws.isAlive = false;
    ws.ping();   // ping gönderiyoruz (client otomatik olarak pong yollar)
  });
}, 25000); // Railway için ideal: 25 saniye
