const N_POINTS = 200;
const BW_FACTOR = 0.08;
const X_MIN = 1;
const X_MAX = 5;

function linspace(a, b, n) {
	const out = new Array(n);
	const step = n > 1 ? (b - a) / (n - 1) : 0;
	for (let i = 0; i < n; i++) out[i] = a + step * i;
	return out;
}

function sampleVariance(samples) {
	const n = samples.length;
	if (n < 2) return 0;
	const mean = samples.reduce((s, v) => s + v, 0) / n;
	let ss = 0;
	for (const v of samples) {
		const d = v - mean;
		ss += d * d;
	}
	return ss / (n - 1);
}

/**
 * @param {number[]} samples
 * @param {number[]} xGrid
 * @returns {number[]}
 */
function kdeDensity(samples, xGrid) {
	const n = samples.length;
	if (n < 3) return xGrid.map(() => 0);
	const variance = sampleVariance(samples);
	const sigma2 = variance * BW_FACTOR * BW_FACTOR;
	if (sigma2 <= 0 || !Number.isFinite(sigma2)) return xGrid.map(() => 0);
	const sigma = Math.sqrt(sigma2);
	const coef = 1 / (n * Math.sqrt(2 * Math.PI) * sigma);
	return xGrid.map((x) => {
		let sum = 0;
		for (const xi of samples) {
			const d = x - xi;
			sum += Math.exp(-0.5 * (d * d) / sigma2);
		}
		return coef * sum;
	});
}

function roundSeries(arr, places) {
	const m = 10 ** places;
	return arr.map((v) => Math.round(v * m) / m);
}

/**
 * @param {Array<{ set?: string; concreteness?: string | number }>} rows
 */
export function buildConcretenessKdePayload(rows) {
	const bySet = { removed: [], remained: [], added: [] };
	for (const row of rows) {
		const set = row?.set;
		const c = Number(row?.concreteness);
		if (!set || !Number.isFinite(c)) continue;
		if (!bySet[set]) continue;
		bySet[set].push(c);
	}

	const removed = bySet.removed;
	const remained = bySet.remained;
	const added = bySet.added;
	const gsl = removed.concat(remained);
	const ngsl = added.concat(remained);

	const x = linspace(X_MIN, X_MAX, N_POINTS);

	const series = {
		gsl: { values: roundSeries(kdeDensity(gsl, x), 6), n: gsl.length },
		ngsl: { values: roundSeries(kdeDensity(ngsl, x), 6), n: ngsl.length }
	};

	return {
		x: roundSeries(x, 4),
		series,
		bandwidth: BW_FACTOR
	};
}
