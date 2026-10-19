import Foundation
import ReaderCore
import Testing

/// A span as its role and the exact source text it covers, so fixtures read like Markdown.
struct Paint: Equatable, Sendable, CustomStringConvertible {
    let role: MarkdownRole
    let text: String
    init(_ role: MarkdownRole, _ text: String) { (self.role, self.text) = (role, text) }
    var description: String { "\(role) \(text.debugDescription)" }
}

/// One input and the exact paint list it must produce, in order.
struct Fixture: Sendable, CustomTestStringConvertible {
    let name: String
    let source: String
    let paints: [Paint]
    init(_ name: String, _ source: String, _ paints: [Paint]) {
        (self.name, self.source, self.paints) = (name, source, paints)
    }
    var testDescription: String { name }
}

func paints(_ source: String) -> [Paint] {
    MarkdownSpan.spans(in: source).map {
        Paint($0.role, (source as NSString).substring(with: $0.range))
    }
}

private func d(_ text: String) -> Paint { Paint(.delimiter, text) }

let fixtures: [Fixture] = [
    Fixture("prose", "Just words.\n", []),
    Fixture("emphasis", "a *b* c", [Paint(.emphasis, "*b*"), d("*"), d("*")]),
    Fixture(
        "strong around emphasis", "**a *b* c**",
        [
            Paint(.strong, "**a *b* c**"), Paint(.emphasis, "*b*"), d("*"), d("*"), d("**"),
            d("**"),
        ]),
    Fixture(
        "underscores", "_a_ __b__",
        [Paint(.emphasis, "_a_"), d("_"), d("_"), Paint(.strong, "__b__"), d("__"), d("__")]),
    Fixture("strikethrough", "~~gone~~", [Paint(.strikethrough, "~~gone~~"), d("~~"), d("~~")]),
    Fixture(
        "code spans", "use `x` and ``a ` b``",
        [
            Paint(.inlineCode, "`x`"), d("`"), d("`"), Paint(.inlineCode, "``a ` b``"), d("``"),
            d("``"),
        ]),
    Fixture(
        "inline link", "see [link](http://x.y) end",
        [
            Paint(.link, "[link](http://x.y)"), d("["), d("]("),
            Paint(.linkDestination, "http://x.y"), d(")"),
        ]),
    Fixture(
        "emphasis in link text", "[*a*](u)",
        [
            Paint(.link, "[*a*](u)"), Paint(.emphasis, "*a*"), d("*"), d("*"), d("["), d("]("),
            Paint(.linkDestination, "u"), d(")"),
        ]),
    Fixture(
        "reference link, autolink", "[a][r] <http://x.y>\n\n[r]: http://z\n",
        [
            Paint(.link, "[a][r]"), d("["), d("][r]"), Paint(.link, "<http://x.y>"), d("<"),
            d(">"),
        ]),
    Fixture(
        "image", "![alt](a.png)",
        [
            Paint(.link, "![alt](a.png)"), d("!["), d("]("), Paint(.linkDestination, "a.png"),
            d(")"),
        ]),
    Fixture(
        "ATX heading, closing hashes", "## Title ##\n",
        [Paint(.heading(level: 2), "## Title"), d("## ")]),
    Fixture(
        "heading with emphasis", "# A *b*",
        [Paint(.heading(level: 1), "# A *b*"), Paint(.emphasis, "*b*"), d("*"), d("*"), d("# ")]),
    Fixture("empty heading", "#\n", [Paint(.heading(level: 1), "#"), d("#")]),
    Fixture(
        "setext then text (clamp)", "Title\n=====\nNext\n",
        [Paint(.heading(level: 1), "Title\n====="), d("=====")]),
    Fixture(
        "setext then blank", "Title\n---\n\nNext\n",
        [Paint(.heading(level: 2), "Title\n---"), d("---")]),
    Fixture("bullet list", "- one\n- two\n", [Paint(.listMarker, "- "), Paint(.listMarker, "- ")]),
    Fixture(
        "ordered list", "1. a\n10. b\n", [Paint(.listMarker, "1. "), Paint(.listMarker, "10. ")]),
    Fixture("task list", "- [ ] task\n", [Paint(.listMarker, "- [ ] ")]),
    Fixture(
        "block quote", "> a\n> b *c*",
        [
            Paint(.blockQuote, "> a\n> b *c*"), Paint(.emphasis, "*c*"), d("*"), d("*"), d(">"),
            d(">"),
        ]),
    Fixture(
        "nested quote", "> > a",
        [Paint(.blockQuote, "> > a"), Paint(.blockQuote, "> a"), d(">"), d("> >")]),
    Fixture(
        "lazy quote line (guard)", "> a\nlazy *x*", [Paint(.blockQuote, "> a\nlazy *x*"), d(">")]),
    Fixture(
        "fenced code", "```swift\nlet x = 1\n```\n",
        [Paint(.codeBlock, "```swift\nlet x = 1\n```"), d("```swift"), d("```")]),
    Fixture("unclosed fence", "~~~\ncode", [Paint(.codeBlock, "~~~\ncode"), d("~~~")]),
    Fixture(
        "fence inside quote", "> ```\n> x\n> ```",
        [
            Paint(.blockQuote, "> ```\n> x\n> ```"), Paint(.codeBlock, "```\n> x\n> ```"), d("```"),
            d("> ```"), d(">"), d(">"), d(">"),
        ]),
    Fixture(
        "unclosed fence in quote (clip)", "> ```\n> x\nAfter\n",
        [Paint(.blockQuote, "> ```\n> x"), Paint(.codeBlock, "```\n> x"), d("```"), d(">"), d(">")]
    ),
    Fixture("indented code", "    let x = 1\n", [Paint(.codeBlock, "let x = 1")]),
    Fixture("trailing newline trim", "    code\n", [Paint(.codeBlock, "code")]),
    Fixture("thematic break", "a\n\n***\n", [Paint(.thematicBreak, "***")]),
    Fixture(
        "issue 205, lazy list line", "- lazy continuation\nwith *lazy* emphasis\n",
        [Paint(.listMarker, "- ")]),
    Fixture(
        "indented continuation", "- item\n  with *emph*\n",
        [Paint(.emphasis, "*emph*"), d("*"), d("*"), Paint(.listMarker, "- ")]),
    Fixture("over-indented continuation (guard)", "a\n   b *c*", []),
    Fixture(
        "CRLF", "# T\r\n\r\n*x*\r\n",
        [Paint(.heading(level: 1), "# T"), d("# "), Paint(.emphasis, "*x*"), d("*"), d("*")]),
    Fixture(
        "table", "| a | *b* |\n|---|---|\n| c | d |\n", [Paint(.emphasis, "*b*"), d("*"), d("*")]),
]

