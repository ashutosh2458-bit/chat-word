#include "document_engine.hpp"

#include <cassert>
#include <iostream>

int main() {
    doc::DocumentEngine engine("Hello 🌍");
    assert(engine.length() == 7);
    assert(engine.getTextRange(6, 1) == "🌍");

    engine.insertText(5, " brave");
    assert(engine.getFullText() == "Hello brave 🌍");
    assert(engine.undo());
    assert(engine.getFullText() == "Hello 🌍");
    assert(engine.redo());
    assert(engine.getFullText() == "Hello brave 🌍");

    const auto matches = engine.findRegex("br[a-z]+", "i");
    assert(matches.size() == 1 && matches[0].value == "brave");
    assert(engine.replaceRegex("brave", "curious") == 1);
    assert(engine.getFullText() == "Hello curious 🌍");

    doc::TextStyle style;
    style.bold = true;
    engine.applyStyle(0, 5, style);
    assert(engine.getStyleSpans().size() == 1);

    const auto stats = engine.getStats();
    assert(stats.charCount == engine.length());
    assert(stats.wordCount == 3);
    assert(stats.lineCount == 1);

    engine.deleteRange(0, 6);
    assert(engine.getFullText() == "curious 🌍");
    assert(engine.undo());
    assert(engine.getFullText() == "Hello curious 🌍");

    std::cout << "DocumentEngine tests passed\n";
    return 0;
}
