#pragma once

#include <cstddef>
#include <string>
#include <vector>

namespace doc {

enum class BufferKind { Original, Add };

struct Piece {
    BufferKind source;
    std::size_t start;
    std::size_t length;
};

struct TextStyle {
    bool bold = false;
    bool italic = false;
    std::string fontFamily;
    std::string color;
    std::string alignment;
};

struct StyleSpan {
    std::size_t start = 0;
    std::size_t length = 0;
    TextStyle style;
};

struct SearchMatch {
    std::size_t start = 0;
    std::size_t length = 0;
    std::string value;
};

struct DocumentStats {
    std::size_t charCount = 0;
    std::size_t wordCount = 0;
    std::size_t lineCount = 0;
};

class DocumentEngine {
public:
    explicit DocumentEngine(const std::string& initialText = {});
    void insertText(std::size_t position, const std::string& text);
    void deleteRange(std::size_t position, std::size_t length);
    void replaceRange(std::size_t position, std::size_t length, const std::string& text);
    void applyStyle(std::size_t position, std::size_t length, const TextStyle& style);
    std::string getTextRange(std::size_t position, std::size_t length) const;
    std::string getFullText() const;
    std::vector<StyleSpan> getStyleSpans() const;
    std::vector<SearchMatch> findRegex(const std::string& pattern, const std::string& flags = "") const;
    std::size_t replaceRegex(const std::string& pattern, const std::string& replacement, const std::string& flags = "");
    DocumentStats getStats() const;
    std::size_t length() const;
    bool undo();
    bool redo();
    bool canUndo() const;
    bool canRedo() const;

private:
    struct Snapshot {
        std::string addBuffer;
        std::vector<Piece> pieces;
        std::vector<StyleSpan> styles;
    };

    std::string originalBuffer_;
    std::string addBuffer_;
    std::vector<Piece> pieces_;
    std::vector<StyleSpan> styles_;
    std::vector<Snapshot> history_;
    std::size_t historyCursor_ = 0;

    std::string materialize() const;
    static std::size_t countCodePoints(const std::string& text);
    static std::size_t byteOffsetForCodePoint(const std::string& text, std::size_t offset);
    static std::size_t codePointOffsetForByte(const std::string& text, std::size_t offset);
    std::size_t splitAtByteOffset(std::size_t byteOffset);
    void normalizePieces();
    void adjustStylesForDelete(std::size_t start, std::size_t end);
    void adjustStylesForInsert(std::size_t position, std::size_t insertedLength);
    void recordHistory();
    void restoreSnapshot(const Snapshot& snapshot);
};

} // namespace doc
