using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Text;
using System.Globalization;
using System.Windows.Forms;

namespace Playfy
{
    internal sealed partial class SessionForm
    {
        protected override void OnPaint(PaintEventArgs e)
        {
            try
            {
                PaintCard(e.Graphics);
            }
            catch (Exception error)
            {
                Program.LogError(error);
            }
        }

        private void PaintCard(Graphics graphics)
        {
            graphics.SmoothingMode = SmoothingMode.AntiAlias;
            graphics.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
            graphics.TextContrast = 5;
            graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
            graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
            graphics.CompositingQuality = CompositingQuality.HighQuality;

            if (_background != null) graphics.DrawImageUnscaled(_background, 0, 0);
            else PaintFallbackBackdrop(graphics);

            /* window border */
            using (GraphicsPath border = RoundedRect(new Rectangle(0, 0, CardWidth - 1, CardHeight - 1), CardRadius))
            using (Pen edge = new Pen(Color.FromArgb(40, 255, 255, 255)))
            {
                graphics.DrawPath(edge, border);
            }

            /* title + metadata */
            string title = string.IsNullOrEmpty(_options.Title) ? "Playfy" : _options.Title;
            using (SolidBrush titleBrush = new SolidBrush(Color.White))
            using (SolidBrush titleShadow = new SolidBrush(Color.FromArgb(150, 0, 0, 0)))
            {
                graphics.DrawString(
                    title,
                    _titleFont,
                    titleShadow,
                    new RectangleF(36f, 52f, CardWidth * 0.55f, 46f),
                    _titleFormat);
                graphics.DrawString(
                    title,
                    _titleFont,
                    titleBrush,
                    new RectangleF(34f, 50f, CardWidth * 0.55f, 44f),
                    _titleFormat);
            }

            using (SolidBrush meta = new SolidBrush(Color.FromArgb(232, 255, 255, 255)))
            using (SolidBrush metaShadow = new SolidBrush(Color.FromArgb(128, 0, 0, 0)))
            {
                string metaText = string.IsNullOrEmpty(_options.AppId)
                    ? "Playfy session"
                    : "APP ID  -  " + _options.AppId;
                graphics.DrawString(
                    metaText,
                    _metaFont,
                    metaShadow,
                    new PointF(36.5f, 101.5f),
                    _typo);
                graphics.DrawString(
                    metaText,
                    _metaFont,
                    meta,
                    new PointF(35f, 100f),
                    _typo);
            }

            TimeSpan elapsed = DateTime.UtcNow - _startedAt;
            string clock = string.Format(
                CultureInfo.InvariantCulture,
                "{0:00}:{1:00}:{2:00}",
                (int)elapsed.TotalHours,
                elapsed.Minutes,
                elapsed.Seconds);

            using (SolidBrush clockShadow = new SolidBrush(Color.FromArgb(120, 0, 0, 0)))
            using (SolidBrush clockBrush = new SolidBrush(Color.FromArgb(222, 255, 255, 255)))
            {
                graphics.DrawString(clock, _clockFont, clockShadow, new PointF(36f, 128f), _typo);
                graphics.DrawString(clock, _clockFont, clockBrush, new PointF(35f, 127f), _typo);

                SizeF clockSize = graphics.MeasureString(clock, _clockFont, 400, _typo);
                using (SolidBrush brand = new SolidBrush(Color.FromArgb(205, 255, 255, 255)))
                {
                    graphics.DrawString(
                        "  -  Playfy",
                        _smallFont,
                        brand,
                        new PointF(35f + clockSize.Width, 128f),
                        _typo);
                }
            }

            /* controls */
            PaintWindowButton(graphics, _minRect, _minHover, false);
            PaintWindowButton(graphics, _closeRect, _closeHover, true);

            if (!string.IsNullOrEmpty(_options.Url)) PaintStoreButton(graphics);
            PaintSourceButton(graphics);
        }

        private void PaintWindowButton(Graphics graphics, Rectangle bounds, float hover, bool close)
        {
            if (hover > 0.01f)
            {
                int alpha = close
                    ? (int)(206 * hover)
                    : (int)(30 * hover);
                Color fill = close
                    ? Color.FromArgb(alpha, 214, 68, 76)
                    : Color.FromArgb(alpha, 255, 255, 255);

                using (GraphicsPath path = RoundedRect(bounds, 9))
                using (SolidBrush brush = new SolidBrush(fill))
                {
                    graphics.FillPath(brush, path);
                }
            }

            float centerX = bounds.X + bounds.Width / 2f;
            float centerY = bounds.Y + bounds.Height / 2f;
            int iconAlpha = close
                ? (int)(190 + 55 * hover)
                : 172;

            using (Pen pen = new Pen(Color.FromArgb(iconAlpha, 255, 255, 255), 1.55f))
            {
                pen.StartCap = LineCap.Round;
                pen.EndCap = LineCap.Round;

                if (close)
                {
                    graphics.DrawLine(pen, centerX - 5.5f, centerY - 5.5f, centerX + 5.5f, centerY + 5.5f);
                    graphics.DrawLine(pen, centerX + 5.5f, centerY - 5.5f, centerX - 5.5f, centerY + 5.5f);
                }
                else
                {
                    graphics.DrawLine(pen, centerX - 6f, centerY, centerX + 6f, centerY);
                }
            }
        }

