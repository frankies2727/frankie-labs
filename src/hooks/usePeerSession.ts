import { useCallback, useEffect, useRef, useState } from 'react';
import Peer, { DataConnection, PeerOptions } from 'peerjs';
import { BaseState, ConnStatus, GameAction, GameDefinition, NetMessage } from '../types';

// All rooms share the public PeerJS broker, so the host's peer id is derived
// deterministically from the game id + room code (the game id keeps two
// different games from colliding on the same code). Roles are explicit: only
// "Host a room" claims that id; "Join" only ever dials it. Letting whoever
// typed a code first become host split rooms in two — if the host's phone
// backgrounded the tab while they texted the code, the broker freed the id and
// the friend quietly became host of an empty copy of the same room.
const PREFIX = 'pn-gallery-v2';
const hostIdFor = (gameId: string, code: string) => `${PREFIX}-${gameId}-${code}`;

// Room codes skip look-alike characters (0/O, 1/I/L) so one read aloud or
// squinted at on a phone is typed back correctly.
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;
const CLAIM_TRIES = 3; // a freshly generated code is almost never taken
const newRoomCode = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
};

// ---- WebRTC transport ------------------------------------------------------
// Two players on the same wifi link up over their LAN addresses. Across
// networks — family in another state, someone on cellular, a school or office
// firewall — the direct path is usually blocked and the data channel has to be
// relayed by a TURN server; with no working relay the join simply never lands.
//
// PeerJS's built-in relays (eu-0/us-0.turn.peerjs.com) no longer exist in DNS,
// and Metered retired the old `openrelayproject` static login. Metered's Open
// Relay still runs, using the standard TURN shared-secret scheme: any username
// of the form `<expiry>:<label>` is accepted with base64(HMAC-SHA1(secret,
// username)) as its password. The secret is published by Metered for public
// use, so it protects nothing of ours. It is shared and best-effort; point
// VITE_TURN_URLS at your own TURN server for a room that has to work every
// time. See "Playing across networks" in the README.
const env = import.meta.env as unknown as Record<string, string | undefined>;
const customTurnUrls = (env.VITE_TURN_URLS ?? '')
  .split(',')
  .map((u) => u.trim())
  .filter(Boolean);

const STUN: RTCIceServer = { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] };
const OPEN_RELAY_HOST = 'staticauth.openrelay.metered.ca';
const OPEN_RELAY_SECRET = 'openrelayprojectsecret';
const RELAY_TTL_S = 12 * 60 * 60; // outlasts any sitting; guests can join a room hours later

async function openRelay(): Promise<RTCIceServer> {
  const username = `${Math.floor(Date.now() / 1000) + RELAY_TTL_S}:frankie-labs`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(OPEN_RELAY_SECRET), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(username)));
  return {
    // UDP first (fastest), then TCP and TLS on 80/443 — the ports that survive
    // strict firewalls.
    urls: [
      `turn:${OPEN_RELAY_HOST}:80`,
      `turn:${OPEN_RELAY_HOST}:80?transport=tcp`,
      `turn:${OPEN_RELAY_HOST}:443?transport=tcp`,
      `turns:${OPEN_RELAY_HOST}:443?transport=tcp`,
    ],
    username,
    credential: btoa(String.fromCharCode(...sig)),
  };
}

async function peerOptions(): Promise<PeerOptions> {
  let relay: RTCIceServer | null = null;
  if (customTurnUrls.length) {
    relay = { urls: customTurnUrls, username: env.VITE_TURN_USERNAME, credential: env.VITE_TURN_CREDENTIAL };
  } else {
    // crypto.subtle only exists on HTTPS/localhost; without it, same-network
    // play over STUN still works.
    try { relay = await openRelay(); } catch { /* no relay */ }
  }
  return { config: { iceServers: relay ? [STUN, relay] : [STUN] } };
}

// The broker drops idle sockets and backgrounded tabs. Re-register so the
// host's room code keeps resolving (and a guest can keep talking to the broker).
const revive = (peer: Peer | null) => {
  if (peer && peer.disconnected && !peer.destroyed) {
    try { peer.reconnect(); } catch { /* raced a destroy */ }
  }
};

// Nothing about the handshake is allowed to stall silently. Each attempt gets
// CONNECT_TIMEOUT_MS to produce an open data channel; ICE can fail on one
// candidate pair and succeed on the next, so we retry a few times, and
// JOIN_DEADLINE_MS is the hard backstop that guarantees the "Connecting…"
// spinner always resolves into either a lobby or an explanation.
const CONNECT_TIMEOUT_MS = 12_000;
const CONNECT_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1_200; // breathing room so a fast failure can't spin the budget away
const JOIN_DEADLINE_MS = 45_000;
const REVIVE_DELAY_MS = 3_000; // don't hammer the broker while it still holds a dead socket

