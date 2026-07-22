import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const electronBinary = require("electron");
const devServerUrl =
	process.env.VERSION_COMPARE_ELECTRON_RENDERER_URL ?? "http://127.0.0.1:3000";
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const devServerProcess = spawn(npmCommand, ["run", "dev"], {
	cwd: process.cwd(),
	env: process.env,
	stdio: "inherit",
});

const electronProcess = spawn(electronBinary, ["electron/main.mjs"], {
	cwd: process.cwd(),
	env: {
		...process.env,
		VERSION_COMPARE_ELECTRON_RENDERER_URL: devServerUrl,
	},
	stdio: "inherit",
});

let shuttingDown = false;

function terminateProcess(childProcess) {
	if (childProcess.killed || childProcess.exitCode != null) {
		return;
	}

	childProcess.kill("SIGTERM");
}

function shutdown(exitCode = 0) {
	if (shuttingDown) {
		return;
	}

	shuttingDown = true;
	terminateProcess(electronProcess);
	terminateProcess(devServerProcess);
	process.exit(exitCode);
}

electronProcess.on("exit", (code) => {
	shutdown(code ?? 0);
});

devServerProcess.on("exit", (code) => {
	if (shuttingDown) {
		return;
	}

	shutdown(code ?? 1);
});

process.on("SIGINT", () => {
	shutdown(0);
});

process.on("SIGTERM", () => {
	shutdown(0);
});
