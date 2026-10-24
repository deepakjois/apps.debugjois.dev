export type Fit = "cover" | "stretch";

export type SheetImage = {
  id: number;
  el: HTMLImageElement;
  w: number;
  h: number;
  url: string;
};

export type SheetState = {
  images: SheetImage[];
  cols: number;
  rows: number;
  fit: Fit;
};

export type SheetAction =
  | { type: "add"; image: SheetImage }
  | { type: "remove"; index: number }
  | { type: "reorder"; from: number; to: number }
  | { type: "clear" }
  | { type: "setCols"; cols: number }
  | { type: "setRows"; rows: number }
  | { type: "setFit"; fit: Fit };

const MAX_GRID = 12;
const EXPORT_CELL_CAP = 1600;

export const initialSheetState: SheetState = { images: [], cols: 3, rows: 1, fit: "cover" };

export function neededRows(count: number, cols: number) {
  return Math.max(1, Math.ceil(count / cols));
}

// Rows only grow on their own so the sheet never hides an image; shrinking is explicit.
export function sheetReducer(state: SheetState, action: SheetAction): SheetState {
  const next = applyAction(state, action);
  return { ...next, rows: Math.max(next.rows, neededRows(next.images.length, next.cols)) };
}

function applyAction(state: SheetState, action: SheetAction): SheetState {
  switch (action.type) {
    case "add":
      return { ...state, images: [...state.images, action.image] };
    case "remove":
      return { ...state, images: state.images.filter((_, i) => i !== action.index) };
    case "reorder":
      return { ...state, images: reorder(state.images, action.from, action.to) };
    case "clear":
      return { ...state, images: [] };
    case "setCols":
      return { ...state, cols: Math.max(1, Math.min(MAX_GRID, action.cols)) };
    case "setRows":
      return {
        ...state,
        rows: Math.max(
          neededRows(state.images.length, state.cols),
          Math.min(MAX_GRID, action.rows),
        ),
      };
    case "setFit":
      return { ...state, fit: action.fit };
  }
}

// `to` is the slot the item is dropped on; dropping on a later slot lands it just before
// that slot's current occupant, and `to === items.length` appends.
export function reorder<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0) return items;
  let target = Math.max(0, Math.min(items.length, to));
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (from < target) target--;
  next.splice(target, 0, item);
  return next;
}

function averageSize(images: SheetImage[]) {
  let w = 0;
  let h = 0;
  for (const im of images) {
    w += im.w;
    h += im.h;
  }
  return { w: w / images.length, h: h / images.length };
}

export function cellAspect(images: SheetImage[]) {
  if (!images.length) return 1;
  const { w, h } = averageSize(images);
  return w / h || 1;
}

export function exportCellSize(images: SheetImage[]) {
  let { w, h } = averageSize(images);
  const longest = Math.max(w, h);
  if (longest > EXPORT_CELL_CAP) {
    const scale = EXPORT_CELL_CAP / longest;
    w *= scale;
    h *= scale;
  }
  return { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  im: SheetImage,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
) {
  const scale = Math.max(dw / im.w, dh / im.h);
  const sw = dw / scale;
  const sh = dh / scale;
  ctx.drawImage(im.el, (im.w - sw) / 2, (im.h - sh) / 2, sw, sh, dx, dy, dw, dh);
}

export function renderSheetPng({ images, cols, rows, fit }: SheetState): Promise<Blob> {
  const cell = exportCellSize(images);
  const canvas = document.createElement("canvas");
  canvas.width = cols * cell.w;
  canvas.height = rows * cell.h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Canvas 2D context is unavailable"));
  ctx.imageSmoothingQuality = "high";

  images.forEach((im, i) => {
    const dx = (i % cols) * cell.w;
    const dy = Math.floor(i / cols) * cell.h;
    if (fit === "stretch") ctx.drawImage(im.el, dx, dy, cell.w, cell.h);
    else drawCover(ctx, im, dx, dy, cell.w, cell.h);
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("PNG encoding failed"))),
      "image/png",
    );
  });
}
