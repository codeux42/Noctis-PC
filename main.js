"use strict";

/**
 * Noctis — application PC.
 *
 * Enveloppe Chromium dédiée : le site s'ouvre dans sa propre fenêtre, sans
 * barre d'adresse ni onglets. Les liens internes restent dans l'application,
 * les liens externes partent dans le navigateur par défaut. La session
 * (connexion, listes, préférences) est conservée d'un lancement à l'autre.
 *
 * Le programme affiche aussi « Regarde Noctis · … » sur Discord : c'est un
 * avantage d'une application installée, un site web n'y a pas accès.
 */

const { app, BrowserWindow, Menu, shell, session, screen } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { DiscordPresence } = require("./presence");

const SITE_URL = process.env.NOCTIS_PC_URL || "https://noctis.ct.ws/";
const SITE_HOSTS = new Set(["noctis.ct.ws", "www.noctis.ct.ws"]);
const APP_ID = "ws.ct.noctis.pc";
const BG = "#0b0c10";
const PRESENCE_START = Math.floor(Date.now() / 1000);

/** Bande transparente en haut : les boutons de fenêtre flottent sur le site. */
const TITLEBAR_HEIGHT = 32;
const TITLEBAR_SYMBOL = "#f4f2ee";

/**
 * Le site est pensé pour un navigateur, avec sa propre barre. Dans
 * l'application, la bande des boutons réduire / agrandir / fermer est prise
 * sur le haut de l'en-tête : le verre et le flou passent derrière les
 * contrôles, le contenu (logo, liens, boutons) reste juste en dessous.
 * Le reste des pages est décalé d'autant, pour ne rien masquer.
 */
const TITLEBAR_CSS = `
:root { --noctis-titlebar: ${TITLEBAR_HEIGHT}px; }
html.noctis-fullscreen { --noctis-titlebar: 0px; }

body { padding-top: var(--noctis-titlebar) !important; }

.site-head,
.site-head__inner {
  height: calc(76px + var(--noctis-titlebar)) !important;
}
.site-head__inner { padding-top: var(--noctis-titlebar) !important; }
.site-search-panel { top: calc(76px + var(--noctis-titlebar)) !important; }
.site-menu { inset: calc(76px + var(--noctis-titlebar)) 0 0 !important; }

@media (min-width: 768px) {
  .site-head,
  .site-head__inner { height: calc(88px + var(--noctis-titlebar)) !important; }
  .site-search-panel { top: calc(88px + var(--noctis-titlebar)) !important; }
  .site-menu { inset: calc(88px + var(--noctis-titlebar)) 0 0 !important; }
}

/* Pages plateformes : la barre de navigation s'étend sous les boutons. */
.pf-nav {
  height: calc(var(--pf-nav-h) + var(--noctis-titlebar)) !important;
  padding-top: var(--noctis-titlebar);
  margin-top: calc(-1 * var(--noctis-titlebar));
}

/* Administration : son en-tête collant garde la même bande. */
.min-h-screen.bg-black > header {
  padding-top: calc(16px + var(--noctis-titlebar)) !important;
}

/* Bande de déplacement : le haut de l'en-tête tire la fenêtre. */
.site-head { -webkit-app-region: drag; }
.pf-nav { -webkit-app-region: drag; }
.min-h-screen.bg-black > header { -webkit-app-region: drag; }

.site-head a,
.site-head button,
.site-head input,
.site-head select,
.site-head label,
.site-head [role="button"],
.site-search-panel,
.site-menu,
.pf-nav a,
.pf-nav button,
.pf-nav [role="button"],
.min-h-screen.bg-black > header a,
.min-h-screen.bg-black > header button {
  -webkit-app-region: no-drag;
}
`;

/**
 * Hôtes autorisés à s'ouvrir dans une fenêtre de l'application plutôt que
 * dans le navigateur : la page publicitaire (sinon le site croit à un popup
 * bloqué et la lecture reste verrouillée) et les lecteurs vidéo.
 * Surchargeable dans `popups.json`, à côté de l'exécutable.
 */
