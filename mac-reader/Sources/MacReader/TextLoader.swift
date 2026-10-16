import Foundation

/// Reads the text to display from a file path or standard input,
/// detecting the encoding where it can.
enum TextLoader {
    enum LoadError: Error, CustomStringConvertible {
        case unreadable(String)
        case undecodable(String)

        var description: String {
            switch self {
            case .unreadable(let p): return "cannot read \(p)"
            case .undecodable(let p): return "cannot decode \(p) as text"
            }
        }
    }

    static func load(_ path: String) throws -> String {
        let data: Data
        if path == "-" {
            data = FileHandle.standardInput.readDataToEndOfFile()
        } else {
            guard let d = FileManager.default.contents(atPath: path) else {
                throw LoadError.unreadable(path)
            }
            data = d
        }

        // UTF-8 first (the overwhelmingly common case), then let Foundation
        // sniff for BOMs / legacy encodings, then a lossy Latin-1 fallback so
        // we always show *something* rather than failing on a stray byte.
        if let s = String(data: data, encoding: .utf8) { return s }
        var converted: NSString?
        var usedLossy: ObjCBool = false
        let rc = NSString.stringEncoding(
            for: data, encodingOptions: nil, convertedString: &converted,
            usedLossyConversion: &usedLossy)
        if rc != 0, let converted { return converted as String }
        if let s = String(data: data, encoding: .isoLatin1) { return s }
        throw LoadError.undecodable(path)
    }
}
