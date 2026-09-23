const TELEGRAM_URL = "https://web.telegram.org/a/";
let scramjetInstance = null;
let activeFrame = null;
let proxyInitialized = false;

function isTrustworthyOrigin() {
	return (
		location.protocol === "https:" ||
		location.hostname === "localhost" ||
		location.hostname === "127.0.0.1"
	);
}

async function initProxy() {
	if (!isTrustworthyOrigin()) {
		throw new Error("Service Worker requires HTTPS, localhost, or 127.0.0.1");
	}

	if (typeof $scramjetLoadController !== "function") {
		throw new Error("Scramjet failed to load");
	}

	const { ScramjetController } = $scramjetLoadController();
	scramjetInstance = new ScramjetController({
		prefix: "/scramjet/",
		files: {
			wasm: "/scram/scramjet.wasm.wasm",
			all: "/scram/scramjet.all.js",
		},
	});
	await scramjetInstance.init();

	if (!("serviceWorker" in navigator)) {
		throw new Error("This browser does not support service workers");
	}
	await navigator.serviceWorker.register("/sw.js", { scope: "/" });
	await navigator.serviceWorker.ready;

	if (typeof BareMux === "undefined") {
		throw new Error("BareMux failed to load");
	}

	const connection = new BareMux.BareMuxConnection("/baremux/worker.js");
	const protocol = location.protocol === "https:" ? "wss:" : "ws:";
	await connection.setTransport("/libcurl/index.mjs", [
		{ wisp: `${protocol}//${location.host}/wisp/` },
	]);

	// Give a managed ingress a moment to establish the WebSocket before making
	// the first heavy Telegram request.
	await new Promise((resolve) => setTimeout(resolve, 800));
	proxyInitialized = true;
}

function showFailure(loading, error) {
	loading.textContent = "";
	const message = document.createElement("div");
	message.style.cssText = "text-align:center;line-height:1.6";
	message.append("Connection failed.");

	const details = document.createElement("div");
	details.textContent = error?.message || "Please try again.";
	details.style.cssText = "color:#aaa;font-size:12px;margin-top:4px";

	const button = document.createElement("button");
	button.type = "button";
	button.textContent = "Reload";
	button.style.cssText =
		"margin-top:10px;padding:8px 16px;background:#333;color:#fff;border:0;border-radius:4px;cursor:pointer";
	button.addEventListener("click", () => location.reload());

	message.append(details, button);
	loading.appendChild(message);
}

async function launch(retryCount = 0) {
	const viewport = document.getElementById("viewport");
	const loading = document.getElementById("loading");

	try {
		if (!proxyInitialized) await initProxy();
		if (
			!scramjetInstance ||
			typeof scramjetInstance.createFrame !== "function"
		) {
			throw new Error("Scramjet controller is unavailable");
		}

		if (!activeFrame) {
			activeFrame = scramjetInstance.createFrame();
			const frame = activeFrame.frame;
			frame.style.cssText =
				"position:fixed;inset:0;width:100%;height:100%;border:0;margin:0;padding:0";
			frame.setAttribute(
				"allow",
				"camera; microphone; display-capture; geolocation; clipboard-read; clipboard-write; autoplay; fullscreen"
			);
			viewport.appendChild(frame);
		}

		await activeFrame.go(TELEGRAM_URL);
		loading.classList.add("hidden");
	} catch (error) {
		console.error("Launch error:", error);
		if (retryCount < 3) {
			loading.querySelector("div")?.replaceChildren("Retrying…");
			setTimeout(() => launch(retryCount + 1), 1500);
		} else {
			showFailure(loading, error);
		}
	}
}

window.addEventListener("DOMContentLoaded", () => launch());
