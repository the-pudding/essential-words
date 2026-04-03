<script>
    let { p1="", p2="", p3="" } = $props();
</script>

<div class="intro-sub">
    <p>{@html p1}</p>
    {#if p2}
        <p>{@html p2}</p>
    {/if}
    {#if p3}
        <p>{@html p3}</p>
    {/if}
</div>