const DEFAULT_POPUP_HOSTS = {
  ads: ["celyntor.xyz"],
  players: ["fluxora.sbs", "anicloud.top", "drive.google.com", "docs.google.com"],
};
let POPUP_HOSTS = {
  ads: [...DEFAULT_POPUP_HOSTS.ads],
  players: [...DEFAULT_POPUP_HOSTS.players],
};

app.setName("Noctis");
app.setAppUserModelId(APP_ID);
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

/** L'empreinte « Electron » dans l'User-Agent n'apporte rien au site. */
app.userAgentFallback = app.userAgentFallback
  .replace(/\sElectron\/[\d.]+/i, "")
  .replace(/\sNoctis\/[\d.]+/i, "");

// Une seule instance : un second lancement ramène la fenêtre existante.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

const STATE_FILE = path.join(app.getPath("userData"), "window-state.json");
const SETTINGS_FILE = path.join(app.getPath("userData"), "settings.json");
const PRESENCE_LOG = path.join(app.getPath("userData"), "presence.log");
const DEFAULT_SETTINGS = { discord: true, alwaysOnTop: false };

let mainWindow = null;
let presence = null;
let settings = loadSettings();

// ---------------------------------------------------------------------------
// Préférences et journal
// ---------------------------------------------------------------------------
function loadSettings() {
  try {
    const saved = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
    return {
      discord: saved?.discord !== false,
      alwaysOnTop: saved?.alwaysOnTop === true,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings() {
  try {
    fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf8");
  } catch {
    /* les préférences restent valables pour la session en cours */
  }
}

function presenceLog(message) {
  try {
    if (fs.existsSync(PRESENCE_LOG) && fs.statSync(PRESENCE_LOG).size > 64 * 1024) {
      fs.writeFileSync(PRESENCE_LOG, "", "utf8");
    }
    fs.appendFileSync(PRESENCE_LOG, `[${new Date().toISOString()}] ${message}\n`, "utf8");
  } catch {
    /* le journal est facultatif */
  }
}

/** Identifiant public de l'application Discord (aucun jeton ici). */
function readClientId() {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(__dirname, "presence.json"), "utf8"));
    const clientId = String(config?.clientId || "");
    return /^\d{15,25}$/.test(clientId) ? clientId : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Taille et position de la fenêtre
// ---------------------------------------------------------------------------
function loadWindowState() {
  try {
    const saved = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    if (!saved || !Number.isFinite(saved.width) || !Number.isFinite(saved.height)) {
      return null;
    }
    const width = Math.max(900, Math.round(saved.width));
    const height = Math.max(560, Math.round(saved.height));
    const bounds = {
      width,
      height,
      x: Number.isFinite(saved.x) ? Math.round(saved.x) : undefined,
      y: Number.isFinite(saved.y) ? Math.round(saved.y) : undefined,
    };
    // Si l'écran a changé, une position hors champ serait invisible.
    if (Number.isFinite(bounds.x) && Number.isFinite(bounds.y)) {
      const visible = screen.getAllDisplays().some((display) => {
        const area = display.workArea;
        return (
          bounds.x < area.x + area.width &&
          bounds.x + width > area.x &&
          bounds.y < area.y + area.height &&
          bounds.y + height > area.y
        );
      });
      if (!visible) {
        delete bounds.x;
        delete bounds.y;
      }
    }
    return { bounds, maximized: Boolean(saved.maximized) };
  } catch {
    return null;
  }
}

function saveWindowState(win) {
  try {
    const maximized = win.isMaximized();
    const bounds = maximized ? win.getNormalBounds() : win.getBounds();
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(
      STATE_FILE,
      JSON.stringify({ ...bounds, maximized }, null, 2),
      "utf8",
    );
  } catch {
    /* l'application fonctionne même si l'état n'est pas enregistré */
  }
}

// ---------------------------------------------------------------------------
// Navigation et fenêtres internes (publicités, lecteurs)
// ---------------------------------------------------------------------------
function loadPopupHosts() {
  const clean = (list) =>
    Array.from(
      new Set(
        (Array.isArray(list) ? list : [])
          .map((host) => String(host || "").trim().toLowerCase())
          .filter((host) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)),
      ),
    );

  const candidates = [];
  if (process.env.NOCTIS_PC_POPUPS) candidates.push(process.env.NOCTIS_PC_POPUPS);
  try {
    candidates.push(path.join(app.getPath("userData"), "popups.json"));
  } catch {
    /* chemin indisponible : on garde le fichier livré avec l'application */
  }
  candidates.push(path.join(__dirname, "popups.json"));

  for (const file of candidates) {
    try {
      const config = JSON.parse(fs.readFileSync(file, "utf8"));
      const hosts = {
        ads: clean(config?.ads),
        players: clean(config?.players),
      };
      if (hosts.ads.length || hosts.players.length) {
        return hosts;
      }
    } catch {
      /* fichier absent ou illisible : candidat suivant */
    }
  }
  return {
    ads: clean(DEFAULT_POPUP_HOSTS.ads),
    players: clean(DEFAULT_POPUP_HOSTS.players),
  };
}

function matchesHost(hostname, hosts) {
  const host = String(hostname || "").toLowerCase();
  return hosts.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

/** « ad », « player » ou null si l'URL doit rester au navigateur externe. */
function popupKind(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (matchesHost(parsed.hostname, POPUP_HOSTS.ads)) return "ad";
    if (matchesHost(parsed.hostname, POPUP_HOSTS.players)) {
      // /go/… est une redirection publicitaire du lecteur, pas le lecteur.
      return /^\/(go|out|redirect)\//i.test(parsed.pathname) ? "ad" : "player";
    }
  } catch {
    /* URL invalide */
  }
  return null;
}

/**
 * Décide du traitement d'une ouverture de fenêtre. Les lecteurs ouvrent leurs
 * propres publicités depuis leur iframe (referrer = fluxora.sbs, etc.) : elles
 * doivent aussi s'afficher dans l'application, sinon le lecteur reste bloqué
 * sur « fermez la publicité puis revenez ».
 */
function popupKindForOpen(details) {
  const kind = popupKind(details.url);
  if (kind) return kind;
  try {
    const referrer = details.referrer?.url;
    if (referrer && matchesHost(new URL(referrer).hostname, POPUP_HOSTS.players)) {
      return "ad";
    }
  } catch {
    /* referrer absent ou invalide */
  }
  return null;
}

function isInternal(url) {
  try {
    const parsed = new URL(url);
    return (
      (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      SITE_HOSTS.has(parsed.hostname)
    );
  } catch {
    return false;
  }
}

function openExternally(url) {
  try {
    const { protocol } = new URL(url);
    if (["http:", "https:", "mailto:"].includes(protocol)) {
      shell.openExternal(url);
    }
  } catch {
    /* URL invalide : ignorée */
  }
}

/**
 * Taille des fenêtres internes : compacte pour une publicité, large pour un
 * lecteur. Elles sont centrées sur la fenêtre Noctis.
 */
function popupWindowOptions(kind, parent) {
  const compact = kind === "ad";
  const width = compact ? 520 : 1120;
  const height = compact ? 780 : 720;

  let x;
  let y;
  try {
    const area = screen.getDisplayMatching(parent.getBounds()).workArea;
    const w = Math.min(width, area.width - 60);
    const h = Math.min(height, area.height - 60);
    const bounds = parent.getBounds();
    x = Math.round(bounds.x + (bounds.width - w) / 2);
    y = Math.round(bounds.y + (bounds.height - h) / 2);
    x = Math.max(area.x, Math.min(x, area.x + area.width - w));
    y = Math.max(area.y, Math.min(y, area.y + area.height - h));
    return {
      width: w,
      height: h,
      x,
      y,
      minWidth: compact ? 360 : 720,
      minHeight: compact ? 480 : 420,
      show: true,
      title: compact ? "Publicité — Noctis" : "Lecteur — Noctis",
      backgroundColor: compact ? "#ffffff" : "#000000",
      icon: path.join(__dirname, "assets", "icon.png"),
      autoHideMenuBar: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
        backgroundThrottling: false,
      },
    };
  } catch {
    return {
      width,
      height,
      minWidth: compact ? 360 : 720,
      minHeight: compact ? 480 : 420,
      show: true,
      title: compact ? "Publicité — Noctis" : "Lecteur — Noctis",
      backgroundColor: compact ? "#ffffff" : "#000000",
      autoHideMenuBar: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
        backgroundThrottling: false,
      },
    };
  }
}

