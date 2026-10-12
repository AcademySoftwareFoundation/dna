EXTENSION_DIR := dna-chrome-extension
EXTENSION_VERSION := $(shell python3 -c "import json; print(json.load(open('$(EXTENSION_DIR)/manifest.json'))['version'])")
EXTENSION_ZIP := dist/dna-chrome-extension-$(EXTENSION_VERSION).zip
FIREFOX_EXTENSION_BUILD := dist/dna-firefox-extension
FIREFOX_EXTENSION_ZIP := dist/dna-firefox-extension-$(EXTENSION_VERSION).zip

.PHONY: package-extension package-extension-firefox

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

# Zip the extension for Firefox (AMO upload or about:debugging). Same sources,
# with Chrome-only manifest keys and permissions stripped.
package-extension-firefox:
	mkdir -p dist
	rm -rf $(FIREFOX_EXTENSION_BUILD) $(FIREFOX_EXTENSION_ZIP)
	cp -R $(EXTENSION_DIR) $(FIREFOX_EXTENSION_BUILD)
	python3 scripts/firefox_extension_manifest.py $(FIREFOX_EXTENSION_BUILD)/manifest.json
	cd $(FIREFOX_EXTENSION_BUILD) && zip -qr ../../$(FIREFOX_EXTENSION_ZIP) . \
		-x 'README.md' \
		-x 'package-lock.json' \
		-x '.DS_Store' \
		-x '__MACOSX/*' \
		-x 'offscreen/*' \
		-x 'content/meetSpeaker.js'
	rm -rf $(FIREFOX_EXTENSION_BUILD)
	@echo "Packaged $(FIREFOX_EXTENSION_ZIP)"
