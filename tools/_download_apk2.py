import urllib.request, json, os, sys

API = 'https://api.github.com'
OWNER, REPO = 'amo-stack', 'schedule-app'
TOKEN = os.environ.get('GH_TOKEN') or (sys.argv[1] if len(sys.argv) > 1 else '')
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'dist', 'app-debug.apk')


def api_json(url):
    r = urllib.request.Request(url)
    r.add_header('Authorization', 'token ' + TOKEN)
    r.add_header('Accept', 'application/vnd.github+json')
    r.add_header('User-Agent', 'dl')
    with urllib.request.urlopen(r, timeout=60) as resp:
        return json.loads(resp.read().decode())


def main():
    rel = api_json(f'{API}/repos/{OWNER}/{REPO}/releases/latest')
    asset = next((a for a in rel['assets'] if a['name'] == 'app-debug.apk'), None)
    if not asset:
        raise SystemExit('asset not found')
    print(f'asset_id={asset["id"]} size={asset["size"]} updated={asset["updated_at"]}')

    url = f'{API}/repos/{OWNER}/{REPO}/releases/assets/{asset["id"]}'
    r = urllib.request.Request(url)
    r.add_header('Accept', 'application/octet-stream')
    r.add_header('Authorization', 'token ' + TOKEN)
    r.add_header('User-Agent', 'dl')
    with urllib.request.urlopen(r, timeout=120) as resp:
        data = resp.read()
        print(f'downloaded {len(data)} bytes')
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        with open(OUT, 'wb') as f:
            f.write(data)
        print(f'saved {OUT}')


if __name__ == '__main__':
    main()