function attachNavigation(win) {
  const popups = new Set();

  /** Configure une fenêtre interne et les fenêtres qu'elle ouvrirait. */
  const watchPopup = (child, kind) => {
    popups.add(child);

    // Une publicité ne doit pas ouvrir d'autres fenêtres en cascade.
    child.webContents.setWindowOpenHandler(({ url }) => {
      if (kind === "ad") return { action: "deny" };
      if (isInternal(url)) {
        win.loadURL(url);
        return { action: "deny" };
      }
      const next = popupKind(url);
      if (next) {
        return { action: "allow", overrideBrowserWindowOptions: popupWindowOptions(next, win) };
      }
      openExternally(url);
      return { action: "deny" };
    });

    child.webContents.on("did-create-window", (grandChild, details) => {
      const next = popupKind(details.url) || "player";
      watchPopup(grandChild, next);
    });

    child.on("closed", () => {
      popups.delete(child);
      if (!win.isDestroyed()) win.focus();
    });
  };

  win.webContents.setWindowOpenHandler((details) => {
    const { url } = details;
    if (process.env.NOCTIS_PC_LOG_POPUPS) {
      console.log(
        "[popup]",
        JSON.stringify({
          url,
          referrer: details.referrer,
          frameName: details.frameName,
          disposition: details.disposition,
        }),
      );
    }
    if (isInternal(url)) {
      win.loadURL(url);
      return { action: "deny" };
    }
    const kind = popupKindForOpen(details);
    if (kind) {
      // Publicité et lecteur s'ouvrent dans une fenêtre Noctis : window.open()
      // reçoit bien une fenêtre, donc le site valide la publicité et la lecture
      // se débloque normalement.
      return {
        action: "allow",
        overrideBrowserWindowOptions: popupWindowOptions(kind, win),
      };
    }
    openExternally(url);
    return { action: "deny" };
  });

  win.webContents.on("did-create-window", (child, details) => {
    watchPopup(child, popupKind(details.url) || "player");
  });

  const keepInside = (event, url) => {
    if (isInternal(url) || url.startsWith("file:")) return;
    event.preventDefault();
    const kind = popupKind(url);
    if (kind) {
      // Un lecteur qui demande la fenêtre entière reste dans l'application.
      const child = new BrowserWindow({ ...popupWindowOptions(kind, win) });
      watchPopup(child, kind);
      child.loadURL(url);
      return;
    }
    openExternally(url);
  };

  win.webContents.on("will-navigate", keepInside);
  win.webContents.on("will-redirect", keepInside);

  // La fenêtre principale fermée, ses fenêtres publicitaires/lecteur aussi.
  win.on("closed", () => {
    for (const child of popups) {
      if (!child.isDestroyed()) child.destroy();
    }
    popups.clear();
  });
}

