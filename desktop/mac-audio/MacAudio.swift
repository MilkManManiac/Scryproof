// Core Audio process taps -> 48 kHz, stereo, signed little-endian 16-bit PCM.
// stdout is audio only. stderr is the app-sound handshake (ok / error).
import AppKit
import AVFoundation
import CoreAudio
import CoreGraphics
import Darwin

func trace(_ text: String) {
    if ProcessInfo.processInfo.environment["MAC_AUDIO_TRACE"] == "1" { FileHandle.standardError.write(Data("trace \(text)\n".utf8)) }
}
struct CaptureError: Error, CustomStringConvertible {
    let description: String
    init(_ message: String) { description = message }
}
func checked(_ status: OSStatus, _ operation: String) throws {
    if status != noErr { throw CaptureError("\(operation) (Core Audio \(status)). Allow System Audio Recording in System Settings > Privacy & Security > Screen & System Audio Recording, then relaunch.") }
}
func address(_ selector: AudioObjectPropertySelector) -> AudioObjectPropertyAddress {
    AudioObjectPropertyAddress(mSelector: selector, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
}
func property<T>(_ object: AudioObjectID, _ selector: AudioObjectPropertySelector, _ initial: T) throws -> T {
    var value = initial
    var size = UInt32(MemoryLayout<T>.size)
    var addr = address(selector)
    try withUnsafeMutablePointer(to: &value) { pointer in
        try checked(AudioObjectGetPropertyData(object, &addr, 0, nil, &size, UnsafeMutableRawPointer(pointer)), "Read audio property")
    }
    return value
}
func audioProcesses() throws -> [AudioObjectID] {
    var addr = address(kAudioHardwarePropertyProcessObjectList)
    var size: UInt32 = 0
    try checked(AudioObjectGetPropertyDataSize(AudioObjectID(kAudioObjectSystemObject), &addr, 0, nil, &size), "List audio processes")
    var values = [AudioObjectID](repeating: 0, count: Int(size) / MemoryLayout<AudioObjectID>.size)
    try checked(AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &addr, 0, nil, &size, &values), "Read audio processes")
    return Array(values.prefix(Int(size) / MemoryLayout<AudioObjectID>.size))
}
// A fresh kernel process table includes Chromium's separate audio service and
// renderers, and children started after the share began. No shell / ps polling.
func processTree(_ root: pid_t) throws -> Set<pid_t> {
    var mib: [Int32] = [CTL_KERN, KERN_PROC, KERN_PROC_ALL, 0]
    var size = 0
    guard sysctl(&mib, 4, nil, &size, nil, 0) == 0 else { throw CaptureError("Cannot read process table") }
    for _ in 0..<3 {
        var entries = [kinfo_proc](repeating: kinfo_proc(), count: size / MemoryLayout<kinfo_proc>.stride + 64)
        size = entries.count * MemoryLayout<kinfo_proc>.stride
        if sysctl(&mib, 4, &entries, &size, nil, 0) == 0 {
            var result: Set<pid_t> = [root]
            var changed = true
            while changed {
                changed = false
                for p in entries.prefix(size / MemoryLayout<kinfo_proc>.stride) where result.contains(p.kp_eproc.e_ppid) {
                    if result.insert(p.kp_proc.p_pid).inserted { changed = true }
                }
            }
            return result
        }
        if errno != ENOMEM { break }
    }
    throw CaptureError("Cannot refresh process tree; capture stopped to keep the call out")
}
func windowOwner(_ window: UInt32) throws -> pid_t {
    guard let windows = CGWindowListCopyWindowInfo([.optionIncludingWindow], window) as? [[String: Any]],
          let info = windows.first, let pid = info[kCGWindowOwnerPID as String] as? Int32 else {
        throw CaptureError("The selected window closed. Choose it again.")
    }
    return pid
}

