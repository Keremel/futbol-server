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

// 🔴 RAILWAY: path YOK, direkt server üstüne kuruyoruz
const wss = new WebSocketServer({
  server,
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
        wrongGuesses: [],
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

      // İkisi de hazırsa takım seçme ekranı
      if (lobby.lobbyReady.host && lobby.lobbyReady.guest) {
        lobby.selectedTeams = { host: null, guest: null };
        lobby.wrongGuesses = [];

        const selectPayload = {
          action: "startTeamSelect",
          teams: premierLeagueTeams,
        };

        lobby.host?.send(JSON.stringify(selectPayload));
        lobby.guest?.send(JSON.stringify(selectPayload));

        const clearWrong = {
          action: "wrongGuessesUpdate",
          wrongGuesses: [],
        };
        lobby.host?.send(JSON.stringify(clearWrong));
        lobby.guest?.send(JSON.stringify(clearWrong));
      }
      return;
    }

    // === TAKIM SEÇİMİ (2. aşama) ===
    if (data.action === "selectTeam") {
      lobby.selectedTeams[data.role] = data.team;

      // Rakibin hangi takımı seçtiği gönderilmiyor (gizli)
      const statePayload = {
        action: "teamSelectionState",
        selected: {
          hostSelected: !!lobby.selectedTeams.host,
          guestSelected: !!lobby.selectedTeams.guest,
        },
      };

      lobby.host?.send(JSON.stringify(statePayload));
      lobby.guest?.send(JSON.stringify(statePayload));

      // İki taraf da takım seçtiyse maç başlasın
      if (lobby.selectedTeams.host && lobby.selectedTeams.guest) {
        const hostTeam = lobby.selectedTeams.host;
        const guestTeam = lobby.selectedTeams.guest;

        const startPayload = {
          action: "startGame",
          team1: hostTeam,
          team2: guestTeam,
        };

        lobby.host?.send(JSON.stringify(startPayload));
        lobby.guest?.send(JSON.stringify(startPayload));

        lobby.lobbyReady = { host: false, guest: false };
        lobby.wrongGuesses = [];
        const clearWrong = {
          action: "wrongGuessesUpdate",
          wrongGuesses: [],
        };
        lobby.host?.send(JSON.stringify(clearWrong));
        lobby.guest?.send(JSON.stringify(clearWrong));
      }
      return;
    }

    // === TAHMİN ===
    if (data.action === "guess") {
      const guessText = (data.guessText || "").trim();

      // Yanlış tahmin -> listeye ekle, HERKESE gönder
      if (!data.correct) {
        if (guessText.length > 0) {
          lobby.wrongGuesses = lobby.wrongGuesses || [];
          if (!lobby.wrongGuesses.includes(guessText)) {
            lobby.wrongGuesses.push(guessText);
          }

          const wrongPayload = {
            action: "wrongGuessesUpdate",
            wrongGuesses: lobby.wrongGuesses,
          };

          lobby.host?.send(JSON.stringify(wrongPayload));
          lobby.guest?.send(JSON.stringify(wrongPayload));
        }
        return;
      }

      // DOĞRU tahmin -> puan ver
      lobby.scores[data.role]++;

      const scorePayload = {
        action: "scoreUpdate",
        scores: lobby.scores,
      };

      lobby.host?.send(JSON.stringify(scorePayload));
      lobby.guest?.send(JSON.stringify(scorePayload));

      // Kazanan çıktıysa
      if (lobby.scores[data.role] >= 3) {
        const gameOverPayload = {
          action: "gameOver",
          winner: data.role,
        };
        lobby.host?.send(JSON.stringify(gameOverPayload));
        lobby.guest?.send(JSON.stringify(gameOverPayload));
        return;
      }

      // Oyun bitmediyse: yeni tur için tekrar takım seçimi
      lobby.selectedTeams = { host: null, guest: null };
      lobby.lobbyReady = { host: false, guest: false };
      lobby.wrongGuesses = [];

      const selectPayload = {
        action: "startTeamSelect",
        teams: premierLeagueTeams,
      };

      lobby.host?.send(JSON.stringify(selectPayload));
      lobby.guest?.send(JSON.stringify(selectPayload));

      const clearWrong = {
        action: "wrongGuessesUpdate",
        wrongGuesses: [],
      };
      lobby.host?.send(JSON.stringify(clearWrong));
      lobby.guest?.send(JSON.stringify(clearWrong));

      return;
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected");
  });
});
