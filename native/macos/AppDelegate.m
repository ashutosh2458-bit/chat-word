#import "AppDelegate.h"
#import "WebBridge.h"

@implementation AppDelegate

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    (void)notification;
    WKWebViewConfiguration *configuration = [[WKWebViewConfiguration alloc] init];
    WKUserContentController *controller = [[WKUserContentController alloc] init];
    self.webBridge = [[WebBridge alloc] init];
    [controller addScriptMessageHandler:self.webBridge name:@"nativeDocument"];
    configuration.userContentController = controller;

    NSString *bridgeScript =
      @"window.nativeBridge = {"
       "open:function(){window.webkit.messageHandlers.nativeDocument.postMessage({action:'open'});},"
       "save:function(text){window.webkit.messageHandlers.nativeDocument.postMessage({action:'save',text:String(text)});}"
       "};";
    WKUserScript *script = [[WKUserScript alloc] initWithSource:bridgeScript
                                                injectionTime:WKUserScriptInjectionTimeAtDocumentStart
                                             forMainFrameOnly:YES];
    [controller addUserScript:script];

    self.webView = [[WKWebView alloc] initWithFrame:NSMakeRect(0,0,1200,820) configuration:configuration];
    self.webBridge.webView = self.webView;
    self.window = [[NSWindow alloc] initWithContentRect:NSMakeRect(0,0,1200,820)
        styleMask:(NSWindowStyleMaskTitled | NSWindowStyleMaskClosable |
                   NSWindowStyleMaskMiniaturizable | NSWindowStyleMaskResizable)
        backing:NSBackingStoreBuffered defer:NO];
    self.window.title = @"Document Editor";
    self.window.contentView = self.webView;
    [self.window center];
    [self.window makeKeyAndOrderFront:nil];
    [NSApp activateIgnoringOtherApps:YES];

    NSURL *indexURL = [[NSBundle mainBundle] URLForResource:@"index"
        withExtension:@"html" subdirectory:@"WebApp"];
    if (indexURL) {
        [self.webView loadFileURL:indexURL allowingReadAccessToURL:[indexURL URLByDeletingLastPathComponent]];
    } else {
        [self.webView loadHTMLString:@"<h2>Web app bundle missing</h2><p>Build the web app and run make macos.</p>" baseURL:nil];
    }
}

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender {
    (void)sender;
    return YES;
}
@end
