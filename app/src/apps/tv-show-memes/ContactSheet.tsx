import { useEffect, useReducer, useRef, useState } from "react";
import type { CSSProperties, DragEvent, Dispatch } from "react";
import {
  cellAspect,
  initialSheetState,
  renderSheetPng,
  sheetReducer,
  type Fit,
  type SheetAction,
} from "./sheet";

const SPROCKET_COUNT = 46;
const FITS: { fit: Fit; label: string }[] = [
  { fit: "cover", label: "Cover" },
  { fit: "stretch", label: "Stretch" },
];

let nextImageId = 1;

function loadFile(file: File | null, dispatch: Dispatch<SheetAction>) {
  if (!file || !file.type.startsWith("image/")) return;
  const url = URL.createObjectURL(file);
  const el = new Image();
  el.onload = () => {
    dispatch({
      type: "add",
      image: { id: nextImageId++, el, w: el.naturalWidth, h: el.naturalHeight, url },
    });
  };
  el.onerror = () => URL.revokeObjectURL(url);
  el.src = url;
}

export function ContactSheet() {
  const [state, dispatch] = useReducer(sheetReducer, initialSheetState);
  const { images, cols, rows, fit } = state;
  const [dragFrom, setDragFrom] = useState(-1);
  const [overSlot, setOverSlot] = useState(-1);
  const [fileOver, setFileOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const imagesRef = useRef(images);

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      let got = false;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            loadFile(file, dispatch);
            got = true;
          }
        }
      }
      if (got) e.preventDefault();
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  function loadFiles(files: FileList) {
    for (const file of Array.from(files)) loadFile(file, dispatch);
  }

  useEffect(() => () => imagesRef.current.forEach((im) => URL.revokeObjectURL(im.url)), []);

  function removeAt(index: number) {
    URL.revokeObjectURL(images[index].url);
    dispatch({ type: "remove", index });
  }

  function clear() {
    images.forEach((im) => URL.revokeObjectURL(im.url));
    dispatch({ type: "clear" });
  }

  async function exportPng() {
    if (!images.length) return;
    const blob = await renderSheetPng(state);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "contact-sheet.png";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function endDrag() {
    setDragFrom(-1);
    setOverSlot(-1);
  }

  function slotDragOver(e: DragEvent, slot: number) {
    if (dragFrom < 0) return;
    e.preventDefault();
    setOverSlot(slot);
  }

  function slotDrop(e: DragEvent, to: number) {
    if (dragFrom < 0) return;
    e.preventDefault();
    e.stopPropagation();
    dispatch({ type: "reorder", from: dragFrom, to });
    endDrag();
  }

  function sheetDragOver(e: DragEvent) {
    if (dragFrom >= 0) return;
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      setFileOver(true);
    }
  }

  function sheetDrop(e: DragEvent) {
    setFileOver(false);
    if (dragFrom >= 0) return;
    if (e.dataTransfer.files.length) {
      e.preventDefault();
      loadFiles(e.dataTransfer.files);
    }
  }

  const browse = () => fileInput.current?.click();
  const has = images.length > 0;
  const emptySlots = cols * rows - images.length;

  return (
    <div className="tv-show-memes">
      <header>
        <div className="titlerow">
          <h1 className="title">Contact Sheet</h1>
          <span className="sub">borderless image grid · runs offline</span>
        </div>
        <div className="sprockets" aria-hidden="true">
          {Array.from({ length: SPROCKET_COUNT }, (_, i) => (
            <i key={i} />
          ))}
        </div>
        <div className="controls">
          <Stepper
            label="Columns"
            value={cols}
            noun="columns"
            onChange={(n) => dispatch({ type: "setCols", cols: n })}
          />
          <Stepper
            label="Rows"
            value={rows}
            noun="rows"
            onChange={(n) => dispatch({ type: "setRows", rows: n })}
          />
          <fieldset className="seg" aria-label="Fit mode">
            {FITS.map((option) => (
              <button
                key={option.fit}
                type="button"
                aria-pressed={fit === option.fit}
                onClick={() => dispatch({ type: "setFit", fit: option.fit })}
              >
                {option.label}
              </button>
            ))}
          </fieldset>
          <button type="button" className="btn" onClick={browse}>
            Add images
          </button>
          <div className="spacer" />
          <button type="button" className="btn ghost" onClick={clear}>
            Clear
          </button>
        </div>
      </header>

      <main>
        <div
          className={`sheet${fileOver ? " fileover" : ""}`}
          onDragEnter={sheetDragOver}
          onDragOver={sheetDragOver}
          onDragLeave={(e) => {
            if (e.target === e.currentTarget) setFileOver(false);
          }}
          onDrop={sheetDrop}
        >
          {has ? (
            <div
              className="grid"
              style={
                {
                  gridTemplateColumns: `repeat(${cols}, 1fr)`,
                  "--cell-ar": cellAspect(images),
                } as CSSProperties
              }
            >
              {images.map((im, i) => (
                <div
                  key={im.id}
                  className={[
                    "cell",
                    fit === "stretch" && "stretch",
                    dragFrom === i && "dragging",
                    overSlot === i && "over",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  draggable
                  onDragStart={(e) => {
                    setDragFrom(i);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/cs-reorder", "1");
                  }}
                  onDragEnd={endDrag}
                  onDragOver={(e) => slotDragOver(e, i)}
                  onDrop={(e) => slotDrop(e, i)}
                >
                  <img src={im.url} alt="" />
                  <span className="frame">{String(i + 1).padStart(2, "0")}</span>
                  <button
                    type="button"
                    className="kill"
                    title="Remove"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeAt(i);
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
              {Array.from({ length: emptySlots }, (_, k) => {
                const slot = images.length + k;
                return (
                  <div
                    key={`empty-${slot}`}
                    className={`empty${overSlot === slot ? " over" : ""}`}
                    onDragOver={(e) => slotDragOver(e, slot)}
                    onDrop={(e) => slotDrop(e, images.length)}
                  >
                    +
                  </div>
                );
              })}
            </div>
          ) : (
            <button type="button" className="blank" onClick={browse}>
              <span className="big">Drop images here</span>
              <span className="small">or click to browse · or paste from clipboard</span>
            </button>
          )}
        </div>
      </main>

      <footer>
        <span className="count">
          {images.length} image{images.length === 1 ? "" : "s"}
        </span>
        <div className="spacer" />
        <button type="button" className="export" disabled={!has} onClick={exportPng}>
          Export PNG
        </button>
      </footer>

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.currentTarget.files) loadFiles(e.currentTarget.files);
          e.currentTarget.value = "";
        }}
      />
    </div>
  );
}

function Stepper({
  label,
  value,
  noun,
  onChange,
}: {
  label: string;
  value: number;
  noun: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="ctl">
      <span className="label">{label}</span>
      <button
        type="button"
        className="step"
        aria-label={`Fewer ${noun}`}
        onClick={() => onChange(value - 1)}
      >
        −
      </button>
      <span className="val">{value}</span>
      <button
        type="button"
        className="step"
        aria-label={`More ${noun}`}
        onClick={() => onChange(value + 1)}
      >
        +
      </button>
    </div>
  );
}
