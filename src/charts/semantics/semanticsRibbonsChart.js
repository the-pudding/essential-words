import * as d3 from "d3";

const CHANGE_THRESHOLD = 15;

const LAYOUT = {
	margin: { top: 50, right: 200, bottom: 50, left: 200 },
	colW: 0,
	gapW: 640,
	bandGap: 16,
	plotH: 760
};

const BASE_SLOPE_WIDTH = LAYOUT.colW + LAYOUT.gapW + LAYOUT.colW;

function cssNumber(el, name, fallback) {
	const value = Number.parseFloat(getComputedStyle(el).getPropertyValue(name));
	return Number.isFinite(value) ? value : fallback;
}

function ribbonPath(c, gslX1, ngslX0, mx) {
	return (
		`M${gslX1},${c.gslY0}` +
		` C${mx},${c.gslY0} ${mx},${c.ngslY0} ${ngslX0},${c.ngslY0}` +
		` L${ngslX0},${c.ngslY1}` +
		` C${mx},${c.ngslY1} ${mx},${c.gslY1} ${gslX1},${c.gslY1}` +
		" Z"
	);
}

function centerLinePath(c, gslX1, ngslX0, mx, fontSize) {
	const shift = fontSize * 0.35;
	const gMid = (c.gslY0 + c.gslY1) / 2 + shift;
	const nMid = (c.ngslY0 + c.ngslY1) / 2 + shift;
	return `M${gslX1},${gMid} C${mx},${gMid} ${mx},${nMid} ${ngslX0},${nMid}`;
}

function antsLinePath(c, gslX1, ngslX0, mx, fontSize, antsYOffset) {
	const shift = fontSize * 0.15;
	const gMid = (c.gslY0 + c.gslY1) / 2 + shift + antsYOffset;
	const nMid = (c.ngslY0 + c.ngslY1) / 2 + shift + antsYOffset;
	return `M${gslX1},${gMid} C${mx},${gMid} ${mx},${nMid} ${ngslX0},${nMid}`;
}

function expandedRibbonPath(c, gslX1, ngslX0, mx, thinThreshold) {
	const gBot = c.gslY1;
	const gTop = gBot - thinThreshold;
	const nBot = c.ngslY1;
	const nTop = nBot - thinThreshold;
	return (
		`M${gslX1},${gTop}` +
		` C${mx},${gTop} ${mx},${nTop} ${ngslX0},${nTop}` +
		` L${ngslX0},${nBot}` +
		` C${mx},${nBot} ${mx},${gBot} ${gslX1},${gBot}` +
		" Z"
	);
}

function expandedCenterPath(c, gslX1, ngslX0, mx, defaultFontSize, thinThreshold) {
	const shift = defaultFontSize * 0.35;
	const gBot = c.gslY1;
	const gMid = gBot - thinThreshold / 2 + shift;
	const nBot = c.ngslY1;
	const nMid = nBot - thinThreshold / 2 + shift;
	return `M${gslX1},${gMid} C${mx},${gMid} ${mx},${nMid} ${ngslX0},${nMid}`;
}

function bandFontSize(c) {
	const gH = c.gslY1 - c.gslY0;
	const nH = c.ngslY1 - c.ngslY0;
	const minH = Math.min(gH, nH);
	if (minH < 2) return 2;
	return Math.min(Math.max(minH * 0.65, 3), 48);
}

function marqueeWordsForCategory(c) {
	if (c.relChange != null && c.relChange >= CHANGE_THRESHOLD) return c.addedWords || [];
	if (c.relChange != null && c.relChange <= -CHANGE_THRESHOLD) return c.removedWords || [];
	return c.remainedWords || [];
}

function marqueeWordSetForCategory(c) {
	if (c.relChange != null && c.relChange >= CHANGE_THRESHOLD) return "added";
	if (c.relChange != null && c.relChange <= -CHANGE_THRESHOLD) return "removed";
	return "remained";
}

function marqueeFontForWordSet(wordSet) {
	if (wordSet === "removed") {
		return { family: "\"Source Serif 4\", serif", style: "italic", weight: 400 };
	}
	return { family: "\"Source Sans 3\", sans-serif", style: "italic", weight: 400 };
}

