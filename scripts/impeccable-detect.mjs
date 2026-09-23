#!/usr/bin/env node

// Repository entry point for the vendored Impeccable detector.
// Keep the current working directory intact: the detector resolves DESIGN.md
// and .impeccable/config.json relative to the project being scanned.
import { detectCli } from './vendor/impeccable/detector/detect-antipatterns.mjs';

await detectCli();
