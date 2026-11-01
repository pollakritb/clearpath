import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import RankEmblem from "./RankEmblem";
import ParticipationBadge from "./ParticipationBadge";
const codes = ["explorer", "reporter", "caretaker", "guardian", "champion"];
const makeRank = (code: string) => ({
  code,
  label: code,
  minimum_xp: 0,
  minimum_days: 0,
  next_label: null,
  next_xp: null,
  next_days: null,
});
afterEach(cleanup);
it("uses five distinct symbols with accessible rank labels", () => {
  const { container } = render(
    <>
      {codes.map((code) => (
        <RankEmblem key={code} rank={makeRank(code)} />
      ))}
    </>,
  );
  expect(screen.getAllByRole("img")).toHaveLength(5);
  const shapes = [...container.querySelectorAll("svg")].map(
    (svg) => svg.innerHTML,
  );
  expect(new Set(shapes).size).toBe(5);
  expect(
    container
      .querySelector('[data-rank="guardian"] svg')
      ?.querySelectorAll("path"),
  ).toHaveLength(1);
});
it("keeps the full name next to the emblem in text badges", () => {
  render(<ParticipationBadge rank={makeRank("champion")} />);
  expect(screen.getByText("champion")).toBeTruthy();
  expect(screen.queryByRole("img")).toBeNull();
});
it("does not display a made-up emblem for an unknown rank", () => {
  const { container } = render(<RankEmblem rank={makeRank("unknown")} />);
  expect(container.children).toHaveLength(0);
});
