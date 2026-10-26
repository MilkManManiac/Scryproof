import Foundation
import Darwin

func expect(_ condition: @autoclosure () -> Bool, _ name: String) {
    if !condition() { fputs("FAIL \(name)\n", stderr); exit(1) }
    print("PASS \(name)")
}
@main struct NativeTests {
    static func main() {
        let args = CommandLine.arguments
        if args.count == 3, args[1] == "--responsibility", let pid = pid_t(args[2]) { print("pid \(pid), responsible \(responsiblePID(pid))"); return }
        let filter = ProcessInfo.processInfo.environment["NATIVE_TEST_ONLY"] ?? ""
        var scenarios = 0
        if filter.isEmpty || filter == "selection" {
        scenarios += 1
        let own: Set<pid_t> = [10, 11]
        let wanted: Set<pid_t> = [20, 21]
        let responsibility: (pid_t) -> pid_t = { [30: 20, 31: 10, 40: 99][$0] ?? -1 }
        expect(eligibleAudioProcess(30, bundle: "com.apple.WebKit.GPU", own: own, wanted: wanted, responsible: responsibility), "WebKit XPC audio belongs to its responsible app")
        expect(!eligibleAudioProcess(31, bundle: "com.apple.WebKit.GPU", own: own, wanted: nil, responsible: responsibility), "call XPC audio is excluded by responsibility")
        expect(!eligibleAudioProcess(20, bundle: "com.scryproof.desktop.helper", own: own, wanted: wanted, responsible: responsibility), "production bundle exclusion wins inclusion")
        expect(!eligibleAudioProcess(20, bundle: "com.scryproof.desktop", own: own, wanted: wanted, responsible: responsibility), "another production main process is excluded by bundle ID")
        expect(eligibleAudioProcess(21, bundle: "", own: own, wanted: wanted, responsible: { _ in -1 }), "missing symbol falls back to process tree")
        expect(!eligibleAudioProcess(40, bundle: "", own: own, wanted: wanted, responsible: responsibility), "unrelated responsible app is not included")

        }
        if filter.isEmpty || filter == "partial" {
        scenarios += 1
        // Deterministic partial-write seam: output stalls after three bytes.
        // The unread byte must precede every byte of the following chunk.
        let stateLock = NSLock()
        var bytes: [UInt8] = []
        var blocked = true
        var failed = false
        let writer = PCMWriter(fd: -1, limit: 16, writeBytes: { _, pointer, count in
            stateLock.lock(); defer { stateLock.unlock() }
            if blocked && bytes.count >= 3 { errno = EAGAIN; return -1 }
            let n = min(3, count)
            bytes.append(contentsOf: UnsafeRawBufferPointer(start: pointer, count: n))
            return n
        }, onError: { _ in failed = true })
        writer.enqueue(Data([1,2,3,4]))
        usleep(30_000)
        writer.enqueue(Data([5,6,7,8]))
        stateLock.lock(); blocked = false; stateLock.unlock()
        usleep(30_000)
        stateLock.lock(); let actual = bytes; stateLock.unlock()
        expect(actual == [1,2,3,4,5,6,7,8] && !failed, "partial writes preserve every byte in order across EAGAIN")
        writer.close()

        }
        if filter.isEmpty || filter == "paused" {
        scenarios += 1
        // A real pipe fills while its reader pauses for one second. Audio
        // resumes afterwards, with a maximum half-second application backlog.
        var fds: [Int32] = [0,0]
        precondition(pipe(&fds) == 0, "create real paused-reader pipe")
        _ = fcntl(fds[0], F_SETFL, O_NONBLOCK)
        _ = fcntl(fds[1], F_SETFL, O_NONBLOCK)
        let failLock = NSLock()
        var pipeError: Int32?
        let live = PCMWriter(fd: fds[1]) { code in failLock.lock(); pipeError = code; failLock.unlock() }
        for index in 0..<200 {
            live.enqueue(Data(repeating: UInt8(index % 255), count: 1920))
            usleep(5_000)
        }
        expect(live.bufferedBytes <= 96_000, "paused reader backlog remains at or below 0.5 seconds")
        failLock.lock(); let duringPause = pipeError; failLock.unlock()
        expect(duringPause == nil, "one-second reader pause does not end capture")
        var buffer = [UInt8](repeating: 0, count: 32_768)
        var received = 0
        let end = Date().addingTimeInterval(0.3)
        while Date() < end {
            let n = read(fds[0], &buffer, buffer.count)
            if n > 0 { received += n }
            usleep(1000)
        }
        live.enqueue(Data(repeating: 254, count: 1920))
        usleep(30_000)
        let n = read(fds[0], &buffer, buffer.count)
        expect(received > 0 && n > 0 && buffer.prefix(n).contains(254), "capture continues delivering fresh PCM after reader resumes")
        live.close()
        close(fds[0]); close(fds[1])
        }
        if filter.isEmpty || filter == "closed" {
            scenarios += 1
            let lock = NSLock()
            var error: Int32?
            let writer = PCMWriter(fd: -999) { code in lock.lock(); error = code; lock.unlock() }
            writer.enqueue(Data([1,2,3,4]))
            usleep(30_000)
            lock.lock(); let actual = error; lock.unlock()
            expect(actual == EBADF, "a gone reader ends capture with a real descriptor error")
            writer.close()
        }
        print("Native Mac audio checks: \(scenarios) scenarios passed.")
    }
}
