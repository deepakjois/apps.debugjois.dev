import { useEffect, useReducer, useRef, useState } from "react";
import type { CSSProperties, DragEvent, Dispatch } from "react";
import {
  cellAspect,
  exportCellSize,
  initialSheetState,
  renderSheetPng,
  sheetReducer,
  type SheetAction,
} from "./sheet";

let nextImageId = 1;

type Preview = { url: string; width: number; height: number };

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
  const { images, cols, rows } = state;
  const [dragFrom, setDragFrom] = useState(-1);
  const [overSlot, setOverSlot] = useState(-1);
  const [fileOver, setFileOver] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
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
    if (!images.length || rendering) return;
    setRendering(true);
    try {
      const blob = await renderSheetPng(state);
      const cell = exportCellSize(images);
      setPreview({ url: URL.createObjectURL(blob), width: cols * cell.w, height: rows * cell.h });
    } finally {
      setRendering(false);
    }
  }

  function closePreview() {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
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
          <h1 className="title">TV Memes</h1>
          <span className={`onair${has ? " live" : ""}`}>{has ? "On air" : "Off air"}</span>
          <span className="sub">screenshots in, meme out · nothing leaves your device</span>
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
          <button type="button" className="btn add" onClick={browse}>
            + Add stills
          </button>
          <div className="spacer" />
          <button
            type="button"
            className="btn ghost"
            title="Remove every still"
            disabled={!has}
            onClick={clear}
          >
            Cancel show
          </button>
        </div>
      </header>

      <main>
        <div className="tv">
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
                    className={["cell", dragFrom === i && "dragging", overSlot === i && "over"]
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
                    <span className="frame">E{String(i + 1).padStart(2, "0")}</span>
                    <button
                      type="button"
                      className="kill"
                      title="Cut this scene"
                      aria-label={`Remove still ${i + 1}`}
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
                    <button
                      type="button"
                      key={`empty-${slot}`}
                      className={`empty${overSlot === slot ? " over" : ""}`}
                      aria-label="Add stills"
                      title="Add stills"
                      onClick={browse}
                      onDragOver={(e) => slotDragOver(e, slot)}
                      onDrop={(e) => slotDrop(e, images.length)}
                    >
                      <span className="plus">+</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <button type="button" className="blank" onClick={browse}>
                <span className="nosignal">No signal</span>
                <span className="big">Drop your screenshots here</span>
                <span className="small">click to browse · or paste from clipboard</span>
              </button>
            )}
          </div>
          <div className="tvbase" aria-hidden="true">
            <span className="led" />
            <span className="plate">Meme-o-Vision</span>
            <span className="knobs">
              <i />
              <i />
            </span>
          </div>
        </div>
      </main>

      <footer>
        <span className="count">
          {images.length} still{images.length === 1 ? "" : "s"} in this episode
        </span>
        <div className="spacer" />
        <button type="button" className="export" disabled={!has || rendering} onClick={exportPng}>
          {rendering ? "Rolling…" : "▶ Make the meme"}
        </button>
      </footer>

      {preview && <PreviewModal preview={preview} onClose={closePreview} />}

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

function PreviewModal({ preview, onClose }: { preview: Preview; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { url, width, height } = preview;

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);

  return (
    <dialog ref={dialog} className="preview" aria-label="Your meme" onClose={onClose}>
      <button
        type="button"
        className="scrim"
        tabIndex={-1}
        aria-hidden="true"
        onClick={() => dialog.current?.close()}
      />
      <div className="card">
        <div className="bar">
          <span className="airing">Now airing</span>
          <span className="dims">
            {width} × {height}
          </span>
          <div className="spacer" />
          <a className="iconbtn" href={url} download="tv-meme.png" title="Download PNG">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14" />
            </svg>
            <span className="sr">Download PNG</span>
          </a>
          <button
            type="button"
            className="iconbtn"
            title="Close"
            onClick={() => dialog.current?.close()}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
            <span className="sr">Close</span>
          </button>
        </div>
        <img
          src={url}
          alt="Exported meme"
          style={{ "--ar": width / height, "--w": `${width}px` } as CSSProperties}
        />
      </div>
    </dialog>
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
      <span className="val">{String(value).padStart(2, "0")}</span>
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
