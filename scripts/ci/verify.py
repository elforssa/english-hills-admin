"""Small, dependency-free docs CI selector, checker and required gate."""
import argparse
import html
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys
from urllib.parse import unquote, urlsplit


def git(*args):
    return subprocess.check_output(['git', *args], stderr=subprocess.PIPE)


def changes(base, head):
    # Explicit object validation and no rename detection: both old/new paths count.
    for ref in (base, head):
        if not re.fullmatch(r'[0-9a-f]{40}', ref):
            raise ValueError('Expected exact commit SHA')
        git('cat-file', '-e', ref + '^{commit}')
    ancestor = git('merge-base', base, head).decode().strip()
    fields = git('diff', '--no-renames', '--name-status', '-z', ancestor, head).decode('utf-8').split('\0')
    if fields[-1] != '' or (len(fields) - 1) % 2:
        raise ValueError('Unresolvable diff')
    entries = list(zip(fields[0:-1:2], fields[1:-1:2]))
    if not entries:
        raise ValueError('Empty diff')
    return ancestor, entries


def safe_repo_path(path):
    parts = PurePosixPath(path).parts
    return (bool(parts)
            and all(p not in ('', '.', '..') for p in path.split('/'))
            and not path.startswith('/')
            and not any(ord(c) < 32 for c in path))


def safe_doc_path(path):
    parts = PurePosixPath(path).parts
    return (safe_repo_path(path)
            and len(parts) >= 2
            and parts[0] == 'docs'
            and path.endswith('.md'))


def safe_tooling_path(path):
    if not safe_repo_path(path):
        return False
    parts = PurePosixPath(path).parts
    if len(parts) >= 2 and parts[0] == 'tools':
        return True
    return path == 'scripts/test-meta-debugger-transport-monitor.mjs'


def regular_blob_at(ref, path, expected):
    entry = git('ls-tree', ref, '--', path).decode().strip()
    return bool(entry) == expected and (not entry or entry.startswith('100644 blob '))


def classify(base, head):
    try:
        ancestor, entries = changes(base, head)
        docs_only = True
        tooling_only = True
        for status, path in entries:
            if status not in ('A', 'M', 'D'):
                return 'full'
            is_doc = safe_doc_path(path)
            is_tooling = safe_tooling_path(path)
            docs_only = docs_only and is_doc
            tooling_only = tooling_only and (is_doc or is_tooling)
            if not (is_doc or is_tooling):
                return 'full'
            for ref in (ancestor, head):
                expected = not (status == 'A' and ref == ancestor or status == 'D' and ref == head)
                if not regular_blob_at(ref, path, expected):
                    return 'full'
        if docs_only:
            return 'docs'
        if tooling_only:
            return 'tooling'
        return 'full'
    except (ValueError, UnicodeError, subprocess.CalledProcessError, OSError):
        print('Classification uncertain; selecting full CI', file=sys.stderr)
        return 'full'


def gate(event, mode, classifier, docs, app, database):
    if classifier != 'success':
        return False
    if event == 'pull_request' and mode == 'docs':
        return docs == 'success' and app == database == 'skipped'
    if event == 'pull_request' and mode == 'tooling':
        return docs == app == 'success' and database == 'skipped'
    if mode != 'full' or docs != 'skipped':
        return False
    return app == 'success' and database == ('success' if event == 'pull_request' else 'skipped')


def prose(text):
    # Links in code examples do not create Markdown links.
    text = re.sub(r'^\s*(`{3,}|~{3,}).*?^\s*\1\s*$', '', text, flags=re.M | re.S)
    return re.sub(r'(`+).*?\1', '', text, flags=re.S)


def anchors(text):
    result, counts = set(), {}
    text = re.sub(r'^\s*(`{3,}|~{3,}).*?^\s*\1\s*$', '', text, flags=re.M | re.S)
    headings = re.findall(r'^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$', text, re.M)
    headings += re.findall(r'^([^\n]+)\n {0,3}(?:=+|-+)\s*$', text, re.M)
    for heading in headings:
        heading = re.sub(r'!?\[([^\]]*)\]\([^)]*\)', r'\1', heading)
        heading = re.sub(r'<[^>]+>', '', html.unescape(heading)).lower()
        slug = ''.join(c for c in heading if c.isalnum() or c in '_- ' or ord(c) > 127 and not re.match(r'[^\w\s]', c))
        slug = slug.replace(' ', '-')
        n = counts.get(slug, 0)
        counts[slug] = n + 1
        result.add(slug + (f'-{n}' if n else ''))
    result.update(re.findall(r'\b(?:id|name)=["\']([^"\']+)["\']', text))
    return result


