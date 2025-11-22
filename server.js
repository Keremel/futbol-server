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

// Render'da path: "/ws", Railway'de path'siz { server } kullan
const wss = new WebSocketServer({
  server,
  path: "/ws",
});

// --- TAKIM VE OYUNCULAR ---

const premierLeagueTeams = [
  "Arsenal",
  "Aston Villa",
  "Bournemouth",
  "Brentford",
  "Brighton",
  "Burnley",
  "Chelsea",
  "Crystal Palace",
  "Everton",
  "Fulham",
  "Leeds United",
  "Liverpool",
  "Manchester City",
  "Manchester United",
  "Newcastle",
  "Nottingham",
  "Sunderland",
  "Tottenham",
  "West Ham",
  "Wolves",
];

// basit demo oyuncu verisi (istersen sonra gerçek isimlerle doldur)
const teamPlayers = {
  Arsenal: ["Olivier Giroud", "Alexis Sanchez", "William Gallas"],
  Chelsea: ["Olivier Giroud", "William Gallas", "Juan Mata"],
  Liverpool: ["Raheem Sterling", "James Milner"],
  "Manchester City": ["Raheem Sterling", "James Milner"],
  "Manchester United": ["Alexis Sanchez", "Juan Mata"],
  Tottenham: ["William Gallas"],

  "Aston Villa": ["Player Aston Villa"],
  Bournemouth: ["Player Bournemouth"],
  Brentford: ["Player Brentford"],
  Brighton: ["Player Brighton"],
  Burnley: ["Player Burnley"],
  "Crystal Palace": ["Player Crystal Palace"],
  Everton: ["Player Everton"],
  Fulham: ["Player Fulham"],
  "Leeds United": ["Player Leeds"],
  Newcastle: ["Player Newcastle"],
  Nottingham: ["Player Nottingham"],
  Sunderland: ["Player Sunderland"],
  "West Ham": ["Player West Ham"],
  Wolves: ["Player Wolves"],
};

let lobbies = {};

wss.on("connection", (ws) => {
  console.log("Client connected");

  ws.on("message", (message) => {
    const data = JSON.parse(message);

    // === LOBİ OLUŞTUR ===
    if (data.action === "createLobby") {
      const lobbyId = Math.random().toString(36).substring(2, 8);
      lobbies[lobbyId] = {
        host: ws,
        guest: null,
        scores: { host: 0, guest: 0 },
        lobbyReady: { host: false, guest: false },
        selectedTeams: { host: null, guest: null },
      };

      ws.send(JSON.stringify({ action: "lobbyCreated", lobbyId }));
      return;
    }

    // === LOBİYE KATIL ===
    if (data.action === "joinLobby") {
      const lobby = lobbies[data.lobbyId];
      if (!lobby) return;

      lobby.guest = ws;

      ws.send(JSON.stringify({ action: "joinedLobby" }));
      lobby.host?.send(JSON.stringify({ action: "guestJoined" }));
      return;
    }

    const lobby = lobbies[data.lobbyId];
    if (!lobby) return;

    // === LOBİDE HAZIRIM (1. aşama) ===
    if (data.action === "readyLobby") {
      lobby.lobbyReady[data.role] = true;

      lobby.host?.send(
        JSON.stringify({ action: "lobbyReadyState", ready: lobby.lobbyReady })
      );
      lobby.guest?.send(
        JSON.stringify({ action: "lobbyReadyState", ready: lobby.lobbyReady })
      );

      if (lobby.lobbyReady.host && lobby.lobbyReady.guest) {
        lobby.selectedTeams = { host: null, guest: null };
        lobby.host?.send(
          JSON.stringify({
            action: "startTeamSelect",
            teams: premierLeagueTeams,
          })
        );
        lobby.guest?.send(
          JSON.stringify({
            action: "startTeamSelect",
            teams: premierLeagueTeams,
          })
        );
      }
      return;
    }

    // === TAKIM SEÇİMİ (2. aşama) ===
    if (data.action === "selectTeam") {
      lobby.selectedTeams[data.role] = data.team;

      lobby.host?.send(
        JSON.stringify({
          action: "teamSelectionState",
          selected: lobby.selectedTeams,
        })
      );
      lobby.guest?.send(
        JSON.stringify({
          action: "teamSelectionState",
          selected: lobby.selectedTeams,
        })
      );

      if (lobby.selectedTeams.host && lobby.selectedTeams.guest) {
        const hostTeam = lobby.selectedTeams.host;
        const guestTeam = lobby.selectedTeams.guest;

        lobby.host?.send(
          JSON.stringify({
            action: "startGame",
            team1: hostTeam,
            team2: guestTeam,
          })
        );
        lobby.guest?.send(
          JSON.stringify({
            action: "startGame",
            team1: hostTeam,
            team2: guestTeam,
          })
        );

        lobby.lobbyReady = { host: false, guest: false };
      }
      return;
    }

    // === TAHMİN ===
    if (data.action === "guess") {
      if (!data.correct) {
        // yanlış tahminleri client kendi tutuyor, server sadece doğru olunca ilgileniyor
        return;
      }

      lobby.scores[data.role]++;

      lobby.host?.send(
        JSON.stringify({ action: "scoreUpdate", scores: lobby.scores })
      );
      lobby.guest?.send(
        JSON.stringify({ action: "scoreUpdate", scores: lobby.scores })
      );

      if (lobby.scores[data.role] >= 3) {
        lobby.host?.send(
          JSON.stringify({ action: "gameOver", winner: data.role })
        );
        lobby.guest?.send(
          JSON.stringify({ action: "gameOver", winner: data.role })
        );
        return;
      }

      // yeni tur için tekrar takım seçimi
      lobby.selectedTeams = { host: null, guest: null };
      lobby.lobbyReady = { host: false, guest: false };

      lobby.host?.send(
        JSON.stringify({
          action: "startTeamSelect",
          teams: premierLeagueTeams,
        })
      );
      lobby.guest?.send(
        JSON.stringify({
          action: "startTeamSelect",
          teams: premierLeagueTeams,
        })
      );

      return;
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected");
  });
});
