// app-sound.exe: one program's sound, nothing else, for sharing a window with sound.
//
//   app-sound.exe <hwnd>
//
// Finds the process that owns the window and records what that process and
// its children play (Windows process loopback, Windows 10 2004 or later). The
// sound goes to stdout as raw 48 kHz stereo 16-bit little-endian PCM, nothing
// else ever does. One line on stderr says how it went ("ok <pid>" or
// "error <why>"). It stops when stdin closes, so it never outlives the app.
//
// Built with the C# compiler that ships with Windows (.NET Framework 4.x), so
// it runs on any Windows 10 or 11 with nothing to install:
//   C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /nologo /optimize /target:exe /out:app-sound.exe AppSound.cs
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

static class AppSound
{
    const int Rate = 48000, Channels = 2, Bits = 16;
    const int LoopbackIncludeTree = 0;
    const uint StreamLoopback = 0x00020000, StreamEventCallback = 0x00040000, StreamAutoConvertPcm = 0x80000000, StreamSrcDefaultQuality = 0x08000000;
    const int BufferSilent = 0x2;

    static int Main(string[] args)
    {
        long hwnd;
        if (args.Length != 1 || !long.TryParse(args[0], out hwnd)) return Fail("usage: app-sound.exe <hwnd>");
        int pid = SoundPid(new IntPtr(hwnd));
        if (pid == 0) return Fail("no such window");
        try
        {
            Record(pid);
            return 0;
        }
        catch (Exception e)
        {
            return Fail(e.Message.Replace('\r', ' ').Replace('\n', ' '));
        }
    }

    static int Fail(string why)
    {
        Console.Error.WriteLine("error " + why);
        return 1;
    }

    /// The process to record for a window. A Store app's window belongs to
    /// ApplicationFrameHost; the app itself owns the CoreWindow inside it.
    static int SoundPid(IntPtr hwnd)
    {
        uint pid;
        if (GetWindowThreadProcessId(hwnd, out pid) == 0) return 0;
        uint inner = 0;
        EnumChildWindows(hwnd, (child, _) =>
        {
            var name = new StringBuilder(64);
            GetClassName(child, name, name.Capacity);
            uint childPid;
            GetWindowThreadProcessId(child, out childPid);
            if (name.ToString() == "Windows.UI.Core.CoreWindow" && childPid != pid) { inner = childPid; return false; }
            return true;
        }, IntPtr.Zero);
        return (int)(inner != 0 ? inner : pid);
    }

    static void Record(int pid)
    {
        IAudioClient client = Activate(pid);
        var format = new WaveFormatEx
        {
            wFormatTag = 1,
            nChannels = Channels,
            nSamplesPerSec = Rate,
            wBitsPerSample = Bits,
            nBlockAlign = Channels * Bits / 8,
            nAvgBytesPerSec = Rate * Channels * Bits / 8,
        };
        // 20 ms of buffer, in 100 ns units.
        client.Initialize(0, StreamLoopback | StreamEventCallback | StreamAutoConvertPcm | StreamSrcDefaultQuality, 200000, 0, ref format, IntPtr.Zero);
        var ready = new AutoResetEvent(false);
        client.SetEventHandle(ready.SafeWaitHandle.DangerousGetHandle());
        Guid captureId = typeof(IAudioCaptureClient).GUID;
        object service;
        client.GetService(ref captureId, out service);
        var capture = (IAudioCaptureClient)service;

        var stop = new ManualResetEvent(false);
        var watcher = new Thread(() => { try { Console.OpenStandardInput().CopyTo(Stream.Null); } catch { } stop.Set(); });
        watcher.IsBackground = true;
        watcher.Start();

        Stream output = Console.OpenStandardOutput();
        byte[] chunk = new byte[Rate * format.nBlockAlign];
        client.Start();
        Console.Error.WriteLine("ok " + pid);
        var waits = new WaitHandle[] { stop, ready };
        while (WaitHandle.WaitAny(waits, 500) != 0)
        {
            int frames;
            while (true)
            {
                capture.GetNextPacketSize(out frames);
                if (frames == 0) break;
                IntPtr data;
                int flags;
                long position, qpc;
                capture.GetBuffer(out data, out frames, out flags, out position, out qpc);
                int bytes = frames * format.nBlockAlign;
                if (bytes > chunk.Length) chunk = new byte[bytes];
                if ((flags & BufferSilent) != 0) Array.Clear(chunk, 0, bytes);
                else Marshal.Copy(data, chunk, 0, bytes);
                capture.ReleaseBuffer(frames);
                try { output.Write(chunk, 0, bytes); output.Flush(); }
                catch (IOException) { return; }
            }
        }
        client.Stop();
    }

