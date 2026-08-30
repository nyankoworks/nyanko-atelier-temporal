#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
にゃんこの時空アトリエ — ビルドツール
=====================================
works/ の中に作品フォルダを1つ置くだけで、note風のトップページを自動で作ります。

つかいかた:
    python3 build.py
    （works/ にフォルダを足したあと、これを実行するだけ）

作品フォルダの中身のルール（お約束）:
    - link.txt を入れる  → note や YouTube などの外部リンクのカードになります
                           （1行目にURL。2行目以降を書くと説明文になります）
    - index.html を入れる → 自作のWebページ作品としてリンクします
    - 画像を入れる        → サムネイル＋クリックで拡大（複数枚OK）
    - PDF を入れる        → PDFを開くカードになります

    フォルダ名がそのままタイトルになります。
    先頭に「09_」のような数字を付けると並び順の目印になります（数字が大きいほど新しい＝上）。

    任意で入れられるファイル:
    - title.txt        … タイトルを上書きしたいとき（1行）
    - about.txt        … カードの説明文
    - cover.png / cover.jpg / thumb.png … サムネイル画像を指定したいとき
    - date.txt         … 日付（例: 2026-08-29）。並び替えの目印にも使えます

    フォルダ名やファイル名が「_」や「.」で始まるものは下書き扱いで表示されません。

GA4:
    config.json の "ga4_id" に測定ID（G-XXXXXXX）を入れると、
    生成される全ページに自動でタグが入ります。空のままなら何も入りません。