@available(macOS 14.2, *)
final class Capture {
    let root: pid_t
    let included: pid_t?
    let queue = DispatchQueue(label: "scryproof.mac-audio")
    var tap: AudioObjectID = 0
    var device: AudioObjectID = 0
    var io: AudioDeviceIOProcID?
    var description: CATapDescription
    var timer: DispatchSourceTimer?
    var listener: AudioObjectPropertyListenerBlock?
    var inputFormat: AVAudioFormat!
    var converter: AVAudioConverter!
    let outputFormat = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 48_000, channels: 2, interleaved: true)!
    var pipe: PCMWriter!
    var stopped = false
    var lastProcesses: [AudioObjectID] = []

    init(root: pid_t, window: UInt32?) throws {
        self.root = root
        included = try window.map(windowOwner)
        if let included, !eligibleAudioProcess(included, bundle: "", own: try processTree(root), wanted: nil) {
            throw CaptureError("This window belongs to the call. Share another app to include sound.")
        }
        description = CATapDescription()
        description.name = "Scryproof share sound"
        description.uuid = UUID()
        description.isPrivate = true
        description.isMixdown = true
        description.isMono = false
        // A whole-machine mix is an include list of all safe audio objects.
        // A newly spawned process is silent until classified; an exclusion tap
        // would briefly leak a new Chromium audio service before its notification.
        description.isExclusive = false
        if #available(macOS 26.0, *) {
            description.isProcessRestoreEnabled = false
            description.bundleIDs = []
        }
        description.muteBehavior = .unmuted
        try refreshDescription()
    }
    func refreshDescription() throws {
        let own = try processTree(root)
        let wanted = try included.map(processTree)
        var selected: [AudioObjectID] = []
        for object in try audioProcesses() {
            let pid = try property(object, kAudioProcessPropertyPID, pid_t(0))
            let bundle = (try? property(object, kAudioProcessPropertyBundleID, "" as CFString)) as String? ?? ""
            if eligibleAudioProcess(pid, bundle: bundle, own: own, wanted: wanted) {
                selected.append(object)
            }
        }
        selected.sort()
        if tap != 0 && selected == lastProcesses { return }
        description.processes = selected
        if tap != 0 {
            var addr = address(kAudioTapPropertyDescription)
            var desc = Unmanaged.passUnretained(description).toOpaque()
            try checked(AudioObjectSetPropertyData(tap, &addr, 0, nil, UInt32(MemoryLayout<UnsafeMutableRawPointer>.size), &desc), "Refresh excluded audio processes")
        }
        lastProcesses = selected
    }
    func start() throws {
        trace("creating tap")
        try checked(AudioHardwareCreateProcessTap(description, &tap), "Create process tap")
        trace("reading format")
        let format = try property(tap, kAudioTapPropertyFormat, AudioStreamBasicDescription())
        guard format.mFormatID == kAudioFormatLinearPCM, format.mSampleRate > 0,
              format.mBytesPerFrame > 0, format.mChannelsPerFrame > 0 else {
            throw CaptureError("The audio tap returned an invalid PCM format")
        }
        let outputDevice = try property(AudioObjectID(kAudioObjectSystemObject), kAudioHardwarePropertyDefaultOutputDevice, AudioObjectID(0))
        guard outputDevice != 0 else { throw CaptureError("No audio output device is available") }
        let outputUID = try property(outputDevice, kAudioDevicePropertyDeviceUID, "" as CFString) as String
        let tapUID = try property(tap, kAudioTapPropertyUID, "" as CFString) as String
        let config: [String: Any] = [
            kAudioAggregateDeviceNameKey: "Scryproof share sound",
            kAudioAggregateDeviceUIDKey: UUID().uuidString,
            kAudioAggregateDeviceIsPrivateKey: true,
            kAudioAggregateDeviceTapAutoStartKey: true,
            kAudioAggregateDeviceMainSubDeviceKey: outputUID,
            kAudioAggregateDeviceSubDeviceListKey: [[kAudioSubDeviceUIDKey: outputUID]],
            kAudioAggregateDeviceTapListKey: [[kAudioSubTapUIDKey: tapUID, kAudioSubTapDriftCompensationKey: true]],
        ]
        trace("creating aggregate")
        try checked(AudioHardwareCreateAggregateDevice(config as CFDictionary, &device), "Create capture device")
        pipe = PCMWriter(fd: STDOUT_FILENO) { [weak self] code in
            self?.queue.async { [weak self] in self?.fail(CaptureError("The audio receiver closed (errno \(code))")) }
        }
        // The aggregate can run at a different rate from the tap's initial
        // ASBD (observed: tap 44100, aggregate 48000). Trust its actual clock.
        let rate = try property(device, kAudioDevicePropertyNominalSampleRate, Double(0))
        guard rate > 0 else { throw CaptureError("The capture device has no sample rate") }
        var asbd = format
        asbd.mSampleRate = rate
        guard let input = AVAudioFormat(streamDescription: &asbd), let convert = AVAudioConverter(from: input, to: outputFormat) else {
            throw CaptureError("The audio device format cannot be converted")
        }
        inputFormat = input
        converter = convert
        trace("creating IO reader")
        try checked(AudioDeviceCreateIOProcIDWithBlock(&io, device, queue) { [weak self] _, data, _, output, _ in
            // The aggregate uses the output device as its clock. We send it
            // silence; the original apps continue playing normally.
            for buffer in UnsafeMutableAudioBufferListPointer(output) {
                if let bytes = buffer.mData { memset(bytes, 0, Int(buffer.mDataByteSize)) }
            }
            self?.consume(data)
        }, "Create audio reader")
        trace("starting device")
        try checked(AudioDeviceStart(device, io), "Start audio capture")
        listener = { [weak self] _, _ in self?.refresh() }
        var addr = address(kAudioHardwarePropertyProcessObjectList)
        try checked(AudioObjectAddPropertyListenerBlock(AudioObjectID(kAudioObjectSystemObject), &addr, queue, listener!), "Watch audio processes")
        let tick = DispatchSource.makeTimerSource(queue: queue)
        tick.schedule(deadline: .now() + .milliseconds(250), repeating: .milliseconds(250))
        tick.setEventHandler { [weak self] in self?.refresh() }
        timer = tick
        tick.resume()
        FileHandle.standardError.write(Data("ok \(included ?? root) rate=\(rate) tapRate=\(format.mSampleRate)\n".utf8))
    }
    func refresh() {
        guard !stopped else { return }
        do { try refreshDescription() } catch { fail(error) }
    }
    func consume(_ data: UnsafePointer<AudioBufferList>) {
        guard !stopped else { return }
        let buffers = UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating: data))
        guard let first = buffers.first, first.mDataByteSize > 0 else { return }
        let frames = first.mDataByteSize / inputFormat.streamDescription.pointee.mBytesPerFrame
        guard let input = AVAudioPCMBuffer(pcmFormat: inputFormat, frameCapacity: frames) else { return }
        input.frameLength = frames
        let target = UnsafeMutableAudioBufferListPointer(input.mutableAudioBufferList)
        guard target.count == buffers.count else { return fail(CaptureError("Audio device changed format. Share again.")) }
        for i in buffers.indices {
            guard let src = buffers[i].mData, let dst = target[i].mData else { return }
            memcpy(dst, src, Int(buffers[i].mDataByteSize))
        }
        let capacity = AVAudioFrameCount(ceil(Double(frames) * 48_000 / inputFormat.sampleRate)) + 64
        guard let output = AVAudioPCMBuffer(pcmFormat: outputFormat, frameCapacity: capacity) else { return }
        var used = false
        var error: NSError?
        let status = converter.convert(to: output, error: &error) { _, result in
            if used { result.pointee = .noDataNow; return nil }
            used = true
            result.pointee = .haveData
            return input
        }
        if status == .error { return fail(error ?? CaptureError("PCM conversion failed") as NSError) }
        let buffer = output.audioBufferList.pointee.mBuffers
        if buffer.mDataByteSize > 0, let bytes = buffer.mData {
            pipe.enqueue(Data(bytes: bytes, count: Int(buffer.mDataByteSize)))
        }
    }
    func fail(_ error: Error) {
        FileHandle.standardError.write(Data("error \(error)\n".utf8))
        stop(code: 1)
    }
    func stop(code: Int32 = 0) {
        guard !stopped else { return }
        stopped = true
        pipe?.close()
        timer?.cancel()
        DispatchQueue.global().async { [self] in
            if let listener {
                var addr = address(kAudioHardwarePropertyProcessObjectList)
                AudioObjectRemovePropertyListenerBlock(AudioObjectID(kAudioObjectSystemObject), &addr, queue, listener)
            }
            if device != 0 {
                AudioDeviceStop(device, io)
                if let io { AudioDeviceDestroyIOProcID(device, io) }
                AudioHardwareDestroyAggregateDevice(device)
            }
            if tap != 0 { AudioHardwareDestroyProcessTap(tap) }
            exit(code)
        }
    }
}
@main
struct MacAudioCommand {
    static func main() {
if #available(macOS 14.2, *) {
    do {
        let args = CommandLine.arguments
        guard args.count == 3, let root = pid_t(args[1]), root > 1 else { throw CaptureError("usage: mac-audio <app-pid> <all|window-id>") }
        let window = args[2] == "all" ? nil : UInt32(args[2])
        if args[2] != "all" && window == nil { throw CaptureError("Invalid window id") }
        signal(SIGPIPE, SIG_IGN)
        _ = fcntl(STDOUT_FILENO, F_SETFL, O_NONBLOCK)
        let capture = try Capture(root: root, window: window)
        do { try capture.start() } catch { capture.fail(error); dispatchMain() }
        // EOF from Electron, SIGTERM and SIGINT all tear down Core Audio objects.
        DispatchQueue.global().async {
            while !FileHandle.standardInput.availableData.isEmpty {}
            capture.queue.async { capture.stop() }
        }
        var signals: [DispatchSourceSignal] = []
        for number in [SIGTERM, SIGINT] {
            signal(number, SIG_IGN)
            let source = DispatchSource.makeSignalSource(signal: number, queue: capture.queue)
            source.setEventHandler { capture.stop() }
            source.resume()
            signals.append(source)
        }
        withExtendedLifetime((capture, signals)) { dispatchMain() }
    } catch {
        FileHandle.standardError.write(Data("error \(error)\n".utf8))
        exit(1)
    }
} else {
    FileHandle.standardError.write(Data("error Sound sharing requires macOS 14.2 or newer\n".utf8))
    exit(1)
}

    }
}
