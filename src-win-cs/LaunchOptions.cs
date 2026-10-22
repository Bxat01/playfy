using System;
using System.Text;

namespace Playfy
{
    internal sealed class LaunchOptions
    {
        public string Title = "Playfy";
        public string Cover = "";
        public string Icon = "";
        public string Url = "";
        public string AppId = "";
        public string Repo = "https://github.com/Bxat01/playfy";
        public int ParentPid = 0;

        public static LaunchOptions Parse(string[] args)
        {
            LaunchOptions options = new LaunchOptions();
            if (args == null) return options;

            for (int i = 0; i < args.Length; i++)
            {
                string key = args[i];
                if (!key.StartsWith("--", StringComparison.Ordinal)) continue;

                // Everything up to the next --flag belongs to this value, so a
                // title with spaces survives even when the caller forgot quotes.
                StringBuilder value = new StringBuilder();
                int cursor = i + 1;
                while (cursor < args.Length && !args[cursor].StartsWith("--", StringComparison.Ordinal))
                {
                    if (value.Length > 0) value.Append(' ');
                    value.Append(args[cursor]);
                    cursor++;
                }
                i = cursor - 1;

                string text = value.ToString();
                if (text.Length == 0) continue;

                if (string.Equals(key, "--title", StringComparison.OrdinalIgnoreCase))
                {
                    options.Title = text;
                }
                else if (string.Equals(key, "--cover", StringComparison.OrdinalIgnoreCase))
                {
                    options.Cover = text;
                }
                else if (string.Equals(key, "--icon", StringComparison.OrdinalIgnoreCase))
                {
                    options.Icon = text;
                }
                else if (string.Equals(key, "--url", StringComparison.OrdinalIgnoreCase))
                {
                    options.Url = text;
                }
                else if (string.Equals(key, "--appid", StringComparison.OrdinalIgnoreCase) ||
                         string.Equals(key, "--id", StringComparison.OrdinalIgnoreCase))
                {
                    options.AppId = text;
                }
                else if (string.Equals(key, "--repo", StringComparison.OrdinalIgnoreCase))
                {
                    options.Repo = text;
                }
                else if (string.Equals(key, "--parent", StringComparison.OrdinalIgnoreCase))
                {
                    int parent;
                    if (int.TryParse(text, out parent)) options.ParentPid = parent;
                }
            }

            return options;
        }
    }
}
