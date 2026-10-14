<script>
	import { getContext, onMount } from "svelte";
	import { browser } from "$app/environment";
	import { subscribeExplorerSteps } from "$utils/explorerSteps.js";
	import Footer from "$components/Footer.svelte";
	import IntroSequence from "$components/IntroSequence.svelte";
	import SemanticsViz from "../charts/semantics/SemanticsViz.svelte";
	import Scope from "../charts/scope/scope.svelte";
	import ConcretenessKde from "../charts/concreteness-kde/concretenessKde.svelte";
	import ConcretenessBands from "../charts/concreteness-bands/concretenessBands.svelte";
	import PosAdverbs from "../charts/part-of-speech/posAdverbs.svelte";
	import PosWaffle from "../charts/part-of-speech/posWaffle.svelte";
	import ScopeArcs from "../charts/scope-arcs/scopeArcs.svelte";
	import StoryTitle from "$svg/title.svg";
	import StoryTitleMobile from "$svg/title-mobile.svg";
	import Explorer from "$components/Explorer.svelte";
	import Notes from "$components/Notes.svelte";

	const copy = getContext("copy");
	const storyBlocks = $derived(Array.isArray(copy?.story) ? copy.story : []);
	const notesBlocks = $derived(Array.isArray(copy?.notes) ? copy.notes : []);
	const introBlocks = $derived(storyBlocks.filter((block) => block?.type === "intro"));
	const mainBlocks = $derived(storyBlocks.filter((block) => block?.type !== "intro"));
	const hasText = (value) => typeof value === "string" && value.trim().length > 0;

	function chartHeadingId(chartId) {
		return chartId ? `${chartId}-heading` : undefined;
	}

	function chartSubheadId(chartId) {
		return chartId ? `${chartId}-subhead` : undefined;
	}

	const TITLE_LINE = 0.38;
	const FOOTER_LINE_PX = 72;

	let titlePassed = $state(false);
	let footerCovering = $state(false);
	let stepsActive = $state(false);
	const explorerVisible = $derived(titlePassed && !footerCovering && !stepsActive);

	function viewportHeight() {
		return window.visualViewport?.height || document.documentElement.clientHeight || 0;
	}

	function clampedInset(height, line) {
		return Math.min(line, Math.max(0, Math.floor(height) - 1));
	}

	onMount(() => {
		if (!browser) return;

		const titleMarker = document.querySelector("[data-explorer-title-edge]");
		const footerMarker = document.querySelector("[data-explorer-footer-edge]");
		let titleObserver = null;
		let footerObserver = null;
		let footerInset = -1;

		function observeEdge(marker, rootMargin, onEntry) {
			if (!marker) return null;
			const observer = new IntersectionObserver(
				(entries) => {
					const entry = entries[entries.length - 1];
					if (entry) onEntry(entry);
				},
				{ root: null, rootMargin, threshold: 0 }
			);
			observer.observe(marker);
			return observer;
		}

		function applyTitle(entry) {
			const line = entry.rootBounds?.top ?? viewportHeight() * TITLE_LINE;
			const bottom = entry.boundingClientRect.bottom;
			titlePassed = !entry.isIntersecting && bottom <= line;
		}

		function applyFooter(entry) {
			const height = viewportHeight();
			const line = height - clampedInset(height, FOOTER_LINE_PX);
			const top = entry.boundingClientRect.top;
			footerCovering = entry.isIntersecting || top < line;
		}

		function syncFooterObserver() {
			const nextFooterInset = clampedInset(viewportHeight(), FOOTER_LINE_PX);

			if (nextFooterInset !== footerInset) {
				footerInset = nextFooterInset;
				footerObserver?.disconnect();
				footerObserver = observeEdge(footerMarker, `0px 0px -${footerInset}px 0px`, applyFooter);
			}
		}

		const unsubscribeSteps = subscribeExplorerSteps((active) => {
			stepsActive = active;
		});

		titleObserver = observeEdge(titleMarker, `-${TITLE_LINE * 100}% 0px 0px 0px`, applyTitle);
		syncFooterObserver();
		window.addEventListener("resize", syncFooterObserver);
		const vv = window.visualViewport;
		vv?.addEventListener("resize", syncFooterObserver);

		return () => {
			unsubscribeSteps();
			titleObserver?.disconnect();
			footerObserver?.disconnect();
			window.removeEventListener("resize", syncFooterObserver);
			vv?.removeEventListener("resize", syncFooterObserver);
		};
	});
