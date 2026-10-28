import { existsSync, constants as fsConstants } from "node:fs";
import { access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
	app,
	BrowserWindow,
	dialog,
	nativeImage,
	screen,
	session,
	shell,
} from "electron";

import { createRuntimeSnapshot } from "./runtime-snapshot.mjs";
import { restoreWindowState, saveWindowState } from "./window-state.mjs";

const ELECTRON_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(ELECTRON_DIR, "..");
const APP_ICON_PATH = join(PROJECT_ROOT, "build", "icon.png");

const DEV_SERVER_URL =
	process.env.AUDIO_VERSIONS_ELECTRON_RENDERER_URL ?? "http://127.0.0.1:3000";
const SERVER_HOST = "127.0.0.1";
const SERVER_PORT = Number.parseInt(
	process.env.AUDIO_VERSIONS_ELECTRON_PORT ?? "31415",
	10,
);
const SERVER_BOOT_TIMEOUT_MS = 15_000;
const SERVER_READY_POLL_MS = 250;

/** @type {Promise<void> | null} */
let productionServerPromise = null;
let runtimeSnapshot = null;
/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {string | null} */
let pendingAuthCallbackUrl = null;

app.setAsDefaultProtocolClient("audio-versions");

function getRendererUrl() {
	return shouldUseProductionServer()
		? getProductionServerUrl()
		: DEV_SERVER_URL;
}

function buildAuthCallbackUrl(callbackUrl) {
	const callback = new URL(callbackUrl);
	const target = new URL("/auth/callback", getRendererUrl());
	target.search = callback.search;
	return target.toString();
}

app.on("open-url", (event, url) => {
	event.preventDefault();
	pendingAuthCallbackUrl = url;
	if (mainWindow && !mainWindow.isDestroyed()) {
		void mainWindow.loadURL(buildAuthCallbackUrl(url));
		pendingAuthCallbackUrl = null;
	}
});

function shouldUseProductionServer() {
	return (
		app.isPackaged ||
		process.env.AUDIO_VERSIONS_ELECTRON_USE_PRODUCTION_SERVER === "1"
	);
}

function getProductionServerUrl() {
	return `http://${SERVER_HOST}:${SERVER_PORT}`;
}

function getServerEntryPath() {
	if (app.isPackaged) {
		return join(process.resourcesPath, ".output", "server", "index.mjs");
	}

	return join(PROJECT_ROOT, ".output", "server", "index.mjs");
}

function delay(milliseconds) {
	return new Promise((resolve) => {
		setTimeout(resolve, milliseconds);
	});
}

async function canAccessFile(filePath) {
	try {
		await access(filePath, fsConstants.R_OK);
		return true;
	} catch {
		return false;
	}
}

async function waitForAudioVersions(url, timeoutMs) {
	const deadline = Date.now() + timeoutMs;

	while (Date.now() < deadline) {
		try {
			const response = await fetch(url, {
				signal: AbortSignal.timeout(1_000),
			});

			if (response.ok) {
				const html = await response.text();

				if (html.includes("<title>Audio Versions</title>")) {
					return;
				}
			}
		} catch {}

		await delay(SERVER_READY_POLL_MS);
	}

	throw new Error(`Timed out waiting for Audio Versions at ${url}.`);
}

async function startProductionServer() {
	if (productionServerPromise != null) {
		return productionServerPromise;
	}

	productionServerPromise = (async () => {
		const builtServerEntryPath = getServerEntryPath();

		if (!(await canAccessFile(builtServerEntryPath))) {
			throw new Error(
				`Missing built server at ${builtServerEntryPath}. Run npm run build before launching Electron.`,
			);
		}

		runtimeSnapshot = await createRuntimeSnapshot(
			resolve(builtServerEntryPath, "../.."),
			app.getPath("temp"),
		);
		const serverEntryPath = runtimeSnapshot.entryPath;
		process.env.HOST = SERVER_HOST;
		process.env.NODE_ENV = process.env.NODE_ENV ?? "production";
		process.env.PORT = String(SERVER_PORT);

		await import(pathToFileURL(serverEntryPath).href);
		await waitForAudioVersions(
			getProductionServerUrl(),
			SERVER_BOOT_TIMEOUT_MS,
		);
	})().catch((error) => {
		productionServerPromise = null;
		runtimeSnapshot?.cleanup();
		runtimeSnapshot = null;
		throw error;
	});

	return productionServerPromise;
}

