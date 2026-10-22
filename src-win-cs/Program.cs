// Playfy session card.
//
// This is the visible, polished session process. On Windows Playfy copies the
// executable under the selected game image name so Discord sees the same
// process that owns the window. Hiding the window keeps that process running.
//
// Built with the .NET Framework compiler that ships with Windows. Keep the
// syntax C# 5 compatible.

using System;
using System.IO;
using System.Windows.Forms;

namespace Playfy
{
    internal static class Program
    {
        [STAThread]
        private static void Main(string[] args)
        {
            try
            {
                NativeMethods.EnableDpiAwareness();

                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
                Application.ThreadException += delegate(object sender, System.Threading.ThreadExceptionEventArgs errorEvent)
                {
                    LogError(errorEvent.Exception);
                };

                LaunchOptions options = LaunchOptions.Parse(args);
                Application.Run(new SessionForm(options));
            }
            catch (Exception error)
            {
                LogError(error);
                try
                {
                    MessageBox.Show(
                        error.Message,
                        "Playfy session",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error);
                }
                catch { /* no desktop to show it on */ }
            }
        }

        internal static void LogError(Exception error)
        {
            try
            {
                File.WriteAllText(
                    Path.Combine(Path.GetTempPath(), "playfy-session-error.log"),
                    error.ToString());
            }
            catch { /* diagnostics must never break the session */ }
        }
    }
}
