(function initTournamentApp() {
  const data = window.TOURNAMENT_DATA;
  if (!data) {
    console.error("TOURNAMENT_DATA introuvable.");
    return;
  }

  const avatarCache = new Map();

  function getInitials(username) {
    if (!username) return "?";
    const parts = username.replace(/[^a-zA-Z0-9_\- ]/g, "").split(/[_\- ]+/).filter(Boolean);
    if (!parts.length) return username.charAt(0).toUpperCase();
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
  }

  async function fetchChessAvatar(username) {
    if (!username) return null;
    const key = username.toLowerCase();
    if (avatarCache.has(key)) return avatarCache.get(key);

    const request = fetch(`https://api.chess.com/pub/player/${encodeURIComponent(username)}`, {
      headers: { Accept: "application/json" }
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Chess.com ${response.status}`);
        const profile = await response.json();
        return profile?.avatar || null;
      })
      .catch((error) => {
        console.warn(`Avatar indisponible pour ${username}:`, error.message);
        return null;
      });

    avatarCache.set(key, request);
    return request;
  }

  async function renderAvatar(username, size = "") {
    const avatarUrl = await fetchChessAvatar(username);
    const initials = getInitials(username);

    if (avatarUrl) {
      return `
        <span class="avatar-wrap ${size}">
          <img src="${avatarUrl}" alt="Avatar de ${username}" loading="lazy" onerror="this.closest('.avatar-wrap').outerHTML='<span class=\'avatar-fallback\'>${initials}</span>'" />
        </span>`;
    }

    return `<span class="avatar-fallback ${size}" aria-label="Avatar de secours pour ${username}">${initials}</span>`;
  }

  function getWeekByNumber(weekNumber) {
    return data.weekends.find((w) => Number(w.week) === Number(weekNumber));
  }

  function findPlayerInfo(teams, username) {
    for (const team of teams) {
      const player = team.players.find((p) => p.username === username);
      if (player) return { ...player, teamName: team.name };
    }
    return { username, elo: "—", teamName: "" };
  }

  async function TeamCard(team) {
    const captain = team.players.find((p) => p.username === team.captain) || { username: team.captain, elo: "—" };
    const avatar = await renderAvatar(team.captain);
    const average = Math.round(team.totalElo / team.players.length);

    return `
      <article class="team-card premium-card" aria-label="${team.name}">
        <div class="team-card-top">
          <div>
            <h3>${team.name}</h3>
            <span class="badge">Capitaine</span>
          </div>
          <div class="elo-pill">
            <span>Total Elo</span>
            <strong>${team.totalElo}</strong>
          </div>
        </div>

        <div class="team-captain">
          ${avatar}
          <div>
            <small>${captain.username}</small>
            <strong>Elo ${captain.elo}</strong>
          </div>
        </div>

        <div class="power-track" role="img" aria-label="Puissance moyenne de ${average} elo">
          <div class="power-fill" style="width: ${Math.max(25, Math.min(100, Math.round((average / 2500) * 100)))}%"></div>
        </div>
      </article>
    `;
  }

  async function MatchBoardCard(boardMatch, teams) {
    const playerA = findPlayerInfo(teams, boardMatch.teamA);
    const playerB = findPlayerInfo(teams, boardMatch.teamB);

    const [avatarA, avatarB] = await Promise.all([
      renderAvatar(playerA.username),
      renderAvatar(playerB.username)
    ]);

    const boardWeight = Number(boardMatch.board) === 1 ? "2 points" : "1 point";

    return `
      <li class="match-board">
        <section class="player-cell">
          ${avatarA}
          <div class="player-meta">
            <p class="username" title="${playerA.username}">${playerA.username}</p>
            <small>Elo ${playerA.elo}</small>
          </div>
        </section>

        <div class="vs-stack" aria-label="Échiquier ${boardMatch.board}">
          <span class="vs">VS</span>
          <span class="board-id">Échiquier ${boardMatch.board}</span>
          <span class="board-id">${boardWeight}</span>
        </div>

        <section class="player-cell right">
          ${avatarB}
          <div class="player-meta">
            <p class="username" title="${playerB.username}">${playerB.username}</p>
            <small>Elo ${playerB.elo}</small>
          </div>
        </section>
      </li>
    `;
  }

  async function ScheduleSection(title, matches, teams) {
    const cards = await Promise.all(matches.map((match) => MatchBoardCard(match, teams)));
    return `
      <section class="schedule-block premium-card" aria-label="${title}">
        <h2 class="schedule-title">${title}</h2>
        <ol class="match-list">${cards.join("")}</ol>
      </section>
    `;
  }

  function WeekendHeader(week) {
    return `
      <header class="weekend-header premium-card">
        <p class="eyebrow">${data.brand}</p>
        <h1>WEEK-END ${week.week}</h1>
        <p class="weekend-dates">${week.dates}</p>

        <div class="match-display">
          <span class="badge">${week.group}</span>
          <p><strong>${week.matchTitle}</strong></p>
          <div class="meta-row">
            <span>Samedi à partir de 19h : échiquiers 5, 4, 3</span>
            <span>Dimanche à partir de 19h : échiquiers 2, 1</span>
          </div>
        </div>
      </header>
    `;
  }

  async function renderWeekendPage() {
    const root = document.getElementById("weekendRoot");
    if (!root) return;

    const params = new URLSearchParams(window.location.search);
    let weekNo = Number(params.get("week") || 1);
    if (!Number.isInteger(weekNo) || weekNo < 1 || weekNo > data.weekends.length) weekNo = 1;

    const week = getWeekByNumber(weekNo);
    if (!week) {
      root.innerHTML = `<article class="premium-card" style="padding:1rem">Week-end introuvable.</article>`;
      return;
    }

    const [teamA, teamB] = await Promise.all(week.teams.map((team) => TeamCard(team)));
    const saturday = await ScheduleSection("Samedi – 19h00", week.schedule.saturday, week.teams);
    const sunday = await ScheduleSection("Dimanche – 19h00", week.schedule.sunday, week.teams);

    root.innerHTML = `
      ${WeekendHeader(week)}

      <section class="teams-grid" aria-label="Équipes">
        ${teamA}
        ${teamB}
      </section>

      ${saturday}
      ${sunday}

      <footer class="footer-brand premium-card">
        <p><strong>${data.brand}</strong> — ${data.stage} — BO4 par échiquier · Échiquier 1 = 2 points</p>
      </footer>
    `;

    document.title = `${data.brand} — WEEK-END ${week.week}`;
    bindWeekNav(week.week);
    bindCaptureMode();
  }

  function bindWeekNav(currentWeek) {
    const prevBtn = document.getElementById("prevWeekBtn");
    const nextBtn = document.getElementById("nextWeekBtn");
    if (!prevBtn || !nextBtn) return;

    prevBtn.disabled = currentWeek <= 1;
    nextBtn.disabled = currentWeek >= data.weekends.length;

    prevBtn.addEventListener("click", () => {
      if (currentWeek > 1) window.location.href = `weekend.html?week=${currentWeek - 1}`;
    });

    nextBtn.addEventListener("click", () => {
      if (currentWeek < data.weekends.length) window.location.href = `weekend.html?week=${currentWeek + 1}`;
    });
  }

  function bindCaptureMode() {
    const toggle = document.getElementById("captureToggle");
    if (!toggle || toggle.dataset.bound === "yes") return;

    toggle.dataset.bound = "yes";
    toggle.addEventListener("click", () => {
      const active = document.body.classList.toggle("screenshot-mode");
      toggle.textContent = active ? "Quitter mode screenshot" : "Mode screenshot";
    });
  }

  function renderHomePage() {
    const cardsRoot = document.getElementById("weekCards");
    if (!cardsRoot) return;

    cardsRoot.innerHTML = data.weekends
      .map(
        (week) => `
          <a class="week-card" href="weekend.html?week=${week.week}">
            <small>WEEK-END ${week.week} · ${week.dates}</small>
            <span class="match">${week.matchTitle}</span>
            <small>${week.group}</small>
          </a>
        `
      )
      .join("");
  }

  renderHomePage();
  renderWeekendPage();
})();
