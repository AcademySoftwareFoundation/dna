EXTENSION_DIR := dna-browser-extension
EXTENSION_VERSION := $(shell python3 -c "import json; print(json.load(open('$(EXTENSION_DIR)/manifest.json'))['version'])")
EXTENSION_ZIP := dist/dna-browser-extension-$(EXTENSION_VERSION).zip
FIREFOX_EXTENSION_BUILD := dist/dna-firefox-extension
FIREFOX_EXTENSION_ZIP := dist/dna-firefox-extension-$(EXTENSION_VERSION).zip
WEB_EXT_VERSION := 8

.PHONY: package-extension package-extension-firefox firefox-extension-build \
	lint-extension-firefox sign-extension-firefox

# Zip the Chrome extension for load-unpacked testing or Chrome Web Store upload.
# manifest.json ends up at the archive root (required by Chrome).
package-extension:
	mkdir -p dist
	rm -f $(EXTENSION_ZIP)
	cd $(EXTENSION_DIR) && zip -qr ../$(EXTENSION_ZIP) . \
		-x 'README.md' \
		-x 'package-lock.json' \
		-x '.DS_Store' \
		-x '__MACOSX/*'
	@echo "Packaged $(EXTENSION_ZIP)"

# Stage the Firefox build: same sources, with Chrome-only manifest keys,
# permissions and files (offscreen doc, Meet content script) stripped.
firefox-extension-build:
	mkdir -p dist
	rm -rf $(FIREFOX_EXTENSION_BUILD)
	cp -R $(EXTENSION_DIR) $(FIREFOX_EXTENSION_BUILD)
	python3 scripts/firefox_extension_manifest.py $(FIREFOX_EXTENSION_BUILD)/manifest.json
	cd $(FIREFOX_EXTENSION_BUILD) && rm -rf README.md package-lock.json offscreen content/meetSpeaker.js
	find $(FIREFOX_EXTENSION_BUILD) -name .DS_Store -delete

# Zip the Firefox build (manual AMO upload or about:debugging).
package-extension-firefox: firefox-extension-build
	rm -f $(FIREFOX_EXTENSION_ZIP)
	cd $(FIREFOX_EXTENSION_BUILD) && zip -qr ../../$(FIREFOX_EXTENSION_ZIP) .
	rm -rf $(FIREFOX_EXTENSION_BUILD)
	@echo "Packaged $(FIREFOX_EXTENSION_ZIP)"

# Run Mozilla's AMO validator on the Firefox build.
lint-extension-firefox: firefox-extension-build
	npx --yes web-ext@$(WEB_EXT_VERSION) lint --source-dir $(FIREFOX_EXTENSION_BUILD)
	rm -rf $(FIREFOX_EXTENSION_BUILD)

# Sign the Firefox build on AMO as unlisted (self-distributed; no public
# listing, automated review only) and download the signed .xpi into dist/.
# Needs AMO API credentials: https://addons.mozilla.org/developers/addon/api/key/
#   export AMO_JWT_ISSUER=user:12345:678  AMO_JWT_SECRET=...
# AMO signs each version once: bump "version" in manifest.json per release.
sign-extension-firefox: firefox-extension-build
	@test -n "$$AMO_JWT_ISSUER" && test -n "$$AMO_JWT_SECRET" || \
		{ echo "Set AMO_JWT_ISSUER and AMO_JWT_SECRET (AMO API key/secret)"; rm -rf $(FIREFOX_EXTENSION_BUILD); exit 1; }
	npx --yes web-ext@$(WEB_EXT_VERSION) sign \
		--source-dir $(FIREFOX_EXTENSION_BUILD) \
		--artifacts-dir dist \
		--channel unlisted \
		--api-key "$$AMO_JWT_ISSUER" \
		--api-secret "$$AMO_JWT_SECRET"; \
		status=$$?; rm -rf $(FIREFOX_EXTENSION_BUILD); exit $$status
