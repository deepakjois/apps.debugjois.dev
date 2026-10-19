import Foundation
import Markdown

/// What a run of Markdown source is, independent of how it looks.
public enum MarkdownRole: Hashable, Sendable {
    /// A whole heading: `#` markers, closing `#`s and a setext underline included.
    case heading(level: Int)
    case emphasis
    case strong
    case strikethrough
    /// A code span, backticks included.
    case inlineCode
    /// A fenced or indented code block, fence lines included.
    case codeBlock
    /// A link, autolink or image, brackets and destination included.
    case link
    /// The destination between `](` and `)`.
    case linkDestination
    case blockQuote
    /// A list item's bullet or number and the space after it.
    case listMarker
    case thematicBreak
    /// Syntax characters: # * _ ~ ` [ ]( ) < > ![ and fence lines.
    case delimiter
}

/// One role over a range of the unchanged source.
public struct MarkdownSpan: Equatable, Sendable {
    public let role: MarkdownRole
    /// UTF-16 range into the source string, as NSAttributedString expects.
    public let range: NSRange

    /// Parses `source` and returns its spans in paint order: a node's role span precedes
    /// its children's spans, and its syntax spans (delimiters, list marker, link
    /// destination) follow them. Applied in sequence, later spans win where they overlap,
    /// so syntax always ends up dimmed. A node whose reported range does not spell its own
    /// syntax is skipped (swift-markdown issue 205); its children are still visited.
    public static func spans(in source: String) -> [MarkdownSpan] {
        let text = SourceText(source)
        var collector = SpanCollector(text: text)
        collector.visit(Document(parsing: source, options: [.disableSmartOpts]))
        return collector.spans
    }
}

/// The source as UTF-8 bytes plus a line table. swift-markdown reports (1-based line,
/// 1-based UTF-8 byte column); everything here works in byte offsets, which makes ASCII
/// delimiter arithmetic exact, and converts to UTF-16 only when a span is emitted.
private struct SourceText {
    /// The source, made native UTF-8 so byte-offset indexing is O(1) even when
    /// TextLoader returned a bridged NSString.
    let string: String
    /// `string.utf8`; delimiter checks compare these bytes directly.
    let bytes: [UInt8]
    /// Byte offset of each line's first byte. Lines end at "\n", "\r\n" or a lone "\r", as
    /// in cmark. Built from bytes, since Swift treats "\r\n" as one Character.
    let lineStarts: [Int]

    init(_ source: String) {
        var s = source
        s.makeContiguousUTF8()
        string = s
        bytes = Array(s.utf8)
        var starts = [0]
        for (i, b) in bytes.enumerated() {
            if b == 0x0A || (b == 0x0D && (i + 1 == bytes.count || bytes[i + 1] != 0x0A)) {
                starts.append(i + 1)
            }
        }
        lineStarts = starts
    }

    /// Byte offset of `loc`, or nil when the line does not exist, the column runs past the
    /// line's terminator, or the offset lands on a UTF-8 continuation byte. Misplaced ranges
    /// (issue 205) do all three; without this, index arithmetic would trap or split a scalar.
    func offset(_ loc: SourceLocation) -> Int? {
        guard loc.line >= 1, loc.line <= lineStarts.count, loc.column >= 1 else { return nil }
        let o = lineStarts[loc.line - 1] + loc.column - 1
        let nextLine = loc.line < lineStarts.count ? lineStarts[loc.line] : bytes.count
        guard o <= nextLine, o == bytes.count || bytes[o] & 0xC0 != 0x80 else { return nil }
        return o
    }

    /// Byte range of `node`; nil when it has no range or either end fails `offset`.
    func range(of node: Markup) -> Range<Int>? {
        guard let r = node.range, let lo = offset(r.lowerBound), let hi = offset(r.upperBound),
            lo <= hi
        else { return nil }
        return lo..<hi
    }

    /// First ranged child's start to last ranged child's end, or nil when no child has a
    /// valid range or the result is not inside `whole`. SoftBreak and LineBreak never have
    /// ranges. `whole` minus this is the node's own syntax.
    func contentRange(of node: Markup, in whole: Range<Int>) -> Range<Int>? {
        let ranges = node.children.compactMap { range(of: $0) }
        guard let lo = ranges.first?.lowerBound, let hi = ranges.last?.upperBound,
            whole.lowerBound <= lo, lo <= hi, hi <= whole.upperBound
        else { return nil }
        return lo..<hi
    }

