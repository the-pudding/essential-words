<script>
	import { getContext } from "svelte";
	import Footer from "$components/Footer.svelte";
	import IntroScreen from "$components/IntroScreen.svelte";

	const copy = getContext("copy");
	// console.log(copy);
	// const data = getContext("data");

	const components = { IntroScreen };


	function storySegments(content) {
		const segments = [];
		let textGroup = [];
		for (const block of content) {
			if (block.type === "text") {
				textGroup.push(block);
			} else if (block.type === "h1" || block.type === "h2") {
				if (textGroup.length) {
					segments.push({ type: "textGroup", blocks: textGroup });
					textGroup = [];
				}
				segments.push({ type: "heading", block });
			}
		}
		if (textGroup.length) segments.push({ type: "textGroup", blocks: textGroup });
		return segments;
	}
</script>

<article class="story">
	{#each copy.body as part}
		<section id={part.section} class="story-section">
			{#if part.section === "intro"}
				{#each part.content as block, blockIndex}
					{#if block.type === "IntroScreen"}
						<IntroScreen {...block.value} screenIndex={blockIndex} />
					{/if}
				{/each}
			{:else}
				{#each storySegments(part.content) as seg}
					{#if seg.type === "heading"}
						<svelte:element this={seg.block.type} class="story-heading">{@html seg.block.value}</svelte:element>
					{:else}
						<div class="content-container">
							{#each seg.blocks as block}
								<p>{@html block.value}</p>
							{/each}
						</div>
					{/if}
				{/each}
			{/if}
		</section>
	{/each}
</article>

<svelte:boundary onerror={(e) => console.error(e)}>
	<!-- <Footer recirc={true} /> -->
</svelte:boundary>
