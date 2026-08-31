import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import { recordServerTime, resetServerClock, serverClockOffset, serverNow } from "../src/clock.js";
import { AUTO_SUBMIT_LEAD_MS, autoSubmitDelay, formatCountdown } from "../src/utils.js";

afterEach(resetServerClock);

// The header this reads is the one the backend had to be changed to expose:
// Date is not CORS-safelisted, so before that change every one of these
// readings was a null and the offset stayed at zero.
const rfc1123 = milliseconds => new Date(milliseconds).toUTCString();

test("no reading yet means the device's own clock, unchanged", () => {
  assert.equal(serverClockOffset(), 0);
  assert.ok(Math.abs(serverNow() - Date.now()) < 50);
});

test("a device running fast is corrected backwards, a slow one forwards", () => {
  const device = Date.parse("2026-03-01T12:00:00Z");

  // The device believes it is 12:00:00; the server says 11:58:00. Two minutes
  // fast, so server time is two minutes behind what this browser thinks.
  assert.equal(recordServerTime(rfc1123(device - 120_000), device, device), true);
  assert.equal(serverClockOffset(), -120_000);

  assert.equal(recordServerTime(rfc1123(device + 90_000), device, device), true);
  assert.equal(serverClockOffset(), 90_000);
});

test("half the round trip is credited to the response's flight", () => {
  const sentAt = Date.parse("2026-03-01T12:00:00Z");
  const receivedAt = sentAt + 2000;

  // Clocks agree exactly: the server stamped the response mid-flight, one
  // second after it was asked for. Charging the whole trip to the reading
  // instead would place the server two seconds in the past and make every
  // deadline look two seconds further away than it is — the direction that
  // submits too late. (A whole second, so that the header's own rounding,
  // measured below, does not confuse the two effects.)
  recordServerTime(rfc1123(sentAt + 1000), sentAt, receivedAt);
  assert.equal(serverClockOffset(), 0);
});

// The claim in clock.js is that what survives the round-trip correction is
// under the second the header is rounded to, and the three-second submission
// lead is wider than that. Both halves are checked here, because the error is
// one-sided: an HTTP date is truncated, never rounded up, so the server always
// reads slightly earlier than it is — the same direction as submitting late.
test("what the header rounds away stays under a second, and behind", () => {
  const sentAt = Date.parse("2026-03-01T12:00:00Z");

  for (const milliseconds of [0, 1, 250, 500, 999]) {
    resetServerClock();
    const stamp = sentAt + milliseconds;
    recordServerTime(rfc1123(stamp), stamp, stamp);
    assert.ok(serverClockOffset() <= 0, `reading ran ahead by ${-serverClockOffset()}ms`);
    assert.ok(serverClockOffset() > -1000, `reading lagged by ${-serverClockOffset()}ms`);
    assert.ok(-serverClockOffset() < AUTO_SUBMIT_LEAD_MS);
  }
});

test("an unreadable Date leaves the last good reading standing", () => {
  const now = Date.parse("2026-03-01T12:00:00Z");
  recordServerTime(rfc1123(now + 60_000), now, now);

  for (const header of [null, undefined, "", "   ", "not a date", "Tue, 99 Xxx 2026"]) {
    assert.equal(recordServerTime(header, now, now), false, `accepted ${String(header)}`);
    assert.equal(serverClockOffset(), 60_000);
  }
});

test("a response too slow to time is not a clock reading", () => {
  const sentAt = Date.parse("2026-03-01T12:00:00Z");
  recordServerTime(rfc1123(sentAt + 60_000), sentAt, sentAt);
  assert.equal(serverClockOffset(), 60_000);

  // Eleven seconds: either the network is that bad or the tab was suspended
  // mid-request. Either way, where in that window the server stamped the
  // response is a guess, and a wrong guess here moves the deadline.
  assert.equal(recordServerTime(rfc1123(sentAt), sentAt, sentAt + 11_000), false);
  assert.equal(serverClockOffset(), 60_000);

  // A response that arrived before it was sent means the device's clock moved
  // under us; the elapsed time measured across it is meaningless.
  assert.equal(recordServerTime(rfc1123(sentAt), sentAt, sentAt - 1), false);
  assert.equal(serverClockOffset(), 60_000);
});

test("serverNow moves with the device clock, offset by the reading", () => {
  // Aligned to a whole second so the header loses nothing to truncation and
  // the offset under test is exactly the five minutes put into it.
  const now = Math.floor(Date.now() / 1000) * 1000;
  recordServerTime(rfc1123(now - 300_000), now, now);
  assert.equal(serverClockOffset(), -300_000);
  assert.ok(Math.abs(serverNow() - (Date.now() - 300_000)) < 50);
});

// The two places a deadline becomes a duration. Both default to server time,
// and they have to agree: a countdown reading from one clock while the
// submission is scheduled off another would show a reader time they do not
// have, or take away time they do.
test("the countdown and the automatic submission read the same clock", () => {
  const now = Math.floor(Date.now() / 1000) * 1000;
  // The device is a minute fast. Ten minutes of quiz remain by the server's
  // reckoning; this browser, left to itself, would say nine.
  recordServerTime(rfc1123(now - 60_000), now, now);
  const expiresAt = new Date(now + 9 * 60_000).toISOString();

  assert.equal(formatCountdown(expiresAt), "10:00");
  // Within a second, because `now` above was floored to one so the header
  // would survive its own rounding; without the correction this delay is a
  // whole minute short, which no tolerance this tight would hide.
  assert.ok(Math.abs(autoSubmitDelay(expiresAt) - (10 * 60_000 - AUTO_SUBMIT_LEAD_MS)) < 1000,
    `delay was ${autoSubmitDelay(expiresAt)}`);

  // Same instant read off the uncorrected device clock, for contrast: this is
  // what both did before, and it is a minute of the reader's time.
  assert.equal(formatCountdown(expiresAt, Date.now()), "09:00");
});

test("an explicit now still wins over the reading", () => {
  const now = Date.parse("2026-03-01T12:00:00Z");
  recordServerTime(rfc1123(now - 3_600_000), now, now);
  assert.equal(formatCountdown("2026-03-01T12:01:05Z", now), "01:05");
  assert.equal(autoSubmitDelay("2026-03-01T12:10:00Z", now), 600_000 - AUTO_SUBMIT_LEAD_MS);
});
