/**
 * SessionManager — guarantees multi-user isolation and prevents the
 * "next caller continues the last chat" bug.
 *
 * Design rules (why the old app bled sessions, and how we stop it):
 *  - Every browser connection gets its OWN session object (own state).
 *  - We NEVER reuse or resume a session. A destroyed callId is gone forever;
 *    creating the same id later yields a brand-new object (fresh createdAt).
 *  - No conversation history is stored here at all — the relay is stateless.
 *  - A hard cap protects the upstream API quota; caller #(cap+1) is rejected.
 *
 * This module is pure (no sockets) so it is fully unit-testable.
 */
export class SessionManager {
  /** @param {{maxSessions?: number}} [opts] */
  constructor({ maxSessions = 8 } = {}) {
    if (!Number.isInteger(maxSessions) || maxSessions < 1) {
      throw new Error("maxSessions must be a positive integer");
    }
    this.maxSessions = maxSessions;
    /** @type {Map<string, object>} */
    this._sessions = new Map();
  }

  /** Number of currently active sessions. */
  get activeCount() {
    return this._sessions.size;
  }

  /** True if another session can be accepted right now. */
  canAccept() {
    return this._sessions.size < this.maxSessions;
  }

  /**
   * Create an isolated session. Throws CAPACITY_FULL at the cap, or
   * DUPLICATE_SESSION if the id is somehow already active.
   * @param {string} callId
   * @param {object} [ctx] per-connection context (upstream ref, timers, etc.)
   */
  create(callId, ctx = {}) {
    if (typeof callId !== "string" || !callId) {
      throw new Error("callId required");
    }
    if (!this.canAccept()) {
      const err = new Error("CAPACITY_FULL");
      err.code = "CAPACITY_FULL";
      throw err;
    }
    if (this._sessions.has(callId)) {
      const err = new Error("DUPLICATE_SESSION");
      err.code = "DUPLICATE_SESSION";
      throw err;
    }
    const session = {
      callId,
      createdAt: Date.now(),
      // A fresh, independent state bag per connection — no shared references.
      state: {},
      ...ctx,
    };
    this._sessions.set(callId, session);
    return session;
  }

  /** @param {string} callId @returns {object|null} */
  get(callId) {
    return this._sessions.get(callId) || null;
  }

  /** @param {string} callId */
  has(callId) {
    return this._sessions.has(callId);
  }

  /**
   * Destroy a session and run its optional close() hook exactly once.
   * @param {string} callId
   * @returns {boolean} true if a session was removed
   */
  destroy(callId) {
    const s = this._sessions.get(callId);
    if (!s) return false;
    this._sessions.delete(callId);
    if (typeof s.close === "function") {
      try {
        s.close();
      } catch {
        /* never let a close hook throw during teardown */
      }
    }
    return true;
  }

  /** Destroy every session (used on server shutdown). */
  destroyAll() {
    for (const callId of [...this._sessions.keys()]) {
      this.destroy(callId);
    }
  }

  /** Snapshot list of active callIds (for logging/monitoring). */
  list() {
    return [...this._sessions.keys()];
  }
}

/** Generate a random, unguessable call id. */
export function newCallId() {
  return "call-" + globalThis.crypto.randomUUID().slice(0, 8);
}
