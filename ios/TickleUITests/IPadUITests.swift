import XCTest

final class IPadUITests: XCTestCase {

  func testSelectionAndKeyboard() throws {
    guard UIDevice.current.userInterfaceIdiom == .pad else { throw XCTSkip("iPad only") }
    XCUIDevice.shared.orientation = .landscapeLeft
    let app = launchTickle(open: "list:rappels")
    XCTAssertTrue(element(app, "Appeler maman").waitForExistence(timeout: 5))
    // A tap selects (for the details beside the list) instead of editing in place.
    element(app, "Appeler maman").tap()
    XCTAssertTrue(app.textFields["Titre"].waitForExistence(timeout: 2), "its details open beside the list")
    XCTAssertEqual(app.textFields["Titre"].value as? String, "Appeler maman")
    screenshot("ipad")
    // ↓ then Space checks the next one.
    app.typeKey(.downArrow, modifierFlags: [])
    app.typeKey(" ", modifierFlags: [])
    XCTAssertTrue(element(app, "Fait : Acheter du pain").waitForExistence(timeout: 2))
    // ⌥↓ moves one within its section. « Acheter du pain » left once checked: ↑ goes on from where it was.
    app.typeKey(.upArrow, modifierFlags: [])
    app.typeKey(.downArrow, modifierFlags: .option)
    XCTAssertTrue(element(app, "Déplacé vers le bas").waitForExistence(timeout: 2))
    // Typing in a field keeps its keys: a space there doesn't check anything.
    // The list's own row: the sidebar has a « Nouveau rappel » button too.
    app.descendants(matching: .any).matching(identifier: "quick-add").firstMatch.tap()
    app.textFields["Nouveau rappel"].typeText("Lait et ")
    XCTAssertEqual(app.textFields["Nouveau rappel"].value as? String, "Lait et ")
    XCTAssertFalse(element(app, "Fait :").exists)
  }
}
