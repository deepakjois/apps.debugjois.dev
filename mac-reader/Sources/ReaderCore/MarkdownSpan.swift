import Foundation
import Markdown

/// What a run of Markdown source is, independent of how it looks.
/// `Typography` maps every case to attributes in one exhaustive switch.
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
    /// Syntax characters drawn dimmed: # * _ ~ ` [ ]( ) < > ![ and fence lines.
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
    /// so syntax always ends up dimmed.
    public static func spans(in source: String) -> [MarkdownSpan] {
        []
    }
}
