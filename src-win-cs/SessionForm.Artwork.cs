using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Net;
using System.Threading;
using System.Windows.Forms;

namespace Playfy
{
    internal sealed partial class SessionForm
    {
        private static Bitmap LoadGlyph(string base64)
        {
            using (MemoryStream stream = new MemoryStream(Convert.FromBase64String(base64)))
            using (Image source = Image.FromStream(stream))
            {
                return new Bitmap(source);
            }
        }

        private void BeginCoverDownload()
        {
            if (_coverRequested || string.IsNullOrEmpty(_options.Cover)) return;
            _coverRequested = true;

            ThreadPool.QueueUserWorkItem(delegate
            {
                Bitmap loaded = null;
                try
                {
                    ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072; // TLS 1.2
                    using (WebClient client = new WebClient())
                    {
                        client.Headers.Add("User-Agent", "Playfy/25.10.8");
                        byte[] data = client.DownloadData(_options.Cover);
                        using (MemoryStream stream = new MemoryStream(data))
                        using (Image source = Image.FromStream(stream))
                        {
                            loaded = new Bitmap(source);
                        }
                    }
                }
                catch { /* offline or CDN hiccup; the neutral fallback covers it */ }

                if (loaded == null) return;
                if (IsDisposed)
                {
                    loaded.Dispose();
                    return;
                }

                try
                {
                    BeginInvoke((MethodInvoker)delegate
                    {
                        Bitmap blurred = MakeBlurred(loaded, CardWidth, CardHeight, 512, 160);
                        _background = MakeBackdrop(blurred);

                        blurred.Dispose();
                        loaded.Dispose();
                        Invalidate();
                    });
                }
                catch
                {
                    loaded.Dispose(); // the window went away mid-download
                }
            });
        }

        /// <summary>
        /// Loads the game's square app icon so the taskbar button and Alt-Tab
        /// preview identify the game, not the Playfy shell. The wide banner is
        /// intentionally not used here; Windows would squash it into a blur.
        /// </summary>
        private void BeginIconDownload()
        {
            if (_iconRequested || string.IsNullOrEmpty(_options.Icon)) return;
            _iconRequested = true;

            ThreadPool.QueueUserWorkItem(delegate
            {
                Bitmap loaded = null;
                try
                {
                    ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072; // TLS 1.2
                    using (WebClient client = new WebClient())
                    {
                        client.Headers.Add("User-Agent", "Playfy/25.10.8");
                        byte[] data = client.DownloadData(_options.Icon);
                        using (MemoryStream stream = new MemoryStream(data))
                        using (Image source = Image.FromStream(stream))
                        {
                            loaded = new Bitmap(source);
                        }
                    }
                }
                catch { /* keep the bundled Playfy icon */ }

                if (loaded == null) return;
                if (IsDisposed)
                {
                    loaded.Dispose();
                    return;
                }

                try
                {
                    BeginInvoke((MethodInvoker)delegate
                    {
                        try
                        {
                            IntPtr handle = loaded.GetHicon();
                            try
                            {
                                using (System.Drawing.Icon temp = System.Drawing.Icon.FromHandle(handle))
                                {
                                    _gameIcon = (System.Drawing.Icon)temp.Clone();
                                }
                            }
                            finally
                            {
                                NativeMethods.DestroyIcon(handle);
                            }

                            if (_gameIcon != null)
                            {
                                Icon = _gameIcon;
                                UpdateTrayIcon();
                            }
                        }
                        catch { /* not a valid icon image */ }
                        finally
                        {
                            loaded.Dispose();
                        }
                    });
                }
                catch
                {
                    loaded.Dispose();
                }
            });
        }

        /// <summary>
        /// Cover-fits the source into a tiny bitmap (centre crop, no stretching)
        /// then scales it back up. That keeps the artwork's real proportions and
        /// produces a soft gaussian-like blur instead of a squashed image.
        /// </summary>
        private static Bitmap MakeBlurred(Bitmap source, int width, int height, int tinyWidth, int tinyHeight)
        {
            Bitmap result = new Bitmap(width, height);
            using (Graphics graphics = Graphics.FromImage(result))
            using (Bitmap tiny = new Bitmap(tinyWidth, tinyHeight))
            {
                graphics.Clear(Color.FromArgb(17, 18, 23));

                float sourceAspect = (float)source.Width / source.Height;
                float targetAspect = (float)width / height;
                RectangleF crop;

                if (sourceAspect > targetAspect)
                {
                    float cropWidth = source.Height * targetAspect;
                    crop = new RectangleF((source.Width - cropWidth) / 2f, 0f, cropWidth, source.Height);
                }
                else
                {
                    float cropHeight = source.Width / targetAspect;
                    crop = new RectangleF(0f, (source.Height - cropHeight) / 2f, source.Width, cropHeight);
                }

                using (Graphics small = Graphics.FromImage(tiny))
                {
                    small.InterpolationMode = InterpolationMode.HighQualityBilinear;
                    small.PixelOffsetMode = PixelOffsetMode.HighQuality;
                    small.CompositingQuality = CompositingQuality.HighQuality;
                    small.DrawImage(
                        source,
                        new Rectangle(0, 0, tinyWidth, tinyHeight),
                        crop.X,
                        crop.Y,
                        crop.Width,
                        crop.Height,
                        GraphicsUnit.Pixel);
                }

                graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
                graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
                graphics.CompositingQuality = CompositingQuality.HighQuality;
                graphics.DrawImage(tiny, new Rectangle(0, 0, width, height));
            }
            return result;
        }

        private static Bitmap MakeBackdrop(Bitmap blurred)
        {
            Bitmap result = new Bitmap(blurred);
            using (Graphics graphics = Graphics.FromImage(result))
            {
                // Even scrim over the artwork: the whole card stays readable
                // without painting a dark slab over one side of the image.
                using (SolidBrush scrim = new SolidBrush(Color.FromArgb(64, 8, 9, 13)))
                {
                    graphics.FillRectangle(scrim, 0, 0, CardWidth, CardHeight);
                }

                // Deep bottom shade keeps the store/source controls readable.
                using (LinearGradientBrush bottom = new LinearGradientBrush(
                    new Rectangle(0, CardHeight - 104, CardWidth, 104),
                    Color.FromArgb(0, 0, 0, 0),
                    Color.FromArgb(104, 0, 0, 0),
                    LinearGradientMode.Vertical))
                {
                    graphics.FillRectangle(bottom, 0, CardHeight - 104, CardWidth, 104);
                }

                // Soft left shade anchors the title and metadata. It fades out
                // long before the centre, so the artwork stays the hero instead
                // of looking like it has a hard side band.
                using (LinearGradientBrush left = new LinearGradientBrush(
                    new Rectangle(0, 0, 420, CardHeight),
                    Color.FromArgb(138, 8, 9, 13),
                    Color.FromArgb(0, 8, 9, 13),
                    LinearGradientMode.Horizontal))
                {
                    graphics.FillRectangle(left, 0, 0, 420, CardHeight);
                }

                // A touch of top shade stops bright artwork from fighting the
                // window controls, without the old white top edge.
                using (LinearGradientBrush top = new LinearGradientBrush(
                    new Rectangle(0, 0, CardWidth, 58),
                    Color.FromArgb(46, 0, 0, 0),
                    Color.FromArgb(0, 0, 0, 0),
                    LinearGradientMode.Vertical))
                {
                    graphics.FillRectangle(top, 0, 0, CardWidth, 58);
                }
            }
            return result;
        }
    }
}
