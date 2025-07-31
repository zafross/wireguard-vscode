const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const child_process = require("child_process");

// Extension name used in status bar messages
const EXTENSION_NAME = "WireGuard";

// Status bar messages with Codicon icons
const statusMessages = {
  noConfig: `$(question) ${EXTENSION_NAME}: No Config`,
  error: `$(error) ${EXTENSION_NAME}: Error`,
};

const PROXY_PORT = 25345;

let wireproxyProcess = null;
let statusBar = null;
let currentWireguardPath = null;

// Activates the extension
exports.activate = function (context) {
  const configDir = path.join(context.extensionPath, "config");
  const configPath = path.join(configDir, "wireproxy.conf");

  // Start wireproxy if config exists
  if (fs.existsSync(configPath)) {
    currentWireguardPath = getWireguardPath(configPath);
    if (currentWireguardPath) {
      startWireproxy(configPath, getProfileName(currentWireguardPath));
    }
  }

  // Initialize status bar
  statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right
  );
  statusBar.command = "wireproxy.configure";
  statusBar.text = currentWireguardPath
    ? `$(check) ${EXTENSION_NAME}: ${getProfileName(currentWireguardPath)}`
    : statusMessages.noConfig;
  statusBar.show();
  updateTooltip(); // Update tooltip on startup
  context.subscriptions.push(statusBar);

  // Register configure command
  context.subscriptions.push(
    vscode.commands.registerCommand("wireproxy.configure", () =>
      selectConfig(context, configPath)
    )
  );
};

// Deactivates the extension
exports.deactivate = function () {
  stopWireproxy();
};

// Prompts user to select a WireGuard config file
async function selectConfig(context, configPath) {
  const file = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    openLabel: "Select WireGuard Config",
    filters: { "WireGuard Config": ["conf"] },
  });

  if (file?.[0]) {
    const newWireguardPath = file[0].fsPath;
    if (newWireguardPath === currentWireguardPath) return;
    updateConfig(configPath, newWireguardPath);
    startWireproxy(configPath, getProfileName(newWireguardPath), true);
  }
}

// Extracts WireGuard config path from wireproxy.conf
function getWireguardPath(configPath) {
  try {
    const content = fs.readFileSync(configPath, "utf8");
    const match = content.match(/^WGConfig = "(.*)"/m);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// Extracts profile name from WireGuard config path
function getProfileName(wireguardPath) {
  return wireguardPath ? path.basename(wireguardPath, ".conf") : "";
}

// Updates or creates wireproxy.conf
function updateConfig(configPath, wireguardPath) {
  const configDir = path.dirname(configPath);
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir);
  const content = `WGConfig = "${wireguardPath}"\n[http]\nBindAddress = 127.0.0.1:${PROXY_PORT}`;
  fs.writeFileSync(configPath, content);
  currentWireguardPath = wireguardPath;
}

// Resets configuration on error
function resetConfig(configPath) {
  if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
  currentWireguardPath = null;
  if (statusBar) {
    statusBar.text = statusMessages.noConfig;
    updateTooltip();
  }
  vscode.workspace
    .getConfiguration("http")
    .update("proxy", "", vscode.ConfigurationTarget.Global);
}

// Starts wireproxy process
function startWireproxy(configPath, profileName, isNewConfig = false) {
  stopWireproxy();
  vscode.workspace
    .getConfiguration("http")
    .update(
      "proxy",
      `http://127.0.0.1:${PROXY_PORT}`,
      vscode.ConfigurationTarget.Global
    );
  wireproxyProcess = child_process.spawn("wireproxy", ["-c", configPath]);

  if (isNewConfig && statusBar) {
    statusBar.text = `$(check) ${EXTENSION_NAME}: ${profileName}`;
    updateTooltip();
  }

  wireproxyProcess.on("error", (err) => {
    if (err.code === "ENOENT") {
      vscode.window.showErrorMessage(
        "WireProxy is not installed. Please install wireproxy and add it to your PATH."
      );
      if (isNewConfig) resetConfig(configPath);
      else if (statusBar) {
        statusBar.text = statusMessages.error;
        updateTooltip();
        stopWireproxy();
      }
    } else if (isNewConfig) {
      vscode.window.showErrorMessage("Invalid WireGuard config file!");
      resetConfig(configPath);
    } else {
      vscode.window.showErrorMessage(`WireProxy error: ${err.message}`);
      if (statusBar) {
        statusBar.text = statusMessages.error;
        updateTooltip();
      }
      stopWireproxy();
    }
  });

  wireproxyProcess.on("exit", (code) => {
    wireproxyProcess = null;
    if (statusBar) {
      statusBar.text = statusMessages.noConfig;
      updateTooltip();
    }
    if (code !== 0) {
      vscode.window.showErrorMessage(`WireProxy exited with code ${code}`);
    }
  });
}

// Stops wireproxy process and clears proxy settings
function stopWireproxy() {
  if (wireproxyProcess) {
    wireproxyProcess.kill();
    wireproxyProcess = null;
    vscode.workspace
      .getConfiguration("http")
      .update("proxy", "", vscode.ConfigurationTarget.Global);
  }
}

// Gets status from status bar text
function getStatusFromText(text) {
  if (text.startsWith("$(check)")) return "Connected";
  else if (text.startsWith("$(question)")) return "No Config";
  else if (text.startsWith("$(error)")) return "Error";
  else return "Unknown";
}

// Updates status bar tooltip
function updateTooltip() {
  if (statusBar) {
    const status = getStatusFromText(statusBar.text);
    const port = PROXY_PORT;
    statusBar.tooltip = `Status: ${status}\nWireproxy port: ${port}`;
  }
}
