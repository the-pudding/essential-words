<script>
	import { getContext } from "svelte";
	import Footer from "$components/Footer.svelte";
	import IntroScreen from "$components/IntroScreen.svelte";
import SemanticsViz from "../charts/semantics/SemanticsViz.svelte";

	const copy = getContext("copy");
	// console.log(copy);
	// const data = getContext("data");

	const introStory = $derived.by(() => {
		const rows = copy?.story;
		if (!Array.isArray(rows)) return [];
		let introIdx = 0;
		return rows.map((block) => {
			if (block?.type === "intro") {
				return { ...block, _introIndex: introIdx++ };
			}
			return block;
		});
	});

</script>

<article class="story">
	{#if introStory.length}
		{#each introStory as block, i}
			{#if block.type === "intro"}
				<section
					class="story-section"
					id={block._introIndex === 0 ? "intro" : `intro-slide-${block._introIndex}`}
				>
					<IntroScreen
						p1={block.p1 ?? ""}
						p2={block.p2 ?? ""}
						p3={block.p3 ?? ""}
						screenIndex={block._introIndex}
					/>
				</section>
			{:else if block.type === "hero"}
				<section class="story-section story-section--hero">
					<h1 class="story-heading">{@html block.h1}</h1>
					{#if block.dek}
						<p class="story-dek">{@html block.dek}</p>
					{/if}
				</section>
			{:else if block.type === "prose"}
				<section class="story-section">
					<div class="content-container story-prose">{@html block.html}</div>
				</section>
			{:else if block.type === "chart"}
				<section class="story-section story-section--chart" id={block.chartId ?? `chart-${i}`}>
					<header class="chart-header">
						<h2 class="story-heading">{@html block.title}</h2>
						{#if block.subhead}
							<p class="chart-subhead">{@html block.subhead}</p>
						{/if}
					</header>
					{#if block.chartId === "semanticsSlopegraph"}
						<SemanticsViz
							title={block.title}
							subhead={block.subhead}
							overlays={block.overlays ?? []}
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
			<p class="story-empty">No <code>copy.story</code> in copy.json.</p>
		</section>
	{/if}
</article>

<svelte:boundary onerror={(e) => console.error(e)}>
	<Footer recirc={true} />
</svelte:boundary>
