import Foundation
import ReaderCore
import Testing

@Test func proseHasNoSpans() {
    #expect(MarkdownSpan.spans(in: "Just words.\n").isEmpty)
}
