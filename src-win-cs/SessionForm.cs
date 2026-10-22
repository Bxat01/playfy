using System;
using System.Drawing;
using System.Windows.Forms;

namespace Playfy
{
    internal sealed partial class SessionForm : Form
    {
        private const int CardWidth = 700;
        private const int CardHeight = 220;
        private const int CardRadius = 24;

        private readonly LaunchOptions _options;

        private Bitmap _background;
        private Bitmap _steamIcon;
        private Bitmap _githubIcon;
        private System.Drawing.Icon _gameIcon;
        private bool _coverRequested;
        private bool _iconRequested;
        private readonly DateTime _startedAt = DateTime.UtcNow;
        private int _lastSecond = -1;

        private readonly Rectangle _minRect = new Rectangle(CardWidth - 88, 14, 32, 32);
        private readonly Rectangle _closeRect = new Rectangle(CardWidth - 52, 14, 32, 32);
        private readonly Rectangle _storeRect = new Rectangle(CardWidth - 212, CardHeight - 60, 180, 40);
        private readonly Rectangle _sourceRect = new Rectangle(24, CardHeight - 54, 32, 32);

        private readonly Font _titleFont = new Font("Segoe UI Semibold", 32f, FontStyle.Regular, GraphicsUnit.Pixel);
        private readonly Font _metaFont = new Font("Segoe UI", 16f, FontStyle.Regular, GraphicsUnit.Pixel);
        private readonly Font _clockFont = new Font("Consolas", 16f, FontStyle.Regular, GraphicsUnit.Pixel);
        private readonly Font _buttonFont = new Font("Segoe UI", 15f, FontStyle.Regular, GraphicsUnit.Pixel);
        private readonly Font _smallFont = new Font("Segoe UI", 13.5f, FontStyle.Regular, GraphicsUnit.Pixel);
        private readonly StringFormat _typo;
        private readonly StringFormat _titleFormat;

        private readonly System.Windows.Forms.Timer _ticker;

        private float _storeHover, _sourceHover, _minHover, _closeHover;
        private bool _storeTarget, _sourceTarget, _minTarget, _closeTarget;
        private float _storePress, _sourcePress;

        // Tray + parent lifetime state lives with the form but its methods are
        // in SessionForm.Tray.cs.
        private NotifyIcon _tray;
        private System.Windows.Forms.Timer _parentTimer;
        private int _parentPid;
        private bool _allowClose;

        public SessionForm(LaunchOptions options)
        {
            _options = options;

            Text = string.IsNullOrEmpty(options.Title) ? "Playfy" : options.Title;
            FormBorderStyle = FormBorderStyle.None;
            StartPosition = FormStartPosition.CenterScreen;
            AutoScaleMode = AutoScaleMode.None;
            ClientSize = new Size(CardWidth, CardHeight);
            MaximizeBox = false;
            MinimizeBox = true;
            BackColor = Color.FromArgb(15, 16, 21);
            DoubleBuffered = true;
            ShowInTaskbar = true;

            // A normal application window: it comes to the front when the
            // session starts, then behaves like every other app instead of
            // floating above everything the user switches to.
            TopMost = false;
            KeyPreview = true;
            SetStyle(
                ControlStyles.AllPaintingInWmPaint |
                ControlStyles.OptimizedDoubleBuffer |
                ControlStyles.UserPaint,
                true);

            try
            {
                Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            }
            catch { /* a missing icon should not block the card */ }

            _steamIcon = LoadGlyph(EmbeddedGlyphs.Steam);
            _githubIcon = LoadGlyph(EmbeddedGlyphs.Github);

            _typo = new StringFormat(StringFormat.GenericTypographic);
            _titleFormat = new StringFormat(StringFormat.GenericTypographic);
            _titleFormat.Trimming = StringTrimming.EllipsisCharacter;
            _titleFormat.FormatFlags |= StringFormatFlags.NoWrap;

            _ticker = new System.Windows.Forms.Timer();
            _ticker.Interval = 33;
            _ticker.Tick += OnTick;
            _ticker.Start();

            Shown += delegate
            {
                // A newly spawned card must be visible immediately. This is a
                // one-time raise, not a topmost window, so switching to another
                // app still puts the card behind it.
                NativeMethods.RaiseWindow(Handle);
                BeginCoverDownload();
                BeginIconDownload();
            };

            KeyDown += delegate(object sender, KeyEventArgs e)
            {
                if (e.KeyCode == Keys.Escape) HideToTray();
            };

            StartParentWatch();
        }

