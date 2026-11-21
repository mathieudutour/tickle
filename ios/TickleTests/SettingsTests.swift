import XCTest
@testable import Tickle

/// Pasted invitation links are read as the web app reads them (`keyFromLink` in src/components/Sharing.tsx).
final class SettingsTests: XCTestCase {
  func testAnInvitationLinkOrAKeyGivesTheKey() {
    let key = "AbCdEfGhIjKlMnOpQrSt_-12"
    XCTAssertEqual(inviteKey(from: "https://tickle.example/#rejoindre=\(key)"), key)
    XCTAssertEqual(inviteKey(from: "Rejoins mes listes sur Tickle : https://tickle.example/#rejoindre=\(key) "), key)
    XCTAssertEqual(inviteKey(from: "  \(key)\n"), key)
    XCTAssertNil(inviteKey(from: "https://tickle.example/"))
    XCTAssertNil(inviteKey(from: "trop-court"))
  }
}