</script>

<article class="story">
	{#if storyBlocks.length}
		{#if introBlocks.length}
			<section class="story-section" id="intro" aria-label="Introduction">
				<IntroSequence blocks={introBlocks} />
			</section>
		{/if}

		{#each mainBlocks as block, i}
			{#if block.type === "title"}
				<section class="story-section story-section--title" id="title">
					<h1 class="story-title">
						<span class="sr-only">From Goat to Despite</span>
						<span class="story-title__art story-title__art--desktop" aria-hidden="true">{@html StoryTitle}</span>
						<span class="story-title__art story-title__art--mobile" aria-hidden="true">{@html StoryTitleMobile}</span>
					</h1>
					{#if block.dek}
						<p class="story-dek">{@html block.dek}</p>
					{/if}
					{#if block.byline}
						<p class="byline">{@html block.byline}</p>
					{/if}
					<span class="explorer-title-edge" data-explorer-title-edge aria-hidden="true"></span>
				</section>
				<Explorer visible={explorerVisible} />
			{:else if block.type === "prose"}
				<section class="story-section story-section--prose">
					<div class="content-container story-prose">{@html block.html}</div>
				</section>
			{:else if block.type === "chart"}
				<section
					class="story-section story-section--chart"
					id={block.chartId ?? `chart-${i}`}
					aria-labelledby={hasText(block.title) ? chartHeadingId(block.chartId) : undefined}
				>
					{#if hasText(block.title) || hasText(block.subhead)}
						<header class="chart-header">
							{#if hasText(block.title)}
								<h3 id={chartHeadingId(block.chartId)} class="chart-heading">{@html block.title}</h3>
							{/if}
							{#if hasText(block.subhead)}
								<p id={chartSubheadId(block.chartId)} class="chart-subhead">{@html block.subhead}</p>
							{/if}
						</header>
					{/if}
					{#if block.chartId === "semanticsSlopegraph"}
						<SemanticsViz
							title={block.title}
							subhead={block.subhead}
							note={block.note}
							overlays={block.overlays ?? []}
							headingId={chartHeadingId(block.chartId)}
							subheadId={hasText(block.subhead) ? chartSubheadId(block.chartId) : undefined}
						/>
					<!-- {:else if block.chartId === "semanticsScopeTiles"}
						<Scope note={block.note} overlays={block.overlays ?? []} /> -->
					{:else if block.chartId === "concretenessDistribution"}
						<ConcretenessKde
							annotation={block.annotation}
							headingId={chartHeadingId(block.chartId)}
							subheadId={hasText(block.subhead) ? chartSubheadId(block.chartId) : undefined}
						/>
					{:else if block.chartId === "concretenessBands"}
						<ConcretenessBands
							note={block.note}
							overlays={block.overlays ?? []}
							headingId={chartHeadingId(block.chartId)}
							subheadId={hasText(block.subhead) ? chartSubheadId(block.chartId) : undefined}
						/>
					{:else if block.chartId === "posDiagram"}
						<PosWaffle
							note={block.note}
							headingId={chartHeadingId(block.chartId)}
							subheadId={hasText(block.subhead) ? chartSubheadId(block.chartId) : undefined}
						/>
					{:else if block.chartId === "adverbsAdded"}
						<PosAdverbs headingId={chartHeadingId(block.chartId)} />
					{:else if block.chartId === "semanticsScopeArcs"}
						<ScopeArcs
							noteSummary={block.noteSummary}
							noteDetails={block.noteDetails}
							overlays={block.overlays ?? []}
							headingId={chartHeadingId(block.chartId)}
							subheadId={hasText(block.subhead) ? chartSubheadId(block.chartId) : undefined}
						/>
					{:else}
						<div class="chart-placeholder" data-chart-id={block.chartId}>
							<p class="chart-placeholder-label">Chart not wired yet: {block.chartId}</p>
						</div>
					{/if}
				</section>
			{/if}
		{/each}
	{:else}
		<section class="story-section">
			<p class="story-empty">No copy in copy.json.</p>
		</section>
	{/if}

	<Notes blocks={notesBlocks} />
</article>

<span class="explorer-footer-edge" data-explorer-footer-edge aria-hidden="true"></span>

<svelte:boundary onerror={(e) => console.error(e)}>
	<Footer recirc={true} />
</svelte:boundary>