@Test(arguments: fixtures) func spansStayInsideTheSource(_ f: Fixture) {
    let length = (f.source as NSString).length
    for span in MarkdownSpan.spans(in: f.source) {
        #expect(span.range.length > 0)
        #expect(NSMaxRange(span.range) <= length)
    }
}

@Test(arguments: fixtures) func paintList(_ f: Fixture) {
    #expect(paints(f.source) == f.paints)
}

@Test func utf8ColumnsBecomeUTF16Ranges() {
    #expect(MarkdownSpan.spans(in: "é 🎉 *x*").first?.range == NSRange(location: 5, length: 3))
    #expect(MarkdownSpan.spans(in: "e\u{301} *x*").first?.range.location == 3)
}

@Test func nestedListMarkers() {
    let spans = MarkdownSpan.spans(in: "- a\n  - b\n")
    #expect(spans.map(\.role) == [.listMarker, .listMarker])
    #expect(spans.map(\.range.location) == [6, 0])
}

@Test(arguments: [
    "\0*a*", "a\rb *c*", "-\tx\n\t*y*", "*", "[a", "`",
    String(repeating: "> ", count: 200) + "deep",
])
func hostileInputsDoNotTrap(_ source: String) {
    let length = (source as NSString).length
    for span in MarkdownSpan.spans(in: source) {
        #expect(span.range.location >= 0)
        #expect(NSMaxRange(span.range) <= length)
    }
}
