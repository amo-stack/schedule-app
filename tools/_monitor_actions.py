import urllib.request, json, time, os, sys

API = 'https://api.github.com'
OWNER, REPO = 'amo-stack', 'schedule-app'
TOKEN = os.environ.get('GH_TOKEN') or (sys.argv[1] if len(sys.argv) > 1 else '')


def req(url):
    r = urllib.request.Request(url)
    r.add_header('Authorization', 'token ' + TOKEN)
    r.add_header('Accept', 'application/vnd.github+json')
    r.add_header('User-Agent', 'monitor')
    with urllib.request.urlopen(r, timeout=30) as resp:
        return json.loads(resp.read().decode())


deadline = time.time() + 900
last = (None, None)
while time.time() < deadline:
    runs = req(f'{API}/repos/{OWNER}/{REPO}/actions/runs?per_page=1')['workflow_runs']
    if not runs:
        print('[%s] 暂无 run，等待…' % time.strftime('%H:%M:%S'))
        time.sleep(15)
        continue
    run = runs[0]
    st, con = run['status'], run['conclusion']
    if (st, con) != last:
        print('[%s] status=%s conclusion=%s url=%s' % (time.strftime('%H:%M:%S'), st, con, run['html_url']))
        last = (st, con)
    if st == 'completed':
        print('BUILD_DONE conclusion=%s' % con)
        break
    time.sleep(20)
else:
    print('TIMEOUT waited 15min')