"""

import json
import os
import re
import shutil
import html
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WORKS = ROOT / "works"
OUT = ROOT / "_site"
ASSETS = ROOT / "assets"

IMAGE_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif"}
PDF_EXT = {".pdf"}

DEFAULT_CONFIG = {
    "site_title": "にゃんこの時空アトリエ",
    "site_subtitle": "nyanko-atelier-temporal",
    "author": "",
    "intro": "",
    "ga4_id": "",
    "footer": "© にゃんこの時空アトリエ",
    "accent": "#e9a0a0",
    "newest_first": True,
}

BADGES = {
    "gallery": "画像",
    "pdf": "PDF",
    "page": "ページ",
    "link": "リンク",
}
ICONS = {
    "gallery": "🖼️",
    "pdf": "📄",
    "page": "🐾",
    "link": "🔗",
}


def load_config():
    cfg = dict(DEFAULT_CONFIG)
    p = ROOT / "config.json"
    if p.exists():
        try:
            cfg.update(json.loads(p.read_text(encoding="utf-8")))
        except Exception as e:
            print(f"  ! config.json の読み込みに失敗しました: {e}")
    return cfg


def natural_key(s):
    """数字を数として扱う自然順ソート用キー"""
    return [int(t) if t.isdigit() else t.lower()
            for t in re.split(r'(\d+)', str(s))]


def clean_title(name):
    m = re.match(r'^\d+[\s_\-\.]+(.*)$', name)
    base = m.group(1) if m else name
    base = base.replace("_", " ").strip()
    return base or name


def read_text_file(folder, *names):
    for n in names:
        p = folder / n
        if p.exists() and p.is_file():
            return p.read_text(encoding="utf-8").strip()
    return ""


def find_files(folder, exts):
    files = [f for f in folder.iterdir()
             if f.is_file() and f.suffix.lower() in exts
             and not f.name.startswith((".", "_"))]
    return sorted(files, key=lambda f: natural_key(f.name))


def find_cover(folder):
    for stem in ("cover", "thumb", "サムネ", "サムネイル"):
        for ext in IMAGE_EXT:
            p = folder / f"{stem}{ext}"
            if p.exists():
                return p
    return None


def url_path(*parts):
    return "/".join(urllib.parse.quote(str(p)) for p in parts)


def build_work(folder):
    name = folder.name
    title = read_text_file(folder, "title.txt") or clean_title(name)
    desc = read_text_file(folder, "about.txt", "description.txt", "desc.txt")
    date = read_text_file(folder, "date.txt")

    link_txt = read_text_file(folder, "link.txt")
    images = find_files(folder, IMAGE_EXT)
    pdfs = find_files(folder, PDF_EXT)
    index_html = (folder / "index.html")
    cover = find_cover(folder)

    info = {
        "name": name,
        "title": title,
        "desc": desc,
        "date": date,
        "cover": None,
        "sort": (date, name),
    }

    if link_txt:
        lines = [l.strip() for l in link_txt.splitlines() if l.strip()]
        url = lines[0] if lines else "#"
        if len(lines) > 1 and not desc:
            info["desc"] = " ".join(lines[1:])
        info["type"] = "link"
        info["url"] = url
        info["domain"] = urllib.parse.urlparse(url).netloc.replace("www.", "")
        # カバー画像があれば使う
        cover = cover or (images[0] if images else None)
        if cover:
            info["cover"] = url_path("works", name, cover.name)
        return info

    if index_html.exists():
        info["type"] = "page"
        info["url"] = url_path("works", name, "index.html")
        cover = cover or (images[0] if images else None)
        if cover:
            info["cover"] = url_path("works", name, cover.name)
        return info

    if images:
        info["type"] = "gallery"
        thumb = cover or images[0]
        info["cover"] = url_path("works", name, thumb.name)
        info["images"] = [url_path("works", name, im.name) for im in images]
        return info

    if pdfs:
        info["type"] = "pdf"
        info["url"] = url_path("works", name, pdfs[0].name)
        if cover:
            info["cover"] = url_path("works", name, cover.name)
        return info

    # 中身が判定できないフォルダはスキップ
    return None


def discover():
    works = []
    if not WORKS.exists():
        return works
    for d in sorted(WORKS.iterdir(), key=lambda p: natural_key(p.name)):
        if not d.is_dir():
            continue
        if d.name.startswith((".", "_")):
            continue
        info = build_work(d)
        if info:
            works.append(info)
        else:
            print(f"  · スキップ（中身が判定できません）: works/{d.name}")
    return works


def ga4_snippet(gid):
    if not gid:
        return ""
    return (
        '<!-- Google tag (gtag.js) -->\n'
        f'<script async src="https://www.googletagmanager.com/gtag/js?id={gid}"></script>\n'
        '<script>\n'
        '  window.dataLayer = window.dataLayer || [];\n'
        '  function gtag(){dataLayer.push(arguments);}\n'
        "  gtag('js', new Date());\n"
        f"  gtag('config', '{gid}');\n"
        '</script>\n'
    )


def inject_ga4(html_text, gid):
    if not gid:
        return html_text
    snippet = ga4_snippet(gid)
    if "</head>" in html_text:
        return html_text.replace("</head>", snippet + "</head>", 1)
    if "<head>" in html_text:
        return html_text.replace("<head>", "<head>\n" + snippet, 1)
    # headが無いページには先頭に付ける
    return snippet + html_text


def clarity_snippet(cid):
    """Microsoft Clarity（ヒートマップ / セッション録画）のタグ"""
    if not cid:
        return ""
    return (
        '<!-- Microsoft Clarity -->\n'
        '<script type="text/javascript">\n'
        '(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};'
        't=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;'
        'y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})'
        f'(window,document,"clarity","script","{cid}");\n'
        '</script>\n'
    )


def gtm_head(gid):
    """Google Tag Manager（<head>用）。1回入れれば、GA4/Clarity/イベントはGTM画面で管理できる"""
    if not gid:
        return ""
    return (
        '<!-- Google Tag Manager -->\n<script>(function(w,d,s,l,i){w[l]=w[l]||[];'
        "w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});"
        "var f=d.getElementsByTagName(s)[0],j=d.createElement(s),"
        "dl=l!='dataLayer'?'&l='+l:'';j.async=true;"
        "j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;"
        'f.parentNode.insertBefore(j,f);})'
        f"(window,document,'script','dataLayer','{gid}');</script>\n<!-- End GTM -->\n"
    )


def gtm_body(gid):
    """Google Tag Manager（<body>直後のnoscript）"""
    if not gid:
        return ""
    return (
        f'<noscript><iframe src="https://www.googletagmanager.com/ns.html?id={gid}" '
        'height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>\n'
    )


def inject_analytics(html_text, cfg):
    """GTM・GA4・Clarity をまとめて注入（GTMは<head>と<body>直後）"""
    head = (gtm_head(cfg.get("gtm_id", ""))
            + ga4_snippet(cfg.get("ga4_id", ""))
            + clarity_snippet(cfg.get("clarity_id", "")))
    if head:
        if "</head>" in html_text:
            html_text = html_text.replace("</head>", head + "</head>", 1)
        elif "<head>" in html_text:
            html_text = html_text.replace("<head>", "<head>\n" + head, 1)
        else:
            html_text = head + html_text
    body = gtm_body(cfg.get("gtm_id", ""))
    if body and "<body>" in html_text:
        html_text = html_text.replace("<body>", "<body>\n" + body, 1)
    return html_text


def card_html(w, idx):
    badge = BADGES.get(w["type"], "")
    icon = ICONS.get(w["type"], "🐾")
    title = html.escape(w["title"])
    desc = html.escape(w["desc"])

    if w["cover"]:
        thumb = f'<img src="{html.escape(w["cover"])}" alt="{title}" loading="lazy">'
    else:
        thumb = f'<div class="placeholder">{icon}</div>'

    inner = (
        f'<div class="thumb"><span class="badge">{badge}</span>{thumb}</div>'
        f'<div class="card-body">'
        f'<h2 class="card-title">{title}</h2>'
    )
    if desc:
        inner += f'<p class="card-desc">{desc}</p>'

    if w["type"] == "gallery":
        meta = f'{icon} {len(w["images"])}枚を見る'
        inner += f'<div class="card-meta">{meta}</div></div>'
        data = html.escape(json.dumps(w["images"], ensure_ascii=False), quote=True)
        return (f'<div class="card" id="w{idx}" data-images="{data}" data-title="{title}" data-card="{title}" '
                f'onclick="openGallery(this)">{inner}</div>')

    if w["type"] == "link":
        label = w.get("domain") or "リンクを開く"
        inner += f'<div class="card-meta">{icon} {html.escape(label)}</div></div>'
        return (f'<a class="card" id="w{idx}" data-card="{title}" href="{html.escape(w["url"])}" '
                f'target="_blank" rel="noopener">{inner}</a>')

    if w["type"] == "pdf":
        inner += f'<div class="card-meta">{icon} PDFを開く</div></div>'
        return (f'<a class="card" id="w{idx}" data-card="{title}" href="{html.escape(w["url"])}" '
                f'target="_blank" rel="noopener">{inner}</a>')

    # page
    inner += f'<div class="card-meta">{icon} ひらく</div></div>'
    return f'<a class="card" id="w{idx}" data-card="{title}" href="{html.escape(w["url"])}">{inner}</a>'


SOCIAL_ICONS = {
    "instagram": ('<svg viewBox="0 0 24 24" width="20" height="20" fill="none" '
                  'stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" '
                  'height="20" rx="5"/><circle cx="12" cy="12" r="4.5"/><circle cx="17.5" '
                  'cy="6.5" r="1.3" fill="currentColor" stroke="none"/></svg>'),
    "twitter": ('<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">'
                '<path d="M18.244 2H21.5l-7.5 8.57L23 22h-6.9l-4.7-6.14L5.9 22H2.64l8.02-9.17'
                'L1.5 2h7.06l4.25 5.6L18.244 2zm-1.21 18h1.83L7.05 3.9H5.09L17.034 20z"/></svg>'),
}
SOCIAL_ICONS["x"] = SOCIAL_ICONS["twitter"]


def render_socials(cfg):
    items = cfg.get("socials", [])
    if not items:
        return ""
    out = []
    for s in items:
        t = s.get("type", "link")
        url = s.get("url", "#")
        label = s.get("label", t)
        icon = SOCIAL_ICONS.get(t, "🔗")
        out.append(f'<a class="sicon {t}" href="{html.escape(url)}" target="_blank" '
                   f'rel="noopener" title="{html.escape(label)}" '
                   f'aria-label="{html.escape(label)}">{icon}</a>')
    return '<div class="socials">' + "".join(out) + '</div>'


PAGE_TEMPLATE = """<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
<meta name="description" content="{intro}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{intro}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/style.css">
<style>:root{{--accent:{accent};}}</style>
</head>
<body>
{sitenav}
<header class="site-header">
  <div class="paw">🐾</div>
  <h1 class="site-title">{title}</h1>
  <div class="site-subtitle">{subtitle}</div>
  <p class="site-intro">{intro}</p>
  {nav}
  <div class="divider"></div>
