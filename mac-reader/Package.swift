// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "mac-reader",
    platforms: [.macOS(.v14)],
    products: [
        // The command-line launcher and the app are one binary.
        .executable(name: "mac-reader", targets: ["MacReader"])
    ],
    targets: [
        .executableTarget(name: "MacReader")
    ]
)
