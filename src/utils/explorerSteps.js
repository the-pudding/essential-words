const activeIds = new Set();
const listeners = new Set();

function notify() {
	const active = activeIds.size > 0;
	for (const listener of listeners) listener(active);
}

function setActive(id, active) {
	if (typeof window === "undefined") return;
	const wasActive = activeIds.size > 0;
	if (active) activeIds.add(id);
	else activeIds.delete(id);
	if (wasActive !== activeIds.size > 0) notify();
}

/** @param {string} id @param {number} step @param {number} count */
export function reportExplorerStep(id, step, count) {
	setActive(id, step >= 0 && step < count);
}

/** @param {string} id */
export function clearExplorerStep(id) {
	setActive(id, false);
}

/** @param {(active: boolean) => void} listener */
export function subscribeExplorerSteps(listener) {
	listeners.add(listener);
	listener(activeIds.size > 0);
	return () => listeners.delete(listener);
}
