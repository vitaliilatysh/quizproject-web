// What time it is on the server, as far as this browser can tell.
//
// An attempt's deadline is the server's, but every duration computed from it
// here used the device's own clock. The two are not the same clock and nobody
// guarantees they agree: a laptop running three minutes fast showed three
// minutes less on the timer and submitted the attempt three minutes early; one
// running slow submitted after the API had already stamped the completion late
// and refused it. Neither is the reader's doing and neither is visible to them.
//
// Every API response carries a Date header — the backend now names it in
// Access-Control-Expose-Headers, so a browser may finally read it — which makes
// each response a fresh reading of the server's clock. What is kept here is the
// difference between that reading and this device's clock at the same instant.
//
// How accurate that is: the header has one-second resolution and the response
// spent time in flight, so a raw reading lands slightly in the past. Half the
// measured round trip corrects the flight; what is left is under the second the
// header itself is rounded to. Automatic submission starts three seconds before
// the deadline, which is wider than that error by design. Anything tighter
// would need a protocol rather than a header.
let offsetMs = 0;

// A response slower than this is not a usable reading: half of a long round
// trip is a poor guess at when the server actually stamped it, and the tab may
// simply have been suspended mid-request. The previous offset stands instead —
// zero, if none was ever taken, which is exactly the behaviour that shipped
// before this file existed.
const USABLE_ROUND_TRIP_MS = 10_000;

/**
 * Record one reading of the server's clock.
 *
 * @param header the response's Date header, or null when it is unreadable
 * @param sentAt Date.now() from just before the request went out
 * @param receivedAt Date.now() from the moment the response headers arrived
 * @returns whether the reading was usable
 */
export function recordServerTime(header, sentAt, receivedAt = Date.now()) {
  const serverTime = Date.parse(header ?? "");
  if (!Number.isFinite(serverTime)) return false;

  const roundTrip = Number.isFinite(sentAt) ? receivedAt - sentAt : 0;
  if (roundTrip < 0 || roundTrip > USABLE_ROUND_TRIP_MS) return false;

  offsetMs = Math.round(serverTime + roundTrip / 2 - receivedAt);
  return true;
}

// Now, in server time. Identical to Date.now() until a response has been read,
// so nothing behaves differently against an API that does not expose Date.
export function serverNow() {
  return Date.now() + offsetMs;
}

export function serverClockOffset() {
  return offsetMs;
}

// Tests only: the offset is module state, and a test that skews it would
// otherwise skew every test that runs after it.
export function resetServerClock() {
  offsetMs = 0;
}
