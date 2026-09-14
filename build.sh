#!/bin/bash

# nami install bun bun.plus

bun install

bun build --compile ./index.js --outfile brook_store

mkdir worker
bun build --target=bun --outfile worker/report_worker.js report_worker.js
bunu https://bash.ooo/bundle.js worker worker.bundle.js
rm -rf worker
bun build --compile ./report.js --outfile brook_store_report