    static IAudioClient Activate(int pid)
    {
        var activation = new ActivationParams { ActivationType = 1, TargetProcessId = pid, ProcessLoopbackMode = LoopbackIncludeTree };
        IntPtr paramsPtr = Marshal.AllocHGlobal(Marshal.SizeOf(activation));
        IntPtr variantPtr = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(BlobVariant)));
        try
        {
            Marshal.StructureToPtr(activation, paramsPtr, false);
            var variant = new BlobVariant { vt = 65, cbSize = Marshal.SizeOf(activation), pBlobData = paramsPtr }; // VT_BLOB
            Marshal.StructureToPtr(variant, variantPtr, false);
            var done = new Completion();
            IActivateAudioInterfaceAsyncOperation operation;
            ActivateAudioInterfaceAsync("VAD\\Process_Loopback", typeof(IAudioClient).GUID, variantPtr, done, out operation);
            if (!done.Finished.WaitOne(5000)) throw new Exception("activation timed out");
            int hr;
            object result;
            operation.GetActivateResult(out hr, out result);
            if (hr != 0) throw new Exception("activation failed 0x" + hr.ToString("x8"));
            return (IAudioClient)result;
        }
        finally
        {
            Marshal.FreeHGlobal(variantPtr);
            Marshal.FreeHGlobal(paramsPtr);
        }
    }

    class Completion : IActivateAudioInterfaceCompletionHandler, IAgileObject
    {
        public readonly ManualResetEvent Finished = new ManualResetEvent(false);
        public void ActivateCompleted(IActivateAudioInterfaceAsyncOperation operation) { Finished.Set(); }
    }

    [StructLayout(LayoutKind.Sequential)]
    struct ActivationParams { public int ActivationType; public int TargetProcessId; public int ProcessLoopbackMode; }

    [StructLayout(LayoutKind.Sequential)]
    struct BlobVariant { public ushort vt; public ushort r1, r2, r3; public int cbSize; public IntPtr pBlobData; }

    [StructLayout(LayoutKind.Sequential, Pack = 2)]
    struct WaveFormatEx { public short wFormatTag; public short nChannels; public int nSamplesPerSec; public int nAvgBytesPerSec; public short nBlockAlign; public short wBitsPerSample; public short cbSize; }

    [ComImport, Guid("41D949AB-9862-444A-80F6-C261334DA5EB"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IActivateAudioInterfaceCompletionHandler { void ActivateCompleted(IActivateAudioInterfaceAsyncOperation operation); }

    [ComImport, Guid("72A22D78-CDE4-431D-B8CC-843A71199B6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IActivateAudioInterfaceAsyncOperation { void GetActivateResult(out int hr, [MarshalAs(UnmanagedType.IUnknown)] out object result); }

    [ComImport, Guid("94ea2b94-e9cc-49e0-c0ff-ee64ca8f5b90"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAgileObject { }

    [ComImport, Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioClient
    {
        void Initialize(int shareMode, uint flags, long bufferDuration, long periodicity, ref WaveFormatEx format, IntPtr session);
        void GetBufferSize(out int frames);
        void GetStreamLatency(out long latency);
        void GetCurrentPadding(out int frames);
        void IsFormatSupported(int shareMode, IntPtr format, out IntPtr closest);
        void GetMixFormat(out IntPtr format);
        void GetDevicePeriod(out long defaultPeriod, out long minimumPeriod);
        void Start();
        void Stop();
        void Reset();
        void SetEventHandle(IntPtr handle);
        void GetService(ref Guid id, [MarshalAs(UnmanagedType.IUnknown)] out object service);
    }

    [ComImport, Guid("C8ADBD64-E71E-48a0-A4DE-185C395CD317"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioCaptureClient
    {
        void GetBuffer(out IntPtr data, out int frames, out int flags, out long devicePosition, out long qpcPosition);
        void ReleaseBuffer(int frames);
        void GetNextPacketSize(out int frames);
    }

    [DllImport("Mmdevapi.dll", ExactSpelling = true, PreserveSig = false)]
    static extern void ActivateAudioInterfaceAsync([MarshalAs(UnmanagedType.LPWStr)] string path, [MarshalAs(UnmanagedType.LPStruct)] Guid iid, IntPtr activationParams, IActivateAudioInterfaceCompletionHandler handler, out IActivateAudioInterfaceAsyncOperation operation);

    delegate bool EnumProc(IntPtr hwnd, IntPtr param);

    [DllImport("user32.dll")]
    static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);

    [DllImport("user32.dll")]
    static extern bool EnumChildWindows(IntPtr parent, EnumProc proc, IntPtr param);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    static extern int GetClassName(IntPtr hwnd, StringBuilder name, int capacity);
}
