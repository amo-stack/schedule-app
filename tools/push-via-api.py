# 通过 GitHub API 推送代码（绕过 git push 被代理拦截的问题）
# 用法: python push-via-api.py <token> [提交说明]
import sys, os, json, base64, hashlib, subprocess, urllib.request, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = 'https://api.github.com'
OWNER = 'amo-stack'
REPO = 'schedule-app'
BRANCH = 'main'


def req(method, path, data=None, token=''):
    url = API + path
    body = json.dumps(data).encode('utf-8') if data is not None else None
    r = urllib.request.Request(url, data=body, method=method)
    r.add_header('Authorization', 'token ' + token)
    r.add_header('User-Agent', 'push-via-api')
    r.add_header('Accept', 'application/vnd.github+json')
    if body:
        r.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        detail = e.read().decode('utf-8', 'replace')[:400]
        raise SystemExit('HTTP %d on %s %s\n%s' % (e.code, method, path, detail))


def git_blob_sha(data):
    return hashlib.sha1(b'blob %d\0' % len(data) + data).hexdigest()


def main():
    token = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('GH_TOKEN', '')
    msg = sys.argv[2] if len(sys.argv) > 2 else 'update via api'
    if not token:
        raise SystemExit('需要 token: python push-via-api.py <token> [说明]')

    os.chdir(ROOT)
    files = subprocess.run(['git', 'ls-files', '-z'], capture_output=True, check=True)
    paths = [p for p in files.stdout.decode('utf-8').split('\0') if p]
    print('跟踪文件 %d 个' % len(paths))

    # 远端当前树
    ref = req('GET', '/repos/%s/%s/git/ref/heads/%s' % (OWNER, REPO, BRANCH), token=token)
    base_commit_sha = ref['object']['sha']
    commit = req('GET', '/repos/%s/%s/git/commits/%s' % (OWNER, REPO, base_commit_sha), token=token)
    base_tree_sha = commit['tree']['sha']
    tree = req('GET', '/repos/%s/%s/git/trees/%s?recursive=1' % (OWNER, REPO, base_tree_sha), token=token)
    remote = {t['path']: t['sha'] for t in tree.get('tree', []) if t['type'] == 'blob'}

    # 找出有变化的文件
    changed = []
    for p in paths:
        full = os.path.join(ROOT, p)
        if not os.path.exists(full):
            continue
        data = open(full, 'rb').read()
        if remote.get(p) == git_blob_sha(data):
            continue
        changed.append((p, data))
    if not changed:
        print('没有变化，无需提交')
        return
    print('待提交 %d 个文件: %s' % (len(changed), ', '.join(p for p, _ in changed)))

    # 建 blob
    tree_items = []
    for p, data in changed:
        blob = req('POST', '/repos/%s/%s/git/blobs' % (OWNER, REPO),
                   {'content': base64.b64encode(data).decode('ascii'), 'encoding': 'base64'}, token=token)
        tree_items.append({'path': p, 'mode': '100644', 'type': 'blob', 'sha': blob['sha']})

    new_tree = req('POST', '/repos/%s/%s/git/trees' % (OWNER, REPO),
                   {'base_tree': base_tree_sha, 'tree': tree_items}, token=token)
    new_commit = req('POST', '/repos/%s/%s/git/commits' % (OWNER, REPO),
                     {'message': msg, 'tree': new_tree['sha'], 'parents': [base_commit_sha]}, token=token)
    req('PATCH', '/repos/%s/%s/git/refs/heads/%s' % (OWNER, REPO, BRANCH),
        {'sha': new_commit['sha']}, token=token)
    print('已推送 %s' % new_commit['sha'][:7])
    print('编译进度: https://github.com/%s/%s/actions' % (OWNER, REPO))


if __name__ == '__main__':
    main()
