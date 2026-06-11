import * as d3 from "d3";
import { createMarqueeLoop } from "$utils/marqueeLoop.js";

const COLORS = {
	remained: "var(--color-secondary, #8F8A77)",
	removed: "var(--color-gsl, #ED9027)",
	added: "var(--color-ngsl, #DB6AE8)",
	label: "var(--color-primary, #5B5B5B)",
	bg: "var(--color-bg, #FFFFF1)"
};

const FONTS = {
	removed: { family: '"Source Serif 4", serif', style: "italic", weight: 500 },
	added: { family: '"Source Sans 3", sans-serif', style: "italic", weight: 400 },
	remained: { family: '"Source Sans 3", sans-serif', style: "italic", weight: 400 }
};

const ARC_OPACITY = 0.4;

function readCssPx(el, varName, fallback) {
	if (!el) return fallback;
	const raw = getComputedStyle(el).getPropertyValue(varName).trim();
	const n = parseFloat(raw);
	return Number.isFinite(n) ? n : fallback;
}

function computeRingRadii(pcts, centerR, radialSpan, ringGap) {
	const n = pcts.length;
	const totalGaps = ringGap * Math.max(0, n - 1);
	const usable = radialSpan - totalGaps;
	let inner = centerR;
	return pcts.map((pct, i) => {
		const thickness = (pct / 100) * usable;
		const outer = inner + thickness;
		inner = outer + (i < n - 1 ? ringGap : 0);
		return outer;
	});
}

function layoutFromWidth(containerWidth, bandThick) {
	const width = Math.max(1, containerWidth);
	const pad = Math.round(width * 0.045);
	const plotR = width / 2 - pad;
	const maxR = plotR;
	const centerR = maxR * (40 / 390);
	const ringGap = Math.max(12, maxR * 0.034);
	const labelFontSize = Math.max(17, maxR * 0.042);
	const wordFontSize = Math.max(20, maxR * 0.03);
	const svgW = (plotR + bandThick / 2 + pad) * 2;
	return { pad, plotR, maxR, centerR, ringGap, labelFontSize, wordFontSize, svgW };
}

