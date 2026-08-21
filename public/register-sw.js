"use strict";

const stockSW = "/sw.js";
const swAllowedHostnames = ["localhost", "127.0.0.1"];

async function registerSW() {
	if (!navigator.serviceWorker) {
		if (
			location.protocol !== "https:" &&
			!swAllowedHostnames.includes(location.hostname)
		) {
			throw new Error("Service workers cannot be registered without https.");
		}
		throw new Error("Your browser doesn't support service workers.");
	}

	const reg = await navigator.serviceWorker.register(stockSW, { scope: "/" });
	
	// Wait until service worker is active & ready
	if (reg.installing || reg.waiting) {
		await new Promise((resolve) => {
			const sw = reg.installing || reg.waiting;
			if (!sw) return resolve();
			sw.addEventListener("statechange", () => {
				if (sw.state === "activated") resolve();
			});
		});
	}
	await navigator.serviceWorker.ready;
	return reg;
}