/**
 * Applique la bande transparente. La feuille est réinjectée à chaque
 * chargement de page (elle ne survit pas à une navigation).
 */
function attachTitleBar(win) {
  // En plein écran, les boutons natifs disparaissent : la bande aussi.
  const toggle = (fullscreen) => {
    const call = `document.documentElement.classList.${
      fullscreen ? "add" : "remove"
    }("noctis-fullscreen")`;
    win.webContents.executeJavaScript(call).catch(() => {});
  };

  const refresh = () => {
    if (!/^https?:/i.test(win.webContents.getURL())) return;
    win.webContents.insertCSS(TITLEBAR_CSS).catch(() => {});
    if (win.isFullScreen()) toggle(true);
  };
  win.webContents.on("dom-ready", refresh);

  win.on("enter-full-screen", () => toggle(true));
  win.on("leave-full-screen", () => toggle(false));
}

function attachShortcuts(win) {
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    const ctrl = input.control || input.meta;
    const key = String(input.key || "").toLowerCase();

    // Les autres raccourcis (F5, F11, zoom, Ctrl+Q) passent par le menu,
    // pour éviter un double déclenchement.
    if (ctrl && key === "r") {
      event.preventDefault();
      if (input.shift) win.webContents.reloadIgnoringCache();
      else win.webContents.reload();
      return;
    }
    if (input.alt && key === "left") {
      event.preventDefault();
      if (win.webContents.canGoBack()) win.webContents.goBack();
      return;
    }
    if (input.alt && key === "right") {
      event.preventDefault();
      if (win.webContents.canGoForward()) win.webContents.goForward();
      return;
    }
    if (input.key === "Escape" && win.isFullScreen()) {
      win.setFullScreen(false);
      return;
    }
    if (input.key === "F12" || (ctrl && input.shift && key === "i")) {
      event.preventDefault();
      win.webContents.toggleDevTools();
    }
  });
}