    /// Index into `lineStarts` of the line containing byte `o`. A terminator belongs to the
    /// line it ends.
    private func lineIndex(containing o: Int) -> Int {
        var lo = 0
        var hi = lineStarts.count - 1
        while lo < hi {
            let mid = (lo + hi + 1) / 2
            if lineStarts[mid] <= o { lo = mid } else { hi = mid - 1 }
        }
        return lo
    }

    /// Line `i`, terminator excluded.
    private func lineRange(_ i: Int) -> Range<Int> {
        let next = i + 1 < lineStarts.count ? lineStarts[i + 1] : bytes.count
        return trimmingTerminator(lineStarts[i]..<next)
    }

    /// The line containing byte `o`, terminator excluded.
    func line(containing o: Int) -> Range<Int> { lineRange(lineIndex(containing: o)) }

    /// End (terminator excluded) of the line after the one containing `o`, or of `o`'s own
    /// line when it is the last.
    func endOfLine(after o: Int) -> Int {
        lineRange(min(lineIndex(containing: o) + 1, lineStarts.count - 1)).upperBound
    }

    /// `r.lowerBound`, then every line start strictly inside `r`.
    func lineStarts(in r: Range<Int>) -> [Int] {
        var result = [r.lowerBound]
        var i = lineIndex(containing: r.lowerBound) + 1
        while i < lineStarts.count, lineStarts[i] < r.upperBound {
            result.append(lineStarts[i])
            i += 1
        }
        return result
    }

    /// `r` without one trailing "\n", "\r\n" or "\r".
    func trimmingTerminator(_ r: Range<Int>) -> Range<Int> {
        var hi = r.upperBound
        if hi > r.lowerBound, bytes[hi - 1] == 0x0A { hi -= 1 }
        if hi > r.lowerBound, bytes[hi - 1] == 0x0D { hi -= 1 }
        return r.lowerBound..<hi
    }

    /// `r` split at newline bytes, empty pieces dropped.
    func linePieces(_ r: Range<Int>) -> [Range<Int>] {
        var pieces: [Range<Int>] = []
        var start = r.lowerBound
        for i in r where bytes[i] == 0x0A || bytes[i] == 0x0D {
            if i > start { pieces.append(start..<i) }
            start = i + 1
        }
        if r.upperBound > start { pieces.append(start..<r.upperBound) }
        return pieces
    }

    func spells(_ r: Range<Int>, _ syntax: String) -> Bool { bytes[r].elementsEqual(syntax.utf8) }
    func starts(_ r: Range<Int>, with s: String) -> Bool { bytes[r].starts(with: s.utf8) }
    func ends(_ r: Range<Int>, with s: String) -> Bool {
        bytes[r].reversed().starts(with: s.utf8.reversed())
    }
    /// True when every byte of `r` is one of `allowed` (vacuously true when empty).
    func consists(_ r: Range<Int>, of allowed: String) -> Bool {
        bytes[r].allSatisfy { allowed.utf8.contains($0) }
    }
    /// Length of the run of bytes from `allowed` starting at `r.lowerBound`.
    func run(in r: Range<Int>, of allowed: String) -> Int {
        bytes[r].prefix { allowed.utf8.contains($0) }.count
    }

    /// UTF-16 range for a byte range whose ends passed `offset`.
    func nsRange(_ r: Range<Int>) -> NSRange {
        let u = string.utf8
        let lo = u.index(u.startIndex, offsetBy: r.lowerBound)
        let hi = u.index(u.startIndex, offsetBy: r.upperBound)
        return NSRange(lo..<hi, in: string)
    }
}

/// Walks the parsed document once and appends spans in paint order. Every syntax range it
/// paints is either `range(of:)` minus `contentRange(of:in:)` or scanned from the bytes, and
/// is checked against the syntax it must spell before it is used. That check is the
/// issue-205 guard.
private struct SpanCollector: MarkupWalker {
    let text: SourceText
    /// The paint list being built.
    var spans: [MarkdownSpan] = []
    /// Byte ranges of the enclosing nodes, innermost last. A node's range is clipped to the
    /// top entry: cmark reports a fenced block closed by its container as running on into
    /// the next paragraph, while the container's own range is exact.
    private var enclosing: [Range<Int>]

