import AppKit

/// Wires the window, menus and the global key handling together.
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private let text: String
    private let options: Options
    private var window: ReaderWindow?
    private var reader: ReaderView?

    init(text: String, options: Options) {
        self.text = text
        self.options = options
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        installMenu()
        // Hide the menu bar and Dock while we are frontmost; they come back
        // when the pointer hits the screen edge, which is standard macOS
        // full-screen behaviour.
        NSApp.presentationOptions = [.autoHideMenuBar, .autoHideDock]

        let screen = Self.targetScreen()
        let window = ReaderWindow(screen: screen, opacity: options.opacity, blur: options.blur)
        let font = Typography.bodyFont(name: options.fontName, size: options.fontSize)
        let reader = ReaderView(
            frame: NSRect(origin: .zero, size: screen.frame.size), text: text, font: font)
        window.readerView = reader
        window.title = (options.path as NSString).lastPathComponent
        // Intercept key presses before the text view sees them so that
        // navigation keys scroll instead of moving an invisible caret.
        window.keyHandler = { [weak self] event in self?.handle(event) ?? false }
        window.setFrame(screen.frame, display: true)
        window.makeKeyAndOrderFront(nil)
        window.makeFirstResponder(reader.textView)
        reader.scrollToTop()
        self.window = window
        self.reader = reader

        // Terminals do not always yield activation to a process they spawned,
        // so ask both ways. The window floats while we are active (see below)
        // so it covers the terminal even if activation is delayed.
        NSApp.activate(ignoringOtherApps: true)
        NSRunningApplication.current.activate(options: [.activateIgnoringOtherApps])
        if ProcessInfo.processInfo.environment["MAC_READER_DEBUG"] != nil {
            FileHandle.standardError.write(
                "screen \(screen.frame) window \(window.frame)\n".data(using: .utf8)!)
        }
    }

    /// The screen the pointer is on, which is where the user is looking when
    /// they hit return in the terminal; falls back to the main screen.
    private static func targetScreen() -> NSScreen {
        let mouse = NSEvent.mouseLocation
        return NSScreen.screens.first { $0.frame.contains(mouse) }
            ?? NSScreen.main ?? NSScreen.screens[0]
    }

    // Float above other windows only while frontmost, so the reader covers
    // everything when in use but ⌘-Tab to another app still puts it behind.
    func applicationDidBecomeActive(_ notification: Notification) {
        window?.level = .floating
    }

    func applicationDidResignActive(_ notification: Notification) {
        window?.level = .normal
    }

    /// Returns true when the event was consumed.
    private func handle(_ event: NSEvent) -> Bool {
        let flags = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
        let chars = event.charactersIgnoringModifiers ?? ""

        // Escape dismisses (HIG: Esc cancels / exits full screen). ⌘W and ⌘Q
        // are the standard close/quit shortcuts.
        if event.keyCode == 53 {
            NSApp.terminate(nil)
            return true
        }
        if flags == .command, chars == "w" || chars == "q" {
            NSApp.terminate(nil)
            return true
        }
        // Leave other ⌘ shortcuts (copy, select all) to the menu, except the
        // ⌘↑/⌘↓ and ⌘j/⌘k jump-to-end combinations the reader handles.
        let isArrow = event.keyCode == 125 || event.keyCode == 126
        if flags.contains(.command) && !isArrow && !(chars == "j" || chars == "k") { return false }
        return reader?.handleKey(event) ?? false
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    /// A minimal menu so ⌘C / ⌘A work on selected text and Quit is reachable
    /// from the auto-hidden menu bar.
    private func installMenu() {
        let main = NSMenu()

        let appItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(
            withTitle: "Quit mac-reader", action: #selector(NSApplication.terminate(_:)),
            keyEquivalent: "q")
        appItem.submenu = appMenu
        main.addItem(appItem)

        let editItem = NSMenuItem()
        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(
            withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = editMenu
        main.addItem(editItem)

        NSApp.mainMenu = main
    }
}