function wrapLeftToRightOffset(offset, cycleLen) {
	if (cycleLen <= 0) return offset;
	while (offset > 0) offset -= cycleLen;
	while (offset <= -cycleLen) offset += cycleLen;
	return offset;
}

export function renderSemanticsRibbons(containerEl, payload) {
	if (!containerEl || !payload?.categories?.length) {
		return () => {};
	}

	containerEl.innerHTML = "";

	const chartW = containerEl.clientWidth || BASE_SLOPE_WIDTH;
	const layoutScale = chartW / BASE_SLOPE_WIDTH;
	const fontScale = cssNumber(containerEl, "--sem-font-scale", 1);
	const minBandFontSize = cssNumber(containerEl, "--sem-min-band-font-size");

	const margin = {
		top: LAYOUT.margin.top * layoutScale,
		bottom: LAYOUT.margin.bottom * layoutScale,
		right: 0,
		left: 0
	};
	const colW = LAYOUT.colW * layoutScale;
	const gapW = LAYOUT.gapW * layoutScale;
	const bandGap = LAYOUT.bandGap * layoutScale;
	const plotH = LAYOUT.plotH * layoutScale;
	const W = chartW;
	const H = margin.top + plotH + margin.bottom;

	const gslX1 = margin.left + colW;
	const ngslX0 = gslX1 + gapW;
	const mx = (gslX1 + ngslX0) / 2;

	const defaultFontSize = Math.max(14 * fontScale, minBandFontSize);
	const thinThreshold = 13 * layoutScale;
	const antsYOffset = -2 * layoutScale;
	const antsStrokeWidth = 1 * layoutScale;
	const antsDashArray = `${4 * layoutScale} ${7 * layoutScale}`;
	const leftPercentOffset = cssNumber(containerEl, "--sem-left-percent-offset", 8) * layoutScale;
	const rightPercentOffset = cssNumber(containerEl, "--sem-right-percent-offset", 8) * layoutScale;
	const leftLabelOffset = cssNumber(containerEl, "--sem-left-label-offset", 16) * layoutScale;
	const rightChangeOffset = cssNumber(containerEl, "--sem-right-change-offset", 46) * layoutScale;
	const leftLabelHoverShift = cssNumber(containerEl, "--sem-left-label-hover-shift", 30) * layoutScale;
	const categoryLabelRestX = gslX1 - leftLabelOffset;
	const categoryLabelHoverX = categoryLabelRestX - leftLabelHoverShift;
	const hoverLabelTransitionMs = 160;
	const marqueeSpeed = 25;
	const antsSpeed = 18;

	const cats = payload.categories.map((d) => ({ ...d }));
	const numCats = cats.length;
	const totalGap = bandGap * (numCats - 1);
	const bandArea = plotH - totalGap;

	const gslOrder = [...cats].sort((a, b) => b.gslPct - a.gslPct);
	let gslCum = 0;
	gslOrder.forEach((c) => {
		const h = (c.gslPct / 100) * bandArea;
		c.gslY0 = margin.top + gslCum;
		c.gslY1 = margin.top + gslCum + h;
		gslCum += h + bandGap;
	});

	const ngslOrder = [...cats].sort((a, b) => b.ngslPct - a.ngslPct);
	let ngslCum = 0;
	ngslOrder.forEach((c) => {
		const h = (c.ngslPct / 100) * bandArea;
		c.ngslY0 = margin.top + ngslCum;
		c.ngslY1 = margin.top + ngslCum + h;
		ngslCum += h + bandGap;
	});

	cats.forEach((c) => {
		c.dir = c.ngslPct > c.gslPct ? "up" : c.ngslPct < c.gslPct ? "down" : "flat";
		const small = c.relChange == null || Math.abs(c.relChange) < CHANGE_THRESHOLD;
		let key;
		if (small) key = "tan";
		else if (c.dir === "up") key = "up";
		else if (c.dir === "down") key = "down";
		else key = "neutral";
		c.dirColor = `var(--sem-ribbon-${key})`;
		c.dirTextColor = `var(--sem-ribbon-${key}-text)`;
	});

	const svg = d3
		.select(containerEl)
		.append("svg")
		.attr("width", W)
		.attr("height", H)
		.style("width", `${W}px`)
		.style("height", `${H}px`)
		.style("overflow", "visible");

	svg.append("rect").attr("width", W).attr("height", H).attr("fill", "var(--color-bg)");

	svg
		.append("text")
		.attr("x", gslX1)
		.attr("y", margin.top - 20)
		.attr("text-anchor", "start")
		.attr("fill", "var(--sem-ribbon-header)")
		.attr("font-size", `${13 * fontScale}px`)
		.attr("font-weight", 600)
		.text("1953 list");
	svg
		.append("text")
		.attr("x", gslX1)
		.attr("y", margin.top - 7)
		.attr("text-anchor", "start")
		.attr("fill", "var(--sem-ribbon-header-sub)")
		.attr("font-size", `${9.5 * fontScale}px`)
		.text(`${payload.nGsl.toLocaleString()} words`);

	svg
		.append("text")
		.attr("x", ngslX0)
		.attr("y", margin.top - 20)
		.attr("text-anchor", "end")
		.attr("fill", "var(--sem-ribbon-header)")
		.attr("font-size", `${13 * fontScale}px`)
		.attr("font-weight", 600)
		.text("2023 list");
	svg
		.append("text")
		.attr("x", ngslX0)
		.attr("y", margin.top - 7)
		.attr("text-anchor", "end")
		.attr("fill", "var(--sem-ribbon-header-sub)")
		.attr("font-size", `${9.5 * fontScale}px`)
		.text(`${payload.nNgsl.toLocaleString()} words`);

	const defs = svg.append("defs");
	const catGroups = svg.append("g").attr("class", "cats");

	cats.forEach((c, i) => {
		const cg = catGroups.append("g").attr("class", "cat-group").attr("data-i", i);

		const clipId = `ribbon-clip-${i}`;
		defs.append("clipPath").attr("id", clipId).append("path").attr("d", ribbonPath(c, gslX1, ngslX0, mx));

		const fs = Math.max(bandFontSize(c) * fontScale, minBandFontSize);
		const pathId = `center-${i}`;
		defs.append("path").attr("id", pathId).attr("d", centerLinePath(c, gslX1, ngslX0, mx, fs));

		cg
			.append("path")
			.attr("d", ribbonPath(c, gslX1, ngslX0, mx))
			.attr("fill", c.dirColor)
			.attr("fill-opacity", 0.5)
			.attr("stroke", c.dirColor)
			.attr("stroke-width", 0.5)
			.attr("stroke-opacity", 0.5)
			.attr("class", "ribbon")
			.style("cursor", "pointer");

		const wordSet = marqueeWordSetForCategory(c);
		const marqueeFont = marqueeFontForWordSet(wordSet);
		const allWords = [...new Set(marqueeWordsForCategory(c))];
		d3.shuffle(allWords);
		const wordStr = allWords.map((w) => w.toUpperCase()).join(",  ");
		const repeatCount = 4;
		const repeated = (wordStr + ",   ").repeat(repeatCount);

		c._wordStr = repeated;
		c._repeatCount = repeatCount;
		c._wordSet = wordSet;
		c._wordFontFamily = marqueeFont.family;
		c._wordFontStyle = marqueeFont.style;
		c._wordFontWeight = marqueeFont.weight;

		const scrollText = cg
			.append("text")
			.attr("clip-path", `url(#${clipId})`)
			.attr("font-family", c._wordFontFamily)
			.attr("font-size", `${fs}px`)
			.attr("font-weight", c._wordFontWeight)
			.attr("font-style", c._wordFontStyle)
			.attr("letter-spacing", "0.04em")
			.attr("fill", c.dirTextColor)
			.attr("fill-opacity", 1)
			.style("pointer-events", "none");

		scrollText.append("textPath").attr("href", `#${pathId}`).attr("startOffset", "0").text(repeated);

		c._scrollText = scrollText;
		c._pathId = pathId;
		c._offset = 0;
		c._normalFs = fs;

		const gH = c.gslY1 - c.gslY0;
		const gMidY = c.gslY0 + gH / 2;
		cg
			.append("text")
			.attr("class", "side-percent gsl-percent")
			.attr("x", gslX1 - leftPercentOffset)
			.attr("y", gMidY)
			.attr("text-anchor", "end")
			.attr("dominant-baseline", "central")
			.attr("font-size", `${9 * fontScale}px`)
			.attr("fill", c.dirColor)
			.attr("font-weight", 600)
			.attr("opacity", 0)
			.style("pointer-events", "none")
			.text(`${c.gslPct.toFixed(1)}%`);

		cg
			.append("text")
			.attr("class", "category-name")
			.attr("x", categoryLabelRestX)
			.attr("y", gMidY)
			.attr("text-anchor", "end")
			.attr("dominant-baseline", "central")
			.attr("font-family", "\"Source Serif 4\", serif")
			.attr("font-size", `${13 * fontScale}px`)
			.attr("fill", "var(--sem-ribbon-label)")
			.attr("font-weight", 500)
			.attr("letter-spacing", "0.02em")
			.style("pointer-events", "none")
			.text(c.shortName);

		const nH = c.ngslY1 - c.ngslY0;
		const nMidY = c.ngslY0 + nH / 2;
		cg
			.append("text")
			.attr("class", "side-percent ngsl-percent")
			.attr("x", ngslX0 + rightPercentOffset)
			.attr("y", nMidY)
			.attr("text-anchor", "start")
			.attr("dominant-baseline", "central")
			.attr("font-size", `${9 * fontScale}px`)
			.attr("fill", c.dirColor)
			.attr("font-weight", 600)
			.attr("opacity", 0)
			.style("pointer-events", "none")
			.text(`${c.ngslPct.toFixed(1)}%`);

		if (c.relChange != null) {
			const arrow = c.relChange > 0 ? "↑" : "↓";
			const changeColor = c.relChange > 0 ? "var(--sem-ribbon-up)" : "var(--sem-ribbon-down)";
			cg
				.append("text")
				.attr("class", "side-percent change-percent")
				.attr("x", ngslX0 + rightChangeOffset)
				.attr("y", nMidY)
				.attr("text-anchor", "start")
				.attr("dominant-baseline", "central")
				.attr("font-size", `${8 * fontScale}px`)
				.attr("fill", changeColor)
				.attr("font-weight", 500)
				.attr("opacity", 0)
				.style("pointer-events", "none")
				.text(`${arrow}${Math.abs(c.relChange).toFixed(1)}%`);
		}

		const minBandH = Math.min(gH, nH);
		c._thin = minBandH < thinThreshold;
		if (c._thin) {
			scrollText.style("display", "none");
			const antsPath = cg
				.append("path")
				.attr("d", antsLinePath(c, gslX1, ngslX0, mx, fs, antsYOffset))
				.attr("clip-path", `url(#${clipId})`)
				.attr("fill", "none")
				.attr("stroke", c.dirTextColor)
				.attr("stroke-opacity", 0.85)
				.attr("stroke-width", antsStrokeWidth)
				.attr("stroke-linecap", "round")
				.attr("stroke-dasharray", antsDashArray)
				.attr("class", "thin-band-ants")
				.style("pointer-events", "none");
			c._antsPath = antsPath.node();
			c._antsOffset = Math.random() * 10;
		}
	});

	cats.forEach((c) => {
		const pathEl = defs.select(`#${c._pathId}`).node();
		c._pathLen = pathEl ? pathEl.getTotalLength() : 600;
		c._tpNode = c._scrollText.select("textPath").node();
		c._textLen = c._tpNode ? c._tpNode.getComputedTextLength() : 2000;
		c._cycleLen = c._textLen / c._repeatCount;
		c._offset = c._cycleLen > 0 ? -Math.random() * c._cycleLen : 0;
	});

	const hoverLayer = svg.append("g").attr("class", "hover-layer").style("pointer-events", "none");

	cats.forEach((c, i) => {
		if (!c._thin) return;
		const expClipId = `exp-clip-${i}`;
		defs
			.append("clipPath")
			.attr("id", expClipId)
			.append("path")
			.attr("d", expandedRibbonPath(c, gslX1, ngslX0, mx, thinThreshold));
		const expPathId = `exp-center-${i}`;
		defs
			.append("path")
			.attr("id", expPathId)
			.attr("d", expandedCenterPath(c, gslX1, ngslX0, mx, defaultFontSize, thinThreshold));
		c._expClipId = expClipId;
		c._expPathId = expPathId;
	});

	let rafId = 0;
	let lastT = performance.now();

	function animateMarquee(now) {
		let dt = (now - lastT) / 1000;
		lastT = now;
		if (dt > 0.5) dt = 0.016;

		for (let i = 0; i < cats.length; i++) {
			const c = cats[i];
			c._offset = wrapLeftToRightOffset(c._offset + marqueeSpeed * dt, c._cycleLen);
			if (!c._thin && c._tpNode) c._tpNode.setAttribute("startOffset", c._offset);
			if (c._hoverActive && c._hoverTpNode) {
				c._hoverOffset = wrapLeftToRightOffset(c._hoverOffset + marqueeSpeed * dt, c._hoverCycleLen);
				c._hoverTpNode.setAttribute("startOffset", c._hoverOffset);
			}
			if (c._thin && c._antsPath) {
				c._antsOffset = (c._antsOffset - antsSpeed * dt) % 10;
				c._antsPath.setAttribute("stroke-dashoffset", c._antsOffset);
			}
		}

		rafId = requestAnimationFrame(animateMarquee);
	}
	rafId = requestAnimationFrame(animateMarquee);

	catGroups.selectAll(".cat-group").each(function eachCat() {
		const el = d3.select(this);
		const i = Number(el.attr("data-i"));
		const c = cats[i];

		el.on("mouseenter", () => {
			catGroups.selectAll(".cat-group").transition().duration(120).attr("opacity", 0.08);
			el.raise().transition().duration(120).attr("opacity", 1);
			el.select(".ribbon").attr("fill-opacity", 0.4).attr("stroke-opacity", 0.7).attr("stroke-width", 1);
			el.select(".category-name").transition().duration(hoverLabelTransitionMs).attr("x", categoryLabelHoverX);
			el.selectAll(".side-percent").transition().duration(hoverLabelTransitionMs).attr("opacity", 1);

			if (c._thin) {
				if (c._antsPath) d3.select(c._antsPath).style("display", "none");
				hoverLayer.selectAll("*").remove();
				hoverLayer
					.append("path")
					.attr("d", expandedRibbonPath(c, gslX1, ngslX0, mx, thinThreshold))
					.attr("fill", c.dirColor)
					.attr("fill-opacity", 0.2)
					.attr("stroke", "none");

				const ht = hoverLayer
					.append("text")
					.attr("clip-path", `url(#${c._expClipId})`)
					.attr("font-family", c._wordFontFamily)
					.attr("font-size", `${defaultFontSize}px`)
					.attr("font-weight", c._wordFontWeight)
					.attr("font-style", c._wordFontStyle)
					.attr("letter-spacing", "0.04em")
					.attr("fill", c.dirTextColor)
					.attr("fill-opacity", 1)
					.style("pointer-events", "none");

				ht.append("textPath").attr("href", `#${c._expPathId}`).attr("startOffset", "0").text(c._wordStr);

				c._hoverText = ht;
				c._hoverTpNode = ht.select("textPath").node();
				c._hoverActive = true;
				c._hoverCycleLen = c._hoverTpNode ? c._hoverTpNode.getComputedTextLength() / c._repeatCount : 2000;
				c._hoverOffset = wrapLeftToRightOffset(c._offset, c._hoverCycleLen);
				if (c._hoverTpNode) c._hoverTpNode.setAttribute("startOffset", c._hoverOffset);
			}

		})
			.on("mouseleave", () => {
				catGroups.selectAll(".cat-group").transition().duration(200).attr("opacity", 1);
				el.select(".ribbon").attr("fill-opacity", 0.4).attr("stroke-opacity", 0.4).attr("stroke-width", 0.5);
				el.select(".category-name").transition().duration(hoverLabelTransitionMs).attr("x", categoryLabelRestX);
				el.selectAll(".side-percent").transition().duration(hoverLabelTransitionMs).attr("opacity", 0);

				if (c._thin) {
					c._hoverActive = false;
					c._hoverTpNode = null;
					if (c._antsPath) d3.select(c._antsPath).style("display", null);
					hoverLayer.selectAll("*").remove();
				}

			});
	});

	return () => {
		cancelAnimationFrame(rafId);
		svg.remove();
	};
}
