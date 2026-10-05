# -*- coding: utf-8 -*-
"""从水鱼查分器拉成绩 -> data/records.json

用法:
  python fetch_records.py                 # 读 config.json
  python fetch_records.py --test          # 拉官方测试数据（无需账号/令牌，成绩是假的，只用来验证界面）
  python fetch_records.py --username XXX  # 临时指定用户名

config.json:
  {"username": "你的水鱼用户名", "import_token": ""}

  * 不填 import_token：只能拿 B50（简略成绩），而且需要该账号允许他人公开查询。
  * 填了 import_token：拿完整成绩（更准的推分建议）。
    Import-Token 在水鱼官网「编辑个人资料」里生成，不需要申请成为开发者。
    注意：老的 Developer-Token 已停止签发，2027-01-01 起停服，不要再用。
"""
import json, os, sys, urllib.error, urllib.request

BASE = 'https://www.diving-fish.com/api/maimaidxprober'
HERE = os.path.dirname(os.path.abspath(__file__))
try:                      # 中文 Windows 控制台默认 GBK，直接输出会炸
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass
DATA = os.path.join(HERE, 'data')
SONGS = os.path.join(DATA, 'songs.json')
OUT = os.path.join(DATA, 'records.json')
CONFIG = os.path.join(HERE, 'config.json')
TEMPLATE = {'username': '', 'import_token': ''}


def http(path, body=None, token=None):
    h = {'User-Agent': 'Mozilla/5.0', 'Content-Type': 'application/json'}
    if token:
        h['Import-Token'] = token
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(body).encode('utf-8') if body is not None else None,
        headers=h)
    try:
        with urllib.request.urlopen(req, timeout=60) as f:
            return json.loads(f.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        detail = e.read().decode('utf-8', 'replace')[:200]
        if e.code == 403:
            raise SystemExit('HTTP 403：该账号设置了隐私或未同意用户协议 / 不允许公开查询。'
                             '\n提示：去水鱼官网个人资料确认「允许他人查询」，'
                             '或填写 import_token 走完整成绩。\n原始响应: %s' % detail)
        if e.code == 400:
            raise SystemExit('HTTP 400：%s' % detail)
        raise SystemExit('HTTP %s: %s' % (e.code, detail))


def load_config(create=True):
    if not os.path.exists(CONFIG):
        if not create:
            return dict(TEMPLATE)
        with open(CONFIG, 'w', encoding='utf-8') as f:
            json.dump(TEMPLATE, f, ensure_ascii=False, indent=2)
        raise SystemExit('已生成 %s，请填入 username（可选 import_token）后重跑。' % CONFIG)
    cfg = dict(TEMPLATE)
    cfg.update(json.loads(open(CONFIG, encoding='utf-8').read()))
    return cfg


def norm(c, newmap):
    title, typ = c.get('title', ''), c.get('type', '')
    return {
        'title': title,
        'type': typ,
        'level_index': c.get('level_index'),
        'level_label': c.get('level_label'),
        'ds': c.get('ds'),
        'achievements': c.get('achievements'),
        'ra': c.get('ra'),
        'fc': c.get('fc') or '',
        'fs': c.get('fs') or '',
        'song_id': c.get('song_id'),
        'is_new': newmap.get((title, typ)),
    }


def main():
    args = sys.argv[1:]
    has_user = '--username' in args
    cfg = dict(TEMPLATE)
    if '--test' not in args:
        cfg = load_config(create=not has_user)
    if has_user:
        cfg['username'] = args[args.index('--username') + 1]

    songs = json.loads(open(SONGS, encoding='utf-8').read())
    tmap = {'standard': 'SD', 'dx': 'DX', 'utage': '宴'}
    newmap = {}
    for s in songs['songs']:
        for c in s['charts']:
            newmap[(s['title'], tmap.get(c['type'], c['type']))] = bool(c['is_new'])

    if '--test' in args:
        mode, raw = 'test', http('/player/test_data')
    elif cfg.get('import_token'):
        mode, raw = 'full', http('/player/records', token=cfg['import_token'])
    else:
        if not cfg.get('username'):
            raise SystemExit('config.json 里至少要填 username。')
        mode = 'b50'
        raw = http('/query/player', {'username': cfg['username'], 'b50': True})

    charts = []
    if mode == 'b50':
        buckets = raw.get('charts') or {}
        if isinstance(buckets, list):          # 少数情况下按列表返回
            charts = [norm(c, newmap) for c in buckets]
        else:
            for key in ('sd', 'dx'):
                charts += [norm(c, newmap) for c in buckets.get(key, [])]
    else:
        charts = [norm(c, newmap) for c in raw.get('records', [])]

    # 校验：rating = 旧曲(非新曲) Top35 + 新曲 Top15，宴会场(曲目 id >= 100000)不参与
    # is_new 查不到的谱面（例如水鱼新增但落雪还没同步的曲目）一律当旧曲处理
    core = [c for c in charts if (c['song_id'] or 0) < 100000 and c['ra'] is not None]
    unknown = [c for c in core if c['is_new'] is None]
    old = sorted([c['ra'] for c in core if c['is_new'] is not True], reverse=True)
    new = sorted([c['ra'] for c in core if c['is_new'] is True], reverse=True)
    check = sum(old[:35]) + sum(new[:15])
    if check != raw.get('rating'):
        print('  ! 重算 %s 与 API %s 不一致（成绩 %d 条，is_new 未匹配 %d 条）'
              % (check, raw.get('rating'), len(core), len(unknown)))

    out = {
        'mode': mode,
        'username': raw.get('username'),
        'nickname': raw.get('nickname'),
        'rating': raw.get('rating'),
        'additional_rating': raw.get('additional_rating'),
        'plate': raw.get('plate'),
        'rating_check': check,
        'charts': charts,
    }
    os.makedirs(DATA, exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print('模式=%s  成绩=%d 条  API rating=%s  重算 rating=%s  %s'
          % (mode, len(charts), raw.get('rating'), check,
             '✓一致' if check == raw.get('rating') else '✗不一致'))
    print('曲目 %d 首，写入 %s (%.0f KB)' % (len(set(c['title'] for c in charts)),
                                            OUT, os.path.getsize(OUT) / 1024))


if __name__ == '__main__':
    main()
