# Build and install the mac-reader CLI.
PREFIX ?= $(HOME)/bin
BIN = .build/release/mac-reader

.PHONY: build debug install test fmt lint clean

build:
	swift build -c release

debug:
	swift build

install: build
	mkdir -p $(PREFIX)
	cp $(BIN) $(PREFIX)/mac-reader

test:
	swift test

fmt:
	swift format -i -r Sources Tests Package.swift

lint:
	swift format lint -r -s Sources Tests Package.swift

clean:
	rm -rf .build
