import { createApp } from "vue";
import '@/theme/style.css'
import { bootstrapSettings } from "./composables/settings";
import { isTauri } from "./composables/rpc";
import App from "./App.vue";

// Paint the window with the saved palette before Vue mounts — no white flash.
bootstrapSettings();

/*
 * The shipped app is a desktop application, not a browser tab. WebView2 still
 * exposes its own context menu (Reload / Inspect / Save as…) and browser reload
 * shortcuts by default, which made right-clicking the settings page look like a
 * broken web page. Disable those in production only; the dev server keeps its
 * normal reload and devtools workflow.
 */
if (isTauri && import.meta.env.PROD) {
  // Set the property as well as a capture listener. WebView2 can raise its
  // native context menu for a few controls before the bubbling phase runs.
  window.oncontextmenu = (event) => {
    event.preventDefault();
    return false;
  };
  window.addEventListener('contextmenu', (event) => event.preventDefault(), { capture: true });

  window.addEventListener(
    'keydown',
    (event) => {
      const key = event.key.toLowerCase();
      const devtools =
        key === 'f12' ||
        ((event.ctrlKey || event.metaKey) && event.shiftKey && ['i', 'j', 'c'].includes(key));
      const reload = key === 'f5' || ((event.ctrlKey || event.metaKey) && key === 'r');
      if (devtools || reload) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    { capture: true },
  );
}

createApp(App).mount("#app");