function stopProductionServer() {
	productionServerPromise = null;
}

function getAppIcon() {
	if (!existsSync(APP_ICON_PATH)) {
		return undefined;
	}

	return nativeImage.createFromPath(APP_ICON_PATH);
}

async function createMainWindow() {
	const appIcon = getAppIcon();
	const statePath = join(app.getPath("userData"), "window-state.json");
	const savedState = restoreWindowState(statePath, screen.getAllDisplays());

	const window = new BrowserWindow({
		width: 1600,
		height: 1080,
		...(savedState
			? {
					x: savedState.x,
					y: savedState.y,
					width: savedState.width,
					height: savedState.height,
				}
			: {}),
		minWidth: 1200,
		minHeight: 800,
		show: false,
		backgroundColor: "#f4f1e8",
		...(appIcon ? { icon: appIcon } : {}),
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
		},
	});
	mainWindow = window;
	let saveTimer;
	const persistBounds = () => {
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => saveWindowState(statePath, window), 250);
	};
	for (const event of ["resize", "move", "maximize", "unmaximize"])
		window.on(event, persistBounds);
	window.on("close", () => {
		clearTimeout(saveTimer);
		saveWindowState(statePath, window);
	});
	window.on("closed", () => {
		if (mainWindow === window) {
			mainWindow = null;
		}
	});

	window.webContents.setWindowOpenHandler(({ url }) => {
		void shell.openExternal(url);
		return { action: "deny" };
	});

	window.webContents.on(
		"did-fail-load",
		(_event, errorCode, errorDescription) => {
			void dialog.showErrorBox(
				"Unable to load Audio Versions",
				`The app window failed to load (${errorCode}: ${errorDescription}).`,
			);
		},
	);

	window.once("ready-to-show", () => {
		if (savedState?.maximized) window.maximize();
		window.show();
	});

	if (shouldUseProductionServer()) {
		const targetUrl = pendingAuthCallbackUrl
			? buildAuthCallbackUrl(pendingAuthCallbackUrl)
			: getProductionServerUrl();
		pendingAuthCallbackUrl = null;
		await window.loadURL(targetUrl);
		return;
	}

	await waitForAudioVersions(DEV_SERVER_URL, SERVER_BOOT_TIMEOUT_MS);
	const targetUrl = pendingAuthCallbackUrl
		? buildAuthCallbackUrl(pendingAuthCallbackUrl)
		: DEV_SERVER_URL;
	pendingAuthCallbackUrl = null;
	await window.loadURL(targetUrl);
	window.webContents.openDevTools({ mode: "detach" });
}

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});

app.on("activate", () => {
	if (BrowserWindow.getAllWindows().length === 0) {
		void createMainWindow();
	}
});

app.on("before-quit", () => {
	stopProductionServer();
});
app.on("will-quit", () => runtimeSnapshot?.cleanup());

function denyDevicePermissions() {
	// Audio Versions never captures audio, video, or other hardware. Denying these
	// requests at the Chromium layer keeps the renderer from triggering macOS
	// TCC prompts (microphone, camera, etc.) when Chromium probes devices
	// during AudioContext / <audio> initialization.
	session.defaultSession.setPermissionRequestHandler(
		(_webContents, _permission, callback) => {
			callback(false);
		},
	);
	session.defaultSession.setPermissionCheckHandler(() => false);
}

async function launchAudioVersions() {
	denyDevicePermissions();

	const appIcon = getAppIcon();
	if (process.platform === "darwin" && appIcon != null) {
		app.dock.setIcon(appIcon);
	}

	if (shouldUseProductionServer()) {
		await startProductionServer();
	}

	await createMainWindow();
}

app
	.whenReady()
	.then(launchAudioVersions)
	.catch((error) => {
		console.error("[audio-versions] failed to launch", error);
		const message = error instanceof Error ? error.message : String(error);
		dialog.showErrorBox("Unable to launch Audio Versions", message);
		app.quit();
	});
