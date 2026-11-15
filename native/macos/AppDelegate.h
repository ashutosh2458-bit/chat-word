#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

@class WebBridge;

@interface AppDelegate : NSObject <NSApplicationDelegate>
@property(nonatomic, strong) NSWindow *window;
@property(nonatomic, strong) WKWebView *webView;
@property(nonatomic, strong) WebBridge *webBridge;
@end
