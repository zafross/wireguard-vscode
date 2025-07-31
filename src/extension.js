const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const child_process = require("child_process");

const EXTENSION_NAME = "WireGuard";
const statusMessages = {
  noConfig: `$(question) ${EXTENSION_NAME}: No Config`,
  error: `$(error) ${EXTENSION_NAME}: Error`,
  starting: `$(sync~spin) ${EXTENSION_NAME}: Starting...`,
};
const PROXY_PORT = 25345;

let wireproxyProcess = null;
let statusBar = null;
let currentWireguardPath = null;
let isStopping = false;

// Activates the extension and initializes status bar
exports.activate = function (context) {
  const configPath = path.join(
    context.extensionPath,
    "config",
    "wireproxy.conf"
  );

  if (fs.existsSync(configPath)) {
    currentWireguardPath = getWireguardPath(configPath);
    if (currentWireguardPath) {
      startWireproxy(configPath, getProfileName(currentWireguardPath));
    }
  }

  statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right
  );
  statusBar.command = "wireproxy.configure";
  statusBar.text = currentWireguardPath
    ? `$(check) ${EXTENSION_NAME}: ${getProfileName(currentWireguardPath)}`
    : statusMessages.noConfig;
  statusBar.show();
  updateTooltip();
  context.subscriptions.push(statusBar);

  context.subscriptions.push(
    vscode.commands.registerCommand("wireproxy.configure", () =>
      selectConfig(context, configPath)
    )
  );
};

// Deactivates the extension, stopping wireproxy
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
    await stopWireproxy();
    updateConfig(configPath, newWireguardPath);
    statusBar.text = statusMessages.starting;
    updateTooltip();
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
  fs.writeFileSync(
    configPath,
    `WGConfig = "${wireguardPath}"\n[http]\nBindAddress = 127.0.0.1:${PROXY_PORT}`
  );
  currentWireguardPath = wireguardPath;
}

// Resets configuration on error
function resetConfig(configPath) {
  if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
  currentWireguardPath = null;
  statusBar.text = statusMessages.noConfig;
  updateTooltip();
  vscode.workspace
    .getConfiguration("http")
    .update("proxy", "", vscode.ConfigurationTarget.Global);
}

// Starts wireproxy process and sets up proxy
function startWireproxy(configPath, profileName, isNewConfig = false) {
  stopWireproxy();

  vscode.workspace
    .getConfiguration("http")
    .update(
      "proxy",
      `http://127.0.0.1:${PROXY_PORT}`,
      vscode.ConfigurationTarget.Global
    );

  try {
    wireproxyProcess = child_process.spawn("wireproxy", ["-c", configPath]);
  } catch (err) {
    handleError(err, configPath, isNewConfig);
    return;
  }

  // Wait 1 second to confirm process stability before updating status bar
  setTimeout(() => {
    if (wireproxyProcess && !wireproxyProcess.killed) {
      if (statusBar && isNewConfig) {
        statusBar.text = `$(check) ${EXTENSION_NAME}: ${profileName}`;
        updateTooltip();
      }
    } else if (isNewConfig) {
      resetConfig(configPath);
    } else {
      statusBar.text = statusMessages.error;
      updateTooltip();
      stopWireproxy();
    }
  }, 1000);

  wireproxyProcess.on("error", (err) =>
    handleError(err, configPath, isNewConfig)
  );

  // Suppress SIGTERM during intentional stop to avoid false error messages
  wireproxyProcess.on("exit", (code, signal) => {
    if (isStopping && signal === "SIGTERM") {
      return;
    }
    if (code === 0) {
      if (statusBar && isNewConfig) {
        statusBar.text = `$(check) ${EXTENSION_NAME}: ${profileName}`;
        updateTooltip();
      }
    } else {
      vscode.window.showErrorMessage(
        `WireProxy exited with code ${code || signal || "unknown"}. Possibly invalid configuration file.`
      );
      if (isNewConfig) resetConfig(configPath);
      else {
        statusBar.text = statusMessages.error;
        updateTooltip();
      }
      stopWireproxy();
    }
  });
}

// Handles spawn and runtime errors
function handleError(err, configPath, isNewConfig) {
  const message =
    err.code === "ENOENT"
      ? "WireProxy is not installed. Please install wireproxy and add it to your PATH."
      : "WireProxy failed to start.";
  vscode.window.showErrorMessage(
    `${message} Possibly invalid configuration file.`
  );
  if (isNewConfig) resetConfig(configPath);
  else {
    statusBar.text = statusMessages.error;
    updateTooltip();
    stopWireproxy();
  }
}

// Stops wireproxy process asynchronously and clears proxy settings
async function stopWireproxy() {
  if (wireproxyProcess && !wireproxyProcess.killed) {
    isStopping = true;
    return new Promise((resolve) => {
      wireproxyProcess.kill("SIGTERM");
      wireproxyProcess.on("close", () => {
        wireproxyProcess = null;
        isStopping = false;
        vscode.workspace
          .getConfiguration("http")
          .update("proxy", "", vscode.ConfigurationTarget.Global);
        resolve();
      });
    });
  }
  return Promise.resolve();
}

// Gets status from status bar text
function getStatusFromText(text) {
  if (text.startsWith("$(check)")) return "Connected";
  if (text.startsWith("$(question)")) return "No Config";
  if (text.startsWith("$(error)")) return "Error";
  if (text.startsWith("$(sync~spin)")) return "Starting";
  return "Unknown";
}

// Updates status bar tooltip with current status and port
function updateTooltip() {
  if (statusBar) {
    const status = getStatusFromText(statusBar.text);
    statusBar.tooltip = `Status: ${status}\nWireproxy port: ${PROXY_PORT}`;
  }
}