    init(text: SourceText) {
        self.text = text
        enclosing = [0..<text.bytes.count]
    }

    /// `node`'s byte range clipped to its parent's; nil when it has none or lies outside.
    private func range(of node: Markup) -> Range<Int>? {
        guard let r = text.range(of: node), let outer = enclosing.last else { return nil }
        let lo = max(r.lowerBound, outer.lowerBound)
        let hi = min(r.upperBound, outer.upperBound)
        return lo <= hi ? lo..<hi : nil
    }

    /// Visits `node`'s children with `whole` as their clipping bound.
    private mutating func descend(_ node: Markup, within whole: Range<Int>) {
        enclosing.append(whole)
        descendInto(node)
        enclosing.removeLast()
    }

    mutating func defaultVisit(_ markup: Markup) {
        guard let whole = range(of: markup) else { return descendInto(markup) }
        descend(markup, within: whole)
    }

    mutating func visitEmphasis(_ node: Emphasis) { symmetric(node, .emphasis, ["*", "_"]) }
    mutating func visitStrong(_ node: Strong) { symmetric(node, .strong, ["**", "__"]) }
    mutating func visitStrikethrough(_ node: Strikethrough) {
        symmetric(node, .strikethrough, ["~", "~~"])
    }
    mutating func visitLink(_ node: Link) { linkLike(node, openers: ["[", "<"]) }
    mutating func visitImage(_ node: Image) { linkLike(node, openers: ["!["]) }

    /// Emphasis, strong, strikethrough: the bytes before and after the content must be the
    /// same delimiter, one of `delimiters`. If not, the range is misplaced, so only the
    /// children are visited.
    private mutating func symmetric(_ node: Markup, _ role: MarkdownRole, _ delimiters: [String]) {
        guard let whole = range(of: node), let inner = text.contentRange(of: node, in: whole),
            let d = delimiters.first(where: { text.spells(whole.lowerBound..<inner.lowerBound, $0) }
            ),
            text.spells(inner.upperBound..<whole.upperBound, d)
        else { return descendInto(node) }
        paint(role, whole)
        descend(node, within: whole)
        paint(.delimiter, whole.lowerBound..<inner.lowerBound)
        paint(.delimiter, inner.upperBound..<whole.upperBound)
    }

    /// Links and images. Head: `[`, `<` or `![`. Tail: `](dest)`, `]`, `][ref]`, or `>` for
    /// an autolink. A head that is not an opener, or a tail that does not close it, means
    /// the range is misplaced.
    private mutating func linkLike(_ node: Markup, openers: [String]) {
        guard let whole = range(of: node), let inner = text.contentRange(of: node, in: whole)
        else { return descendInto(node) }
        let head = whole.lowerBound..<inner.lowerBound
        let tail = inner.upperBound..<whole.upperBound
        let autolink = text.spells(head, "<")
        guard openers.contains(where: { text.spells(head, $0) }),
            autolink ? text.spells(tail, ">") : text.starts(tail, with: "]")
        else { return descendInto(node) }
        paint(.link, whole)
        descend(node, within: whole)
        paint(.delimiter, head)
        if tail.count >= 3, text.starts(tail, with: "]("), text.ends(tail, with: ")") {
            paint(.delimiter, tail.lowerBound..<tail.lowerBound + 2)
            paint(.linkDestination, tail.lowerBound + 2..<tail.upperBound - 1)
            paint(.delimiter, tail.upperBound - 1..<tail.upperBound)
        } else {
            paint(.delimiter, tail)
        }
    }

    mutating func visitInlineCode(_ node: InlineCode) {
        // A code span's range is widened by its backtick count, so both ends must be a run
        // of n backticks, or the range is misplaced.
        guard let whole = range(of: node) else { return }
        let n = text.run(in: whole, of: "`")
        guard n > 0, 2 * n < whole.count,
            text.consists(whole.upperBound - n..<whole.upperBound, of: "`")
        else { return }
        paint(.inlineCode, whole)
        paint(.delimiter, whole.lowerBound..<whole.lowerBound + n)
        paint(.delimiter, whole.upperBound - n..<whole.upperBound)
    }

