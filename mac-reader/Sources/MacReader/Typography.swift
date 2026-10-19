import AppKit
import ReaderCore

/// Builds the font and paragraph attributes for the reading column.
enum Typography {
    /// Measure (column width) in points. ~65–70 characters at 20pt serif,
    /// which is the classic comfortable line length for continuous reading.
    static let measure: CGFloat = 660

    /// Fallbacks tried in order if the system serif (New York) is unavailable.
    /// Charter and Georgia ship with macOS and are excellent screen serifs.
    static let preferredFamilies = ["Charter", "Georgia", "Palatino"]

    static func bodyFont(name: String?, size: CGFloat) -> NSFont {
        if let name {
            if let f = NSFont(name: name, size: size) { return f }
            // Allow a family name like "Baskerville" as well as a face name.
            if let f = NSFontManager.shared.font(
                withFamily: name, traits: [], weight: 5, size: size)
            {
                return f
            }
            FileHandle.standardError.write(
                "mac-reader: font \(name) not found, using default\n".data(using: .utf8)!)
        }
        // New York: the system serif design, only reachable through a
        // descriptor. Its family name is private (".AppleSystemUIFontSerif"),
        // so detect success by checking we did not get the sans back.
        let sans = NSFont.systemFont(ofSize: size)
        if let serif = sans.fontDescriptor.withDesign(.serif),
            let f = NSFont(descriptor: serif, size: size), f.fontName != sans.fontName
        {
            return f
        }
        for family in preferredFamilies {
            if let f = NSFont(name: family, size: size) { return f }
            if let f = NSFontManager.shared.font(
                withFamily: family, traits: [], weight: 5, size: size)
            {
                return f
            }
        }
        return NSFont.systemFont(ofSize: size)
    }

    /// Line height as a multiple of the point size. 1.5× reads well at this measure.
    static let leading: CGFloat = 1.5

    /// Text colour: light on dark, but not pure white, to keep contrast comfortable.
    static let ink = NSColor(calibratedWhite: 0.86, alpha: 1.0)

    /// Paragraph style with the line height pinned (min == max) to `height`.
    static func lineStyle(height: CGFloat) -> NSParagraphStyle {
        let style = NSMutableParagraphStyle()
        style.alignment = .natural
        style.minimumLineHeight = height
        style.maximumLineHeight = height
        style.paragraphSpacing = 0
        style.hyphenationFactor = 0
        style.lineBreakMode = .byWordWrapping
        return style
    }

    /// Pinned line height of body text set in `font`.
    private static func bodyLineHeight(_ font: NSFont) -> CGFloat {
        (font.pointSize * leading).rounded()
    }

    /// Attributes for body text. Paragraph spacing is deliberately zero: the
    /// gap between paragraphs comes from the file's own blank lines, which
    /// `styled(_:font:)` shrinks to a fraction of a line. That keeps verse and
    /// code (single newlines) tight while prose paragraphs still breathe.
    static func bodyAttributes(font: NSFont) -> [NSAttributedString.Key: Any] {
        [
            .font: font,
            .paragraphStyle: lineStyle(height: bodyLineHeight(font)),
            .foregroundColor: ink,
            .ligature: 1,
            .kern: 0,
        ]
    }

    /// Attributes for an empty line: a spacer about 0.6 of a text line tall.
    static func blankLineAttributes(font: NSFont) -> [NSAttributedString.Key: Any] {
        var attrs = bodyAttributes(font: font)
        attrs[.paragraphStyle] = lineStyle(height: (font.pointSize * leading * 0.6).rounded())
        return attrs
    }

    /// The attributed document for the reading column.
    static func document(_ text: String, mode: TextMode, font: NSFont) -> NSAttributedString {
        switch mode {
        case .plain(let reflow): return styled(reflow ? Reflow.reflow(text) : text, font: font)
        case .markdown: return markdown(text, font: font)
        }
    }

    /// Applies body styling to `text`, with blank lines turned into spacers.
    private static func styled(_ text: String, font: NSFont) -> NSAttributedString {
        let result = NSMutableAttributedString(string: text, attributes: bodyAttributes(font: font))
        let blank = blankLineAttributes(font: font)
        let ns = text as NSString
        ns.enumerateSubstrings(in: NSRange(location: 0, length: ns.length), options: .byParagraphs)
        {
            substring, _, enclosingRange, _ in
            if substring?.trimmingCharacters(in: .whitespaces).isEmpty == true {
                result.setAttributes(blank, range: enclosingRange)
            }
        }
        return result
    }

    // MARK: Markdown

    /// Monospace size as a fraction of the surrounding text's size.
    static let codeScale: CGFloat = 0.88

    /// Heading size as a multiple of the body size, by level; other levels stay at 1.
    private static let headingScales: [Int: CGFloat] = [1: 1.5, 2: 1.3, 3: 1.15]

