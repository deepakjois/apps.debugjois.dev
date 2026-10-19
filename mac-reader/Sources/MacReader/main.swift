import AppKit

// Entry point. Parse arguments and load the file before touching AppKit so
// that errors surface on the terminal instead of in a half-launched app.

guard let options = Options.parse(Array(CommandLine.arguments.dropFirst())) else {
    exit(64)  // EX_USAGE
}

let text: String
do {
    text = try TextLoader.load(options.path)
} catch {
    FileHandle.standardError.write("mac-reader: \(error)\n".data(using: .utf8)!)
    exit(66)  // EX_NOINPUT
}

let app = NSApplication.shared
// Regular policy so the app can become active and own key focus when
// launched from a terminal; the Dock icon is hidden by presentation options.
app.setActivationPolicy(.regular)
let delegate = AppDelegate(text: text, options: options)
app.delegate = delegate
app.run()
