import * as d3 from "d3";

function readCssPx(el, varName, fallback) {
	if (!el) return fallback;
	const raw = getComputedStyle(el).getPropertyValue(varName).trim();
	if (!raw) return fallback;
	const n = parseFloat(raw);
	return Number.isFinite(n) ? n : fallback;
}

function readCssString(el, varName, fallback) {
	if (!el) return fallback;
	const raw = getComputedStyle(el).getPropertyValue(varName).trim();
	return raw || fallback;
}


export function readScopeMetrics(containerEl) {
	const root = containerEl?.closest?.(".scope") ?? containerEl;
	const px = (name, fb) => readCssPx(root, name, fb);
	const str = (name, fb) => readCssString(root, name, fb);
	return {
		// layout
		viewBox: px("--scope-viewbox", 1000),
		centerR: px("--scope-center-r", 32),
		maxR: px("--scope-max-r", 360),
		ringGap: px("--scope-ring-gap", 32),
		minRingDepthPx: px("--scope-min-ring-depth", 10),
		splitGapPx: px("--scope-split-gap", 8),
		labelGapBias: parseFloat(str("--scope-label-gap-bias", "0.25")) || 0,
		labelOuterPad: px("--scope-label-outer-pad", 8),
		// tiles
		rectW: px("--scope-rect-w", 8),
		rectH: px("--scope-rect-h", 2),
		dotEdgeGap: px("--scope-dot-edge-gap", 1.5),
		dotAlign: str("--scope-dot-align", "inner"),
		hitRadius: px("--scope-hit-radius", 5),
		ringArcOffset: px("--scope-ring-arc-offset", 2),
		hoverScale: parseFloat(str("--scope-hover-scale", "1.6")) || 1.6,
		// typography
		ringLabelSize: px("--scope-ring-label-size", 12),
		pctLabelSize: px("--scope-pct-label-size", 10),
		// typography
		headerFontSize: px("--scope-header-font-size", 16),
		// transitions
		focusFadeMs: px("--scope-focus-fade-ms", 220),
		dividerExpandMs: px("--scope-divider-expand-ms", 700),
		listHeaderGap: px("--scope-list-header-gap", 32),
		listHeaderTransitionMs: px("--scope-list-header-transition-ms", 700),
		headerLayout: str("--scope-header-layout", "side"),
		headerTopPad: px("--scope-header-top-pad", 12),
		hoverMs: px("--scope-hover-ms", 180),
		// zoom stuff
		zoomMax: parseFloat(str("--scope-zoom-max", "6")) || 6,
		zoomMs: px("--scope-zoom-ms", 700)
	};
}

export const SCOPE_COLORS = {
	background: "var(--color-bg, #FFFFF1)",
	remained: "var(--scope-color-remained, var(--color-secondary, #8F8A77))",
	removed: "var(--scope-color-removed, var(--color-gsl, #ED9027))",
	added: "var(--scope-color-added, var(--color-ngsl, #DB6AE8))",
	ringStroke: "var(--scope-ring-stroke, #d0cbc4)",
	divider: "var(--scope-divider, var(--color-primary, #5B5B5B))",
	label: "var(--scope-label, var(--color-primary, #504a44))"
};

export const SCOPE_RING_STROKE_WIDTH = 1;

const SET_LABELS = {
	remained: "in both lists",
	removed: "removed word",
	added: "added word"
};

/**
 * @param {HTMLElement} container
 * @param {ReturnType<typeof import("./scopePayload.js").buildScopePayload>} payload
 */