    /// What one role does to the attributes already on its range. Colours replace. The
    /// font fields are deltas applied to each existing font run, so nested roles compose:
    /// italic inside a heading stays heading-sized and bold, and code inside a heading
    /// scales from the heading size.
    private struct Look {
        var color: NSColor
        var background: NSColor? = nil
        var strikethrough = false
        var fontScale: CGFloat = 1
        var traits: NSFontDescriptor.SymbolicTraits = []
        var monospace = false
        /// Pinned line height for the span's whole paragraph (headings and code blocks).
        var lineHeight: CGFloat? = nil

        var changesFont: Bool { fontScale != 1 || !traits.isEmpty || monospace }
    }

    /// The theme table. Exhaustive, so a new role fails the build until it has a look.
    private static func look(for role: MarkdownRole, body: NSFont) -> Look {
        switch role {
        case .heading(let level):
            let scale = headingScales[level] ?? 1
            return Look(
                color: rgb(0.96, 0.82, 0.60), fontScale: scale, traits: .bold,
                lineHeight: (body.pointSize * scale * leading).rounded())
        case .emphasis: return Look(color: rgb(0.86, 0.80, 0.96), traits: .italic)
        case .strong: return Look(color: rgb(0.97, 0.97, 0.97), traits: .bold)
        case .strikethrough: return Look(color: rgb(0.60, 0.60, 0.60), strikethrough: true)
        case .inlineCode, .codeBlock:
            // Blank lines inside a code block are content, so its paragraphs take the
            // body height instead of the 0.6 spacer.
            return Look(
                color: rgb(0.66, 0.87, 0.70), background: NSColor(calibratedWhite: 1, alpha: 0.06),
                fontScale: codeScale, monospace: true,
                lineHeight: role == .codeBlock ? bodyLineHeight(body) : nil)
        case .link: return Look(color: rgb(0.53, 0.75, 1.00))
        case .linkDestination: return Look(color: rgb(0.45, 0.58, 0.76))
        case .blockQuote: return Look(color: rgb(0.70, 0.76, 0.82))
        case .listMarker: return Look(color: rgb(0.95, 0.68, 0.42))
        case .thematicBreak: return Look(color: rgb(0.45, 0.45, 0.45))
        case .delimiter: return Look(color: ink.withAlphaComponent(0.38))
        }
    }

    /// Markdown source verbatim: plain body styling, then every span painted in order.
    /// The result's string is `text`; only attributes are added.
    private static func markdown(_ text: String, font: NSFont) -> NSAttributedString {
        let result = NSMutableAttributedString(attributedString: styled(text, font: font))
        let ns = text as NSString
        for span in MarkdownSpan.spans(in: text) {
            let look = look(for: span.role, body: font)
            result.addAttribute(.foregroundColor, value: look.color, range: span.range)
            if let background = look.background {
                result.addAttribute(.backgroundColor, value: background, range: span.range)
            }
            if look.strikethrough {
                result.addAttribute(
                    .strikethroughStyle, value: NSUnderlineStyle.single.rawValue, range: span.range)
            }
            if look.changesFont {
                result.enumerateAttribute(.font, in: span.range) { value, run, _ in
                    if let current = value as? NSFont {
                        result.addAttribute(.font, value: apply(look, to: current), range: run)
                    }
                }
            }
            if let height = look.lineHeight {
                // Body paragraphs pin min == max, so a larger font under the body's height
                // would collide with the line above. The whole paragraph gets its own height.
                result.addAttribute(
                    .paragraphStyle, value: lineStyle(height: height),
                    range: ns.paragraphRange(for: span.range))
            }
        }
        return result
    }

    private static func apply(_ look: Look, to font: NSFont) -> NSFont {
        var result = font
        if look.fontScale != 1 {
            result =
                NSFont(descriptor: result.fontDescriptor, size: result.pointSize * look.fontScale)
                ?? result
        }
        if !look.traits.isEmpty { result = adding(look.traits, to: result) }
        if look.monospace { result = monospaced(like: result) }
        return result
    }

    /// `font` with `traits` added via its descriptor (works for New York, whose family name
    /// is private); `font` itself when the face has no such variant.
    private static func adding(_ traits: NSFontDescriptor.SymbolicTraits, to font: NSFont)
        -> NSFont
    {
        let descriptor = font.fontDescriptor.withSymbolicTraits(
            font.fontDescriptor.symbolicTraits.union(traits))
        return NSFont(descriptor: descriptor, size: font.pointSize) ?? font
    }

    /// The monospaced system font at `font`'s size, keeping its bold and italic.
    private static func monospaced(like font: NSFont) -> NSFont {
        let traits = font.fontDescriptor.symbolicTraits
        let mono = NSFont.monospacedSystemFont(
            ofSize: font.pointSize, weight: traits.contains(.bold) ? .bold : .regular)
        return traits.contains(.italic) ? adding(.italic, to: mono) : mono
    }

    private static func rgb(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat) -> NSColor {
        NSColor(calibratedRed: r, green: g, blue: b, alpha: 1)
    }
}
