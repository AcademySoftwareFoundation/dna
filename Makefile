EXTENSION_DIR := dna-chrome-extension
EXTENSION_VERSION := $(shell python3 -c "import json; print(json.load(open('$(EXTENSION_DIR)/manifest.json'))['version'])")
EXTENSION_ZIP := dist/dna-chrome-extension-$(EXTENSION_VERSION).zip

.PHONY: package-extension

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