</header>

<main class="wrap">
  <p class="count-line">{count_line}</p>
  <section class="grid">
{cards}
  </section>
</main>

<footer class="site-footer">{socials}{footer}</footer>

<div class="lightbox" id="lightbox">
  <button class="close" onclick="closeGallery()">×</button>
  <button class="nav prev" onclick="stepGallery(-1)">‹</button>
  <img id="lightbox-img" src="" alt="">
  <button class="nav next" onclick="stepGallery(1)">›</button>
</div>

<script>
let _imgs = [], _idx = 0;
function openGallery(el){{
  try {{ _imgs = JSON.parse(el.getAttribute('data-images')); }} catch(e){{ _imgs = []; }}
  if(!_imgs.length) return;
  _idx = 0; showImg();
  document.getElementById('lightbox').classList.add('open');
}}
function showImg(){{ document.getElementById('lightbox-img').src = _imgs[_idx]; }}
function stepGallery(d){{ event.stopPropagation(); _idx = (_idx + d + _imgs.length) % _imgs.length; showImg(); }}
function closeGallery(){{ document.getElementById('lightbox').classList.remove('open'); }}
document.getElementById('lightbox').addEventListener('click', function(e){{
  if(e.target === this) closeGallery();
}});
document.addEventListener('keydown', function(e){{
  if(!document.getElementById('lightbox').classList.contains('open')) return;
  if(e.key === 'Escape') closeGallery();
  if(e.key === 'ArrowRight') stepGallery(1);
  if(e.key === 'ArrowLeft') stepGallery(-1);
}});
</script>

