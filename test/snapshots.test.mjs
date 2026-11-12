import assert from "node:assert/strict";
import test from "node:test";
import { MemorySnapshotStore } from "../src/snapshots.mjs";

test("snapshots are immutable copies with exact bounded payload bytes", () => {
  const store = new MemorySnapshotStore();
  try {
    const original = { tweets: [{ id: "123", text: "原文🦊" }] };
    const expected = structuredClone(original);
    const id = store.add(original);
    assert.match(id, /^[0-9a-f-]{36}$/);
    assert.equal(store.byteLength, Buffer.byteLength(JSON.stringify(expected)));
    original.tweets[0].text = "provider mutated after query";
    const firstRead = store.get(id);
    assert.deepEqual(firstRead, expected);
    firstRead.tweets[0].text = "renderer mutation";
    assert.deepEqual(store.get(id), expected);
  } finally { store.close(); }
});

test("snapshot entry count and byte capacity evict only oldest entries", () => {
  const value = { text: "one" };
  const bytes = Buffer.byteLength(JSON.stringify(value));
  const countBound = new MemorySnapshotStore({ maxEntries: 2 });
  const byteBound = new MemorySnapshotStore({ maxEntries: 100, maxBytes: bytes * 2 });
  try {
    for (const store of [countBound, byteBound]) {
      const first = store.add(value);
      const second = store.add(value);
      assert.deepEqual(store.get(first), value, "reading does not promote or refresh old snapshots");
      const third = store.add(value);
      assert.equal(store.get(first), null);
      assert.deepEqual(store.get(second), value);
      assert.deepEqual(store.get(third), value);
      assert.equal(store.size, 2);
      assert.equal(store.byteLength, bytes * 2);
    }
    const before = byteBound.byteLength;
    assert.throws(() => byteBound.add({ text: "x".repeat(100) }), { status: 503, code: "SNAPSHOT_TOO_LARGE" });
    assert.equal(byteBound.byteLength, before, "oversized admission cannot wipe useful existing entries");
  } finally { countBound.close(); byteBound.close(); }
});

test("snapshots expire on their original monotonic deadline and release memory while idle", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
  let elapsed = 0;
  const store = new MemorySnapshotStore({ ttlMs: 100, now: () => elapsed });
  try {
    const id = store.add({ value: "preview" });
    t.mock.timers.setTime(500_000);
    assert.notEqual(store.get(id), null, "wall-clock corrections cannot expire a monotonic snapshot");
    elapsed = 99;
    t.mock.timers.tick(99);
    assert.notEqual(store.get(id), null);
    elapsed = 100;
    t.mock.timers.tick(1);
    assert.equal(store.size, 0, "idle expiry needs no subsequent query to reclaim data");
    assert.equal(store.byteLength, 0);
    assert.equal(store.get(id), null);
  } finally { store.close(); }
});

test("closing the store releases all data and validates finite capacity configuration", () => {
  const store = new MemorySnapshotStore();
  const id = store.add({ value: "preview" });
  store.close();
  assert.equal(store.size, 0);
  assert.equal(store.byteLength, 0);
  assert.equal(store.get(id), null);
  assert.throws(() => store.add({}), { code: "SNAPSHOT_UNAVAILABLE" });
  store.close();
  for (const option of ["maxEntries", "maxBytes", "ttlMs"]) {
    for (const value of [0, -1, NaN, Infinity, 1.5, 2 ** 31]) {
      assert.throws(() => new MemorySnapshotStore({ [option]: value }), RangeError);
    }
  }
  assert.throws(() => new MemorySnapshotStore({ now: 42 }), TypeError);
});