def destinations(text):
    text = prose(text)
    definitions = {}
    for match in re.finditer(r'^ {0,3}\[([^\]]+)\]:\s*(<[^>]+>|\S+)', text, re.M):
        definitions[' '.join(match[1].lower().split())] = match[2].strip('<>')
    # Scan balanced inline destinations (including parentheses in filenames).
    pattern = re.compile(r'!?\[([^\]\n]+)\](?:\(|\[([^\]\n]*)\])?')
    position = 0
    while (match := pattern.search(text, position)) is not None:
        position = match.end()
        if text[match.end() - 1] == '(':
            tail, depth, escaped, end = text[match.end():].split('\n', 1)[0], 1, False, None
            for i, c in enumerate(tail):
                if escaped:
                    escaped = False
                elif c == '\\':
                    escaped = True
                elif c == '(':
                    depth += 1
                elif c == ')':
                    depth -= 1
                    if depth == 0:
                        end = i
                        break
            if end is None:
                raise ValueError('Malformed inline link')
            # Resume immediately after this destination, not at the line's end.
            position = match.end() + end + 1
            raw = tail[:end].strip()
            if raw.startswith('<'):
                close = raw.find('>')
                if close < 0:
                    raise ValueError('Malformed link destination')
                yield raw[1:close]
            elif raw:
                yield raw.split()[0]
        else:
            label = ' '.join((match[2] or match[1]).lower().split())
            if label in definitions:
                yield definitions[label]
            elif match[2] is not None:
                raise ValueError('Undefined reference link')
    yield from definitions.values()


SECRET_PATTERNS = {
    'private key': r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
    'access token': r'\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16}|sk_live_[A-Za-z0-9]{16,}|xox[baprs]-[A-Za-z0-9-]{20,})\b',
    'JWT': r'\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\b',
    'credential URL': r'\b(?:postgres(?:ql)?|https?)://[^\s/:]+:[^\s/@]+@',
    'secret assignment': r'''(?i)\b(?:password|secret|api[_-]?key|access[_-]?token|service[_-]?role[_-]?key)\s*[:=]\s*["']?[A-Za-z0-9+/_.-]{20,}''',
    'machine-local path': r'(?i)(?<![\w./-])/(?:Users|home)/[^/\s]+|\b[A-Z]:[\\/]Users[\\/]|file://',
    'phone': r'(?<!\w)(?:\+\d[\d ()-]{8,}\d|0[567]\d{8})(?!\w)',
}


def sensitive_added(text):
    hits = [name for name, pattern in SECRET_PATTERNS.items() if re.search(pattern, text)]
    for address in re.findall(r'\b[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b', text):
        if address.lower() not in ('example.com', 'example.org', 'example.net') and not address.lower().endswith('.invalid'):
            hits.append('personal email')
    return sorted(set(hits))


def check_links(root, path):
    errors = []
    for index, dest in enumerate(destinations((root / path).read_text()), 1):
        # Never interpolate destinations: paths, queries and fragments can hold secrets.
        context = f'link {index} (destination redacted): '
        try:
            dest = re.sub(r'\\([() ])', r'\1', dest)
            url = urlsplit(dest)
            if url.scheme or url.netloc:
                continue
            target = (root / unquote(url.path).lstrip('/') if url.path.startswith('/') else root / path.parent / unquote(url.path)).resolve() if url.path else (root / path).resolve()
            if not target.is_relative_to(root.resolve()) or not target.exists():
                errors.append(context + 'Missing or outside-repository relative target')
            elif url.fragment:
                if target.suffix.lower() != '.md' or unquote(url.fragment) not in anchors(target.read_text()):
                    errors.append(context + 'Missing Markdown anchor')
        except (OSError, ValueError):
            errors.append(context + 'Invalid or unreadable link target')
    return errors


def check_docs(base, head, root=Path('.')):
    ancestor, entries = changes(base, head)
    errors = []
    for status, name in entries:
        path = Path(name)
        if path.suffix != '.md':
            continue
        if status != 'D':
            try:
                errors.extend(f'{name}: {error}' for error in check_links(root, path))
            except (OSError, ValueError):
                errors.append(f'{name}: Invalid Markdown link syntax or source (destination redacted)')
        patch = git('diff', '--no-ext-diff', '--no-textconv', '--unified=0', ancestor, head, '--', name).decode()
        added_lines, in_hunk = [], False
        for line in patch.splitlines():
            if line.startswith('@@ '):
                in_hunk = True
            elif in_hunk and line.startswith('+'):
                added_lines.append(line[1:])
        added = '\n'.join(added_lines)
        # Report categories only, never print matched sensitive content.
        errors.extend(f'{name}: added content flagged: {hit}' for hit in sensitive_added(added))
    try:
        git('diff', '--check', ancestor, head)
    except subprocess.CalledProcessError as error:
        raise ValueError('git diff --check failed (content suppressed)') from error
    if errors:
        raise ValueError('\n'.join(errors))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['classify', 'docs', 'gate'])
    parser.add_argument('--base', default='')
    parser.add_argument('--head', default='')
    args = parser.parse_args()
    if args.command == 'classify':
        mode = classify(args.base, args.head) if os.environ.get('EVENT') == 'pull_request' else 'full'
        with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
            output.write(f'mode={mode}\n')
        print(f'Selected verification path: {mode}')
    elif args.command == 'docs':
        check_docs(args.base, args.head)
        print('Documentation verification passed')
    elif not gate(*(os.environ.get(k, '') for k in ('EVENT', 'MODE', 'CLASSIFIER', 'DOCS', 'APP', 'DATABASE'))):
        raise ValueError('Selected verification path did not succeed')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