const UNREACHABLE = 'Could not reach the host. Check you both typed the same code, then try again.';
const NO_BROKER = 'Could not reach the matchmaking server. Check your connection and try again.';

// PeerJS error types turned into something a player can act on.
const describeError = (type?: string) => {
  switch (type) {
    case 'peer-unavailable':
      return 'No one is hosting that room right now. Check the code, and ask the host to keep the game open on their screen.';
    case 'browser-incompatible':
      return 'This browser cannot run peer-to-peer games.';
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed':
      return NO_BROKER;
    case 'ssl-unavailable':
      return 'This page must be served over HTTPS to connect players.';
    default:
      return `Connection error (${type ?? 'unknown'}).`;
  }
};

// Bots seated by the host carry a `bot-` id so they're never confused with a
// real peer id (a PeerJS hash). The host drives them with the same botMove the
// offline session uses; guests just render them as ordinary players.
const BOT_PREFIX = 'bot-';
export const isBotId = (id: string) => id.startsWith(BOT_PREFIX);
const BOT_DELAY_MS = 650;

export interface Session<S extends BaseState> {
  state: S | null;
  myId: string;
  conn: ConnStatus;
  error: string;
  isHost: boolean;
  /** Whether the local player may add/remove bots (host, in a bot-capable game). */
  canManageBots: boolean;
  join: (roomId: string, name: string) => void;
  start: () => void;
  move: (action: GameAction) => void;
  rematch: () => void;
  addBot: () => void;
  removeBot: (id: string) => void;
}

export interface PeerSession<S extends BaseState> extends Session<S> {
  /** Open a new room under a freshly generated code (shown in the lobby). */
  host: (name: string) => void;
}