export function renderScopeChart(container, payload, options = {}) {
	if (!container || !payload) return null;
	const { interactive = true } = options;
	const m = readScopeMetrics(container);

	const W = m.viewBox;
	const H = m.viewBox;
	const cx = W / 2;
	const cy = H / 2;
	const halfSplit = m.splitGapPx / 2;
	const cxLeft = cx - halfSplit;
	const cxRight = cx + halfSplit;

	const radialStride = m.rectW + m.dotEdgeGap;
	const tangentialStride = m.rectH + m.dotEdgeGap;

	const rings = payload.rings;
	const nRings = rings.length;

	rings.forEach((ring, ri) => {
		ring.gslWords.forEach((w, i) => {
			w._id = `g-${ri}-${i}`;
			w._ringIdx = ri;
			w._side = "left";
		});
		ring.ngslWords.forEach((w, i) => {
			w._id = `n-${ri}-${i}`;
			w._ringIdx = ri;
			w._side = "right";
		});
	});

	function computeRingRadialDepth(rMin, wordCount) {
		if (wordCount <= 0) return m.minRingDepthPx;
		let idx = 0;
		let r = rMin + m.rectW / 2 + m.dotEdgeGap * 0.5;
		const positions = [];
		while (idx < wordCount) {
			const capacity = Math.max(1, Math.floor((Math.PI * r) / tangentialStride));
			const n = Math.min(capacity, wordCount - idx);
			positions.push({ r, n, full: n === capacity });
			idx += n;
			r += radialStride;
		}
		if (!positions.length) return m.minRingDepthPx;
		if (m.dotAlign === "center") {
			const usedR =
				positions[positions.length - 1].r + m.rectW / 2 - (positions[0].r - m.rectW / 2);
			return Math.max(m.minRingDepthPx, usedR);
		}
		const lastR = positions[positions.length - 1].r;
		return Math.max(m.minRingDepthPx, lastR + m.rectW / 2 - rMin);
	}

	function clearWordLayout() {
		for (const ring of rings) {
			for (const w of ring.gslWords) {
				w.x = null;
				w.y = null;
				w.theta = null;
			}
			for (const w of ring.ngslWords) {
				w.x = null;
				w.y = null;
				w.theta = null;
			}
		}
	}

	function placementOverflow() {
		for (const ring of rings) {
			for (const w of ring.gslWords) if (w.x == null) return true;
			for (const w of ring.ngslWords) if (w.x == null) return true;
		}
		return false;
	}

	function placeDots(words, rMin, rMax, side) {
		const cxSide = side === "left" ? cxLeft : cxRight;
		let idx = 0;
		let r = rMin + m.rectW / 2 + m.dotEdgeGap * 0.5;
		const positions = [];

		while (idx < words.length && r + m.rectW / 2 <= rMax + 0.5) {
			const capacity = Math.max(1, Math.floor((Math.PI * r) / tangentialStride));
			const n = Math.min(capacity, words.length - idx);
			positions.push({ r, n, startIdx: idx, full: n === capacity });
			idx += n;
			r += radialStride;
		}

		const usedR = positions.length
			? positions[positions.length - 1].r + m.rectW / 2 - (positions[0].r - m.rectW / 2)
			: 0;
		const rOffset = m.dotAlign === "center" ? Math.max(0, (rMax - rMin - usedR) / 2) : 0;

		for (const pos of positions) {
			const ar = pos.r + rOffset;
			const step = pos.full
				? Math.PI / pos.n
				: Math.PI / Math.max(1, Math.floor((Math.PI * ar) / tangentialStride));
			const start = step / 2;
			for (let i = 0; i < pos.n; i++) {
				const angle = start + i * step;
				const theta = side === "left" ? -Math.PI / 2 - angle : -Math.PI / 2 + angle;
				const w = words[pos.startIdx + i];
				w.x = cxSide + ar * Math.cos(theta);
				w.y = cy + ar * Math.sin(theta);
				w.theta = theta;
			}
		}
	}


	let rCursor = m.centerR;
	const naturalDepths = [];
	for (const ring of rings) {
		const wc = Math.max(ring.gslWords.length, ring.ngslWords.length);
		const need = computeRingRadialDepth(rCursor, wc);
		const d = Math.max(m.minRingDepthPx, need);
		naturalDepths.push(d);
		rCursor += d + m.ringGap;
	}


	const gapTotal = (nRings - 1) * m.ringGap;
	const budget = m.maxR - m.centerR - gapTotal;
	const sumNatural = naturalDepths.reduce((a, b) => a + b, 0);
	let scale = sumNatural > 0 ? budget / sumNatural : 1;

	let bands = [];
	let outerR = m.centerR;
	for (let guard = 0; guard < 80; guard++) {
		rCursor = m.centerR;
		bands = [];
		for (let i = 0; i < nRings; i++) {
			const d = Math.max(m.minRingDepthPx, naturalDepths[i] * scale);
			bands.push({ rMin: rCursor, rMax: rCursor + d });
			rCursor += d + m.ringGap;
		}
		outerR = rCursor - m.ringGap;
		clearWordLayout();
		rings.forEach((ring, i) => {
			placeDots(ring.gslWords, bands[i].rMin, bands[i].rMax, "left");
			placeDots(ring.ngslWords, bands[i].rMin, bands[i].rMax, "right");
		});
		if (!placementOverflow()) break;
		scale *= 1.035;
	}

	const plotR = Math.max(m.maxR, outerR);

	const dividerClearance = 24;
	const padTop =
		m.headerLayout === "top"
			? dividerClearance + m.headerFontSize + m.headerTopPad
			: dividerClearance;
	const padBottom = dividerClearance;
	
	const headerAllowance = m.rectW;
	const padX = Math.max(m.rectW, headerAllowance);
	const vbX = cx - plotR - padX;
	const vbY = cy - plotR - padTop;
	const vbW = plotR * 2 + padX * 2;
	const vbH = plotR * 2 + padTop + padBottom;

	const svg = d3
		.create("svg")
		.attr("class", "scope-svg")
		.attr("viewBox", [vbX, vbY, vbW, vbH])
		.attr("preserveAspectRatio", "xMidYMid meet")
		.attr("width", "100%")
		.attr("height", "100%")
		.style("display", "block")
		.style("overflow", "hidden");

	const defs = svg.append("defs");

	// geometry layers live inside this group so each step can zoom toward the focused
	// ring. defs stays on <svg> (it is never rendered, only referenced).
	const zoomG = svg.append("g").attr("class", "scope-zoom-root");

	// Ring boundary arcs
	function semiArc(r, side) {
		const cx0 = side === "left" ? cxLeft : cxRight;
		const top = `${cx0} ${cy - r}`;
		const bot = `${cx0} ${cy + r}`;
		const flag = side === "left" ? 0 : 1;
		return `M ${top} A ${r} ${r} 0 0 ${flag} ${bot}`;
	}

	const ringArcsG = zoomG.append("g").attr("class", "scope-ring-arcs");
	const arcOut = m.ringArcOffset;
	bands.forEach((band, ringIdx) => {
		const innerR = band.rMin - arcOut;
		const outerR = band.rMax + arcOut;
		for (const side of ["left", "right"]) {
			for (const r of [innerR, outerR]) {
				if (r <= m.centerR + 0.5) continue;
				ringArcsG
					.append("path")
					.attr("data-ring", ringIdx + 1)
					.attr("d", semiArc(r, side))
					.attr("fill", "none")
					.attr("stroke", SCOPE_COLORS.ringStroke)
					.attr("stroke-width", SCOPE_RING_STROKE_WIDTH)
					.attr("vector-effect", "non-scaling-stroke");
			}
		}
	});

	const dividerY1 = cy - plotR - 12;
	const dividerY2 = cy + plotR + 12;
	const divider = zoomG
		.append("line")
		.attr("class", "scope-divider")
		.attr("x1", cx)
		.attr("x2", cx)
		.attr("y1", dividerY1)
		.attr("y2", dividerY2)
		.attr("stroke", SCOPE_COLORS.divider)
		.attr("stroke-width", 1)
		.attr("stroke-dasharray", "4,8")
		.attr("vector-effect", "non-scaling-stroke")
		.attr("stroke-opacity", 0.7);

	const allDots = [];
	for (const ring of rings) {
		for (const w of ring.gslWords) if (w.x != null) allDots.push(w);
		for (const w of ring.ngslWords) if (w.x != null) allDots.push(w);
	}

	const dotLayer = zoomG.append("g").attr("class", "scope-dots");

	const dotSel = dotLayer
		.selectAll("rect.scope-dot")
		.data(allDots, (d) => d._id)
		.join("rect")
		.attr("class", (d) => `scope-dot scope-dot--${d.s}`)
		.attr("data-id", (d) => d._id)
		.attr("data-ring", (d) => d._ringIdx + 1)
		.attr("x", (d) => d.x - m.rectW / 2)
		.attr("y", (d) => d.y - m.rectH / 2)
		.attr("width", m.rectW)
		.attr("height", m.rectH)
		.attr("fill", (d) => {
			if (d.s === "remained") return SCOPE_COLORS.remained;
			if (d.s === "removed") return SCOPE_COLORS.removed;
			return SCOPE_COLORS.added;
		})
		.attr("transform", (d) => `rotate(${(d.theta * 180) / Math.PI}, ${d.x}, ${d.y})`)
		.style("pointer-events", "none");


	const hitSel = interactive
		? dotLayer
				.selectAll("circle.scope-hit")
				.data(allDots, (d) => d._id)
				.join("circle")
				.attr("class", "scope-hit")
				.attr("data-id", (d) => d._id)
				.attr("data-ring", (d) => d._ringIdx + 1)
				.attr("cx", (d) => d.x)
				.attr("cy", (d) => d.y)
				.attr("r", m.hitRadius)
				.attr("fill", "transparent")
				.style("cursor", "default")
		: null;

	// Ring labels
	const labelLayer = zoomG.append("g").attr("class", "scope-ring-labels");
	const spc = "\u00A0\u00A0\u00A0\u00A0";
	const span = 1.4;

	function appendLabelTspans(parent, ring) {
		parent
			.append("tspan")
			.attr("class", "scope-pct scope-pct--gsl")
			.attr("font-size", m.pctLabelSize)
			.text(`${ring.gslPct.toFixed(1)}%`);

		parent.append("tspan").text(spc);

		parent
			.append("tspan")
			.attr("class", "scope-ring-name")
			.text(ring.name.toUpperCase());

		parent.append("tspan").text(spc);

		parent
			.append("tspan")
			.attr("class", "scope-pct scope-pct--ngsl")
			.attr("font-size", m.pctLabelSize)
			.text(`${ring.ngslPct.toFixed(1)}%`);
	}

	rings.forEach((ring, i) => {
		const text = labelLayer
			.append("text")
			.attr("class", "scope-ring-label")
			.attr("data-ring", i + 1)
			.attr("font-size", m.ringLabelSize)
			.attr("fill", SCOPE_COLORS.label)
			.attr("paint-order", "stroke")
			.attr("stroke", SCOPE_COLORS.background)
			.attr("stroke-width", 4)
			.attr("stroke-linecap", "round")
			.attr("stroke-linejoin", "round");

		if (i === 0) {
			text
				.attr("x", cx)
				.attr("y", cy)
				.attr("text-anchor", "middle")
				.attr("dominant-baseline", "middle");

			const nameWords = ring.name.toUpperCase().split(/\s+/).filter(Boolean);

			if (nameWords.length >= 2) {
				// top line: first word
				text
					.append("tspan")
					.attr("class", "scope-ring-name")
					.attr("x", cx)
					.attr("dy", "-0.5em")
					.text(nameWords[0]);

				// middle line: percentages flanking
				const middle = text.append("tspan").attr("x", cx).attr("dy", "0");
				middle
					.append("tspan")
					.attr("class", "scope-pct scope-pct--gsl")
					.attr("font-size", m.pctLabelSize)
					.text(`${ring.gslPct.toFixed(1)}%`);
				middle.append("tspan").text(spc);
				middle.append("tspan").text(spc);
				middle
					.append("tspan")
					.attr("class", "scope-pct scope-pct--ngsl")
					.attr("font-size", m.pctLabelSize)
					.text(`${ring.ngslPct.toFixed(1)}%`);

				// bottom line: remaining word(s)
				text
					.append("tspan")
					.attr("class", "scope-ring-name")
					.attr("x", cx)
					.attr("dy", "1em")
					.text(nameWords.slice(1).join(" "));
			} else {
				appendLabelTspans(text, ring);
			}
			return;
		}

	
		const innerPad = m.ringGap * m.labelGapBias;
		const r = bands[i].rMin - innerPad - m.ringLabelSize;

		const a1 = -Math.PI / 2 - span;
		const a2 = -Math.PI / 2 + span;
		const x1 = cx + r * Math.cos(a1);
		const y1 = cy + r * Math.sin(a1);
		const x2 = cx + r * Math.cos(a2);
		const y2 = cy + r * Math.sin(a2);

		const arcId = `scope-ring-arc-${i}`;
		defs.append("path").attr("id", arcId).attr("d", `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`);

		const textPath = text
			.append("textPath")
			.attr("href", `#${arcId}`)
			.attr("startOffset", "50%")
			.attr("text-anchor", "middle");

		appendLabelTspans(textPath, ring);
	});

	// ---- Hover state ----
	let hoveredId = null;
	let interactionLocked = false;
	/** @type {Set<number>} ring ids (1-5) */
	let focusRings = new Set();
	let visibleRings = 1;

	const onHoverChange = { listeners: [] };
	function notifyHover(payload) {
		for (const fn of onHoverChange.listeners) fn(payload);
	}

	function dotTransform(dd, scale) {
		const deg = (dd.theta * 180) / Math.PI;
		return `translate(${dd.x},${dd.y}) rotate(${deg}) scale(${scale}) translate(${-dd.x},${-dd.y})`;
	}

	function setHover(d) {
		const prevId = hoveredId;
		hoveredId = d ? d._id : null;
		const ease = d3.easeCubicOut;
		const dur = m.hoverMs;

		dotSel.each(function eachDot(dd) {
			const isTarget = d && dd._id === d._id;
			const wasTarget = prevId === dd._id;
			if (!isTarget && !wasTarget) return;

			const sel = d3.select(this);
			const targetScale = isTarget ? m.hoverScale : 1;
			const startScale = wasTarget && !isTarget ? m.hoverScale : 1;
			const startBright = wasTarget && !isTarget ? 0.75 : 1;
			const endBright = isTarget ? 0.75 : 1;

			sel.interrupt("hover")
				.transition("hover")
				.duration(dur)
				.ease(ease)
				.attrTween("transform", () => (t) =>
					dotTransform(dd, startScale + (targetScale - startScale) * t)
				)
				.attrTween("filter", () => (t) => {
					const b = startBright + (endBright - startBright) * t;
					return `brightness(${b})`;
				});

			if (isTarget) sel.raise();
		});
		notifyHover(d ?? null);
	}

	function applyFocusState({ immediate = false } = {}) {
		const hasForcedFocus = interactionLocked && focusRings.size > 0;

		function dotOp(ring) {
			if (ring > visibleRings) return 0;
			if (!hasForcedFocus) return 1;
			return focusRings.has(ring) ? 1 : 0.07;
		}
		function labelOp(ring) {
			if (ring > visibleRings) return 0;
			if (!hasForcedFocus) return 1;
			return focusRings.has(ring) ? 1 : 0.25;
		}
		function arcOp(ring) {
			if (ring > visibleRings) return 0;
			if (!hasForcedFocus) return 1;
			return focusRings.has(ring) ? 1 : 0.25;
		}

		function setOpacity(sel, op) {
			if (immediate) {
				sel.style("opacity", function () { return op(Number(this.getAttribute("data-ring"))); });
				return;
			}
			sel.transition().duration(m.focusFadeMs)
				.style("opacity", function () { return op(Number(this.getAttribute("data-ring"))); });
		}

		setOpacity(dotLayer.selectAll(".scope-dot"), dotOp);
		setOpacity(labelLayer.selectAll(".scope-ring-label"), labelOp);
		setOpacity(ringArcsG.selectAll("path"), arcOp);
	}

	if (hitSel) {
		hitSel.on("mouseenter", function onEnter(_event, d) {
			const ring = d._ringIdx + 1;
			if (ring > visibleRings) return;
			if (interactionLocked && !focusRings.has(ring)) return;
			if (hoveredId === d._id) return;
			setHover(d);
		});
		hitSel.on("mouseleave", function onLeave() {
			if (hoveredId == null) return;
			setHover(null);
		});
	}

	// ---- List header labels (in SVG so position is always exact) ----
	function headerPosForRing(n) {
		const outerStrokeR = bands[n - 1].rMax + SCOPE_RING_STROKE_WIDTH / 2;
		const edgeR = outerStrokeR + m.ringArcOffset;
		const leftX = cxLeft - edgeR;
		const rightX = cxRight + edgeR;
		if (m.headerLayout === "top") {
			const topY = cy - outerStrokeR - m.headerTopPad;
			return {
				left: { x: leftX, y: topY, anchor: "start" },
				right: { x: rightX, y: topY, anchor: "end" }
			};
		}
		return {
			left: { x: leftX, y: cy, anchor: "start" },
			right: { x: rightX, y: cy, anchor: "end" }
		};
	}

	const initHPos = headerPosForRing(1);
	const headerLabelsG = zoomG.append("g").attr("class", "scope-header-labels");

	const headerLabelLeft = headerLabelsG
		.append("text")
		.attr("class", "scope-header-label scope-header-label--left")
		.attr("x", initHPos.left.x)
		.attr("y", initHPos.left.y)
		.attr("text-anchor", initHPos.left.anchor)
		.attr("dominant-baseline", m.headerLayout === "top" ? "hanging" : "middle")
		.attr("font-size", m.headerFontSize)
		.style("opacity", 1)
		.text("1953 LIST");

	const headerLabelRight = headerLabelsG
		.append("text")
		.attr("class", "scope-header-label scope-header-label--right")
		.attr("x", initHPos.right.x)
		.attr("y", initHPos.right.y)
		.attr("text-anchor", initHPos.right.anchor)
		.attr("dominant-baseline", m.headerLayout === "top" ? "hanging" : "middle")
		.attr("font-size", m.headerFontSize)
		.style("opacity", 1)
		.text("2023 LIST");

	function moveHeaders(n, animate) {
		const pos = headerPosForRing(n);
		if (animate) {
			headerLabelLeft
				.transition("header")
				.duration(m.listHeaderTransitionMs)
				.ease(d3.easeCubicInOut)
				.attr("x", pos.left.x)
				.attr("y", pos.left.y)
				.attr("text-anchor", pos.left.anchor);
			headerLabelRight
				.transition("header")
				.duration(m.listHeaderTransitionMs)
				.ease(d3.easeCubicInOut)
				.attr("x", pos.right.x)
				.attr("y", pos.right.y)
				.attr("text-anchor", pos.right.anchor);
		} else {
			headerLabelLeft
				.attr("x", pos.left.x)
				.attr("y", pos.left.y)
				.attr("text-anchor", pos.left.anchor);
			headerLabelRight
				.attr("x", pos.right.x)
				.attr("y", pos.right.y)
				.attr("text-anchor", pos.right.anchor);
		}
	}

	// zoom 
	let overview = false;
	let zoomScale = 1;

	function outerRadiusForRing(n) {
		const idx = Math.max(0, Math.min(bands.length - 1, (n || 1) - 1));
		return Math.max(bands[idx]?.rMax ?? plotR, m.centerR + 1);
	}

	function zoomScaleForRing(focusedRing) {
		if (overview || !focusedRing) return 1;
		
		return Math.min(m.zoomMax, (plotR * 0.92) / outerRadiusForRing(focusedRing));
	}

	function applyZoom(animate) {
		const s = zoomScale;
		const dur = animate ? m.zoomMs : 0;
		const tf = `translate(${cx},${cy}) scale(${s}) translate(${-cx},${-cy})`;
		// counter-scale text so labels keep a constant on-screen size through the zoom.
		const ringSize = `${m.ringLabelSize / s}px`;
		const headerSize = m.headerFontSize / s;
		const ringNames = labelLayer.selectAll(".scope-ring-name");
		const headers = headerLabelsG.selectAll("text");

		if (animate && dur > 0) {
			const ease = d3.easeCubicInOut;
			zoomG.interrupt().transition("zoom").duration(dur).ease(ease).attr("transform", tf);
			ringNames.interrupt().transition("zoom-text").duration(dur).ease(ease).style("font-size", ringSize);
			headers
				.interrupt()
				.transition("zoom-text")
				.duration(dur)
				.ease(ease)
				.attr("font-size", headerSize);
		} else {
			zoomG.attr("transform", tf);
			ringNames.style("font-size", ringSize);
			headers.attr("font-size", headerSize);
		}
	}

	applyFocusState({ immediate: true });
	zoomScale = zoomScaleForRing(1);
	applyZoom(false);
	container.replaceChildren(svg.node());

	return {
		onHover(fn) {
			onHoverChange.listeners.push(fn);
			return () => {
				onHoverChange.listeners = onHoverChange.listeners.filter((l) => l !== fn);
			};
		},
		setInteractionLocked(locked) {
			const next = Boolean(locked);
			if (interactionLocked === next) return;
			interactionLocked = next;
			if (interactionLocked) setHover(null);
		},
		setFocus(rings) {
			focusRings = new Set(
				(Array.isArray(rings) ? rings : [])
					.map((r) => Number(r))
					.filter((r) => Number.isInteger(r) && r >= 1 && r <= nRings)
			);
			applyFocusState();
		},
		clearFocus() {
			focusRings = new Set();
			applyFocusState();
		},
		setVisibleRings(n) {
			const next = Math.max(1, Math.min(nRings, Math.floor(Number(n) || 1)));
			if (next === visibleRings) return;
			if (hoveredId != null) {
				const dot = allDots.find((d) => d._id === hoveredId);
				if (dot && dot._ringIdx + 1 > next) setHover(null);
			}
			visibleRings = next;
			applyFocusState();
			moveHeaders(next, true);
		},
		setZoom(focusedRing, isOverview, animate = true) {
			overview = Boolean(isOverview);
			zoomScale = zoomScaleForRing(focusedRing);
			applyZoom(animate);
		},
		destroy() {
			onHoverChange.listeners = [];
			svg.remove();
		}
	};
}
