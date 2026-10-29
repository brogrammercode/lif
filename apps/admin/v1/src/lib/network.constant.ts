export const REQUEST_TIMEOUT_MS = 25_000;
// Session creation/rotation may wait for the hosted database to wake or acquire
// a connection. Resource requests keep their shorter independent timeout.
export const SESSION_REQUEST_TIMEOUT_MS = 60_000;
export const IMAGE_SAVE_TIMEOUT_MS = 90_000;
export const NETWORK_COPY = {
  UNREACHABLE: "Cannot reach 1More Admin. Check your connection and try again.",
  TIMEOUT: "1More Admin took too long to respond. Please try again.",
  SERVER_ERROR:
    "1More Admin could not complete this request. Please try again.",
  REQUEST_ERROR: "The request could not be completed.",
  SESSION_ENDED: "Your session has ended. Please sign in again.",
  UNKNOWN_ERROR: "Something went wrong. Please try again.",
  INVALID_RESPONSE:
    "1More Admin returned an unexpected response. Please try again.",
} as const;