export function usePeerSession<S extends BaseState>(def: GameDefinition<S>): PeerSession<S> {
  const [state, setState] = useState<S | null>(null);
  const [myId, setMyId] = useState('');
  const [conn, setConn] = useState<ConnStatus>('idle');
  const [error, setError] = useState('');
  const [isHost, setIsHost] = useState(false);

  const peerRef = useRef<Peer | null>(null);
  const isHostRef = useRef(false);
  const botCounter = useRef(0);
  const myIdRef = useRef('');
  const stateRef = useRef<S | null>(null); // host's authoritative copy
  const connsRef = useRef<DataConnection[]>([]); // host: guests; guest: [hostConn]
  const joinedRef = useRef(false);
  const unmountedRef = useRef(false);

  const errTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showError = useCallback((msg: string) => {
    setError(msg);
    if (errTimer.current) clearTimeout(errTimer.current);
    errTimer.current = setTimeout(() => setError(''), 5000);
  }, []);

  // Every handshake watchdog is tracked so unmounting mid-join can't leave a
  // timer running against a torn-down peer.
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const arm = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(() => { timers.current.delete(t); fn(); }, ms);
    timers.current.add(t);
    return t;
  }, []);
  const disarm = useCallback((t: ReturnType<typeof setTimeout> | null) => {
    if (t === null) return;
    clearTimeout(t);
    timers.current.delete(t);
  }, []);

  // Give up on a join that will never land: tear everything down and drop the
  // player back on the room-code screen with a reason, rather than spinning.
  const abortJoin = useCallback((msg: string) => {
    for (const t of timers.current) clearTimeout(t);
    timers.current.clear();
    peerRef.current?.destroy();
    peerRef.current = null;
    connsRef.current = [];
    showError(msg);
    setConn('idle');
    joinedRef.current = false;
  }, [showError]);

  // --- Host: persist authoritative state + push a per-viewer view to each ---
  const viewFor = useCallback(
    (next: S, viewerId: string): S => (def.redact ? def.redact(next, viewerId) : next),
    [def],
  );

  const commit = useCallback((next: S) => {
    stateRef.current = next; // authoritative, unredacted
    setState(viewFor(next, myIdRef.current));
    for (const c of connsRef.current) {
      try { c.send({ kind: 'state', state: viewFor(next, c.peer) } as NetMessage<S>); } catch { /* closing */ }
    }
  }, [viewFor]);

  const maxPlayers = def.maxPlayers ?? 2;
  const minPlayers = def.minPlayers ?? 2;

  const hostSeat = useCallback((pid: string, name: string) => {
    const room = stateRef.current;
    if (!room || room.status !== 'waiting') return;
    if (room.players[pid] || Object.keys(room.players).length >= maxPlayers) return;
    commit({ ...room, players: { ...room.players, [pid]: { id: pid, name } } });
  }, [commit, maxPlayers]);

  // Host-only: drop a bot into an open seat so friends can play alongside CPUs.
  const hostAddBot = useCallback(() => {
    const room = stateRef.current;
    if (!isHostRef.current || !def.botMove || !room || room.status !== 'waiting') return;
    if (Object.keys(room.players).length >= maxPlayers) return;
    botCounter.current += 1;
    const n = botCounter.current;
    const id = `${BOT_PREFIX}${n}`;
    commit({ ...room, players: { ...room.players, [id]: { id, name: `Bot ${n}` } } });
  }, [commit, def, maxPlayers]);

  // Host-only: pull a bot back out of the lobby before the game starts.
  const hostRemoveBot = useCallback((id: string) => {
    const room = stateRef.current;
    if (!isHostRef.current || !room || room.status !== 'waiting' || !isBotId(id) || !room.players[id]) return;
    const players = { ...room.players };
    delete players[id];
    commit({ ...room, players });
  }, [commit]);

  const hostStart = useCallback(() => {
    const room = stateRef.current;
    if (!room || room.status !== 'waiting') return;
    const n = Object.keys(room.players).length;
    if (n < minPlayers || n > maxPlayers) return;
    commit(def.start(room));
  }, [commit, def, minPlayers, maxPlayers]);

  const hostAction = useCallback((pid: string, action: GameAction) => {
    const room = stateRef.current;
    if (!room) return;
    commit(def.reducer(room, pid, action));
  }, [commit, def]);

  // Rematch: restart straight into a fresh game with the same two players —
  // no return to the lobby or room code. Regenerates random setup (shuffles,
  // fleets, cards) by rebuilding from a clean initial state.
  const hostRematch = useCallback(() => {
    const room = stateRef.current;
    if (!room) return;
    const n = Object.keys(room.players).length;
    if (n < minPlayers) {
      showError('Not enough players to rematch.');
      return;
    }
    // Games may define `replay` to reuse the finished setup (e.g. the same
    // crossword board) instead of re-rolling from scratch.
    if (def.replay) { commit(def.replay(room)); return; }
    const fresh = def.createInitialState(room.roomId);
    commit(def.start({ ...fresh, players: room.players }));
  }, [commit, def, showError, minPlayers]);

  const hostRemove = useCallback((pid: string) => {
    const room = stateRef.current;
    if (!room || !room.players[pid]) return;
    if (room.status === 'waiting') {
      const players = { ...room.players };
      delete players[pid];
      commit({ ...room, players });
    } else if (room.status === 'playing') {
      commit({ ...room, status: 'gameover' }); // opponent bailed mid-game
    }
  }, [commit]);

  // --- Guest: render whatever the host sends ---
  const handleHostMessage = useCallback((data: NetMessage<S>) => {
    if (data.kind === 'state') {
      stateRef.current = data.state;
      setState(data.state);
    } else if (data.kind === 'error') {
      showError(data.msg);
    }
  }, [showError]);

  const handleGuestMessage = useCallback((c: DataConnection, data: NetMessage<S>) => {
    switch (data.kind) {
      case 'join': hostSeat(c.peer, data.name); break;
      case 'start': hostStart(); break;
      case 'rematch': hostRematch(); break;
      case 'action': hostAction(c.peer, data.action); break;
      default: break;
    }
  }, [hostSeat, hostStart, hostRematch, hostAction]);

  const sendToHost = useCallback((msg: NetMessage<S>) => {
    connsRef.current[0]?.send(msg);
  }, []);

  const joinAsGuest = useCallback((code: string, name: string, opts: PeerOptions) => {
    const peer = new Peer(opts);
    peerRef.current = peer;
    isHostRef.current = false;
    setIsHost(false);

    let live = false; // the data channel to the host has opened
    let attempts = 0;
    let reason = UNREACHABLE; // most useful thing we can say if we run out of road
    let attemptTimer: ReturnType<typeof setTimeout> | null = null;

    const deadline = arm(() => { if (!live) abortJoin(reason); }, JOIN_DEADLINE_MS);

    const giveUp = () => {
      if (live) return;
      disarm(attemptTimer);
      disarm(deadline);
      abortJoin(reason);
    };

    // One handshake attempt. A stalled attempt is torn down and replaced rather
    // than left half-open: PeerJS keeps a failed DataConnection around with no
    // `open` and — because it never opened — no `close` either.
    const attempt = () => {
      if (live || peer.destroyed) return;
      disarm(attemptTimer);
      // Signalling dropped (laptop slept, cellular hiccup). Get the socket back
      // first; `open` fires again and re-drives this.
      if (peer.disconnected) {
        try { peer.reconnect(); } catch { giveUp(); }
        return;
      }
      if (attempts >= CONNECT_ATTEMPTS) { giveUp(); return; }
      attempts += 1;

      // Tearing down the previous attempt makes it emit its own failure events.
      // Stamping each attempt lets those late events be ignored, so one dead
      // connection can't cascade through the whole retry budget at once.
      const gen = attempts;
      const current = () => !live && gen === attempts && !peer.destroyed;
      const retry = () => { if (current()) { disarm(attemptTimer); attemptTimer = arm(attempt, RETRY_DELAY_MS); } };

      const prev = connsRef.current[0];
      if (prev) { try { prev.close(); } catch { /* already dead */ } }

      const c = peer.connect(hostIdFor(def.id, code), { reliable: true });
      connsRef.current = [c];
      attemptTimer = arm(attempt, CONNECT_TIMEOUT_MS);

      c.on('open', () => {
        live = true;
        disarm(attemptTimer);
        disarm(deadline);
        connsRef.current = [c]; // whichever attempt won is the one we talk on
        setConn('connected');
        c.send({ kind: 'join', name } as NetMessage<S>);
      });
      c.on('data', (d) => handleHostMessage(d as NetMessage<S>));
      // ICE gave up on this candidate pair. Without this listener the failure is
      // completely silent — it is what left the join screen spinning forever.
      c.on('error', retry);
      c.on('iceStateChanged', (s) => { if (s === 'failed' || s === 'closed') retry(); });
      c.on('close', () => {
        if (!live) { retry(); return; }
        showError('Host left the game.');
        setConn('idle');
        setState(null);
        stateRef.current = null;
        joinedRef.current = false;
      });
    };

    peer.on('open', (id) => {
      myIdRef.current = id;
      setMyId(id);
      attempt();
    });
    peer.on('disconnected', () => { arm(() => revive(peer), REVIVE_DELAY_MS); });
    peer.on('error', (err) => {
      const type = (err as { type?: string }).type;
      reason = describeError(type);
      if (live) { showError(reason); return; } // already playing: just surface it
      // The host's broker registration can be briefly stale, and a dropped
      // socket often comes straight back — both are worth one more round trip.
      if ((type === 'peer-unavailable' || type === 'network') && attempts < CONNECT_ATTEMPTS) {
        disarm(attemptTimer);
        attemptTimer = arm(attempt, RETRY_DELAY_MS);
        return;
      }
      giveUp();
    });
  }, [def.id, handleHostMessage, showError, arm, disarm, abortJoin]);

  // Both entry points start the same way: lock out double-clicks, show the
  // spinner, and fetch relay credentials before any Peer exists.
  const begin = useCallback(async (name: string): Promise<PeerOptions | null> => {
    if (joinedRef.current || !name.trim()) return null;
    joinedRef.current = true;
    setConn('connecting');
    const opts = await peerOptions();
    return unmountedRef.current ? null : opts;
  }, []);

  const join = useCallback(async (roomId: string, name: string) => {
    const code = roomId.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!code) return;
    const opts = await begin(name);
    if (opts) joinAsGuest(code, name, opts);
  }, [begin, joinAsGuest]);

  const host = useCallback(async (name: string) => {
    const opts = await begin(name);
    if (!opts) return;

    const claim = (code: string, triesLeft: number) => {
      const peer = new Peer(hostIdFor(def.id, code), opts);
      peerRef.current = peer;

      // Claiming the room code is the first round trip of the whole flow. If
      // the broker never answers (offline, blocked, down) neither `open` nor
      // `error` ever fires, so nothing downstream can rescue it but this.
      const claimTimer = arm(() => abortJoin(NO_BROKER), CONNECT_TIMEOUT_MS);

      peer.on('open', (id) => {
        disarm(claimTimer);
        if (isHostRef.current) return; // re-registered after a dropped socket
        isHostRef.current = true;
        setIsHost(true);
        myIdRef.current = id;
        setMyId(id);
        stateRef.current = def.createInitialState(code);
        hostSeat(id, name); // seat the host as player 1
        setConn('connected');
      });

      peer.on('connection', (c) => {
        connsRef.current.push(c);
        c.on('open', () => {
          // A guest whose first attempt failed ICE opens a second connection
          // under the same peer id; keep only the live one so state isn't
          // pushed into a channel nobody is listening on.
          connsRef.current = connsRef.current.filter((x) => x === c || x.peer !== c.peer);
          if (stateRef.current) c.send({ kind: 'state', state: viewFor(stateRef.current, c.peer) } as NetMessage<S>);
        });
        c.on('data', (d) => handleGuestMessage(c, d as NetMessage<S>));
        c.on('error', () => {
          // A guest attempt that never opened: drop it so it can't linger in
          // the broadcast list. Their retry arrives as a fresh `connection`.
          if (!c.open) connsRef.current = connsRef.current.filter((x) => x !== c);
        });
        c.on('close', () => {
          connsRef.current = connsRef.current.filter((x) => x !== c);
          // A retrying guest can drop a stale channel while a fresh one is
          // already live — that isn't someone leaving, so don't unseat them.
          if (connsRef.current.some((x) => x.peer === c.peer)) return;
          hostRemove(c.peer);
          showError('Opponent disconnected.');
        });
      });

      // Guests already in the room keep playing over WebRTC, but new ones
      // can't find the code until the host is registered again.
      peer.on('disconnected', () => { arm(() => revive(peer), REVIVE_DELAY_MS); });

      peer.on('error', (err) => {
        const type = (err as { type?: string }).type;
        if (isHostRef.current) {
          // Re-registering right after a dropped socket can find the broker
          // still holding our old one; it lets go shortly and the revive loop
          // gets the code back. Anything else: the room is up, keep it running.
          if (type !== 'unavailable-id') showError(describeError(type));
          return;
        }
        disarm(claimTimer);
        peer.destroy();
        peerRef.current = null;
        if (type === 'unavailable-id' && triesLeft > 1) claim(newRoomCode(), triesLeft - 1);
        else abortJoin(describeError(type));
      });
    };

    claim(newRoomCode(), CLAIM_TRIES);
  }, [def, begin, hostSeat, handleGuestMessage, hostRemove, showError, viewFor, arm, disarm, abortJoin]);

  const start = useCallback(() => {
    if (isHostRef.current) hostStart();
    else sendToHost({ kind: 'start' });
  }, [hostStart, sendToHost]);

  const move = useCallback((action: GameAction) => {
    if (isHostRef.current) hostAction(myIdRef.current, action);
    else sendToHost({ kind: 'action', action });
  }, [hostAction, sendToHost]);

  const rematch = useCallback(() => {
    if (isHostRef.current) hostRematch();
    else sendToHost({ kind: 'rematch' });
  }, [hostRematch, sendToHost]);

  // Host drives every seated bot, mirroring the offline session: after each
  // state change, whichever bot has a move takes it after a short delay, and the
  // resulting state broadcasts to all the real players. Guests never run this.
  useEffect(() => {
    if (!isHostRef.current || !def.botMove) return;
    const room = stateRef.current;
    if (!room || room.status !== 'playing') return;
    for (const bid of Object.keys(room.players).filter(isBotId)) {
      const view = def.redact ? def.redact(room, bid) : room;
      const action = def.botMove(view, bid);
      if (!action) continue;
      const timer = setTimeout(() => {
        const cur = stateRef.current;
        if (!cur || cur.status !== 'playing') return;
        const next = def.reducer(cur, bid, action);
        if (next !== cur) commit(next);
      }, BOT_DELAY_MS);
      return () => clearTimeout(timer);
    }
  }, [state, def, commit]);

  // A phone that backgrounded the tab (or lost signal) gets its broker socket
  // back the moment the player returns, rather than on the next retry tick.
  useEffect(() => {
    const onReturn = () => { if (document.visibilityState === 'visible') revive(peerRef.current); };
    document.addEventListener('visibilitychange', onReturn);
    window.addEventListener('online', onReturn);
    return () => {
      document.removeEventListener('visibilitychange', onReturn);
      window.removeEventListener('online', onReturn);
    };
  }, []);

  useEffect(() => {
    const pending = timers.current;
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      if (errTimer.current) clearTimeout(errTimer.current);
      for (const t of pending) clearTimeout(t);
      pending.clear();
      peerRef.current?.destroy();
    };
  }, []);

  const canManageBots = isHost && !!def.botMove;
  return { state, myId, conn, error, isHost, canManageBots, join, host, start, move, rematch, addBot: hostAddBot, removeBot: hostRemoveBot };
}
