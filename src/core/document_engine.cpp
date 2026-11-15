#include "document_engine.hpp"

#include <algorithm>
#include <cctype>
#include <iterator>
#include <regex>
#include <utility>

namespace doc {

DocumentEngine::DocumentEngine(const std::string& initialText) : originalBuffer_(initialText) {
    if (!originalBuffer_.empty()) pieces_.push_back({BufferKind::Original, 0, originalBuffer_.size()});
    recordHistory();
}

std::string DocumentEngine::materialize() const {
    std::string result;
    std::size_t bytes = 0;
    for (const auto& piece : pieces_) bytes += piece.length;
    result.reserve(bytes);
    for (const auto& piece : pieces_) {
        const auto& source = piece.source == BufferKind::Original ? originalBuffer_ : addBuffer_;
        if (piece.start <= source.size() && piece.length <= source.size() - piece.start)
            result.append(source, piece.start, piece.length);
    }
    return result;
}

std::size_t DocumentEngine::countCodePoints(const std::string& text) {
    std::size_t count = 0;
    for (unsigned char byte : text) if ((byte & 0xC0) != 0x80) ++count;
    return count;
}

std::size_t DocumentEngine::byteOffsetForCodePoint(const std::string& text, std::size_t offset) {
    if (offset == 0) return 0;
    std::size_t count = 0;
    for (std::size_t i = 0; i < text.size(); ++i) {
        if ((static_cast<unsigned char>(text[i]) & 0xC0) != 0x80) {
            if (count == offset) return i;
            ++count;
        }
    }
    return text.size();
}

std::size_t DocumentEngine::codePointOffsetForByte(const std::string& text, std::size_t offset) {
    std::size_t count = 0;
    for (std::size_t i = 0; i < std::min(offset, text.size()); ++i)
        if ((static_cast<unsigned char>(text[i]) & 0xC0) != 0x80) ++count;
    return count;
}

std::size_t DocumentEngine::length() const { return countCodePoints(materialize()); }

std::size_t DocumentEngine::splitAtByteOffset(std::size_t byteOffset) {
    std::size_t cursor = 0;
    for (std::size_t i = 0; i < pieces_.size(); ++i) {
        auto& piece = pieces_[i];
        if (byteOffset == cursor) return i;
        if (byteOffset < cursor + piece.length) {
            const std::size_t leftLength = byteOffset - cursor;
            Piece right{piece.source, piece.start + leftLength, piece.length - leftLength};
            piece.length = leftLength;
            pieces_.insert(pieces_.begin() + static_cast<std::ptrdiff_t>(i + 1), right);
            return i + 1;
        }
        cursor += piece.length;
    }
    return pieces_.size();
}

void DocumentEngine::normalizePieces() {
    std::vector<Piece> result;
    result.reserve(pieces_.size());
    for (const auto& piece : pieces_) {
        if (!piece.length) continue;
        if (!result.empty()) {
            auto& previous = result.back();
            if (previous.source == piece.source && previous.start + previous.length == piece.start) {
                previous.length += piece.length;
                continue;
            }
        }
        result.push_back(piece);
    }
    pieces_.swap(result);
}

void DocumentEngine::adjustStylesForDelete(std::size_t start, std::size_t end) {
    const std::size_t removed = end - start;
    const auto map = [start, end, removed](std::size_t position) {
        if (position <= start) return position;
        if (position >= end) return position - removed;
        return start;
    };
    std::vector<StyleSpan> adjusted;
    for (auto span : styles_) {
        const auto newStart = map(span.start);
        const auto newEnd = map(span.start + span.length);
        if (newEnd > newStart) {
            span.start = newStart;
            span.length = newEnd - newStart;
            adjusted.push_back(std::move(span));
        }
    }
    styles_.swap(adjusted);
}

void DocumentEngine::adjustStylesForInsert(std::size_t position, std::size_t insertedLength) {
    for (auto& span : styles_) {
        const std::size_t end = span.start + span.length;
        if (span.start >= position) span.start += insertedLength;
        else if (span.start < position && end > position) span.length += insertedLength;
    }
}

void DocumentEngine::recordHistory() {
    if (historyCursor_ + 1 < history_.size())
        history_.erase(history_.begin() + static_cast<std::ptrdiff_t>(historyCursor_ + 1), history_.end());
    history_.push_back({addBuffer_, pieces_, styles_});
    historyCursor_ = history_.size() - 1;
    constexpr std::size_t limit = 300;
    if (history_.size() > limit) {
        history_.erase(history_.begin());
        --historyCursor_;
    }
}

void DocumentEngine::restoreSnapshot(const Snapshot& snapshot) {
    addBuffer_ = snapshot.addBuffer;
    pieces_ = snapshot.pieces;
    styles_ = snapshot.styles;
}

void DocumentEngine::insertText(std::size_t position, const std::string& text) {
    replaceRange(position, 0, text);
}

void DocumentEngine::deleteRange(std::size_t position, std::size_t rangeLength) {
    replaceRange(position, rangeLength, "");
}

void DocumentEngine::replaceRange(std::size_t position, std::size_t rangeLength, const std::string& text) {
    const std::string current = materialize();
    const std::size_t total = countCodePoints(current);
    const std::size_t start = std::min(position, total);
    const std::size_t end = start + std::min(rangeLength, total - start);
    if (start == end && text.empty()) return;

    const std::size_t byteStart = byteOffsetForCodePoint(current, start);
    const std::size_t byteEnd = byteOffsetForCodePoint(current, end);
    adjustStylesForDelete(start, end);

    const std::size_t first = splitAtByteOffset(byteStart);
    const std::size_t last = splitAtByteOffset(byteEnd);
    if (last > first)
        pieces_.erase(pieces_.begin() + static_cast<std::ptrdiff_t>(first),
                      pieces_.begin() + static_cast<std::ptrdiff_t>(last));

    if (!text.empty()) {
        const std::size_t addStart = addBuffer_.size();
        addBuffer_ += text;
        pieces_.insert(pieces_.begin() + static_cast<std::ptrdiff_t>(first),
                       Piece{BufferKind::Add, addStart, text.size()});
        adjustStylesForInsert(start, countCodePoints(text));
    }
    normalizePieces();
    recordHistory();
}

void DocumentEngine::applyStyle(std::size_t position, std::size_t rangeLength, const TextStyle& style) {
    const std::size_t total = length();
    const std::size_t start = std::min(position, total);
    const std::size_t end = start + std::min(rangeLength, total - start);
    if (end <= start) return;
    styles_.push_back({start, end - start, style});
    recordHistory();
}

std::string DocumentEngine::getTextRange(std::size_t position, std::size_t rangeLength) const {
    const std::string text = materialize();
    const std::size_t total = countCodePoints(text);
    const std::size_t start = std::min(position, total);
    const std::size_t end = start + std::min(rangeLength, total - start);
    const auto byteStart = byteOffsetForCodePoint(text, start);
    const auto byteEnd = byteOffsetForCodePoint(text, end);
    return text.substr(byteStart, byteEnd - byteStart);
}

std::string DocumentEngine::getFullText() const { return materialize(); }
std::vector<StyleSpan> DocumentEngine::getStyleSpans() const { return styles_; }

std::vector<SearchMatch> DocumentEngine::findRegex(const std::string& pattern, const std::string& flags) const {
    const std::string text = materialize();
    auto options = std::regex_constants::ECMAScript;
    if (flags.find('i') != std::string::npos) options |= std::regex_constants::icase;
    if (flags.find('m') != std::string::npos) options |= std::regex_constants::multiline;
    std::vector<SearchMatch> result;
    try {
        const std::regex expression(pattern, options);
        for (std::sregex_iterator it(text.begin(), text.end(), expression), end; it != end; ++it) {
            const auto& match = *it;
            result.push_back({
                codePointOffsetForByte(text, static_cast<std::size_t>(match.position())),
                countCodePoints(match.str()),
                match.str()
            });
        }
    } catch (const std::regex_error&) {
        return {};
    }
    return result;
}

std::size_t DocumentEngine::replaceRegex(const std::string& pattern,
                                         const std::string& replacement,
                                         const std::string& flags) {
    const std::string text = materialize();
    auto options = std::regex_constants::ECMAScript;
    if (flags.find('i') != std::string::npos) options |= std::regex_constants::icase;
    if (flags.find('m') != std::string::npos) options |= std::regex_constants::multiline;
    try {
        const std::regex expression(pattern, options);
        const auto count = static_cast<std::size_t>(
            std::distance(std::sregex_iterator(text.begin(), text.end(), expression), std::sregex_iterator()));
        if (!count) return 0;
        replaceRange(0, countCodePoints(text), std::regex_replace(text, expression, replacement));
        return count;
    } catch (const std::regex_error&) {
        return 0;
    }
}

DocumentStats DocumentEngine::getStats() const {
    const std::string text = materialize();
    DocumentStats stats;
    stats.charCount = countCodePoints(text);
    stats.lineCount = text.empty() ? 0 :
        static_cast<std::size_t>(std::count(text.begin(), text.end(), '\n')) + 1;
    bool inWord = false;
    for (unsigned char character : text) {
        const bool whitespace = std::isspace(character) != 0;
        if (!whitespace && !inWord) ++stats.wordCount;
        inWord = !whitespace;
    }
    return stats;
}

bool DocumentEngine::canUndo() const { return historyCursor_ > 0; }
bool DocumentEngine::canRedo() const { return historyCursor_ + 1 < history_.size(); }

bool DocumentEngine::undo() {
    if (!canUndo()) return false;
    restoreSnapshot(history_[--historyCursor_]);
    return true;
}

bool DocumentEngine::redo() {
    if (!canRedo()) return false;
    restoreSnapshot(history_[++historyCursor_]);
    return true;
}

} // namespace doc
