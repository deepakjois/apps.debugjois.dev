import AppKit

/// How the reader window joins Spaces.
enum SpaceMode {
    case coverCurrentSpace
    case ownFullScreenSpace

    /// Another process has an on-screen, layer-0 window whose bounds equal the
    /// whole display: that is what a native full-screen Space looks like from
    /// the window list.
    @MainActor
    static func forScreen(_ screen: NSScreen) -> SpaceMode {
        guard
            let displayID = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")]
                as? CGDirectDisplayID,
            let windows = CGWindowListCopyWindowInfo(
                [.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID)
                as? [[String: Any]]
        else { return .coverCurrentSpace }
        let displayBounds = CGDisplayBounds(displayID)
        let me = ProcessInfo.processInfo.processIdentifier
        let covered = windows.contains { window in
            guard (window[kCGWindowLayer as String] as? Int) == 0,
                (window[kCGWindowOwnerPID as String] as? pid_t) != me,
                let bounds = window[kCGWindowBounds as String] as? [String: Any],
                let rect = CGRect(dictionaryRepresentation: bounds as CFDictionary)
            else { return false }
            return rect == displayBounds
        }
        return covered ? .ownFullScreenSpace : .coverCurrentSpace
    }
}

/// A borderless window that covers the whole screen. Borderless windows refuse
/// key status by default, so that is overridden here.
final class ReaderWindow: NSWindow {
    /// Colour of the tint laid over the desktop; its alpha is the `--opacity`.
    static let tintColor = NSColor(calibratedRed: 0.06, green: 0.06, blue: 0.07, alpha: 1)

    /// Hosts the content on top of an optionally blurred, tinted backdrop.
    let backdrop: NSView
    let spaceMode: SpaceMode

    init(screen: NSScreen, opacity: CGFloat, blur: Bool, spaceMode: SpaceMode) {
        self.spaceMode = spaceMode
        backdrop = NSView(frame: NSRect(origin: .zero, size: screen.frame.size))
        super.init(
            contentRect: screen.frame,
            styleMask: [.borderless],
            backing: .buffered,
            defer: false)

        isOpaque = false
        backgroundColor = .clear
        hasShadow = false
        isMovable = false
        isReleasedWhenClosed = false
        animationBehavior = .none
        appearance = NSAppearance(named: .darkAqua)
        // A normal window keeps ⌘-Tab and Mission Control as usual, so it is the
        // default. But when the screen is showing another app's full-screen Space,
        // the window server relocates a normal window moved into it off every
        // screen, and without `.moveToActiveSpace` it lands on the hidden desktop
        // Space instead; the only visible option is a full-screen Space of our own.
        switch spaceMode {
        case .coverCurrentSpace:
            collectionBehavior = [.fullScreenNone, .moveToActiveSpace]
        case .ownFullScreenSpace:
            collectionBehavior = [.fullScreenPrimary]
        }
        level = .normal

        // Optionally blur whatever is behind the window, then darken it with
        // a tint. The effect view is only added when blurring: an inactive
        // one paints a solid backdrop of its own rather than nothing.
        backdrop.autoresizingMask = [.width, .height]
        if blur {
            let effect = NSVisualEffectView(frame: backdrop.bounds)
            effect.blendingMode = .behindWindow
            effect.material = .hudWindow
            effect.state = .active
            effect.autoresizingMask = [.width, .height]
            backdrop.addSubview(effect)
        }
        let tintView = NSView(frame: backdrop.bounds)
        tintView.wantsLayer = true
        tintView.layer?.backgroundColor = Self.tintColor.withAlphaComponent(opacity).cgColor
        tintView.autoresizingMask = [.width, .height]
        backdrop.addSubview(tintView)
        super.contentView = backdrop
    }

    /// Orders the window front, entering its own full-screen Space when the mode calls for it.
    func present() {
        makeKeyAndOrderFront(nil)
        if spaceMode == .ownFullScreenSpace { toggleFullScreen(nil) }
    }

    /// Content is placed inside the backdrop rather than replacing it.
    var readerView: NSView? {
        didSet {
            oldValue?.removeFromSuperview()
            if let readerView {
                readerView.frame = backdrop.bounds
                readerView.autoresizingMask = [.width, .height]
                backdrop.addSubview(readerView)
            }
        }
    }

    /// Called for every key-down before normal dispatch; return true to swallow.
    var keyHandler: ((NSEvent) -> Bool)?

    override func sendEvent(_ event: NSEvent) {
        if event.type == .keyDown, keyHandler?(event) == true { return }
        super.sendEvent(event)
    }

    /// AppKit nudges windows to keep their title bar on screen; a full-screen
    /// borderless window must be placed exactly where asked.
    override func constrainFrameRect(_ frameRect: NSRect, to screen: NSScreen?) -> NSRect {
        frameRect
    }

    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }
}
