#import "WebBridge.h"
#import <AppKit/AppKit.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>

@implementation WebBridge

- (void)userContentController:(WKUserContentController *)userContentController
      didReceiveScriptMessage:(WKScriptMessage *)message {
    (void)userContentController;
    if (![message.body isKindOfClass:[NSDictionary class]]) return;
    NSDictionary *body = (NSDictionary *)message.body;
    NSString *action = body[@"action"];
    if ([action isEqualToString:@"open"]) {
        [self openDocument];
    } else if ([action isEqualToString:@"save"]) {
        NSString *text = [body[@"text"] isKindOfClass:[NSString class]] ? body[@"text"] : @"";
        [self saveDocument:text];
    }
}

- (void)openDocument {
    NSOpenPanel *panel = [NSOpenPanel openPanel];
    panel.canChooseFiles = YES;
    panel.canChooseDirectories = NO;
    panel.allowsMultipleSelection = NO;
    panel.allowedContentTypes = @[UTTypePlainText];
    [panel beginWithCompletionHandler:^(NSModalResponse response) {
        if (response != NSModalResponseOK || !panel.URL) return;
        NSURL *url = panel.URL;
        BOOL scoped = [url startAccessingSecurityScopedResource];
        NSError *error = nil;
        NSString *text = [NSString stringWithContentsOfURL:url encoding:NSUTF8StringEncoding error:&error];
        if (scoped) [url stopAccessingSecurityScopedResource];
        if (error || !text) {
            [self sendResult:@{@"action":@"open", @"error":error.localizedDescription ?: @"Unable to read this text file."}];
            return;
        }
        [self sendResult:@{@"action":@"open", @"filename":url.lastPathComponent ?: @"document.txt", @"text":text}];
    }];
}

- (void)saveDocument:(NSString *)text {
    NSSavePanel *panel = [NSSavePanel savePanel];
    panel.allowedContentTypes = @[UTTypePlainText];
    panel.nameFieldStringValue = @"document.txt";
    [panel beginWithCompletionHandler:^(NSModalResponse response) {
        if (response != NSModalResponseOK || !panel.URL) return;
        NSError *error = nil;
        BOOL saved = [text writeToURL:panel.URL atomically:YES encoding:NSUTF8StringEncoding error:&error];
        if (!saved) {
            [self sendResult:@{@"action":@"save", @"error":error.localizedDescription ?: @"Unable to save this text file."}];
            return;
        }
        [self sendResult:@{@"action":@"save", @"filename":panel.URL.lastPathComponent ?: @"document.txt"}];
    }];
}

- (void)sendResult:(NSDictionary *)payload {
    NSError *error = nil;
    NSData *data = [NSJSONSerialization dataWithJSONObject:payload options:NSJSONWritingFragmentsAllowed error:&error];
    if (!data || error) return;
    NSString *json = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    if (!json) return;
    dispatch_async(dispatch_get_main_queue(), ^{
        NSString *source = [NSString stringWithFormat:
          @"window.documentEditorNative && window.documentEditorNative.receive(%@);", json];
        [self.webView evaluateJavaScript:source completionHandler:nil];
    });
}
@end
