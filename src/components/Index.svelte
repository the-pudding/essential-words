<script>
	import { getContext } from "svelte";
	import Footer from "$components/Footer.svelte";
	import IntroSub from "$components/IntroSub.svelte";

	const copy = getContext("copy");
	// console.log(copy);
	// const data = getContext("data");

	const components = { IntroSub };
</script>

<article class="story">
	{#each copy.body as part}
		<section id={part.section} class="story-section">
			{#each part.content as block}
				{#if block.type === "IntroSub"}
					<IntroSub {...block.value} />
				{:else if block.type === "text"}
					<p>{@html block.value}</p>
				{:else if block.type === "h1" || block.type === "h2"}
					<svelte:element this={block.type} class="story-heading">{@html block.value}</svelte:element>
				{/if}
			{/each}
		</section>
	{/each}
</article>

<svelte:boundary onerror={(e) => console.error(e)}>
	<!-- <Footer recirc={true} /> -->
</svelte:boundary>
