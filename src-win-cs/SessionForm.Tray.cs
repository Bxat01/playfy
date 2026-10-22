using System;
using System.Diagnostics;
using System.Drawing;
using System.Windows.Forms;

namespace Playfy
{
    internal sealed partial class SessionForm
    {
        private void StartParentWatch()
        {
            _parentPid = _options.ParentPid;
            if (_parentPid <= 0) return;

            _parentTimer = new System.Windows.Forms.Timer();
            _parentTimer.Interval = 2000;
            _parentTimer.Tick += OnParentTick;
            _parentTimer.Start();
        }

        private void OnParentTick(object sender, EventArgs e)
        {
            if (_allowClose) return;

            bool alive = false;
            try
            {
                using (Process process = Process.GetProcessById(_parentPid))
                {
                    alive = !process.HasExited;
                }
            }
            catch
            {
                alive = false;
            }

            if (!alive)
            {
                // Playfy is gone; never leave orphaned cards or game hosts
                // behind. The native host has the same watchdog.
                _allowClose = true;
                DisposeTray();
                Close();
            }
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (!_allowClose &&
                e.CloseReason != CloseReason.WindowsShutDown &&
                e.CloseReason != CloseReason.TaskManagerClosing)
            {
                e.Cancel = true;
                HideToTray();
                return;
            }

            DisposeTray();
            base.OnFormClosing(e);
        }

        private void HideToTray()
        {
            if (IsDisposed || Disposing) return;

            Hide();
            EnsureTray();

            if (_tray != null)
            {
                _tray.Visible = true;
                _tray.ShowBalloonTip(
                    7000,
                    "Playfy",
                    BuildStillRunningText(),
                    ToolTipIcon.Info);
            }
        }

        private string BuildStillRunningText()
        {
            string title = string.IsNullOrEmpty(_options.Title) ? "The session" : _options.Title;
            string text = "Playfy session for " + title + " is still active. Use Stop in Playfy to end it.";
            if (text.Length > 220) text = text.Substring(0, 217) + "...";
            return text;
        }

        private void EnsureTray()
        {
            if (_tray != null) return;

            _tray = new NotifyIcon();
            _tray.Icon = Icon != null ? Icon : SystemIcons.Application;
            _tray.Text = Clip("Playfy - " + (string.IsNullOrEmpty(_options.Title) ? "Session" : _options.Title), 62);

            ContextMenuStrip menu = new ContextMenuStrip();
            menu.Items.Add("Show session card", null, delegate { ShowFromTray(); });
            menu.Items.Add("Hide card", null, delegate { HideToTray(); });
            menu.Items.Add(new ToolStripSeparator());

            ToolStripMenuItem stopHint = new ToolStripMenuItem("Stop the game from Playfy");
            stopHint.Enabled = false;
            menu.Items.Add(stopHint);

            _tray.ContextMenuStrip = menu;
            _tray.DoubleClick += delegate { ShowFromTray(); };
            _tray.BalloonTipClicked += delegate { ShowFromTray(); };
            _tray.Visible = true;
        }

        private void ShowFromTray()
        {
            if (IsDisposed || Disposing) return;

            Show();
            if (WindowState == FormWindowState.Minimized)
            {
                WindowState = FormWindowState.Normal;
            }
            NativeMethods.RaiseWindow(Handle);

            if (_tray != null) _tray.Visible = false;
        }

        private void UpdateTrayIcon()
        {
            if (_tray == null) return;
            _tray.Icon = _gameIcon != null ? _gameIcon : SystemIcons.Application;
        }

        private void DisposeTray()
        {
            if (_tray == null) return;
            _tray.Visible = false;
            _tray.Dispose();
            _tray = null;
        }

        private static string Clip(string text, int max)
        {
            if (string.IsNullOrEmpty(text)) return "Playfy";
            if (text.Length <= max) return text;
            return text.Substring(0, max - 3) + "...";
        }
    }
}
