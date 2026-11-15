APP_DIR := build/DocumentEditor.app
EXECUTABLE := $(APP_DIR)/Contents/MacOS/DocumentEditor
SOURCES := native/macos/AppDelegate.m native/macos/WebBridge.m native/macos/main.m

.PHONY: all clean
all: $(EXECUTABLE)

$(EXECUTABLE): $(SOURCES) native/macos/Info.plist
	mkdir -p $(APP_DIR)/Contents/MacOS $(APP_DIR)/Contents/Resources/WebApp
	xcrun clang -fobjc-arc -framework Cocoa -framework WebKit -framework UniformTypeIdentifiers $(SOURCES) -o $(EXECUTABLE)
	cp native/macos/Info.plist $(APP_DIR)/Contents/Info.plist
	cp -R dist/. $(APP_DIR)/Contents/Resources/WebApp/

clean:
	rm -rf build/DocumentEditor.app
