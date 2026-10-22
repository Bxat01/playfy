using System;
using System.Runtime.InteropServices;

namespace Playfy
{
    internal static class NativeMethods
    {
        internal const int WM_NCLBUTTONDOWN = 0xA1;
        internal const int HT_CAPTION = 0x2;
        internal const int CS_DROPSHADOW = 0x00020000;

        private static readonly IntPtr DpiAwarenessPerMonitorV2 = new IntPtr(-4);

        [DllImport("user32.dll")]
        private static extern bool SetProcessDPIAware();

        [DllImport("user32.dll")]
        private static extern bool SetProcessDpiAwarenessContext(IntPtr value);

        internal static void EnableDpiAwareness()
        {
            // Per-monitor awareness keeps the card sharp and in physical pixels
            // on high-DPI displays instead of stretching a virtual bitmap.
            try
            {
                if (!SetProcessDpiAwarenessContext(DpiAwarenessPerMonitorV2))
                {
                    SetProcessDPIAware();
                }
            }
            catch
            {
                try { SetProcessDPIAware(); }
                catch { /* older shells */ }
            }
        }

        [DllImport("user32.dll")]
        internal static extern int SendMessage(IntPtr hWnd, int msg, int wParam, int lParam);

        [DllImport("user32.dll")]
        private static extern bool SetWindowPos(
            IntPtr hWnd,
            IntPtr insertAfter,
            int x,
            int y,
            int width,
            int height,
            uint flags);

        [DllImport("user32.dll")]
        private static extern bool SetForegroundWindow(IntPtr hWnd);

        /// <summary>
        /// Raises the card above Playfy when a session starts or is restored.
        /// Windows blocks a background process from taking the foreground, so
        /// the window briefly enters the topmost band and immediately leaves
        /// it. The final window is a normal, non-topmost application window;
        /// switching apps still puts the card behind them.
        /// </summary>
        internal static void RaiseWindow(IntPtr handle)
        {
            if (handle == IntPtr.Zero) return;

            const uint NoSize = 0x0001;
            const uint NoMove = 0x0002;
            const uint NoActivate = 0x0010;
            const uint Flags = NoSize | NoMove | NoActivate;
            IntPtr TopMost = new IntPtr(-1);
            IntPtr NoTopMost = new IntPtr(-2);

            try
            {
                SetWindowPos(handle, TopMost, 0, 0, 0, 0, Flags);
                SetWindowPos(handle, NoTopMost, 0, 0, 0, 0, Flags);
                SetForegroundWindow(handle);
            }
            catch { /* the card still works if the shell rejects activation */ }
        }

        [DllImport("user32.dll", CharSet = CharSet.Auto)]
        internal static extern bool DestroyIcon(IntPtr handle);

        [DllImport("user32.dll")]
        internal static extern bool ReleaseCapture();

        [DllImport("gdi32.dll")]
        internal static extern IntPtr CreateRoundRectRgn(int x1, int y1, int x2, int y2, int w, int h);

        [DllImport("user32.dll")]
        internal static extern int SetWindowRgn(IntPtr hWnd, IntPtr hRgn, bool redraw);
    }
}
