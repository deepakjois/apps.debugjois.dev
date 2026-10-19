# mac-reader

A minimal macOS reading view for plain text and Markdown files. Launch it from
the terminal with a file and it fills the screen with a single, centred reading
column set in the system serif (New York) over a blurred, translucent dark
backdrop. No chrome apart from a thin overlay scroller on the right.

```
mac-reader notes.txt
mac-reader README.md                    # Markdown: source shown verbatim, syntax coloured
cat notes.md | mac-reader --markdown -  # stdin is plain text unless told otherwise
mac-reader --plain CHANGELOG.md         # a .md file as plain text (reflow applies)
mac-reader --font Charter --size 22 book.txt
mac-reader --opacity 0.9 --no-blur notes.txt
mac-reader --no-reflow poem.txt
```

| Flag | Default | Meaning |
| --- | --- | --- |
| `--font NAME` | New York | Font family or face; falls back to Charter, then Georgia |
| `--size POINTS` | 20 | Body text size |
| `--opacity N` | 0.8 | Opacity of the dark backdrop, 0 to 1 |
| `--no-blur` | blur on | Show what is behind the window sharp instead of blurred |
| `--markdown` | by extension | Show FILE as Markdown (needed for stdin) |
| `--plain` | by extension | Show FILE as plain text even if it ends in `.md` |
| `--no-reflow` | reflow on | Keep the file's own line breaks (plain text only; Markdown is never reflowed) |

Hard-wrapped files (text wrapped at 72/80 columns) are reflowed into paragraphs
so they read naturally at the wider measure. Blank lines separate paragraphs;
indented lines, list items, headings and block quotes keep their own breaks.
Pass `--no-reflow` to show the file exactly as written.

## Markdown

Files ending in `.md`, `.markdown`, `.mdown` or `.mkd` open in Markdown mode.
The file is shown exactly as written. `#`, `*`, backticks, `[text](url)`, `>`
and list markers all stay on screen, and the syntax is coloured in place:
headings slightly larger and bold, code in monospace on a faint tint, links,
quotes, lists, emphasis and strikethrough in their own colours, delimiters
dimmed. Long lines still wrap at the column width. Markdown mode never reflows.
Use `--markdown` for stdin and `--plain` to opt out.

## Keys

| Key | Action |
| --- | --- |
| `Esc`, `⌘W`, `⌘Q` | Close |
| `Space` / `Shift-Space`, `PgDn` / `PgUp`, `f` / `b`, `d` / `u` | Page down / up |
| `↓` / `↑`, `j` / `k` | Line down / up |
| `Home` / `End`, `g` / `G`, `⌘↑` / `⌘↓` | Top / bottom |
| `⌘C`, `⌘A` | Copy selection, select all |

The reader opens on the display the mouse pointer is on. The menu bar and Dock
auto-hide while it is frontmost; move the pointer to the top of the screen to
get the menu bar back. ⌘-Tab to another app drops it behind that app as usual.

## Development

Requires the Swift 6 toolchain (Xcode Command Line Tools are enough) on macOS 14+.

```
make debug      # swift build
make build      # swift build -c release  -> .build/release/mac-reader
make install    # copy the release binary to ~/bin (override with PREFIX=...)
make test       # swift test (Swift Testing; Command Line Tools are enough)
make fmt        # swift format, config in .swift-format
make lint       # swift format lint
```

Run without installing:

```
swift run mac-reader path/to/file.txt
```

## Layout

- `Sources/MacReader/main.swift` – argument parsing and app bootstrap
- `Options.swift` – CLI flags and the plain / Markdown mode decision
- `TextLoader.swift` – file / stdin loading with encoding detection
- `Reflow.swift` – hard-wrap detection and paragraph reflow
- `Typography.swift` – font selection, measure, leading, paragraph spacing, Markdown theme
- `ReaderView.swift` – scroll view, text column, keyboard scrolling
- `ReaderWindow.swift` – borderless full-screen window with blurred backdrop
- `AppDelegate.swift` – window setup, menu, key dispatch
- `Sources/ReaderCore/MarkdownSpan.swift` – AppKit-free Markdown span extraction (swift-markdown)
- `Tests/ReaderCoreTests/` – Swift Testing fixtures for the span extraction