// ---------------------------------------------------------------------------
// Statut Discord
// ---------------------------------------------------------------------------
/** « Films - Noctis » → « Films », « Plateformes · Netflix - Noctis » → « Plateformes · Netflix ». */
function describePage(url, title) {
  try {
    if (new URL(url).pathname === "/") return "Accueil";
  } catch {
    /* URL locale : on garde le titre */
  }
  const clean = String(title || "")
    .replace(/\s*[·|]\s*Noctis\b.*$/i, "")
    .replace(/\s*[—–-]\s*Noctis\b.*$/i, "")
    .trim();
  return clean || "Noctis";
}

function refreshPresence(win) {
  if (!presence) return;
  if (!settings.discord) {
    presence.setActivity(null);
    return;
  }
  const url = win.webContents.getURL();
  if (!isInternal(url)) {
    presence.setActivity(null);
    return;
  }
  const section = describePage(url, win.webContents.getTitle()).slice(0, 96);
  presence.setActivity({
    // 3 = « Regarde … » (0 afficherait « Joue à … »).
    type: 3,
    details: `Noctis · ${section}`.slice(0, 128),
    state: "Films, séries & TV en direct",
    timestamps: { start: PRESENCE_START },
    buttons: [{ label: "Ouvrir Noctis", url: SITE_URL }],
    instance: false,
  });
}

function applyDiscordSetting(win) {
  if (!presence) return;
  if (settings.discord) {
    presence.start();
    refreshPresence(win);
  } else {
    presence.setActivity(null);
    presence.stop();
  }
}

// ---------------------------------------------------------------------------
// Fenêtre
// ---------------------------------------------------------------------------
function buildMenu(win) {
  return Menu.buildFromTemplate([
    {
      label: "Noctis",
      submenu: [
        {
          label: "Statut Discord",
          type: "checkbox",
          checked: settings.discord,
          click: (item) => {
            settings.discord = item.checked;
            saveSettings();
            applyDiscordSetting(win);
            presenceLog(`statut Discord ${item.checked ? "activé" : "désactivé"}`);
          },
        },
        {
          label: "Toujours au premier plan",
          type: "checkbox",
          checked: settings.alwaysOnTop,
          click: (item) => {
            settings.alwaysOnTop = item.checked;
            saveSettings();
            win.setAlwaysOnTop(item.checked);
          },
        },
        { type: "separator" },
        { label: "Recharger", accelerator: "F5", click: () => win.webContents.reload() },
        {
          label: "Plein écran",
          accelerator: "F11",
          click: () => win.setFullScreen(!win.isFullScreen()),
        },
        {
          label: "Page précédente",
          accelerator: "Alt+Left",
          click: () => {
            if (win.webContents.canGoBack()) win.webContents.goBack();
          },
        },
        {
          label: "Page suivante",
          accelerator: "Alt+Right",
          click: () => {
            if (win.webContents.canGoForward()) win.webContents.goForward();
          },
        },
        { label: "Zoom avant", accelerator: "CommandOrControl+Plus", role: "zoomIn" },
        { label: "Zoom arrière", accelerator: "CommandOrControl+-", role: "zoomOut" },
        { label: "Taille réelle", accelerator: "CommandOrControl+0", role: "resetZoom" },
        { type: "separator" },
        { label: "Quitter", accelerator: "CommandOrControl+Q", click: () => app.quit() },
      ],
    },
  ]);
}