    mutating func visitHeading(_ node: Heading) {
        guard var whole = range(of: node) else { return descendInto(node) }
        let content = text.contentRange(of: node, in: whole)
        if let content {
            // cmark finalizes a setext heading while reading the line after its underline
            // and reports that line's end as the heading's end, so "Title\n===\nNext" would
            // swallow "Next". No heading ends past the line after its content.
            whole =
                whole.lowerBound..<min(whole.upperBound, text.endOfLine(after: content.upperBound))
        }
        paint(.heading(level: node.level), whole)
        descend(node, within: whole)
        let inner = content ?? whole.upperBound..<whole.upperBound
        for syntax in [whole.lowerBound..<inner.lowerBound, inner.upperBound..<whole.upperBound]
        where text.consists(syntax, of: "#=->\t\r\n ") {
            paint(.delimiter, syntax)
        }
    }

    mutating func visitListItem(_ node: ListItem) {
        guard let whole = range(of: node) else { return descendInto(node) }
        descend(node, within: whole)
        // The marker is whatever precedes the item's first block on its first line ("- ",
        // "10. ").
        let firstLineEnd = text.line(containing: whole.lowerBound).upperBound
        let contentStart = text.contentRange(of: node, in: whole)?.lowerBound ?? firstLineEnd
        paint(.listMarker, whole.lowerBound..<min(contentStart, firstLineEnd))
    }

    mutating func visitBlockQuote(_ node: BlockQuote) {
        guard let whole = range(of: node) else { return descendInto(node) }
        paint(.blockQuote, whole)
        descend(node, within: whole)
        // A Paragraph inside a quote covers the "> " of its later lines, so markers can't be
        // node-minus-children. Each line's marker is its leading run of spaces, tabs and ">",
        // up to the last ">". Lazy lines have none.
        for start in text.lineStarts(in: whole) {
            let prefix = start..<start + text.run(in: start..<whole.upperBound, of: " \t>")
            if let last = text.bytes[prefix].lastIndex(of: UInt8(ascii: ">")) {
                paint(.delimiter, start..<last + 1)
            }
        }
    }

    mutating func visitCodeBlock(_ node: CodeBlock) {
        guard let whole = range(of: node), !whole.isEmpty else { return }
        paint(.codeBlock, whole)
        // Fenced blocks: dim the opening fence line (info string included) and the closing
        // fence line if there is one. Indented blocks start at their first code byte, so the
        // fence test fails and nothing is dimmed.
        let opening =
            whole
            .lowerBound..<min(text.line(containing: whole.lowerBound).upperBound, whole.upperBound)
        let indent = text.run(in: opening, of: " ")
        let fenceStart = opening.lowerBound + indent
        let fence = text.run(in: fenceStart..<opening.upperBound, of: "`~")
        guard indent <= 3, fence >= 3 else { return }
        paint(.delimiter, opening)
        let fenceChar = String(UnicodeScalar(text.bytes[fenceStart]))
        var last = text.line(containing: whole.upperBound - 1)
        last = last.lowerBound..<min(last.upperBound, whole.upperBound)
        guard last.lowerBound > opening.lowerBound else { return }
        let afterPrefix = last.lowerBound + text.run(in: last, of: " \t>")
        let closing = text.run(in: afterPrefix..<last.upperBound, of: fenceChar)
        if closing >= fence, text.consists(afterPrefix + closing..<last.upperBound, of: " \t") {
            paint(.delimiter, last)
        }
    }

    mutating func visitThematicBreak(_ node: ThematicBreak) {
        if let whole = range(of: node) { paint(.thematicBreak, whole) }
    }

    /// Role spans lose one trailing line terminator (cmark includes it for some blocks and
    /// not others); delimiter spans never cross a line.
    private mutating func paint(_ role: MarkdownRole, _ r: Range<Int>) {
        let pieces = role == .delimiter ? text.linePieces(r) : [text.trimmingTerminator(r)]
        for piece in pieces where !piece.isEmpty {
            spans.append(MarkdownSpan(role: role, range: text.nsRange(piece)))
        }
    }
}
