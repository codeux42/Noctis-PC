"use strict";

/**
 * Statut Discord (Rich Presence) de l'application PC.
 *
 * Contrairement à un site web, un programme installé peut parler au client
 * Discord de bureau par son canal local (discord-ipc-0). L'activité s'affiche
 * donc automatiquement sur le profil de la personne qui utilise l'application,
 * sans compagnon séparé.
 *
 * Aucun secret ici : `presence.json` ne contient que l'identifiant public de
 * l'application Discord (le même que dans les liens d'invitation OAuth).
 */

const net = require("node:net");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const MIN_UPDATE_MS = 5000;
const READY_TIMEOUT_MS = 8000;
const RETRY_MS = 15000;

function ipcPath(index) {
  if (process.platform === "win32") return `\\\\?\\pipe\\discord-ipc-${index}`;
  const base =
    process.env.XDG_RUNTIME_DIR ||
    process.env.TMPDIR ||
    process.env.TMP ||
    process.env.TEMP ||
    "/tmp";
  return path.join(base, `discord-ipc-${index}`);
}

function encodeFrame(op, payload) {
  const json = Buffer.from(JSON.stringify(payload), "utf8");
  const frame = Buffer.alloc(8 + json.length);
  frame.writeInt32LE(op, 0);
  frame.writeInt32LE(json.length, 4);
  json.copy(frame, 8);
  return frame;
}

function createReader(onMessage) {
  let buffer = Buffer.alloc(0);
  return (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 8) {
      const op = buffer.readInt32LE(0);
      const size = buffer.readInt32LE(4);
      if (size < 0 || buffer.length < 8 + size) break;
      const payload = buffer.subarray(8, 8 + size).toString("utf8");
      buffer = buffer.subarray(8 + size);
      try {
        onMessage(op, JSON.parse(payload));
      } catch {
        /* trame illisible ignorée */
      }
    }
  };
}

class DiscordPresence {
  constructor({ clientId, siteUrl, log = () => {} }) {
    this.clientId = clientId ? String(clientId) : null;
    this.siteUrl = siteUrl;
    this.log = log;
    this.socket = null;
    this.ready = false;
    this.stopped = true;
    this.index = 0;
    this.activity = null;
    this.retryTimer = null;
    this.readyTimer = null;
    this.updateTimer = null;
    this.lastSentAt = 0;
  }

  get available() {
    return /^\d{15,25}$/.test(this.clientId || "");
  }

  start() {
    if (!this.available || !this.stopped) return;
    this.stopped = false;
    this.index = 0;
    this.connect();
  }

  stop() {
    this.stopped = true;
    this.ready = false;
    this.clearTimers();
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
  }

  /** Activité complète, ou null pour effacer le statut. */
  setActivity(activity) {
    this.activity = activity;
    this.flush();
  }

  clearTimers() {
    for (const key of ["retryTimer", "readyTimer", "updateTimer"]) {
      if (this[key]) {
        clearTimeout(this[key]);
        this[key] = null;
      }
    }
  }

  write(op, payload) {
    if (!this.socket || this.socket.destroyed) return false;
    try {
      this.socket.write(encodeFrame(op, payload));
      return true;
    } catch {
      return false;
    }
  }

  flush() {
    if (!this.ready || this.stopped) return;
    const now = Date.now();
    const wait = MIN_UPDATE_MS - (now - this.lastSentAt);
    if (wait > 0) {
      if (!this.updateTimer) {
        this.updateTimer = setTimeout(() => {
          this.updateTimer = null;
          this.flush();
        }, wait);
      }
      return;
    }
    this.lastSentAt = now;
    this.write(1, {
      cmd: "SET_ACTIVITY",
      args: { pid: process.pid, activity: this.activity },
      nonce: randomUUID(),
    });
    this.log(
      this.activity
        ? `statut envoyé : ${this.activity.details}`
        : "statut Discord effacé",
    );
  }

  scheduleRetry() {
    if (this.stopped || this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.index = 0;
      this.connect();
    }, RETRY_MS);
  }

  fail(socket, delay = 0) {
    if (this.readyTimer) {
      clearTimeout(this.readyTimer);
      this.readyTimer = null;
    }
    if (this.socket === socket) {
      this.socket = null;
      this.ready = false;
    }
    if (socket && !socket.destroyed) socket.destroy();
    if (this.stopped) return;
    this.index = 0;
    if (delay > 0) {
      if (this.retryTimer) clearTimeout(this.retryTimer);
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        this.connect();
      }, delay);
    } else {
      this.connect();
    }
  }

  connect() {
    if (this.stopped) return;
    if (this.index > 9) {
      // Discord n'est pas lancé : on réessaie plus tard, sans bloquer l'app.
      this.index = 0;
      this.scheduleRetry();
      return;
    }

    const socket = net.createConnection(ipcPath(this.index));
    let connected = false;
    let failed = false;

    const giveUp = (delay) => {
      if (failed) return;
      failed = true;
      this.fail(socket, delay);
    };

    socket.once("connect", () => {
      connected = true;
      this.socket = socket;
      this.ready = false;
      socket.write(encodeFrame(0, { v: 1, client_id: this.clientId }));
      this.readyTimer = setTimeout(() => {
        if (!this.ready) giveUp(RETRY_MS);
      }, READY_TIMEOUT_MS);
    });

    socket.on("data", (chunk) =>
      createReader((op, message) => {
        if (op === 3) {
          // PING du client Discord → PONG obligatoire.
          this.write(4, message);
          return;
        }
        if (op === 1 && message.cmd === "DISPATCH" && message.evt === "READY") {
          this.ready = true;
          if (this.readyTimer) {
            clearTimeout(this.readyTimer);
            this.readyTimer = null;
          }
          this.lastSentAt = 0;
          this.log("connecté au client Discord");
          this.flush();
          return;
        }
        if (message.evt === "ERROR") {
          this.log(
            `erreur Discord : ${message.data?.message || JSON.stringify(message.data || {})}`,
          );
        }
      })(chunk),
    );

    socket.on("error", () => {
      if (!connected) {
        // Ce canal n'existe pas : on essaie discord-ipc-1, etc.
        if (failed) return;
        failed = true;
        socket.destroy();
        this.index += 1;
        this.connect();
      } else {
        giveUp(5000);
      }
    });

    socket.on("close", () => {
      if (this.socket !== socket) return;
      giveUp(3000);
    });
  }
}

module.exports = { DiscordPresence };
