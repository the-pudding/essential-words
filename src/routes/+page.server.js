import introRows from "$data/intro_screen.csv";
import semanticsRows from "$data/semantics.csv";
import { buildIntroWordPools } from "$utils/introWords.js";
import { buildSemanticsRibbonsPayload } from "../charts/semantics/semanticsRibbonsPayload.js";

export async function load() {
	const introWordPools = buildIntroWordPools(introRows);

	let semanticsRibbonsPayload = null;
	let semanticsRibbonsError = null;
	try {
		semanticsRibbonsPayload = buildSemanticsRibbonsPayload(semanticsRows);
	} catch (e) {
		semanticsRibbonsError = e instanceof Error ? e.message : String(e);
	}

	return {
		introWordPools,
		semanticsRibbonsPayload,
		semanticsRibbonsError
	};
}
