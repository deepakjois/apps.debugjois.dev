// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "mac-reader",
    platforms: [.macOS(.v14)],
    products: [
        // The command-line launcher and the app are one binary.
        .executable(name: "mac-reader", targets: ["MacReader"])
    ],
    dependencies: [
        .package(url: "https://github.com/swiftlang/swift-markdown.git", from: "0.9.0")
    ],
    targets: [
        .executableTarget(name: "MacReader", dependencies: ["ReaderCore"]),
        // AppKit-free logic (Markdown span extraction), separate so it can be unit tested.
        .target(
            name: "ReaderCore",
            dependencies: [.product(name: "Markdown", package: "swift-markdown")]),
        .testTarget(name: "ReaderCoreTests", dependencies: ["ReaderCore"]),
    ]
)
