import { FormattingPatterns } from "@spacebarchat/spacebar-api-types/v9";
import Marked, { ReactRenderer } from "marked-react";
import React from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { materialDark } from "react-syntax-highlighter/dist/cjs/styles/prism";
import styled from "styled-components";
import CodeBlock from "../Codeblock";
import Link from "../Link";
import Spoiler from "../Spoiler";
import { MarkdownProps } from "./Markdown";
import Timestamp from "./Timestamp";

const Container = styled.div`
	// remove the excessive left padding, and margin in lists
	ul,
	ol {
		padding: 0 0 0 15px;
		margin: 0;
	}

	blockquote {
		margin: 2px 0;
		padding: 5px;
		background-color: var(--background-secondary);
		width: fit-content;
		border-radius: 4px;
		border-inline-start: 4px solid var(--background-tertiary);
	}

	code.inline {
		background-color: var(--background-secondary);
		padding: 2px 4px;
		border-radius: 4px;
		font-size: 80%;
		font-family: var(--font-family-code);
	}

	code {
		font-size: 85%;
	}

	.syntaxHighlighter {
		// remove excessive left "padding" in line numbers
		.linenumber {
			min-width: 0 !important;
		}

		// append vertical pipe to line numbers
		.linenumber::after {
			content: " |";
		}
	}
`;

/**
 * Regex for matching execessive recursion of blockquotes and lists
 */
const RE_RECURSIVE = /(^(?:[>*+-][^\S\r\n]*){5})(?:[>*+-][^\S\r\n]*)+(.*$)/gm;

/**
 * Regex for matching multi-line blockquotes
 */
const RE_BLOCKQUOTE = /^([^\S\r\n]*>[^\n]+\n?)+/gm;

/**
 * Regex for matching HTML tags
 */
const RE_HTML_TAGS = /^(<\/?[a-zA-Z0-9]+>)(.*$)/gm;

/**
 * Regex for matching empty lines
 */
const RE_EMPTY_LINE = /^\s*?$/gm;

/**
 * Regex for matching line starting with plus
 */
const RE_PLUS = /^\s*\+(?:$|[^+])/gm;

/**
 * Sanitise Markdown input before rendering
 * @param content Input string
 * @returns Sanitised string
 */
function sanitize(content: string) {
	return (
		content
			// Strip excessive blockquote or list indentation
			.replace(RE_RECURSIVE, (_, m0, m1) => m0 + m1)

			// Append empty character if string starts with html tag
			// This is to avoid inconsistencies in rendering Markdown inside/after HTML tags
			// https://github.com/revoltchat/revite/issues/733
			.replace(RE_HTML_TAGS, (match) => `\u200E${match}`)

			// Append empty character if line starts with a plus
			// which would usually open a new list but we want
			// to avoid that behaviour in our case.
			.replace(RE_PLUS, (match) => `\u200E${match}`)

			// Replace empty lines with non-breaking space
			// because remark renderer is collapsing empty
			// or otherwise whitespace-only lines of text
			.replace(RE_EMPTY_LINE, "‎")

			// Ensure empty line after blockquotes for correct rendering
			.replace(RE_BLOCKQUOTE, (match) => `${match}\n`)
	);
}

const customRenderer: Partial<ReactRenderer> = {
	code: (content: string, lang: string) => (
		<CodeBlock lang={lang}>
			<SyntaxHighlighter
				className="syntaxHighlighter"
				children={content}
				language={lang}
				style={materialDark}
				showLineNumbers={true}
				showInlineLineNumbers={true}
				PreTag="div"
			/>
		</CodeBlock>
	),
	codespan: (content: string) => <code className="inline">{content}</code>,
	link: (href, text) => <Link href={href}>{text}</Link>,
	text: (text: string) => {
		const spoilerRe = /\|\|([\s\S]+?)\|\|/g;

		if (spoilerRe.test(text)) {
			// get content inside spoiler tags
			const spoilerContent = text.match(spoilerRe)![0].slice(2, -2);
			return <Spoiler children={spoilerContent} />;
		}

		const match = text.match(FormattingPatterns.Timestamp);
		if (match) {
			const { timestamp, style } = match.groups || {};
			return <Timestamp timestamp={timestamp} style={style} />;
		}

		return text;
	},
};

export default React.memo(({ content }: MarkdownProps) => {
	const sanitizedContent = React.useMemo(() => sanitize(content), [content]);

	return (
		<Container>
			<Marked breaks gfm openLinksInNewTab renderer={customRenderer}>
				{sanitizedContent}
			</Marked>
		</Container>
	);
});
