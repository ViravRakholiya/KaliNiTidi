// Persistent player identity + room session (for reconnection / share links).
const PLAYER_ID_KEY = "kanitidi_playerId";
const SESSION_KEY = "kanitidi_session";

export function getPlayerId() {
  let id = null;
  try {
    id = localStorage.getItem(PLAYER_ID_KEY);
  } catch (e) {}
  if (!id) {
    id =
      window.crypto && crypto.randomUUID
        ? crypto.randomUUID()
        : "p_" + Date.now() + "_" + Math.random().toString(36).slice(2);
    try {
      localStorage.setItem(PLAYER_ID_KEY, id);
    } catch (e) {}
  }
  return id;
}
export const setPlayerId = (id) => {
  try {
    if (id) localStorage.setItem(PLAYER_ID_KEY, id);
  } catch (e) {}
};
export const saveSession = (roomId, name) => {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ roomId, name }));
  } catch (e) {}
};
export const getSession = () => {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch (e) {
    return null;
  }
};
export const clearSession = () => {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch (e) {}
};
