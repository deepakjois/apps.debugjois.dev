import Foundation

/// Parsed command-line options. See `usage` for the flags.
/// FILE may be `-` to read from standard input.
struct Options {
    var path: String
    /// Font family override; nil means the built-in preference list is used.
    var fontName: String?
    /// Body text size in points.
    var fontSize: CGFloat = 20
    /// Whether to join hard-wrapped lines into flowing paragraphs.
    var reflow = true
    /// Opacity of the dark backdrop tint, 0 (clear) to 1 (solid).
    var opacity: CGFloat = 0.80
    /// Whether to blur what is behind the window.
    var blur = true

    static let usage = """
        usage: mac-reader [options] FILE

          FILE            text file to display, or '-' to read standard input
          --font NAME     font family (default: New York, falling back to Charter, Georgia)
          --size POINTS   body text size in points (default: 20)
          --opacity N     backdrop opacity from 0 to 1 (default: 0.8)
          --no-blur       do not blur what is behind the window
          --no-reflow     keep the file's own line breaks instead of reflowing
                          hard-wrapped paragraphs

        Press Escape, ⌘W or ⌘Q to close.
        """

    /// Parses `args` (excluding the program name). Returns nil, after
    /// printing a message to stderr, when the arguments are invalid.
    static func parse(_ args: [String]) -> Options? {
        var fontName: String?
        var fontSize: CGFloat = 20
        var reflow = true
        var opacity: CGFloat = 0.80
        var blur = true
        var path: String?

        var it = args.makeIterator()
        while let arg = it.next() {
            switch arg {
            case "-h", "--help":
                print(usage)
                exit(0)
            case "--font":
                guard let v = it.next() else { return fail("--font requires a value") }
                fontName = v
            case "--size":
                guard let v = it.next(), let n = Double(v), n > 0 else {
                    return fail("--size requires a positive number")
                }
                fontSize = CGFloat(n)
            case "--opacity":
                guard let v = it.next(), let n = Double(v), (0...1).contains(n) else {
                    return fail("--opacity requires a number between 0 and 1")
                }
                opacity = CGFloat(n)
            case "--no-blur":
                blur = false
            case "--no-reflow":
                reflow = false
            case "-":
                path = arg
            default:
                if arg.hasPrefix("-") { return fail("unknown option \(arg)") }
                if path != nil { return fail("only one file may be given") }
                path = arg
            }
        }

        guard let path else { return fail("no file given") }
        return Options(
            path: path, fontName: fontName, fontSize: fontSize, reflow: reflow,
            opacity: opacity, blur: blur)
    }

    private static func fail(_ message: String) -> Options? {
        FileHandle.standardError.write("mac-reader: \(message)\n\n\(usage)\n".data(using: .utf8)!)
        return nil
    }
}
