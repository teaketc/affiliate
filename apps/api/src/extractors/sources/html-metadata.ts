export interface HtmlMetadata {
	/** og:* and product:* meta properties (first value wins, except og:image which is collected). */
	openGraph: Record<string, string>;
	ogImages: string[];
	/** Parsed JSON-LD blocks (invalid JSON blocks are skipped). */
	jsonLd: unknown[];
	title: string | null;
	canonical: string | null;
	description: string | null;
}

const MAX_JSONLD_BLOCK_CHARS = 500_000;

/** Parses Open Graph, JSON-LD, <title> and canonical link using Bun's streaming HTMLRewriter. */
export async function parseHtmlMetadata(html: string): Promise<HtmlMetadata> {
	const openGraph: Record<string, string> = {};
	const ogImages: string[] = [];
	const jsonLdTexts: string[] = [];
	let current = '';
	let title = '';
	let inTitle = false;
	let canonical: string | null = null;
	let description: string | null = null;

	const rewriter = new HTMLRewriter()
		.on('meta', {
			element(el) {
				const key = (el.getAttribute('property') ?? el.getAttribute('name') ?? '').trim().toLowerCase();
				const content = el.getAttribute('content');
				if (!key || content === null) return;
				if (key === 'og:image' || key === 'og:image:url' || key === 'og:image:secure_url') {
					ogImages.push(content);
				}
				if (key.startsWith('og:') || key.startsWith('product:')) {
					if (!(key in openGraph)) openGraph[key] = content;
				}
				if (key === 'description' && description === null) description = content;
			}
		})
		.on('link', {
			element(el) {
				const rel = (el.getAttribute('rel') ?? '').toLowerCase().split(/\s+/);
				if (rel.includes('canonical') && canonical === null) canonical = el.getAttribute('href');
			}
		})
		.on('title', {
			element(el) {
				if (title) return;
				inTitle = true;
				el.onEndTag(() => {
					inTitle = false;
				});
			},
			text(t) {
				if (inTitle) title += t.text;
			}
		})
		.on('script[type="application/ld+json"]', {
			text(t) {
				if (current.length < MAX_JSONLD_BLOCK_CHARS) current += t.text;
				if (t.lastInTextNode) {
					jsonLdTexts.push(current);
					current = '';
				}
			}
		});

	await rewriter.transform(new Response(html)).text();

	const jsonLd: unknown[] = [];
	for (const text of jsonLdTexts) {
		try {
			jsonLd.push(JSON.parse(text) as unknown);
		} catch {
			// invalid structured data is ignored, never guessed
		}
	}

	return { openGraph, ogImages, jsonLd, title: title.trim() || null, canonical, description };
}
