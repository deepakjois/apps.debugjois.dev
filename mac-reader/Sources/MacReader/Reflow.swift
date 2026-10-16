import Foundation

/// Joins hard-wrapped lines into flowing paragraphs so that text wrapped at
/// 72/80 columns in an editor reads naturally in a proportional column.
///
/// Heuristic: a file is treated as hard-wrapped when it contains at least one
/// blank-line-separated block of two or more lines and no non-blank line is
/// longer than `maxWrappedWidth`. Within a block, consecutive lines are joined
/// with a space, except that lines which look structural (indented, list
/// items, headings, rules, quotes) keep their own line break.
enum Reflow {
    static let maxWrappedWidth = 120

    static func reflow(_ text: String) -> String {
        let normalized = text.replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
        let lines = normalized.split(separator: "\n", omittingEmptySubsequences: false)
            .map(String.init)

        guard looksHardWrapped(lines) else { return normalized }

        var out: [String] = []
        var paragraph: [String] = []

        // Flush the accumulated paragraph as one joined line.
        func flush() {
            if !paragraph.isEmpty {
                out.append(paragraph.joined(separator: " "))
                paragraph.removeAll()
            }
        }

        for line in lines {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.isEmpty {
                flush()
                out.append("")
            } else if isStructural(line) {
                flush()
                out.append(line.trimmingTrailingWhitespace())
            } else {
                paragraph.append(trimmed)
            }
        }
        flush()
        return out.joined(separator: "\n")
    }

    /// True when the file has multi-line blocks and nothing wider than an
    /// editor would have wrapped at.
    static func looksHardWrapped(_ lines: [String]) -> Bool {
        var runLength = 0
        var sawMultiLineBlock = false
        for line in lines {
            if line.trimmingCharacters(in: .whitespaces).isEmpty {
                runLength = 0
                continue
            }
            if line.count > maxWrappedWidth { return false }
            runLength += 1
            if runLength >= 2 && !isStructural(line) { sawMultiLineBlock = true }
        }
        return sawMultiLineBlock
    }

    /// Lines whose own break should be preserved: indented/code, list items,
    /// Markdown-ish headings, horizontal rules, block quotes, tables.
    static func isStructural(_ line: String) -> Bool {
        if line.hasPrefix(" ") || line.hasPrefix("\t") { return true }
        let t = line.trimmingCharacters(in: .whitespaces)
        if t.hasPrefix("#") || t.hasPrefix(">") || t.hasPrefix("|") { return true }
        if t.hasPrefix("- ") || t.hasPrefix("* ") || t.hasPrefix("• ") || t.hasPrefix("+ ") {
            return true
        }
        if t.allSatisfy({ "-=*_~".contains($0) }) && t.count >= 3 { return true }
        // Numbered list: "1. ", "12) "
        var digits = 0
        for c in t {
            if c.isNumber {
                digits += 1
                continue
            }
            if digits > 0 && (c == "." || c == ")") { return true }
            break
        }
        return false
    }
}

extension String {
    fileprivate func trimmingTrailingWhitespace() -> String {
        var s = Substring(self)
        while let last = s.last, last.isWhitespace { s.removeLast() }
        return String(s)
    }
}
