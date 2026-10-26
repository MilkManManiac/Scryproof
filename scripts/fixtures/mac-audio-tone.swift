// A separate WebKit app: its GPU/audio XPC service is parented by launchd,
// so the window-share check must follow responsible PID, not just ppid.
import AppKit
import WebKit

let app = NSApplication.shared
app.setActivationPolicy(.regular)
let window = NSWindow(contentRect: NSRect(x: 40, y: 40, width: 420, height: 220), styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
window.title = "tone-1000"
let configuration = WKWebViewConfiguration()
configuration.mediaTypesRequiringUserActionForPlayback = []
let web = WKWebView(frame: window.contentView!.bounds, configuration: configuration)
web.autoresizingMask = [.width, .height]
window.contentView!.addSubview(web)
web.loadHTMLString("""
<html><body><h1>WebKit tone 1000 Hz</h1><script>
const c = new AudioContext(); const o = c.createOscillator(); const g = c.createGain();
o.frequency.value = 1000; g.gain.value = 0.03; o.connect(g).connect(c.destination); o.start(); c.resume();
</script></body></html>
""", baseURL: nil)
window.makeKeyAndOrderFront(nil)
app.activate(ignoringOtherApps: true)
if CommandLine.arguments.count > 1 {
    try String(ProcessInfo.processInfo.processIdentifier).write(toFile: CommandLine.arguments[1], atomically: true, encoding: .utf8)
}
app.run()
