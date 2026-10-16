# Build and install the mac-reader CLI.
PREFIX ?= $(HOME)/bin
BIN = .build/release/mac-reader

.PHONY: build debug install fmt lint clean

build:
	swift build -c release

debug:
	swift build

install: build
	mkdir -p $(PREFIX)
	cp $(BIN) $(PREFIX)/mac-reader

fmt:
	swift format -i -r Sources Package.swift

lint:
	swift format lint -r -s Sources Package.swift

clean:
	rm -rf .build
