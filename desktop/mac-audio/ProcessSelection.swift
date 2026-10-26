import Darwin

// XPC audio services may be parented by launchd. Responsibility keeps them
// attached to the app which owns their audio, including WebKit.GPU.
typealias ResponsibleProcess = @convention(c) (pid_t) -> pid_t
private let responsibleProcess: ResponsibleProcess? = {
    guard let symbol = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "responsibility_get_pid_responsible_for_pid") else { return nil }
    return unsafeBitCast(symbol, to: ResponsibleProcess.self)
}()
func responsiblePID(_ pid: pid_t) -> pid_t { responsibleProcess?(pid) ?? -1 }
func eligibleAudioProcess(_ pid: pid_t, bundle: String, own: Set<pid_t>, wanted: Set<pid_t>?, responsible: (pid_t) -> pid_t = responsiblePID) -> Bool {
    let owner = responsible(pid)
    // Exclusion always wins, even for an included app's XPC helper.
    if own.contains(pid) || own.contains(owner) || bundle == "com.scryproof.desktop" || bundle.hasPrefix("com.scryproof.desktop.") { return false }
    guard let wanted else { return true }
    return wanted.contains(pid) || wanted.contains(owner)
}
