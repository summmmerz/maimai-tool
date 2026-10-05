# -*- coding: utf-8 -*-
"""合并 落雪(lxns) + 水鱼(diving-fish) 曲库 -> data/songs.json

落雪提供: 定数(level_value) / 谱师(note_designer) / BPM / 曲目版本
水鱼提供: 物量(note 数)
两者均无需密钥。

用法: python build_db.py [--offline]
"""
import json, os, sys, collections, urllib.request

UA = {'User-Agent': 'Mozilla/5.0'}
URL_DF = 'https://www.diving-fish.com/api/maimaidxprober/music_data'
URL_LX = 'https://maimai.lxns.net/api/v0/maimai/song/list'
URL_ALIAS = 'https://maimai.lxns.net/api/v0/maimai/alias/list'
HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'data')
DF_RAW = os.path.join(DATA, 'raw_divingfish.json')
LX_RAW = os.path.join(DATA, 'raw_lxns.json')
ALIAS_RAW = os.path.join(DATA, 'raw_alias.json')
OUT = os.path.join(DATA, 'songs.json')
DIFF_NAME = ['Basic', 'Advanced', 'Expert', 'Master', 'Re:Master']


def get(url, cache):
    if os.path.exists(cache):
        return json.loads(open(cache, encoding='utf-8').read())
    req = urllib.request.Request(url, headers=UA)
    raw = urllib.request.urlopen(req, timeout=120).read().decode('utf-8')
    with open(cache, 'w', encoding='utf-8') as f:
        f.write(raw)
    return json.loads(raw)


def main():
    os.makedirs(DATA, exist_ok=True)
    df = get(URL_DF, DF_RAW) if '--offline' not in sys.argv else json.loads(open(DF_RAW, encoding='utf-8').read())
    lx = (get(URL_LX, LX_RAW) if '--offline' not in sys.argv else json.loads(open(LX_RAW, encoding='utf-8').read()))['songs']
    # 水鱼约定: DX 谱的曲目 id = 标准谱 id + 10000
    df_std = {int(s['id']): s for s in df if int(s['id']) < 100000}
    df_dx = {int(s['id']) - 10000: s for s in df if 10000 <= int(s['id']) < 100000}

    # 版本码 -> 版本名 : 用 水鱼 basic_info.from 交叉投票推导
    votes = collections.defaultdict(collections.Counter)
    for s in lx:
        d = df_std.get(int(s['id'])) or df_dx.get(int(s['id']))
        if d:
            votes[s['version']][d['basic_info'].get('from', '?')] += 1

    songs, mismatch, nodf, diff_hist = [], 0, 0, collections.Counter()
    vname_df = vname_fb = 0
    for s in lx:
        sid = int(s['id'])
        blk = {k: v for k, v in s['difficulties'].items() if isinstance(v, list)}
        srcs = {'standard': df_std.get(sid), 'dx': df_dx.get(sid), 'utage': None}
        base = srcs['standard'] or srcs['dx']
        if base is None:
            nodf += 1
        vname = (base or {}).get('basic_info', {}).get('from')
        if not vname:
            if sid >= 100000:
                vname = '宴会场'
            else:
                vname = votes[s['version']].most_common(1)[0][0] if votes.get(s['version']) else '未知版本'
            vname_fb += 1
        else:
            vname_df += 1
        charts = []
        for typ in ('standard', 'dx', 'utage'):
            cs = blk.get(typ, [])
            if not cs:
                continue
            raw = (srcs[typ] or {}).get('charts') or []
            if len(raw) != len(cs):
                if raw:
                    mismatch += 1
                raw = []
            for i, c in enumerate(cs):
                notes = None
                if raw:
                    n = raw[i].get('notes')
                    if isinstance(n, list) and n:
                        notes = sum(n)
                charts.append({
                    'type': typ,
                    'diff': c.get('difficulty'),
                    'name': DIFF_NAME[c['difficulty']] if isinstance(c.get('difficulty'), int) and 0 <= c['difficulty'] < 5 else '?',
                    'level': c.get('level'),
                    'ds': c.get('level_value'),
                    'designer': c.get('note_designer') or '-',
                    'notes': notes,
                    'is_new': bool((srcs[typ] or {}).get('basic_info', {}).get('is_new')),
                })
        for c in charts:
            diff_hist[c['name']] += 1
        songs.append({
            'id': sid,
            'title': s['title'],
            'artist': s.get('artist', ''),
            'genre': s.get('genre', ''),
            'bpm': s.get('bpm', 0),
            'version': s['version'],
            'version_name': vname,
            'charts': charts,
        })

    payload = {
        'version_map': {str(k): v.most_common(1)[0][0] for k, v in sorted(votes.items()) if v},
        'songs': songs,
    }
    # 曲目别名（落雪公开接口，无需密钥）：中文译名 / 罗马音 / 社区绰号。
    # 拉取失败不影响主流程，只是没有别名可搜。
    amap = {}
    try:
        alias_raw = get(URL_ALIAS, ALIAS_RAW)
        amap = {int(a['song_id']): [x for x in a.get('aliases', []) if x] for a in alias_raw.get('aliases', [])}
    except Exception as e:
        print('  ! 别名拉取失败，跳过：%s' % e)
    for s in songs:
        s['aliases'] = amap.get(s['id'], [])
    print('别名: 覆盖 %d / %d 首，别名字符串 %d 条'
          % (sum(1 for s in songs if s['aliases']), len(songs), sum(len(s['aliases']) for s in songs)))

    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, separators=(',', ':'))
    print('songs=%d charts=%d  size=%.0fKB' % (len(songs), sum(len(s['charts']) for s in songs), os.path.getsize(OUT) / 1024))
    print('无对应水鱼条目=%d  物量对不齐(已放弃)=%d' % (nodf, mismatch))
    print('难度分布:', dict(diff_hist))
    print('版本名: 水鱼直接给出=%d  回退到推导映射=%d' % (vname_df, vname_fb))
    print('物量缺失谱面=%d / %d' % (sum(1 for s in songs for c in s['charts'] if c['notes'] is None),
                                    sum(len(s['charts']) for s in songs)))


if __name__ == '__main__':
    main()
