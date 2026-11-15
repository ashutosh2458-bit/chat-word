#include "document_engine.hpp"

#include <emscripten/bind.h>
#include <emscripten/val.h>

using namespace emscripten;

EMSCRIPTEN_BINDINGS(document_editor_module) {
    value_object<doc::TextStyle>("TextStyle")
        .field("bold", &doc::TextStyle::bold)
        .field("italic", &doc::TextStyle::italic)
        .field("fontFamily", &doc::TextStyle::fontFamily)
        .field("color", &doc::TextStyle::color)
        .field("alignment", &doc::TextStyle::alignment);

    value_object<doc::StyleSpan>("StyleSpan")
        .field("start", &doc::StyleSpan::start)
        .field("length", &doc::StyleSpan::length)
        .field("style", &doc::StyleSpan::style);

    value_object<doc::SearchMatch>("SearchMatch")
        .field("start", &doc::SearchMatch::start)
        .field("length", &doc::SearchMatch::length)
        .field("value", &doc::SearchMatch::value);

    register_vector<doc::StyleSpan>("StyleSpanVector");
    register_vector<doc::SearchMatch>("SearchMatchVector");

    class_<doc::DocumentEngine>("DocumentEngine")
        .constructor<const std::string&>()
        .function("insertText", &doc::DocumentEngine::insertText)
        .function("deleteRange", &doc::DocumentEngine::deleteRange)
        .function("replaceRange", &doc::DocumentEngine::replaceRange)
        .function("applyStyle", optional_override([](doc::DocumentEngine& engine,
                                                      std::size_t position,
                                                      std::size_t length,
                                                      val style) {
            doc::TextStyle value;
            value.bold = style["bold"].as<bool>();
            value.italic = style["italic"].as<bool>();
            value.fontFamily = style["fontFamily"].as<std::string>();
            value.color = style["color"].as<std::string>();
            value.alignment = style["alignment"].as<std::string>();
            engine.applyStyle(position, length, value);
        }))
        .function("getTextRange", &doc::DocumentEngine::getTextRange)
        .function("getFullText", &doc::DocumentEngine::getFullText)
        .function("getStyleSpans", &doc::DocumentEngine::getStyleSpans)
        .function("findRegex", &doc::DocumentEngine::findRegex)
        .function("replaceRegex", &doc::DocumentEngine::replaceRegex)
        .function("undo", &doc::DocumentEngine::undo)
        .function("redo", &doc::DocumentEngine::redo)
        .function("canUndo", &doc::DocumentEngine::canUndo)
        .function("canRedo", &doc::DocumentEngine::canRedo)
        .function("length", &doc::DocumentEngine::length)
        .function("getStats", optional_override([](const doc::DocumentEngine& engine) {
            const auto stats = engine.getStats();
            val result = val::object();
            result.set("charCount", stats.charCount);
            result.set("wordCount", stats.wordCount);
            result.set("lineCount", stats.lineCount);
            return result;
        }));
}
