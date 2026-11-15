SHELL := /bin/sh

.PHONY: install dev wasm build test test-native macos clean

install:
	npm install

dev:
	npm run dev

wasm:
	npm run wasm:build

build: wasm
	npm run build

test:
	npm test

test-native:
	npm run test:cpp

macos: build
	$(MAKE) -f native/macos/Makefile

clean:
	rm -rf build dist public/wasm/document_core.js public/wasm/document_core.wasm
