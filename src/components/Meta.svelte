<script>
	let {
		title = "essential words",
		description = "Description TK",
		url = "https://pudding.cool/2026/07/essential-words",
		keywords = "",
		preloadFont = []
	} = $props();
</script>

<svelte:head>
	<title>How the Words We Teach English Language Learners Changed</title>
	<meta name="description" content="Differences between “essential vocabulary” lists, 1953 vs. 2023" />
	<meta name="author" content="The Pudding" />
	<meta name="news_keywords" content={keywords} />

	<meta property="og:title" content="How the Words We Teach English Language Learners Changed" />
	<meta property="og:site_name" content="The Pudding" />
	<meta property="og:url" content={url} />
	<meta property="og:description" content="Differences between “essential vocabulary” lists, 1953 vs. 2023" />
	<meta property="og:type" content="article" />
	<meta property="og:locale" content="en_US" />

	<meta property="og:image" content="https://pudding.cool/2026/07/essential-words/assets/social-facebook.jpg" />
	<meta property="og:image:type" content="image/jpeg" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />

	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:site" content="https://pudding.cool" />
	<meta name="twitter:creator" content="@puddingviz" />
	<meta name="twitter:title" content="How the Words We Teach English Language Learners Changed" />
	<meta name="twitter:description" content="Differences between “essential vocabulary” lists, 1953 vs. 2023" />
	<meta name="twitter:image:src" content="https://pudding.cool/2026/07/essential-words/assets/social-facebook.jpg" />

	<meta name="robots" content="max-image-preview:large" />

	<link rel="canonical" href="https://pudding.cool/2026/07/essential-words" />

	{#each preloadFont as href}
		<link rel="preload" {href} as="font" type="font/woff2" crossorigin />
	{/each}
</svelte:head>
