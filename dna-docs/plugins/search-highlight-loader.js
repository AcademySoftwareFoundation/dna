// Build-time patches for @easyops-cn/docusaurus-search-local (see
// ./search-highlight.ts). Each must match exactly once in the files it
// applies to, so a plugin update that moves the code fails the build
// instead of quietly restoring the old behaviour.
const PATCHES = [
  {
    // Only results matched in a page's body link with ?_highlight=..., so
    // page-title and heading results open without the on-page highlights.
    // Shared by SearchBar (dropdown) and SearchPage ("See all results").
    files: /SearchBar\.jsx$|SearchPage\.jsx$/,
    from: /if \(Mark && tokens\.length > 0\) \{/,
    to: 'if (Mark && tokens.length > 0 && type === SearchDocumentType.Content) {',
  },
  {
    // The plugin only renders its ✕ clear button (which also clears the
    // on-page highlights) when the keyboard shortcut and its hint are on.
    // We run without the shortcut, so render it regardless; custom.css
    // hides the shortcut hint that shares this block.
    files: /SearchBar\.jsx$/,
    from: /\{searchBarShortcut &&\s+searchBarShortcutHint &&\s+\(inputValue !== ""/,
    to: '{(inputValue !== ""',
  },
];

module.exports = function searchHighlightLoader(source) {
  let out = source;
  for (const {files, from, to} of PATCHES) {
    if (!files.test(this.resourcePath)) continue;
    const matches = out.match(new RegExp(from.source, 'g')) ?? [];
    if (matches.length !== 1) {
      throw new Error(
        `search-highlight-loader: expected one match for ${from} in ${this.resourcePath}, ` +
          `found ${matches.length}. The search plugin has changed; update ` +
          'dna-docs/plugins/search-highlight-loader.js.',
      );
    }
    out = out.replace(from, to);
  }
  return out;
};
