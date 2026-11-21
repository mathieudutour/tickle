import XCTest

/// The list screens, used as a person would, on the space in seed.json.
final class ListUITests: XCTestCase {
  override func setUp() async throws {
    // On iPad a tap selects a reminder rather than editing it in place: IPadUITests covers it.
    guard await UIDevice.current.userInterfaceIdiom == .phone else { throw XCTSkip("iPhone only") }
  }




  func testListInteractions() throws {
    let app = launchTickle(open: "list:rappels")
    XCTAssertTrue(element(app, "Appeler maman").waitForExistence(timeout: 5))

    // Completing shows « Fait » with « Annuler », keeps the row a moment, then it leaves; Annuler brings it back.
    app.buttons["Terminer Appeler maman"].tap()
    XCTAssertTrue(element(app, "Fait : Appeler maman").waitForExistence(timeout: 2))
    XCTAssertTrue(app.buttons["Rouvrir Appeler maman"].exists, "lingers")
    screenshot("completed")
    sleep(3)
    XCTAssertFalse(app.buttons["Rouvrir Appeler maman"].exists, "left after a moment")
    app.buttons["Annuler"].tap()
    XCTAssertTrue(app.buttons["Terminer Appeler maman"].waitForExistence(timeout: 2))

    // Subtasks open from the counter.
    element(app, "1 sous-tâche").tap()
    XCTAssertTrue(element(app, "Faire la valise").waitForExistence(timeout: 2))

    // The menu shows completed reminders.
    app.buttons["Options de la liste"].tap()
    element(app, "Afficher les terminés").tap()
    XCTAssertTrue(element(app, "Lait").waitForExistence(timeout: 2))
    app.buttons["Options de la liste"].tap()
    element(app, "Masquer les terminés").tap()

    // Quick add understands French dates.
    element(app, "Nouveau rappel").tap()
    let field = app.textFields["Nouveau rappel"]
    XCTAssertTrue(field.waitForExistence(timeout: 2))
    field.typeText("Pain demain 9h")
    screenshot("quickadd")
    field.typeText("\n")
    XCTAssertTrue(element(app, "Pain").waitForExistence(timeout: 2))

    // Tapping a reminder edits it; Return goes on to a new one below; an empty new one goes away.
    element(app, "Arroser les plantes").tap()
    let title = app.textFields["Titre"]
    XCTAssertTrue(title.waitForExistence(timeout: 2))
    screenshot("editing")
    title.typeText(" vertes\n")
    XCTAssertTrue(app.textFields["Titre"].waitForExistence(timeout: 2))
    app.textFields["Titre"].typeText("Rempoter\n")
    XCTAssertTrue(element(app, "Rempoter").waitForExistence(timeout: 2) || app.textFields["Titre"].exists)
    app.textFields["Titre"].typeText("\n")
    sleep(1)
    screenshot("continued")
    XCTAssertTrue(element(app, "Arroser les plantes vertes").exists)
    XCTAssertTrue(element(app, "Rempoter").exists)

    // Swipe to delete, with « Annuler ».
    element(app, "Acheter du pain").swipeLeft()
    app.buttons["Supprimer"].tap()
    XCTAssertTrue(element(app, "Supprimé : Acheter du pain").waitForExistence(timeout: 2))
    app.buttons["Annuler"].tap()
    XCTAssertTrue(element(app, "Acheter du pain").waitForExistence(timeout: 2))

    // Long press and drag reorders.
    let from = element(app, "Préparer le voyage")
    let to = element(app, "Appeler maman")
    from.press(forDuration: 0.8, thenDragTo: to)
    XCTAssertTrue(element(app, "Déplacé : Préparer le voyage").waitForExistence(timeout: 3))
    screenshot("moved")
    XCTAssertLessThan(element(app, "Préparer le voyage").frame.minY, element(app, "Appeler maman").frame.minY)
  }

  func testSectionsAndMoveAcross() throws {
    let app = launchTickle(open: "list:courses")
    XCTAssertTrue(element(app, "Pâtes").waitForExistence(timeout: 5))
    element(app, "Pâtes").press(forDuration: 0.8, thenDragTo: element(app, "Yaourts"))
    screenshot("across-after")
    XCTAssertTrue(element(app, "Déplacé : Pâtes").waitForExistence(timeout: 3))
    screenshot("across")
    // Now above Yaourts, in « Frais ».
    XCTAssertLessThan(element(app, "Pâtes").frame.minY, element(app, "Yaourts").frame.minY)
    XCTAssertLessThan(app.textFields["Nom de la section"].firstMatch.frame.minY, element(app, "Pâtes").frame.minY)

    app.buttons["Options de la liste"].tap()
    app.buttons["Ajouter une section"].tap()
    sleep(1)
    app.typeText("Boissons\n")
    XCTAssertTrue(app.textFields.matching(identifier: "Nom de la section").allElementsBoundByIndex.contains { ($0.value as? String) == "Boissons" })
  }

  func testTodayGroups() throws {
    let app = launchTickle(open: "today")
    XCTAssertTrue(element(app, "En retard").waitForExistence(timeout: 5))
    // Today's new reminders are due today.
    element(app, "Nouveau rappel").tap()
    app.textFields["Nouveau rappel"].typeText("Sortir le chien\n")
    XCTAssertTrue(element(app, "Sortir le chien").waitForExistence(timeout: 2))
    XCTAssertTrue(element(app, "Toute la journée").exists)
  }
}
