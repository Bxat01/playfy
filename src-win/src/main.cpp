// Playfy compatibility host.
//
// This tiny Win32 process can be copied under a selected executable name and
// launched next to the Playfy session card. It does not run or emulate the
// actual game. Discord may match the process name, but detection and Quest
// eligibility depend on Discord and cannot be guaranteed.
//
// It deliberately has no visible UI. A 1x1 transparent tool window carries a
// title for detectors that inspect top-level windows; the visible card is a
// separate application (playfy-session.exe) with its own taskbar button.
//
// No CRT, no .NET, no network, no third-party libraries.

#include <windows.h>
#include <shellapi.h>

#define PLAYFY_HOST_CLASS L"PlayfyGameHost"
#define PLAYFY_HOST_TIMER 1
#define PLAYFY_PARENT_CHECK_MS 2000
#define PLAYFY_TITLE_MAX 511

static wchar_t g_title[PLAYFY_TITLE_MAX + 1];
static DWORD g_parent_pid = 0;

static void CopyTitle(const wchar_t* source) {
    int i = 0;
    if (source != NULL) {
        while (source[i] != L'\0' && i < PLAYFY_TITLE_MAX) {
            g_title[i] = source[i];
            ++i;
        }
    }
    if (i == 0) {
        const wchar_t* fallback = L"Playfy Game";
        while (fallback[i] != L'\0' && i < PLAYFY_TITLE_MAX) {
            g_title[i] = fallback[i];
            ++i;
        }
    }
    g_title[i] = L'\0';
}

static DWORD ParsePid(const wchar_t* value) {
    DWORD result = 0;
    if (value == NULL) return 0;
    while (*value >= L'0' && *value <= L'9') {
        result = result * 10 + (DWORD)(*value - L'0');
        ++value;
    }
    return result;
}

static bool IsParentGone() {
    if (g_parent_pid == 0) return false;

    HANDLE process = OpenProcess(SYNCHRONIZE, FALSE, g_parent_pid);
    if (process == NULL) return true;

    DWORD state = WaitForSingleObject(process, 0);
    CloseHandle(process);
    return state == WAIT_OBJECT_0;
}

static LRESULT CALLBACK HostWindowProc(HWND hwnd, UINT message, WPARAM wParam, LPARAM lParam) {
    switch (message) {
    case WM_TIMER:
        if (wParam == PLAYFY_HOST_TIMER && IsParentGone()) {
            DestroyWindow(hwnd);
        }
        return 0;

    case WM_DESTROY:
        PostQuitMessage(0);
        return 0;

    default:
        return DefWindowProcW(hwnd, message, wParam, lParam);
    }
}

extern "C" {
    // The runner is linked with /NODEFAULTLIB, so the compiler's implicit
    // memset reference needs a small local implementation.
    #pragma function(memset)
    void* memset(void* destination, int value, size_t count) {
        unsigned char* bytes = (unsigned char*)destination;
        while (count--) {
            *bytes++ = (unsigned char)value;
        }
        return destination;
    }
}

extern "C" void mainEntryPoint() {
    g_title[0] = L"\0"[0];

    int argc = 0;
    LPWSTR* argv = CommandLineToArgvW(GetCommandLineW(), &argc);
    if (argv != NULL) {
        for (int i = 1; i < argc; ++i) {
            if (lstrcmpiW(argv[i], L"--title") == 0 && i + 1 < argc) {
                CopyTitle(argv[++i]);
            } else if (lstrcmpiW(argv[i], L"--parent") == 0 && i + 1 < argc) {
                g_parent_pid = ParsePid(argv[++i]);
            }
        }
        LocalFree(argv);
    }
    if (g_title[0] == L'\0') CopyTitle(NULL);

    HINSTANCE instance = GetModuleHandleW(NULL);

    WNDCLASSW windowClass;
    memset(&windowClass, 0, sizeof(windowClass));
    windowClass.lpfnWndProc = HostWindowProc;
    windowClass.hInstance = instance;
    windowClass.lpszClassName = PLAYFY_HOST_CLASS;
    RegisterClassW(&windowClass);

    HWND window = CreateWindowExW(
        WS_EX_TOOLWINDOW | WS_EX_LAYERED | WS_EX_NOACTIVATE,
        PLAYFY_HOST_CLASS,
        g_title,
        WS_POPUP,
        -32000,
        -32000,
        1,
        1,
        NULL,
        NULL,
        instance,
        NULL);

    if (window == NULL) {
        ExitProcess(1);
    }

    // Fully transparent, out of the taskbar and out of Alt-Tab. It still gives
    // Discord a real top-level window carrying the game title.
    SetLayeredWindowAttributes(window, 0, 0, LWA_ALPHA);
    ShowWindow(window, SW_SHOWNOACTIVATE);
    SetTimer(window, PLAYFY_HOST_TIMER, PLAYFY_PARENT_CHECK_MS, NULL);

    MSG message;
    while (GetMessageW(&message, NULL, 0, 0) > 0) {
        TranslateMessage(&message);
        DispatchMessageW(&message);
    }

    ExitProcess(0);
}
