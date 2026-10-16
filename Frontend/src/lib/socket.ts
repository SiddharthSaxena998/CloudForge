import { io, type Socket } from "socket.io-client";
import { API_BASE_URL, TOKEN_STORAGE_KEY } from "./api-client";

/**
 * One shared Socket.IO connection to the CloudForge backend (same origin as the REST API).
 * The JWT is sent in the handshake; the server rejects sockets without a valid token.
 */

let socket: Socket | null = null;
let socketToken: string | null = null;

function readToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function apiOrigin(): string {
  try {
    return new URL(API_BASE_URL).origin;
  } catch {
    return window.location.origin;
  }
}

/** Returns the shared socket, or null on the server / when signed out. */
export function getSocket(): Socket | null {
  if (typeof window === "undefined") return null;

  const token = readToken();
  if (!token) {
    disconnectSocket();
    return null;
  }

  // Signed in as someone else since the last call: start a fresh connection
  if (socket && socketToken !== token) disconnectSocket();

  if (!socket) {
    socketToken = token;
    socket = io(apiOrigin(), {
      // function form: reconnects always use the latest token
      auth: (cb) => cb({ token: readToken() ?? "" }),
      reconnectionDelayMax: 5000,
    });
  }

  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }
  socket = null;
  socketToken = null;
}