function createWindow() {
  const state = loadWindowState();
  const bounds = state?.bounds || { width: 1440, height: 900 };

  const win = new BrowserWindow({
    ...bounds,
    minWidth: 900,
    minHeight: 560,
    show: false,
    title: "Noctis",
    backgroundColor: BG,
    icon: path.join(__dirname, "assets", "icon.png"),
    autoHideMenuBar: true,
    // Barre de titre invisible : les contrôles natifs sont dessinés en
    // surimpression, transparents, par-dessus l'en-tête du site.
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#00000000",
      symbolColor: TITLEBAR_SYMBOL,
      height: TITLEBAR_HEIGHT,
    },
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
      backgroundThrottling: false,
    },
  });

  mainWindow = win;
  Menu.setApplicationMenu(buildMenu(win));
  win.setAlwaysOnTop(settings.alwaysOnTop);

  attachNavigation(win);
  attachTitleBar(win);
  attachShortcuts(win);
  attachPresence(win);

  // Boutons latéraux de la souris : précédent / suivant dans le site.
  win.on("app-command", (event, command) => {
    if (command === "browser-backward" && win.webContents.canGoBack()) {
      event.preventDefault();
      win.webContents.goBack();
    } else if (command === "browser-forward" && win.webContents.canGoForward()) {
      event.preventDefault();
      win.webContents.goForward();
    }
  });

  win.once("ready-to-show", () => {
    win.show();
    if (state?.maximized) win.maximize();
    // Petit passage par l'écran d'accueil, puis le site.
    setTimeout(() => {
      if (!win.isDestroyed()) win.loadURL(SITE_URL);
    }, 350);
  });

  win.webContents.on("did-fail-load", (event, code, description, url, isMainFrame) => {
    // -3 = chargement interrompu volontairement (navigation annulée).
    if (!isMainFrame || code === -3) return;
    if (win.webContents.getURL().startsWith("file:")) return;
    win.loadFile(path.join(__dirname, "offline.html"));
  });

  win.on("close", () => saveWindowState(win));
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });

  // Diagnostic facultatif : capture de la fenêtre puis fermeture.
  //   set NOCTIS_PC_CAPTURE=C:\...\capture.png
  if (process.env.NOCTIS_PC_CAPTURE) {
    let captureScheduled = false;
    win.webContents.on("did-finish-load", () => {
      if (captureScheduled) return;
      if (!win.webContents.getURL().startsWith("https://")) return;
      captureScheduled = true;
      setTimeout(async () => {
        try {
          const image = await win.webContents.capturePage();
          fs.writeFileSync(process.env.NOCTIS_PC_CAPTURE, image.toPNG());
          const probe = await win.webContents.executeJavaScript(`(() => ({
            title: document.title,
            url: location.href,
            version: (document.body.innerText.match(/v\\d+\\.\\d+\\.\\d+/) || [null])[0],
            cards: document.querySelectorAll('a[href^="/movie/"], a[href^="/tv/"]').length,
            text: document.body.innerText.replace(/\\s+/g, " ").slice(0, 240)
          }))()`);
          fs.writeFileSync(
            `${process.env.NOCTIS_PC_CAPTURE}.json`,
            JSON.stringify(probe, null, 2),
            "utf8",
          );
        } catch {
          /* capture impossible : on ferme quand même */
        } finally {
          app.quit();
        }
      }, Number(process.env.NOCTIS_PC_CAPTURE_DELAY || 12000));
    });
  }

  win.loadFile(path.join(__dirname, "splash.html"));
}

function attachPresence(win) {
  const update = () => refreshPresence(win);
  win.webContents.on("did-finish-load", update);
  win.webContents.on("did-navigate", update);
  win.webContents.on("did-navigate-in-page", update);
  win.webContents.on("page-title-updated", update);

  // Réduite ou masquée : la personne n'est plus « sur Noctis ».
  win.on("minimize", () => presence?.setActivity(null));
  win.on("hide", () => presence?.setActivity(null));
  win.on("restore", update);
  win.on("show", update);
}

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------
app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

app.whenReady().then(() => {
  POPUP_HOSTS = loadPopupHosts();

  session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => {
    callback(
      ["notifications", "fullscreen", "clipboard-sanitized-write"].includes(permission),
    );
  });

  presence = new DiscordPresence({
    clientId: readClientId(),
    siteUrl: SITE_URL,
    log: presenceLog,
  });
  if (settings.discord) presence.start();
  else presenceLog("statut Discord désactivé dans les préférences");

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  presence?.stop();
});

app.on("window-all-closed", () => {
  app.quit();
});
