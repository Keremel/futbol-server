import { WebSocketServer } from "ws";
import http from "http";

const PORT = process.env.PORT || 8080;

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("WebSocket server is running.\n");
});

server.listen(PORT, () => {
  console.log("Server ready on port:", PORT);
});

const wss = new WebSocketServer({
  server,
});

let lobbies = {};

wss.on("connection", (ws) => {
  console.log("Client connected");

  ws.on("message", (message) => {
    const data = JSON.parse(message);

    if (data.action === "createLobby") {
      const lobbyId = Math.random().toString(36).substring(2, 8);
      lobbies[lobbyId] = {
        host: ws,
        guest: null,
        scores: { host: 0, guest: 0 },
        ready: { host: false, guest: false },
      };

      ws.send(JSON.stringify({ action: "lobbyCreated", lobbyId }));
    }

    if (data.action === "joinLobby") {
      const lobby = lobbies[data.lobbyId];
      if (!lobby) return;

      lobby.guest = ws;

      ws.send(JSON.stringify({ action: "joinedLobby" }));
      lobby.host?.send(JSON.stringify({ action: "guestJoined" }));
    }

    // 🔥 HAZIRIM LOGİĞİ BURADA
    if (data.action === "ready") {
      const lobby = lobbies[data.lobbyId];
      if (!lobby) return;

      // host / guest hangisiyse onu true yap
      lobby.ready[data.role] = true;

      // İki tarafa da hazır durumunu gönder (istersen UI'da kullanırsın)
      lobby.host?.send(JSON.stringify({ action: "readyState", ready: lobby.ready }));
      lobby.guest?.send(JSON.stringify({ action: "readyState", ready: lobby.ready }));

      // 🔥 Eğer hem host hem guest hazırsa oyunu başlat
      if (lobby.ready.host && lobby.ready.guest) {
        lobby.host?.send(JSON.stringify({ action: "startGame" }));
        lobby.guest?.send(JSON.stringify({ action: "startGame" }));
      }
    }

    if (data.action === "guess") {
      const lobby = lobbies[data.lobbyId];
      if (!lobby) return;

      if (data.correct) {
        lobby.scores[data.role]++;

        if (lobby.scores[data.role] >= 3) {
          lobby.host?.send(JSON.stringify({ action: "gameOver", winner: data.role }));
          lobby.guest?.send(JSON.stringify({ action: "gameOver", winner: data.role }));
          return;
        }
      }

      lobby.host?.send(JSON.stringify({ action: "scoreUpdate", scores: lobby.scores }));
      lobby.guest?.send(JSON.stringify({ action: "scoreUpdate", scores: lobby.scores }));

      lobby.host?.send(JSON.stringify({ action: "nextRound" }));
      lobby.guest?.send(JSON.stringify({ action: "nextRound" }));
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected");
  });
});
