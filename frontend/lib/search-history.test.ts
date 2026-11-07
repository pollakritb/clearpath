import { beforeEach, expect, it, vi } from "vitest";
import {
  rememberSearch,
  removeSearchHistory,
  searchHistoryKey,
  searchHistorySnapshot,
  subscribeSearchHistory,
} from "./search-history";
const key = searchHistoryKey("history-test-user");
const location = {
  id: "park",
  name: "สวนสาธารณะ",
  address: "นครปฐม",
  kind: "park",
  source: "local" as const,
  lat: 13.82,
  lon: 100.06,
};
beforeEach(() => {
  removeSearchHistory(key);
});
it("keeps the latest ten unique selections and persists them without readings", () => {
  for (let i = 0; i < 12; i++)
    rememberSearch(key, {
      key: `place:${i}`,
      kind: "place",
      location: { ...location, id: `${i}` },
    });
  rememberSearch(key, {
    key: "place:5",
    kind: "place",
    location: { ...location, id: "5", name: "Updated park" },
  });
  const entries = searchHistorySnapshot(key);
  expect(entries).toHaveLength(10);
  expect(entries[0].location.name).toBe("Updated park");
  expect(entries.filter((item) => item.key === "place:5")).toHaveLength(1);
  expect(JSON.parse(localStorage.getItem(key)!)).toEqual(entries);
  expect(localStorage.getItem(key)).not.toContain("pm25");
});
it("isolates accounts and supports individual deletion and clearing", () => {
  const other = searchHistoryKey("another-user");
  removeSearchHistory(other);
  rememberSearch(key, { key: "place:park", kind: "place", location });
  expect(searchHistorySnapshot(other)).toEqual([]);
  rememberSearch(key, {
    key: "place:school",
    kind: "place",
    location: { ...location, id: "school" },
  });
  removeSearchHistory(key, "place:park");
  expect(searchHistorySnapshot(key).map((item) => item.key)).toEqual([
    "place:school",
  ]);
  removeSearchHistory(key);
  expect(searchHistorySnapshot(key)).toEqual([]);
  expect(localStorage.getItem(key)).toBeNull();
});
it("rejects corrupted storage and synchronizes another tab's clearing", () => {
  const unique = searchHistoryKey("bad-history");
  localStorage.setItem(
    unique,
    JSON.stringify([
      {
        key: "bad",
        kind: "place",
        location: { ...location, lat: 999 },
        selectedAt: 1,
      },
    ]),
  );
  expect(searchHistorySnapshot(unique)).toEqual([]);
  const listener = vi.fn();
  const unsubscribe = subscribeSearchHistory(listener);
  rememberSearch(key, { key: "place:park", kind: "place", location });
  localStorage.removeItem(key);
  window.dispatchEvent(new StorageEvent("storage", { key }));
  expect(searchHistorySnapshot(key)).toEqual([]);
  expect(listener).toHaveBeenCalledTimes(2);
  unsubscribe();
});
