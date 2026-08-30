#!/bin/bash
cd "$(dirname "$0")"
echo "にゃんこの時空アトリエ を更新します..."
python3 build.py
open "_site/index.html"
