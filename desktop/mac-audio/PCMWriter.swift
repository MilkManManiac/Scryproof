import Foundation
import Darwin

/// Bounded PCM pipe. Keep an in-progress chunk through partial writes; when
/// the reader pauses, discard only whole queued chunks, never an odd tail.
final class PCMWriter {
    private let fd: Int32
    private let limit: Int
    private let lock = NSLock()
    private let timer: DispatchSourceTimer
    private let onError: (Int32) -> Void
    private var pending: [Data] = []
    private var pendingBytes = 0
    private var current = Data()
    private var offset = 0
    private var closed = false
    private let writeBytes: (Int32, UnsafeRawPointer, Int) -> Int

    init(fd: Int32, limit: Int = 96_000,
         writeBytes: @escaping (Int32, UnsafeRawPointer, Int) -> Int = { Darwin.write($0, $1, $2) },
         onError: @escaping (Int32) -> Void) {
        self.fd = fd
        self.limit = limit
        self.writeBytes = writeBytes
        self.onError = onError
        timer = DispatchSource.makeTimerSource(queue: DispatchQueue(label: "scryproof.pcm-output"))
        timer.schedule(deadline: .now(), repeating: .milliseconds(5))
        timer.setEventHandler { [weak self] in self?.drain() }
        timer.resume()
    }
    var bufferedBytes: Int {
        lock.lock(); defer { lock.unlock() }
        return pendingBytes + current.count - offset
    }
    func enqueue(_ chunk: Data) {
        lock.lock(); defer { lock.unlock() }
        guard !closed, !chunk.isEmpty, chunk.count <= limit else { return }
        while !pending.isEmpty && pendingBytes + current.count - offset + chunk.count > limit {
            pendingBytes -= pending.removeFirst().count
        }
        guard pendingBytes + current.count - offset + chunk.count <= limit else { return }
        pending.append(chunk)
        pendingBytes += chunk.count
    }
    private func drain() {
        lock.lock()
        guard !closed else { lock.unlock(); return }
        var failure: Int32?
        while true {
            if offset == current.count {
                current = Data(); offset = 0
                if pending.isEmpty { break }
                current = pending.removeFirst()
                pendingBytes -= current.count
            }
            let count = current.withUnsafeBytes { bytes in
                writeBytes(fd, bytes.baseAddress!.advanced(by: offset), current.count - offset)
            }
            if count > 0 { offset += count; continue }
            if count == 0 { break }
            let code = errno
            if code == EINTR { continue }
            if code == EAGAIN || code == EWOULDBLOCK { break }
            failure = code
            closed = true
            timer.cancel()
            break
        }
        lock.unlock()
        if let failure { onError(failure) }
    }
    func close() {
        lock.lock(); defer { lock.unlock() }
        closed = true
        pending.removeAll(); pendingBytes = 0; current = Data(); offset = 0
        timer.cancel()
    }
    deinit { timer.cancel() }
}
