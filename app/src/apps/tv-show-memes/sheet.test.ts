import { describe, expect, it } from "vitest";
import {
  exportCellSize,
  initialSheetState,
  reorder,
  sheetReducer,
  type SheetAction,
  type SheetImage,
  type SheetState,
} from "./sheet";

function image(id: number, w = 100, h = 100): SheetImage {
  return { id, w, h, el: {} as HTMLImageElement, url: `blob:${id}` };
}

function run(actions: SheetAction[], start: SheetState = initialSheetState) {
  return actions.reduce(sheetReducer, start);
}

describe("reorder", () => {
  it.each([
    [0, 2, ["b", "a", "c", "d"]],
    [3, 1, ["a", "d", "b", "c"]],
    [0, 4, ["b", "c", "d", "a"]],
    [2, 2, ["a", "b", "c", "d"]],
  ])("moves %i onto slot %i", (from, to, expected) => {
    expect(reorder(["a", "b", "c", "d"], from, to)).toEqual(expected);
  });
});

describe("sheetReducer", () => {
  it("grows rows to fit every image and keeps them when images go away", () => {
    const four = run([1, 2, 3, 4].map((id) => ({ type: "add", image: image(id) })));
    expect(four.rows).toBe(2);
    expect(run([{ type: "clear" }], four).rows).toBe(2);
  });

  it("will not shrink rows below what the images need", () => {
    const state = run([
      ...[1, 2, 3, 4].map((id): SheetAction => ({ type: "add", image: image(id) })),
      { type: "setRows", rows: 5 },
      { type: "setRows", rows: 1 },
    ]);
    expect(state.rows).toBe(2);
  });

  it("regrows rows when columns shrink", () => {
    const state = run([
      ...[1, 2, 3].map((id): SheetAction => ({ type: "add", image: image(id) })),
      { type: "setCols", cols: 1 },
    ]);
    expect(state).toMatchObject({ cols: 1, rows: 3 });
  });

  it("clamps columns and rows to 1 through 12", () => {
    expect(run([{ type: "setCols", cols: 0 }]).cols).toBe(1);
    expect(run([{ type: "setCols", cols: 13 }]).cols).toBe(12);
    expect(run([{ type: "setRows", rows: 13 }]).rows).toBe(12);
  });
});

describe("exportCellSize", () => {
  it("averages source sizes and caps the longest side at 1600", () => {
    expect(exportCellSize([image(1, 100, 50), image(2, 300, 151)])).toEqual({ w: 200, h: 101 });
    expect(exportCellSize([image(1, 3200, 1800)])).toEqual({ w: 1600, h: 900 });
  });
});