function arcPath(cx, cy, r, startAngle, endAngle, sweepFlag) {
	let span;
	if (sweepFlag === 1) {
		span = ((endAngle - startAngle) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
	} else {
		span = ((startAngle - endAngle) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
	}
	if (span >= 2 * Math.PI - 0.001) {
		const top = { x: cx, y: cy - r };
		const bot = { x: cx, y: cy + r };
		return (
			`M ${top.x} ${top.y} ` +
			`A ${r} ${r} 0 0 ${sweepFlag} ${bot.x} ${bot.y} ` +
			`A ${r} ${r} 0 0 ${sweepFlag} ${top.x} ${top.y}`
		);
	}
	if (span < 0.001) return "";
	const x1 = cx + r * Math.cos(startAngle);
	const y1 = cy + r * Math.sin(startAngle);
	const x2 = cx + r * Math.cos(endAngle);
	const y2 = cy + r * Math.sin(endAngle);
	const largeArc = span > Math.PI ? 1 : 0;
	return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} ${sweepFlag} ${x2} ${y2}`;
}

function buildWordStr(words) {
	if (!words?.length) return "· · ·";
	return words.map((w) => w.w.toUpperCase()).join(", ") + ", ";
}

function wrapPathOffset(offset, cycleLen) {
	if (cycleLen <= 0) return offset;
	while (offset > 0) offset -= cycleLen;
	while (offset <= -cycleLen) offset += cycleLen;
	return offset;
}

function arcBandClipD(cx, cy, r, halfBand, start, end) {
	const ro = r + halfBand;
	const ri = Math.max(1, r - halfBand);
	const span = ((end - start) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
	const large = span > Math.PI ? 1 : 0;
	const xos = cx + ro * Math.cos(start);
	const yos = cy + ro * Math.sin(start);
	const xoe = cx + ro * Math.cos(end);
	const yoe = cy + ro * Math.sin(end);
	const xis = cx + ri * Math.cos(end);
	const yis = cy + ri * Math.sin(end);
	const xie = cx + ri * Math.cos(start);
	const yie = cy + ri * Math.sin(start);
	return (
		`M ${xos} ${yos} ` +
		`A ${ro} ${ro} 0 ${large} 1 ${xoe} ${yoe} ` +
		`L ${xis} ${yis} ` +
		`A ${ri} ${ri} 0 ${large} 0 ${xie} ${yie} Z`
	);
}

export function renderScopeArcsChart(container, payload) {
	if (!container || !payload?.rings?.length) return null;

	const root = container.closest?.(".scope-arcs") ?? container;
	const layoutWidth = root.clientWidth || container.clientWidth;
	if (!layoutWidth || layoutWidth < 2) return null;

	container.innerHTML = "";
	const bandThick = readCssPx(root, "--scope-arcs-band-thick", 40);
	const bandThin = readCssPx(root, "--scope-arcs-band-thin", 20);
	const focusFadeMs = readCssPx(root, "--scope-arcs-focus-fade-ms", 220);
	const zoomMs = readCssPx(root, "--scope-arcs-zoom-ms", 600);
	const zoomMax = readCssPx(root, "--scope-arcs-zoom-max", 3);
	const segmentGapDeg = readCssPx(root, "--scope-arcs-segment-gap-deg", 2);
	const segmentGap = (segmentGapDeg * Math.PI) / 180;
	const sideGapPx = readCssPx(root, "--scope-arcs-side-gap", 8);
	const dividerWidth = readCssPx(root, "--scope-arcs-divider-width", 1);
	const dividerDash = getComputedStyle(root).getPropertyValue("--scope-arcs-divider-dash").trim() || "5 5";

	const textOutset = readCssPx(root, "--scope-arcs-text-outset", 0);
	const labelOutset = readCssPx(root, "--scope-arcs-label-outset", 0);
	const marqueeSpeed = readCssPx(root, "--scope-arcs-marquee-speed", 18);
	const marqueeRepeat = Math.max(2, Math.round(readCssPx(root, "--scope-arcs-marquee-repeat", 3)));

	const rings = payload.rings;
	const ringData = rings.map((ring) => {
		const remainedWords = ring.gslWords.filter((w) => w.s === "remained");
		const removedWords = ring.gslWords.filter((w) => w.s === "removed");
		const addedWords = ring.ngslWords.filter((w) => w.s === "added");
		const removedShare = ring.gslCount > 0 ? removedWords.length / ring.gslCount : 0;
		const addedShare = ring.ngslCount > 0 ? addedWords.length / ring.ngslCount : 0;
		return { ...ring, remainedWords, removedWords, addedWords, removedShare, addedShare };
	});

	const layout = layoutFromWidth(layoutWidth, bandThick);
	const { maxR, centerR, ringGap, labelFontSize, wordFontSize, svgW } = layout;
	const minArcShare = 0.008;

	const gslPcts = ringData.map((r) => r.gslPct);
	const ngslPcts = ringData.map((r) => r.ngslPct);
	const radialSpan = maxR - centerR;
	const gslRadii = computeRingRadii(gslPcts, centerR, radialSpan, ringGap);
	const ngslRadii = computeRingRadii(ngslPcts, centerR, radialSpan, ringGap);

	const svgCx = svgW / 2;
	const svgCy = svgW / 2;

	const svg = d3
		.create("svg")
		.attr("class", "scope-arcs-svg")
		.attr("viewBox", `0 0 ${svgW} ${svgW}`)
		.attr("preserveAspectRatio", "xMidYMid meet")
		.attr("width", "100%")
		.style("display", "block")
		.style("margin", "0 auto")
		.style("overflow", "hidden");

	const TOP = (3 * Math.PI) / 2;
	const BOTTOM = Math.PI / 2;

	function outerRadiusForRing(ringNum) {
		const i = ringNum - 1;
		return Math.max(gslRadii[i] ?? centerR, ngslRadii[i] ?? centerR);
	}

	function zoomScaleForState({ focusedRing, overview }) {
		if (overview) return 1;
		const ring = focusedRing ?? 1;
		const targetR = Math.max(outerRadiusForRing(ring), centerR + 1);
		return Math.min(zoomMax, maxR / targetR);
	}

	function zoomTransform(scale) {
		return `translate(${svgCx},${svgCy}) scale(${scale}) translate(${-svgCx},${-svgCy})`;
	}


	function sideArcBounds(side, R) {
		const inset = (sideGapPx / 2) / Math.max(R, 1);
		if (side === "left") {
			return { start: BOTTOM + inset, end: TOP - inset, span: Math.PI - 2 * inset };
		}
		return { start: TOP + inset, end: BOTTOM - inset, span: Math.PI - 2 * inset };
	}


	function splitSemicircle(partialShare, side, R) {
		const { start: arcStart, end: arcEnd, span: semi } = sideArcBounds(side, R);
		const hasPartial = partialShare >= minArcShare;
		const partialOnly = partialShare >= 1 - minArcShare;
		const remainedOnly = !hasPartial;

		if (remainedOnly) {
			return { remained: { start: arcStart, end: arcEnd }, partial: null };
		}

		if (partialOnly) {
			const arc =
				side === "left"
					? { start: arcEnd - semi, end: arcEnd }
					: { start: arcStart, end: arcStart + semi };
			return { remained: null, partial: arc };
		}

		const usable = semi - segmentGap;
		const partialSpan = partialShare * usable;
		const remainedSpan = usable - partialSpan;

		if (side === "left") {
			return {
				remained: { start: arcStart, end: arcStart + remainedSpan },
				partial: { start: arcEnd - partialSpan, end: arcEnd }
			};
		}

		return {
			partial: { start: arcStart, end: arcStart + partialSpan },
			remained: { start: arcStart + partialSpan + segmentGap, end: arcEnd }
		};
	}

	function ribbonTextRadius(r) {
		return r + textOutset;
	}

	function drawBandArc(g, className, cx, cy, r, start, end, color, strokeW) {
		const d = arcPath(cx, cy, r, start, end, 1);
		if (!d) return null;
		g.append("path")
			.attr("class", `sarc-arc ${className}`)
			.attr("d", d)
			.attr("fill", "none")
			.attr("stroke", color)
			.attr("stroke-width", strokeW)
			.attr("stroke-linecap", "butt")
			.attr("vector-effect", "non-scaling-stroke")
			.attr("opacity", ARC_OPACITY);
		return d;
	}

	function registerTextPath(id, cx, cy, r, start, end) {
		const d = arcPath(cx, cy, ribbonTextRadius(r), start, end, 1);
		if (!d) return false;
		defs.append("path").attr("id", id).attr("d", d);
		return true;
	}

	function registerSegmentClip(id, cx, cy, r, start, end, halfBand) {
		const d = arcBandClipD(cx, cy, r, halfBand, start, end);
		if (!d) return false;
		defs
			.append("clipPath")
			.attr("id", id)
			.attr("clipPathUnits", "userSpaceOnUse")
			.append("path")
			.attr("d", d);
		return true;
	}

	/** @type {Array<{ ring: number, textEl: SVGTextElement, tpNode: SVGTextPathElement, offset: number, cycleLen: number }>} */
	const marqueeTracks = [];

	const zoomG = svg
		.append("g")
		.attr("class", "sarc-zoom-root")
		.attr("transform", zoomTransform(1));
	const defs = zoomG.append("defs");

	ringData.forEach((ring, i) => {
		const R_L = gslRadii[i];
		const R_R = ngslRadii[i];
		const ringNum = i + 1;

		const g = zoomG.append("g").attr("class", "sarc-ring").attr("data-ring", ringNum);

		const leftSegs = splitSemicircle(ring.removedShare, "left", R_L);
		const rightSegs = splitSemicircle(ring.addedShare, "right", R_R);

		const leftRemTextId = `sarc-rem-left-text-${i}`;
		const removedTextId = `sarc-removed-text-${i}`;
		const rightRemTextId = `sarc-rem-right-text-${i}`;
		const addedTextId = `sarc-added-text-${i}`;
		const leftRemClipId = `sarc-rem-left-clip-${i}`;
		const removedClipId = `sarc-removed-clip-${i}`;
		const rightRemClipId = `sarc-rem-right-clip-${i}`;
		const addedClipId = `sarc-added-clip-${i}`;
		const clipBand = bandThick / 2;

		let hasLeftRem = false;
		let hasRemoved = false;
		let hasRightRem = false;
		let hasAdded = false;

		if (leftSegs.remained) {
			hasLeftRem = !!drawBandArc(
				g, "sarc-arc--remained", svgCx, svgCy, R_L,
				leftSegs.remained.start, leftSegs.remained.end, COLORS.remained, bandThick
			);
			if (hasLeftRem) {
				registerTextPath(leftRemTextId, svgCx, svgCy, R_L, leftSegs.remained.start, leftSegs.remained.end);
				registerSegmentClip(leftRemClipId, svgCx, svgCy, R_L, leftSegs.remained.start, leftSegs.remained.end, clipBand);
			}
		}

		if (leftSegs.partial) {
			hasRemoved = !!drawBandArc(
				g, "sarc-arc--removed", svgCx, svgCy, R_L,
				leftSegs.partial.start, leftSegs.partial.end, COLORS.removed, bandThick
			);
			if (hasRemoved) {
				registerTextPath(removedTextId, svgCx, svgCy, R_L, leftSegs.partial.start, leftSegs.partial.end);
				registerSegmentClip(removedClipId, svgCx, svgCy, R_L, leftSegs.partial.start, leftSegs.partial.end, clipBand);
			}
		}

		if (rightSegs.remained) {
			hasRightRem = !!drawBandArc(
				g, "sarc-arc--remained", svgCx, svgCy, R_R,
				rightSegs.remained.start, rightSegs.remained.end, COLORS.remained, bandThick
			);
			if (hasRightRem) {
				registerTextPath(rightRemTextId, svgCx, svgCy, R_R, rightSegs.remained.start, rightSegs.remained.end);
				registerSegmentClip(rightRemClipId, svgCx, svgCy, R_R, rightSegs.remained.start, rightSegs.remained.end, clipBand);
			}
		}

		if (rightSegs.partial) {
			hasAdded = !!drawBandArc(
				g, "sarc-arc--added", svgCx, svgCy, R_R,
				rightSegs.partial.start, rightSegs.partial.end, COLORS.added, bandThick
			);
			if (hasAdded) {
				registerTextPath(addedTextId, svgCx, svgCy, R_R, rightSegs.partial.start, rightSegs.partial.end);
				registerSegmentClip(addedClipId, svgCx, svgCy, R_R, rightSegs.partial.start, rightSegs.partial.end, clipBand);
			}
		}

		// Ring name label
		const labelG = zoomG
			.append("g")
			.attr("class", "sarc-ring-label")
			.attr("data-ring", ringNum);

		if (i === 0) {
			const nameWords = ring.name.toUpperCase().split(/\s+/).filter(Boolean);
			const lineEm = 1.1;
			const centerLabel = labelG
				.append("text")
				.attr("class", "sarc-center-label")
				.attr("x", svgCx)
				.attr("y", svgCy)
				.attr("text-anchor", "middle")
				.attr("dominant-baseline", "middle")
				.attr("font-size", labelFontSize)
				.attr("font-family", '"Source Sans 3", sans-serif')
				.attr("fill", COLORS.label)
				.attr("letter-spacing", "0.06em");
			nameWords.forEach((word, wi) => {
				centerLabel
					.append("tspan")
					.attr("x", svgCx)
					.attr("dy", wi === 0 ? `${-((nameWords.length - 1) * lineEm) / 2}em` : `${lineEm}em`)
					.text(word);
			});
		} else {
			const outerR = Math.min(gslRadii[i], ngslRadii[i]);
			const innerR = Math.max(gslRadii[i - 1], ngslRadii[i - 1]);
			const labelR = Math.max(10, (innerR + outerR) / 2 + labelOutset);
			const labelSpan = Math.min(
				(160 * Math.PI) / 180,
				(Math.PI * labelR) / Math.max(1, labelFontSize * ring.name.length * 0.56)
			);
			const labelArcD = arcPath(
				svgCx, svgCy, Math.max(labelR, 10),
				TOP - labelSpan / 2, TOP + labelSpan / 2, 1
			);
			if (labelArcD) {
				const labelPathId = `sarc-label-path-${i}`;
				defs.append("path").attr("id", labelPathId).attr("d", labelArcD);
				labelG
					.append("text")
					.attr("font-size", labelFontSize)
					.attr("font-family", '"Source Sans 3", sans-serif')
					.attr("fill", COLORS.label)
					.attr("letter-spacing", "0.06em")
					.append("textPath")
					.attr("href", `#${labelPathId}`)
					.attr("startOffset", "50%")
					.attr("text-anchor", "middle")
					.text(ring.name.toUpperCase());
			}
		}

		// Word labels (focused ring only)
		const wordsG = g.append("g").attr("class", "sarc-words").attr("data-ring", ringNum);
		const addWords = (pathId, clipId, words, font, color) => {
			if (!words?.length || !pathId || !clipId) return;
			const repeated = buildWordStr(words).repeat(marqueeRepeat);
			const clipG = wordsG.append("g").attr("class", "sarc-word-clip").attr("clip-path", `url(#${clipId})`);
			const tEl = clipG
				.append("text")
				.attr("class", "sarc-word-text")
				.attr("font-size", wordFontSize)
				.attr("font-family", font.family)
				.attr("font-style", font.style)
				.attr("font-weight", font.weight)
				.attr("fill", color)
				.attr("opacity", 1)
				.attr("letter-spacing", "0.04em");
			const tp = tEl
				.append("textPath")
				.attr("href", `#${pathId}`)
				.attr("startOffset", "0")
				.text(repeated);
			const tpNode = tp.node();
			if (tpNode) {
				marqueeTracks.push({
					ring: ringNum,
					textEl: tEl.node(),
					tpNode,
					offset: 0,
					cycleLen: 1
				});
			}
		};

		if (hasLeftRem) addWords(leftRemTextId, leftRemClipId, ring.remainedWords, FONTS.remained, COLORS.remained);
		if (hasRemoved) addWords(removedTextId, removedClipId, ring.removedWords, FONTS.removed, COLORS.removed);
		if (hasRightRem) addWords(rightRemTextId, rightRemClipId, ring.remainedWords, FONTS.remained, COLORS.remained);
		if (hasAdded) addWords(addedTextId, addedClipId, ring.addedWords, FONTS.added, COLORS.added);
	});

	const dividerReach = maxR + bandThick / 2;
	zoomG
		.append("line")
		.attr("class", "sarc-center-divider")
		.attr("x1", svgCx)
		.attr("y1", svgCy - dividerReach)
		.attr("x2", svgCx)
		.attr("y2", svgCy + dividerReach)
		.attr("stroke", "var(--scope-arcs-divider-color, var(--color-primary, #5B5B5B))")
		.attr("stroke-width", dividerWidth)
		.attr("stroke-dasharray", dividerDash)
		.attr("vector-effect", "non-scaling-stroke")
		.attr("opacity", 0.55)
		.attr("pointer-events", "none");

	container.appendChild(svg.node());

	const ringLayer = zoomG.selectAll(".sarc-ring");
	const labelLayer = zoomG.selectAll(".sarc-ring-label");
	const zoomRoot = zoomG;

	let scrollState = { visibleRings: 1, focusedRing: 1, overview: false };
	let marqueePaused = false;
	let marqueeResumeTimer = 0;

	function setMarqueePaused(paused) {
		marqueePaused = paused;
		marqueeLoop.syncEngagement();
	}

	function trackMarqueeActive(track) {
		if (marqueePaused) return false;
		const { visibleRings, focusedRing, overview } = scrollState;
		if (overview || !focusedRing) return false;
		return track.ring === focusedRing && track.ring <= visibleRings;
	}

	let marqueeInitialized = false;
	let prevFocusedRing = scrollState.focusedRing;

	function scheduleMarqueeResume(ms, fontSize, resetOffsets) {
		if (marqueeResumeTimer) {
			clearTimeout(marqueeResumeTimer);
			marqueeResumeTimer = 0;
		}
		if (ms <= 0) {
			setMarqueePaused(false);
			measureMarqueeTracks(fontSize, resetOffsets);
			return;
		}
		setMarqueePaused(true);
		marqueeResumeTimer = setTimeout(() => {
			marqueeResumeTimer = 0;
			setMarqueePaused(false);
			measureMarqueeTracks(fontSize, resetOffsets);
			marqueeLoop.syncEngagement();
		}, ms);
	}

	function measureMarqueeTracks(fontSize, resetOffsets = false) {
		for (const track of marqueeTracks) {
			track.textEl.setAttribute("font-size", fontSize);
			const textLen = track.tpNode.getComputedTextLength();
			const newCycle = textLen / marqueeRepeat;
			if (resetOffsets) {
				track.offset = newCycle > 0 ? -Math.random() * newCycle : 0;
			} else {
				track.offset = wrapPathOffset(track.offset, newCycle);
			}
			track.cycleLen = newCycle;
			track.tpNode.setAttribute("startOffset", track.offset);
		}
	}

	const marqueeLoop = createMarqueeLoop({
		isEngaged: () => marqueeTracks.some(trackMarqueeActive),
		tick(dt, prefersReducedMotion) {
			for (const track of marqueeTracks) {
				if (!trackMarqueeActive(track)) continue;
				if (prefersReducedMotion) continue;
				track.offset = wrapPathOffset(track.offset + marqueeSpeed * dt, track.cycleLen);
				track.tpNode.setAttribute("startOffset", track.offset);
			}
		}
	});

	function applyScrollState(next, animate = true) {
		scrollState = { ...scrollState, ...next };
		const { visibleRings, focusedRing, overview } = scrollState;
		const dur = animate ? focusFadeMs : 0;
		const zoomDur = animate ? zoomMs : 0;
		const ease = d3.easeCubicInOut;
		const scale = zoomScaleForState({ focusedRing, overview });

		const ringVisible = (ring) => ring <= visibleRings;
		const ringOp = (ring) => (ringVisible(ring) ? 1 : 0);
		const labelOp = (ring) => {
			if (ring > visibleRings) return 0;
			if (overview) return 1;
			return ring === focusedRing ? 1 : 0.35;
		};
		const wordsOp = (ring) => (!overview && ring === focusedRing && ring <= visibleRings ? 1 : 0);
		const bandForRing = (ring) => {
			if (overview || ring !== focusedRing) return bandThin;
			return bandThick;
		};

		ringLayer
			.interrupt()
			.transition("ring-vis")
			.duration(dur)
			.ease(ease)
			.style("opacity", function () {
				return ringOp(Number(this.getAttribute("data-ring")));
			})
			.style("visibility", function () {
				return ringVisible(Number(this.getAttribute("data-ring"))) ? "visible" : "hidden";
			});

		ringLayer
			.selectAll(".sarc-arc")
			.interrupt()
			.transition("band-w")
			.duration(dur)
			.ease(ease)
			.attr("stroke-width", function () {
				const ring = Number(this.parentNode?.getAttribute?.("data-ring"));
				return bandForRing(ring);
			});

		ringLayer
			.selectAll(".sarc-words")
			.interrupt()
			.transition("words")
			.duration(dur)
			.ease(ease)
			.style("opacity", function () {
				return wordsOp(Number(this.getAttribute("data-ring")));
			});

		labelLayer
			.interrupt()
			.transition("labels")
			.duration(dur)
			.ease(ease)
			.style("opacity", function () {
				return labelOp(Number(this.getAttribute("data-ring")));
			})
			.style("visibility", function () {
				const ring = Number(this.getAttribute("data-ring"));
				return ringVisible(ring) && labelOp(ring) > 0 ? "visible" : "hidden";
			});

		const nextTransform = zoomTransform(scale);
		const wordSize = wordFontSize / scale;
		const nameSize = labelFontSize / scale;

		const wordText = ringLayer.selectAll(".sarc-word-text");
		const labelText = labelLayer.selectAll("text");

		if (animate && zoomDur > 0) {
			zoomRoot.interrupt().transition("zoom").duration(zoomDur).ease(ease).attr("transform", nextTransform);
			wordText.interrupt().transition("text-size").duration(zoomDur).ease(ease).attr("font-size", wordSize);
			labelText.interrupt().transition("text-size").duration(zoomDur).ease(ease).attr("font-size", nameSize);
		} else {
			zoomRoot.interrupt().attr("transform", nextTransform);
			wordText.attr("font-size", wordSize);
			labelText.attr("font-size", nameSize);
		}

		const focusChanged =
			marqueeInitialized && focusedRing !== prevFocusedRing && !overview;
		prevFocusedRing = overview ? null : focusedRing;
		const resetOffsets = !marqueeInitialized || focusChanged;
		const transitionMs = animate ? Math.max(zoomDur, dur) : 0;
		scheduleMarqueeResume(transitionMs, wordSize, resetOffsets);
		marqueeInitialized = true;
		marqueeLoop.syncEngagement();
	}

	applyScrollState(scrollState, false);

	return {
		setScrollState(state) {
			applyScrollState(state, true);
		},
		setMarqueeActive: marqueeLoop.setMarqueeActive,
		setPrefersReducedMotion: marqueeLoop.setPrefersReducedMotion,
		destroy() {
			if (marqueeResumeTimer) {
				clearTimeout(marqueeResumeTimer);
				marqueeResumeTimer = 0;
			}
			marqueeLoop.destroy();
			container.innerHTML = "";
		}
	};
}
