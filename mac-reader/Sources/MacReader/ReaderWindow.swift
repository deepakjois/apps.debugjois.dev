import AppKit

/// A borderless window that covers the whole screen. Borderless windows refuse
/// key status by default, so that is overridden here.
final class ReaderWindow: NSWindow {
    /// Colour of the tint laid over the desktop; its alpha is the `--opacity`.
    static let tintColor = NSColor(calibratedRed: 0.06, green: 0.06, blue: 0.07, alpha: 1)

    /// Hosts the content on top of an optionally blurred, tinted backdrop.
    let backdrop: NSView

    init(screen: NSScreen, opacity: CGFloat, blur: Bool) {
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
        // Stay on the current Space with other normal windows so ⌘-Tab and
        // Mission Control behave as usual.
        collectionBehavior = [.fullScreenNone, .moveToActiveSpace]
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