        protected override CreateParams CreateParams
        {
            get
            {
                CreateParams parameters = base.CreateParams;
                parameters.ClassStyle |= NativeMethods.CS_DROPSHADOW;
                return parameters;
            }
        }

        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            IntPtr region = NativeMethods.CreateRoundRectRgn(
                0,
                0,
                Width + 1,
                Height + 1,
                CardRadius * 2,
                CardRadius * 2);
            NativeMethods.SetWindowRgn(Handle, region, true);
        }

        private void OnTick(object sender, EventArgs e)
        {
            bool dirty = false;

            if (Animate(ref _storeHover, _storeTarget)) dirty = true;
            if (Animate(ref _sourceHover, _sourceTarget)) dirty = true;
            if (Animate(ref _minHover, _minTarget)) dirty = true;
            if (Animate(ref _closeHover, _closeTarget)) dirty = true;

            if (_storePress > 0.005f)
            {
                _storePress *= 0.86f;
                if (_storePress <= 0.005f) _storePress = 0f;
                dirty = true;
            }
            if (_sourcePress > 0.005f)
            {
                _sourcePress *= 0.86f;
                if (_sourcePress <= 0.005f) _sourcePress = 0f;
                dirty = true;
            }

            int second = (int)(DateTime.UtcNow - _startedAt).TotalSeconds;
            if (second != _lastSecond)
            {
                _lastSecond = second;
                dirty = true;
            }

            if (dirty) Invalidate();
        }

        private static bool Animate(ref float value, bool target)
        {
            float goal = target ? 1f : 0f;
            if (Math.Abs(value - goal) < 0.01f)
            {
                if (value == goal) return false;
                value = goal;
                return true;
            }

            value += (goal - value) * 0.28f;
            if (Math.Abs(value - goal) < 0.02f) value = goal;
            return true;
        }

        /* ------------------------------------------------------------- input */

        protected override void OnMouseDown(MouseEventArgs e)
        {
            base.OnMouseDown(e);

            if (_closeRect.Contains(e.Location))
            {
                // X hides the card and leaves the native game host running.
                // The boundary between the card and the game is intentional.
                HideToTray();
                return;
            }

            if (_minRect.Contains(e.Location))
            {
                WindowState = FormWindowState.Minimized;
                return;
            }

            if (!string.IsNullOrEmpty(_options.Url) && _storeRect.Contains(e.Location))
            {
                _storePress = 1f;
                Invalidate();
                OpenUrl(_options.Url);
                return;
            }

            if (_sourceRect.Contains(e.Location))
            {
                _sourcePress = 1f;
                Invalidate();
                OpenUrl(_options.Repo);
                return;
            }

            if (e.Button == MouseButtons.Left)
            {
                NativeMethods.ReleaseCapture();
                NativeMethods.SendMessage(Handle, NativeMethods.WM_NCLBUTTONDOWN, NativeMethods.HT_CAPTION, 0);
            }
        }

        protected override void OnMouseMove(MouseEventArgs e)
        {
            base.OnMouseMove(e);

            bool overStore = !string.IsNullOrEmpty(_options.Url) && _storeRect.Contains(e.Location);
            bool overSource = _sourceRect.Contains(e.Location);
            bool overMin = _minRect.Contains(e.Location);
            bool overClose = _closeRect.Contains(e.Location);

            _storeTarget = overStore;
            _sourceTarget = overSource;
            _minTarget = overMin;
            _closeTarget = overClose;

            Cursor = (overStore || overSource || overMin || overClose)
                ? Cursors.Hand
                : Cursors.SizeAll;
        }

        protected override void OnMouseLeave(EventArgs e)
        {
            base.OnMouseLeave(e);
            _storeTarget = false;
            _sourceTarget = false;
            _minTarget = false;
            _closeTarget = false;
            Cursor = Cursors.SizeAll;
        }

        private static void OpenUrl(string url)
        {
            if (string.IsNullOrEmpty(url)) return;
            try { System.Diagnostics.Process.Start(url); }
            catch { /* no default browser */ }
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                _ticker.Stop();
                _ticker.Dispose();

                if (_parentTimer != null)
                {
                    _parentTimer.Stop();
                    _parentTimer.Dispose();
                }

                DisposeTray();
                _titleFont.Dispose();
                _metaFont.Dispose();
                _clockFont.Dispose();
                _buttonFont.Dispose();
                _smallFont.Dispose();
                _typo.Dispose();
                _titleFormat.Dispose();
                if (_background != null) _background.Dispose();
                if (_steamIcon != null) _steamIcon.Dispose();
                if (_githubIcon != null) _githubIcon.Dispose();
                if (_gameIcon != null) _gameIcon.Dispose();
            }
            base.Dispose(disposing);
        }
    }
}
