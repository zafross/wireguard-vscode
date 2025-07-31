# WireGuard for VSCode

Tunnel VSCode network requests through WireGuard using wireproxy for enhanced security and bypassing regional restrictions. Automatically activates on startup to ensure seamless, secure connectivity.

## Installation

1. **Install the Extension**:

   - Search for `WireGuard for VSCode` in the VSCode Marketplace and click **Install**.

2. **Install wireproxy**:

   - Download the [`wireproxy`](https://github.com/whyvl/wireproxy) binary from [wireproxy releases](https://github.com/whyvl/wireproxy/releases).
   - **Windows**: Add the `wireproxy.exe` directory to your PATH:
     - Open System Properties → Advanced → Environment Variables.
     - Edit the `Path` variable and add the directory containing `wireproxy.exe`.
   - **Linux/macOS**: After installation, `wireproxy` is typically added to PATH automatically.

## Usage

1. Click the status bar item (`WireProxy: No Config` or similar) in the bottom-right corner of VSCode.
2. Select a WireGuard configuration file (`.conf`) via the file picker.
3. The extension will automatically start `wireproxy`, set the proxy, and update the status bar to `WireProxy: <profile_name>`.

## How It Works

The extension automates secure tunneling of VSCode’s network traffic (e.g., extension downloads, telemetry):

- Sets `http.proxy` to `http://127.0.0.1:25345` in VSCode settings.
- Spawns the `wireproxy` process with the selected WireGuard `.conf` file.
- Displays real-time connection status via the status bar with a tooltip showing the current status and port.
- Handles errors gracefully, resetting the configuration if `wireproxy` fails or the config is invalid.

## Contributing

This is a small personal project to simplify secure VSCode networking, but I’d love contributions! Feel free to open issues or submit pull requests on GitHub.
