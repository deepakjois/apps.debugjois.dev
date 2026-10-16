import AppKit

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

    /// Attributes for body text. Paragraph spacing is deliberately zero: the
    /// gap between paragraphs comes from the file's own blank lines, which
    /// `styled(_:font:)` shrinks to a fraction of a line. That keeps verse and
    /// code (single newlines) tight while prose paragraphs still breathe.
    static func bodyAttributes(font: NSFont) -> [NSAttributedString.Key: Any] {
        let style = NSMutableParagraphStyle()
        style.alignment = .natural
        style.minimumLineHeight = (font.pointSize * leading).rounded()
        style.maximumLineHeight = style.minimumLineHeight
        style.paragraphSpacing = 0
        style.hyphenationFactor = 0
        style.lineBreakMode = .byWordWrapping

        return [
            .font: font,
            .paragraphStyle: style,
            .foregroundColor: ink,
            .ligature: 1,
            .kern: 0,
        ]
    }

    /// Attributes for an empty line: a spacer about 0.6 of a text line tall.
    static func blankLineAttributes(font: NSFont) -> [NSAttributedString.Key: Any] {
        var attrs = bodyAttributes(font: font)
        let style =
            (attrs[.paragraphStyle] as! NSParagraphStyle).mutableCopy() as! NSMutableParagraphStyle
        style.minimumLineHeight = (font.pointSize * leading * 0.6).rounded()
        style.maximumLineHeight = style.minimumLineHeight
        attrs[.paragraphStyle] = style
        return attrs
    }

    /// Applies body styling to `text`, with blank lines turned into spacers.
    static func styled(_ text: String, font: NSFont) -> NSAttributedString {
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
}