<script>
  // カードのクリック数を計測（GA4イベント select_card として送信）
  document.querySelectorAll('.card').forEach(function(c){{
    c.addEventListener('click', function(){{
      var name = c.dataset.card || c.dataset.title || '';
      if (window.gtag) gtag('event', 'select_card', {{ card_title: name }});
    }});
  }});
</script>
</body>
</html>
"""

EMPTY_CARDS = """    <div class="empty">
      <span class="big">🐾</span>
      まだ作品がありません。<br>
      <b>works/</b> フォルダの中に、作品フォルダを1つ置いて、もう一度ビルドしてください。
    </div>"""


def nav_html(works, base):
    """全ページ共通のナビバー（🐾トップ＋全カードへのチップ）。base は index.html までの相対プレフィックス（""や"../../"）"""
    chip = ("display:inline-block;flex:0 0 auto;font-size:12px;color:#4a423b;"
            "background:#f4ead9;border:1px solid #ece2d2;padding:5px 11px;"
            "border-radius:999px;text-decoration:none;")
    chips = "".join(
        f'<a href="{base}index.html#w{i+1}" style="{chip}">{html.escape(w["title"])}</a>'
        for i, w in enumerate(works))
    return (
        '<nav class="sitenav" style="position:sticky;top:0;z-index:9000;display:flex;'
        'align-items:center;gap:10px;background:rgba(255,253,249,.96);'
        'border-bottom:1px solid #ece2d2;padding:8px 12px;'
        'font-family:\'Zen Maru Gothic\',system-ui,sans-serif;">'
        f'<a href="{base}index.html" style="flex:0 0 auto;font-weight:700;color:#fff;'
        'background:#e9a0a0;padding:6px 14px;border-radius:999px;font-size:13px;'
        'text-decoration:none;">🐾 トップ</a>'
        f'<div style="display:flex;gap:7px;overflow-x:auto;white-space:nowrap;'
        f'padding-bottom:2px;-webkit-overflow-scrolling:touch;">{chips}</div>'
        '</nav>'
    )


def copy_works(works):
    """作品フォルダを _site/works/ にコピーし、各HTMLに共通ナビ＋計測タグを注入"""
    out_works = OUT / "works"
    for w in works:
        src = WORKS / w["name"]
        dst = out_works / w["name"]
        if dst.exists():
            shutil.rmtree(dst)
        shutil.copytree(src, dst, ignore=shutil.ignore_patterns(
            "title.txt", "about.txt", "description.txt", "desc.txt",
            "link.txt", "date.txt"))
        for htmlfile in dst.rglob("*.html"):
            try:
                txt = htmlfile.read_text(encoding="utf-8")
                # 共通ナビを <body> 直後に注入（重複しないように）
                if 'class="sitenav"' not in txt:
                    rel = os.path.relpath(OUT, htmlfile.parent).replace(os.sep, "/")
                    base = (rel + "/") if rel != "." else ""
                    nav = nav_html(works, base)
                    if "<body>" in txt:
                        txt = txt.replace("<body>", "<body>\n" + nav, 1)
                    else:
                        txt = nav + txt
                txt = inject_analytics(txt, CONFIG)
                htmlfile.write_text(txt, encoding="utf-8")
            except Exception as e:
                print(f"  ! ページ加工に失敗: {htmlfile} ({e})")


# ============================================================
#  AIノート（非公開の作業場・ChatGPT風）
#  _AIノート/ の中の .md / .txt を読み、_AIノート/ノート.html を作ります。
#  ※ 先頭が「_」のフォルダなので、サイトにもGitHubにも出ません（PC内だけ）。
# ============================================================
NOTE_DIR = ROOT / "_AIノート"
NOTE_OUT = NOTE_DIR / "ノート.html"


def md_inline(s):
    s = html.escape(s)
    s = re.sub(r'`([^`]+)`', r'<code>\1</code>', s)
    s = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', s)
    return s


def md_block(text):
    parts = re.split(r'```[ \t]*\w*\n?', text)
    out = []
    for i, part in enumerate(parts):
        if i % 2 == 1:
            out.append('<pre><code>' + html.escape(part.rstrip('\n')) + '</code></pre>')
        else:
            para = "<br>".join(md_inline(l) for l in part.split('\n'))
            out.append(para)
    return "".join(out).strip("<br>")


# 話者ラベル（日本語/英語どちらでもOK。各AIの表示名のまま貼れる）
USER_LABELS = r'Q|質問|あなた|自分|私|わたし|You|user|ユーザー'
AI_SOURCES = [
    ('ChatGPT', r'ChatGPT|チャッピー|チャッピ|GPT'),
    ('Gemini',  r'Gemini|ジェミニ'),
    ('Claude',  r'Claude|クロード'),
    ('',        r'AI|A|回答|アシスタント|assistant|ボット|Bot'),
]


def _classify(line):
    m = re.match(r'^\s*(?:' + USER_LABELS + r')\s*[:：]\s?(.*)$', line, re.I)
    if m:
        return ('user', '', m.group(1))
    for src, pat in AI_SOURCES:
        m = re.match(r'^\s*(?:' + pat + r')\s*[:：]\s?(.*)$', line, re.I)
        if m:
            return ('assistant', src, m.group(1))
    return None


def parse_entry(path):
    raw = path.read_text(encoding="utf-8")
    title = None
    date = None
    body = []
    for ln in raw.splitlines():
        if title is None and ln.startswith('# '):
            title = ln[2:].strip()
            continue
        m = re.match(r'^>\s*(\d{4}-\d{2}-\d{2})', ln)
        if date is None and m:
            date = m.group(1)
            continue
        body.append(ln)

    msgs = []
    cur = None
    for ln in body:
        c = _classify(ln)
        if c:
            role, src, text = c
            if cur:
                msgs.append(cur)
            cur = {'role': role, 'source': src, 'text': text}
        elif cur is not None:
            cur['text'] += '\n' + ln
    if cur:
        msgs.append(cur)

    # 話者ラベルが1つも無いときは、空行区切りで「質問→回答→…」と交互に割り当て
    if not msgs:
        blocks = [b.strip() for b in re.split(r'\n\s*\n', '\n'.join(body)) if b.strip()]
        for i, b in enumerate(blocks):
            msgs.append({'role': 'user' if i % 2 == 0 else 'assistant',
                         'source': '', 'text': b})

    stem = path.stem
    if not date:
        m = re.match(r'^(\d{4}-\d{2}-\d{2})', stem)
        date = m.group(1) if m else ''
    if not title:
        t = re.sub(r'^\d{4}-\d{2}-\d{2}[_\-\s]*', '', stem).replace('_', ' ').strip()
        title = t or stem

    rendered = [{'role': m['role'], 'source': m.get('source', ''),
                 'html': md_block(m['text'].strip())}
                for m in msgs if m['text'].strip()]
    return {'title': title, 'date': date, 'file': path.name, 'messages': rendered}


def build_ainote():
    if not NOTE_DIR.exists():
        return 0
    files = [f for f in NOTE_DIR.iterdir()
             if f.is_file() and f.suffix.lower() in ('.md', '.txt')
             and not f.name.startswith(('_', '.'))]
    files.sort(key=lambda f: natural_key(f.name), reverse=True)  # 新しい順
    entries = [parse_entry(f) for f in files]
    entries = [e for e in entries if e['messages']]

    data = json.dumps(entries, ensure_ascii=False).replace('</', '<\\/')
    page = NOTE_TEMPLATE.replace('/*__DATA__*/', data)
    NOTE_OUT.write_text(page, encoding="utf-8")
    return len(entries)


NOTE_TEMPLATE = r"""<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AIノート 🐾</title>
<link href="https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  :root{
    --side:#2c2622; --side-hover:#3a332d; --side-line:#413a33;
    --ink:#3a332d; --ink-soft:#8a7f74; --bg:#f7f3ec; --card:#ffffff;
    --line:#ece2d2; --accent:#e9a0a0; --user:#f6d9d9; --code:#f3ece0;
  }
  *{box-sizing:border-box;}
  html,body{height:100%;margin:0;}
  body{font-family:"Zen Maru Gothic","Hiragino Maru Gothic ProN",system-ui,sans-serif;
       color:var(--ink); background:var(--bg); display:flex; overflow:hidden;}

  /* サイドバー（ChatGPT風の会話一覧） */
  .side{width:270px; background:var(--side); color:#f3ece0; display:flex; flex-direction:column; flex-shrink:0;}
  .side-head{padding:18px 16px 12px; border-bottom:1px solid var(--side-line);}
  .side-title{font-weight:700; font-size:16px; display:flex; align-items:center; gap:8px;}
  .side-sub{font-size:11px; color:#b6a89b; margin-top:4px; line-height:1.5;}
  .side-list{flex:1; overflow-y:auto; padding:8px;}
  .side-item{padding:10px 12px; border-radius:10px; cursor:pointer; margin-bottom:2px;}
  .side-item:hover{background:var(--side-hover);}
  .side-item.active{background:var(--side-hover);}
  .side-item .t{font-size:13.5px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}
  .side-item .d{font-size:11px; color:#b6a89b; margin-top:2px;}
  .side-foot{padding:12px 14px; font-size:11px; color:#9d9083; border-top:1px solid var(--side-line); line-height:1.6;}

  /* メイン（スレッド） */
  .main{flex:1; display:flex; flex-direction:column; min-width:0;}
  .thread-head{padding:16px 24px; border-bottom:1px solid var(--line); background:var(--card);}
  .thread-head h1{font-size:18px; margin:0;}
  .thread-head .date{font-size:12px; color:var(--ink-soft); margin-top:2px;}
  .thread{flex:1; overflow-y:auto; padding:26px 20px 60px;}
  .thread-inner{max-width:760px; margin:0 auto; display:flex; flex-direction:column; gap:18px;}

  .row{display:flex; gap:12px; align-items:flex-start;}
  .row.user{flex-direction:row-reverse;}
  .avatar{width:34px; height:34px; border-radius:50%; flex-shrink:0; display:flex;
          align-items:center; justify-content:center; font-size:17px;}
  .avatar.ai{background:var(--accent); color:#fff;}
  .avatar.me{background:#dfe8f1; color:#4a5a6a; font-size:13px; font-weight:700;}
  .col{display:flex; flex-direction:column; max-width:78%;}
  .row.user .col{align-items:flex-end;}
  .src{font-size:11px; color:var(--ink-soft); margin:0 6px 3px; font-weight:700;}
  .bubble{padding:12px 16px; border-radius:16px; font-size:14.5px; line-height:1.8; max-width:100%;}
  .row.assistant .bubble{background:var(--card); border:1px solid var(--line); border-top-left-radius:4px;}
  .row.user .bubble{background:var(--user); border-top-right-radius:4px;}
  .bubble code{background:var(--code); padding:1px 6px; border-radius:5px; font-size:13px;}
  .bubble pre{background:#2c2622; color:#f3ece0; padding:12px 14px; border-radius:10px; overflow-x:auto;}
  .bubble pre code{background:none; color:inherit; padding:0;}

  .empty{margin:80px auto; text-align:center; color:var(--ink-soft); max-width:520px; line-height:1.9;}
  .empty .big{font-size:44px; display:block; margin-bottom:10px;}
  .empty code{background:var(--code); padding:2px 7px; border-radius:6px;}

  @media (max-width:720px){
    .side{width:200px;}
  }
</style>
</head>
<body>
  <aside class="side">
    <div class="side-head">
      <div class="side-title">🐾 AIノート</div>
      <div class="side-sub">日々AIに聞いたこと（非公開の作業場）</div>
    </div>
    <div class="side-list" id="list"></div>
    <div class="side-foot">
      <a href="../_site/index.html" style="color:#e9a0a0;font-weight:700;">← 作品一覧へもどる</a><br><br>
      新しいメモは <b>_AIノート/</b> に<br>ファイルを足して<br><b>「更新.bat」をダブルクリック</b>
    </div>
  </aside>

  <main class="main">
    <div class="thread-head" id="head"><h1>AIノート</h1></div>
    <div class="thread"><div class="thread-inner" id="thread"></div></div>
  </main>

<script id="data" type="application/json">/*__DATA__*/</script>
<script>
  const entries = JSON.parse(document.getElementById('data').textContent || '[]');
  const list = document.getElementById('list');
  const thread = document.getElementById('thread');
  const head = document.getElementById('head');

  function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML;}

  function renderList(){
    if(!entries.length){
      list.innerHTML='<div style="padding:14px;color:#b6a89b;font-size:13px;">まだメモがありません</div>';
      return;
    }
    list.innerHTML = entries.map((e,i)=>
      `<div class="side-item${i===0?' active':''}" data-i="${i}">
         <div class="t">${esc(e.title)}</div>
         <div class="d">${esc(e.date||'')}</div>
       </div>`).join('');
    list.querySelectorAll('.side-item').forEach(el=>{
      el.addEventListener('click',()=>select(parseInt(el.dataset.i)));
    });
  }

  function select(i){
    const e = entries[i];
    if(!e) return;
    list.querySelectorAll('.side-item').forEach(el=>
      el.classList.toggle('active', parseInt(el.dataset.i)===i));
    head.innerHTML = `<h1>${esc(e.title)}</h1><div class="date">${esc(e.date||'')}</div>`;
    thread.innerHTML = e.messages.map(m=>{
      const src = m.source ? `<div class="src">${esc(m.source)}</div>` : '';
      return `<div class="row ${m.role}">
         <div class="avatar ${m.role==='assistant'?'ai':'me'}">${m.role==='assistant'?'🐾':'You'}</div>
         <div class="col">${src}<div class="bubble">${m.html}</div></div>
       </div>`;
    }).join('');
    thread.parentElement.scrollTop = 0;
  }

  if(!entries.length){
    head.innerHTML='<h1>AIノート</h1>';
    thread.innerHTML='<div class="empty"><span class="big">🐾</span>'
      +'まだメモがありません。<br><code>_AIノート/</code> に <code>2026-08-29_タイトル.md</code> のような'
      +'ファイルを足して、<code>python3 build.py</code> を実行してください。</div>';
    renderList();
  } else {
    renderList();
    select(0);
  }
</script>
</body>
</html>
"""


CONFIG = {}


def main():
    global CONFIG
    CONFIG = load_config()
    print("🐾 にゃんこの時空アトリエ をビルドします…")

    works = discover()

    if CONFIG.get("newest_first", True):
        works.sort(key=lambda w: natural_key(w["sort"][1]), reverse=True)
        works.sort(key=lambda w: w["date"] or "", reverse=True)
    else:
        works.sort(key=lambda w: natural_key(w["sort"][1]))

    # 出力フォルダを作り直す
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)

    # assets をコピー
    if ASSETS.exists():
        shutil.copytree(ASSETS, OUT / "assets")

    # 作品をコピー
    copy_works(works)

    # カード生成
    if works:
        cards = "\n".join(card_html(w, i + 1) for i, w in enumerate(works))
        count_line = f"作品 {len(works)} 点"
    else:
        cards = EMPTY_CARDS
        count_line = ""

    # AIノートへのリンクは「ローカル（自分のPC）で見るときだけ」表示。
    # GitHub Actions（公開ビルド）では出さない＝公開サイトには非公開ページのリンクを出さない。
    # AIノートは claude.ai上の自分専用ツール（保存できる版）に飛ばす。
    # 自分だけの入口なので、公開ビルド（GitHub Actions）では出さない。
    nav = ""
    if os.environ.get("GITHUB_ACTIONS") != "true":
        ainote_url = "https://claude.ai/code/artifact/ec7d3bf2-cddf-4d07-b793-770a7c8d0727"
        nav = (f'<a class="nav-ainote" href="{ainote_url}" target="_blank" rel="noopener">'
               f'💬 AIノート（自分専用）</a>')

    page = PAGE_TEMPLATE.format(
        title=html.escape(CONFIG["site_title"]),
        subtitle=html.escape(CONFIG["site_subtitle"]),
        intro=html.escape(CONFIG["intro"]),
        accent=CONFIG.get("accent", "#e9a0a0"),
        footer=html.escape(CONFIG["footer"]),
        count_line=count_line,
        cards=cards,
        nav=nav,
        sitenav=nav_html(works, ""),
        socials=render_socials(CONFIG),
    )
    page = inject_analytics(page, CONFIG)

    # 構造化データ（JSON-LD）— 検索エンジン/AI向け
    ld = {"@context": "https://schema.org", "@type": "WebSite",
          "name": CONFIG["site_title"], "description": CONFIG["intro"]}
    if CONFIG.get("site_url"):
        ld["url"] = CONFIG["site_url"]
    ld_tag = '<script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False) + '</script>'
    if "</head>" in page:
        page = page.replace("</head>", ld_tag + "</head>", 1)

    # Google Search Console 所有者確認（HTMLタグ方式）
    gsv = CONFIG.get("google_site_verification", "")
    if gsv and "</head>" in page:
        page = page.replace(
            "</head>",
            f'<meta name="google-site-verification" content="{html.escape(gsv)}"></head>', 1)

    (OUT / "index.html").write_text(page, encoding="utf-8")
    # .nojekyll（GitHub PagesでそのままHTMLを配信させる）
    (OUT / ".nojekyll").write_text("", encoding="utf-8")

    # ---- SEO / AIO 用ファイル ----
    site_url = (CONFIG.get("site_url", "") or "").rstrip("/")
    robots = "User-agent: *\nAllow: /\n"
    if site_url:
        robots += f"Sitemap: {site_url}/sitemap.xml\n"
    (OUT / "robots.txt").write_text(robots, encoding="utf-8")

    if site_url:
        locs = [site_url + "/"]
        for w in works:
            if w["type"] == "page":
                locs.append(site_url + "/" + url_path("works", w["name"]) + "/")
        sm = ['<?xml version="1.0" encoding="UTF-8"?>',
              '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
        for u in locs:
            sm.append(f"  <url><loc>{html.escape(u)}</loc></url>")
        sm.append("</urlset>")
        (OUT / "sitemap.xml").write_text("\n".join(sm), encoding="utf-8")

    # llms.txt（AI検索/AIO向けの、サイト内容の要約）
    llms = [f"# {CONFIG['site_title']}", CONFIG.get("intro", ""), "", "## 作品一覧"]
    for w in works:
        d = w.get("desc", "").strip()
        llms.append(f"- {w['title']}" + (f"：{d}" if d else ""))
    (OUT / "llms.txt").write_text("\n".join(llms) + "\n", encoding="utf-8")

    print(f"✅ 完成！ 作品 {len(works)} 点。 → _site/index.html をブラウザで開いて確認できます。")
    if not CONFIG.get("ga4_id"):
        print("  （GA4は未設定。config.json の ga4_id に G-XXXX を入れると全ページに入ります）")
    if not CONFIG.get("clarity_id"):
        print("  （Clarityは未設定。config.json の clarity_id にIDを入れるとヒートマップが入ります）")
    if not CONFIG.get("gtm_id"):
        print("  （GTMは未設定。config.json の gtm_id に GTM-XXXX を入れると全ページに入ります）")
    if not CONFIG.get("site_url"):
        print("  （site_url未設定。公開URLを入れるとsitemap.xmlも作られSEOに有利）")

    # AIノート（非公開の作業場）をビルド
    n = build_ainote()
    if n or NOTE_DIR.exists():
        print(f"🔒 AIノート（非公開）{n} 件。 → _AIノート/ノート.html をブラウザで開いて確認できます（ネットには出ません）。")


if __name__ == "__main__":
    main()