        private void PaintStoreButton(Graphics graphics)
        {
            using (GraphicsPath path = RoundedRect(_storeRect, 10))
            {
                // Hover is a soft fill change only. No outline and no glow:
                // the old hover ring read as a hard, pixelated border.
                int fillAlpha = 138 + (int)(52 * _storeHover) + (int)(34 * _storePress);
                using (SolidBrush fill = new SolidBrush(Color.FromArgb(fillAlpha, 8, 9, 13)))
                {
                    graphics.FillPath(fill, path);
                }

                if (_steamIcon != null)
                {
                    int iconSize = 18;
                    Rectangle iconRect = new Rectangle(
                        _storeRect.X + 15,
                        _storeRect.Y + (_storeRect.Height - iconSize) / 2,
                        iconSize,
                        iconSize);
                    DrawGlyph(graphics, _steamIcon, iconRect, 0.94f);
                }

                using (SolidBrush text = new SolidBrush(Color.FromArgb(250, 255, 255, 255)))
                using (SolidBrush textShadow = new SolidBrush(Color.FromArgb(142, 0, 0, 0)))
                using (StringFormat format = new StringFormat(StringFormat.GenericTypographic))
                {
                    format.Alignment = StringAlignment.Near;
                    format.LineAlignment = StringAlignment.Center;
                    RectangleF labelRect = new RectangleF(
                        _storeRect.X + 41,
                        _storeRect.Y,
                        _storeRect.Width - 49,
                        _storeRect.Height);
                    RectangleF shadowRect = labelRect;
                    shadowRect.Offset(1f, 1f);
                    graphics.DrawString("Store page", _buttonFont, textShadow, shadowRect, format);
                    graphics.DrawString("Store page", _buttonFont, text, labelRect, format);
                }
            }
        }

        private void PaintSourceButton(Graphics graphics)
        {
            if (_sourceHover > 0.01f)
            {
                using (GraphicsPath path = RoundedRect(_sourceRect, 8))
                using (SolidBrush fill = new SolidBrush(Color.FromArgb((int)(22 * _sourceHover), 255, 255, 255)))
                {
                    graphics.FillPath(fill, path);
                }
            }

            if (_sourcePress > 0.01f)
            {
                using (GraphicsPath path = RoundedRect(_sourceRect, 8))
                using (SolidBrush fill = new SolidBrush(Color.FromArgb((int)(38 * _sourcePress), 255, 255, 255)))
                {
                    graphics.FillPath(fill, path);
                }
            }

            if (_githubIcon != null)
            {
                int iconSize = 17;
                Rectangle iconRect = new Rectangle(
                    _sourceRect.X + (_sourceRect.Width - iconSize) / 2,
                    _sourceRect.Y + (_sourceRect.Height - iconSize) / 2,
                    iconSize,
                    iconSize);
                float alpha = 0.42f + 0.48f * _sourceHover;
                DrawGlyph(graphics, _githubIcon, iconRect, alpha);
            }

            if (_sourceHover > 0.02f)
            {
                using (SolidBrush label = new SolidBrush(Color.FromArgb((int)(150 * _sourceHover), 255, 255, 255)))
                using (StringFormat format = new StringFormat(StringFormat.GenericTypographic))
                {
                    format.LineAlignment = StringAlignment.Center;
                    graphics.DrawString(
                        "Source",
                        _smallFont,
                        label,
                        new RectangleF(_sourceRect.Right + 4, _sourceRect.Y, 70, _sourceRect.Height),
                        format);
                }
            }
        }

        private void PaintFallbackBackdrop(Graphics graphics)
        {
            using (LinearGradientBrush brush = new LinearGradientBrush(
                ClientRectangle,
                Color.FromArgb(46, 52, 67),
                Color.FromArgb(11, 12, 16),
                LinearGradientMode.ForwardDiagonal))
            {
                graphics.FillRectangle(brush, ClientRectangle);
            }

            using (SolidBrush glow = new SolidBrush(Color.FromArgb(17, 255, 255, 255)))
            {
                graphics.FillEllipse(glow, ClientSize.Width - 280, -130, 410, 320);
            }
        }

        private static void DrawGlyph(Graphics graphics, Image glyph, Rectangle bounds, float opacity)
        {
            ColorMatrix matrix = new ColorMatrix();
            matrix.Matrix33 = opacity;
            using (ImageAttributes attributes = new ImageAttributes())
            {
                attributes.SetColorMatrix(matrix, ColorMatrixFlag.Default, ColorAdjustType.Bitmap);
                graphics.DrawImage(
                    glyph,
                    bounds,
                    0,
                    0,
                    glyph.Width,
                    glyph.Height,
                    GraphicsUnit.Pixel,
                    attributes);
            }
        }

        private static GraphicsPath RoundedRect(Rectangle bounds, int radius)
        {
            int diameter = radius * 2;
            GraphicsPath path = new GraphicsPath();
            path.AddArc(bounds.X, bounds.Y, diameter, diameter, 180, 90);
            path.AddArc(bounds.Right - diameter, bounds.Y, diameter, diameter, 270, 90);
            path.AddArc(bounds.Right - diameter, bounds.Bottom - diameter, diameter, diameter, 0, 90);
            path.AddArc(bounds.X, bounds.Bottom - diameter, diameter, diameter, 90, 90);
            path.CloseFigure();
            return path;
        }
    }
}
