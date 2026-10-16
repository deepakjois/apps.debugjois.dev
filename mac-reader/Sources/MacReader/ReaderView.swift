import AppKit

/// Read-only text view that never scrolls itself to the (invisible) caret.
/// AppKit does that when a text view becomes first responder, which would
/// hide the top inset on launch; all scrolling here is driven by the user.
final class ReaderTextView: NSTextView {
    override func scrollRangeToVisible(_ range: NSRange) {}
}

/// A scroll view containing a single read-only text column centred on screen.
/// Owns the thin overlay scroller and all keyboard scrolling behaviour.
final class ReaderView: NSScrollView {
    let textView: ReaderTextView

    init(frame: NSRect, text: String, font: NSFont) {
        let container = NSTextContainer(
            size: NSSize(width: Typography.measure, height: CGFloat.greatestFiniteMagnitude))
        container.widthTracksTextView = false
        container.lineFragmentPadding = 0

        let layoutManager = NSLayoutManager()
        layoutManager.addTextContainer(container)
        let storage = NSTextStorage(attributedString: Typography.styled(text, font: font))
        storage.addLayoutManager(layoutManager)

        textView = ReaderTextView(frame: frame, textContainer: container)
        super.init(frame: frame)

        configureTextView()
        configureScrollView()
        documentView = textView
        layoutColumn()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("not supported") }

    private func configureTextView() {
        textView.isEditable = false
        textView.isSelectable = true
        textView.isRichText = false
        textView.drawsBackground = false
        textView.isVerticallyResizable = true
        textView.isHorizontallyResizable = false
        textView.autoresizingMask = [.width]
        textView.minSize = NSSize(width: 0, height: 0)
        textView.maxSize = NSSize(
            width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
        textView.usesFontPanel = false
        textView.allowsUndo = false
        textView.isAutomaticLinkDetectionEnabled = false
        textView.isAutomaticDataDetectionEnabled = false
        textView.selectedTextAttributes = [
            .backgroundColor: NSColor(calibratedWhite: 1.0, alpha: 0.18)
        ]
        textView.insertionPointColor = .clear
        textView.layoutManager?.usesFontLeading = false
        textView.setSelectedRange(NSRange(location: 0, length: 0))
    }

    /// Scrolls to the start of the document without animation.
    func scrollToTop() {
        contentView.scroll(to: .zero)
        reflectScrolledClipView(contentView)
    }

    private func configureScrollView() {
        drawsBackground = false
        hasVerticalScroller = true
        hasHorizontalScroller = false
        autohidesScrollers = true
        // Overlay scrollers are the thin, fade-away kind; the light knob
        // style is the one meant for dark content.
        scrollerStyle = .overlay
        scrollerKnobStyle = .light
        verticalScrollElasticity = .allowed
        horizontalScrollElasticity = .none
        borderType = .noBorder
        autoresizingMask = [.width, .height]
    }

    /// Centres the fixed-measure text container inside the view by padding the
    /// text view's inset. Vertical inset gives the first line some breathing
    /// room from the top of the screen.
    private func layoutColumn() {
        let width = bounds.width
        let measure = min(Typography.measure, width - 2 * 32)
        textView.textContainer?.containerSize = NSSize(
            width: measure, height: CGFloat.greatestFiniteMagnitude)
        let sideInset = max(32, (width - measure) / 2)
        let topInset = (bounds.height * 0.12).rounded()
        textView.textContainerInset = NSSize(width: sideInset, height: topInset)
    }

    override func resizeSubviews(withOldSize oldSize: NSSize) {
        super.resizeSubviews(withOldSize: oldSize)
        layoutColumn()
    }

    // MARK: Keyboard scrolling

    /// Handles reading-oriented keys. Returns true when the key was consumed.
    func handleKey(_ event: NSEvent) -> Bool {
        let clip = contentView
        let visible = clip.bounds
        let docHeight = textView.frame.height
        let maxY = max(0, docHeight - visible.height)
        let page = visible.height * 0.85
        // Scroll steps follow the body line height so single-step scrolling
        // moves exactly one line.
        let line = (textView.font?.pointSize ?? 20) * Typography.leading

        func scroll(to y: CGFloat) {
            let target = NSPoint(x: 0, y: min(max(0, y), maxY))
            NSAnimationContext.runAnimationGroup { ctx in
                ctx.duration = 0.18
                ctx.timingFunction = CAMediaTimingFunction(name: .easeOut)
                clip.animator().setBoundsOrigin(target)
                reflectScrolledClipView(clip)
            }
            flashScrollers()
        }

        let flags = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
        let chars = event.charactersIgnoringModifiers ?? ""

        switch (event.keyCode, chars) {
        case (49, _):  // space
            scroll(to: flags.contains(.shift) ? visible.minY - page : visible.minY + page)
        case (121, _), (_, "f"), (_, "d"):  // page down, f, d
            scroll(to: visible.minY + page)
        case (116, _), (_, "b"), (_, "u"):  // page up, b, u
            scroll(to: visible.minY - page)
        case (125, _), (_, "j"):  // down arrow, j
            scroll(to: visible.minY + (flags.contains(.command) ? maxY : line))
        case (126, _), (_, "k"):  // up arrow, k
            scroll(to: flags.contains(.command) ? 0 : visible.minY - line)
        case (115, _), (_, "g"):  // home, g
            scroll(to: 0)
        case (119, _), (_, "G"):  // end, G
            scroll(to: maxY)
        default:
            return false
        }
        return true
    }
}
