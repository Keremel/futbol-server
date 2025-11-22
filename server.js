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
  path: "/ws", // Render kullanıyorsan bu doğru, Railway'de path'siz kullanırız
});

// --- TAKIM VE OYUNCULAR ---
const premierLeagueTeams = [
  { name: "Arsenal" },
  { name: "Chelsea" },
  { name: "Liverpool" },
  { name: "Manchester City" },
  { name: "Manchester United" },
  { name: "Tottenham" },
];

const teamPlayers = {
  Arsenal: ["Olivier Giroud", "Alexis Sanchez", "William Gallas"],
  Chelsea: ["Olivier Giroud", "William Gallas", "Juan Mata"],
  Liverpool: ["Raheem Sterling", "James Milner"],
  "Manchester City": ["Raheem Sterling", "James Milner"],
  "Manchester United": ["Alexis Sanchez", "Juan Mata"],
  Tottenham: ["William Gallas"],
};

// Ortak oyuncusu olan 2 random takım seç
function generateRound() {
  let t1, t2, shared;

  do {
    t1 = premierLeagueTeams[Math.floor(Math.random() * premierLeagueTeams.length)].name;
    t2 = premierLeagueTeams[Math.floor(Math.random() * premierLeagueTeams.length)].name;
    shared = teamPlayers[t1].filter((p) => teamPlayers[t2].includes(p));
  } while (shared.length === 0 || t1 === t2);

  return { team1: t1, team2: t2 };
}

let lobbies = {};

wss.on("connection", (ws) => {
  console.log("Client connected");

  ws.on("message", (message) => {
    const data = JSON.parse(message);

    // LOBİ OLUŞTUR
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

    // LOBİYE KATIL
    if (data.action === "joinLobby") {
      const lobby = lobbies[data.lobbyId];
      if (!lobby) return;

      lobby.guest = ws;

      ws.send(JSON.stringify({ action: "joinedLobby" }));
      lobby.host?.send(JSON.stringify({ action: "guestJoined" }));
    }

    // HAZIRIM
    if (data.action === "ready") {
      const lobby = lobbies[data.lobbyId];
      if (!lobby) return;

      lobby.ready[data.role] = true;

      // İstersen UI'da göstermek için
      lobby.host?.send(JSON.stringify({ action: "readyState", ready: lobby.ready }));
      lobby.guest?.send(JSON.stringify({ action: "readyState", ready: lobby.ready }));

      // İkisi de hazırsa oyunu başlat + aynı takımları gönder
      if (lobby.ready.host && lobby.ready.guest) {
        const round = generateRound();

        lobby.host?.send(JSON.stringify({ action: "startGame", ...round }));
        lobby.guest?.send(JSON.stringify({ action: "startGame", ...round }));
      }
    }

    // TAHMİN
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

      // Yeni tur = yeni random takımlar (yine ikisine aynı)
      const round = generateRound();
      lobby.host?.send(JSON.stringify({ action: "nextRound", ...round }));
      lobby.guest?.send(JSON.stringify({ action: "nextRound", ...round }));
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected");
  });
});
