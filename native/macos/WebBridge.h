#import <Foundation/Foundation.h>
#import <WebKit/WebKit.h>

@interface WebBridge : NSObject <WKScriptMessageHandler>
@property(nonatomic, weak) WKWebView *webView;
@end
