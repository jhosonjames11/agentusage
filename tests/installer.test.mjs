import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, chmod, access, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const installer = fileURLToPath(new URL('../scripts/install-macos.sh', import.meta.url));
async function setup(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'agentusage-install-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = path.join(root, 'bin'), fixture = path.join(root, 'fixture', 'agentusage-main');
  await mkdir(bin, { recursive: true });
  await mkdir(path.join(fixture, 'scripts'), { recursive: true });
  await writeFile(path.join(fixture, 'scripts', 'manage.mjs'), "console.log('started fixture dashboard')\n");
  await writeFile(path.join(fixture, 'package.json'), '{}');
  const archive = path.join(root, 'source.tar.gz');
  assert.equal(spawnSync('tar', ['-czf', archive, '-C', path.dirname(fixture), 'agentusage-main']).status, 0);
  for (const [name, contents] of Object.entries({
    uname: '#!/bin/sh\nprintf "Darwin\\n"\n',
    curl: '#!/bin/sh\nwhile [ "$#" -gt 0 ]; do if [ "$1" = "-o" ]; then shift; cp "$TEST_FIXTURE_ARCHIVE" "$1"; exit $?; fi; shift; done\nexit 2\n',
    npm: '#!/bin/sh\nexit 0\n',
  })) {
    const file = path.join(bin, name); await writeFile(file, contents); await chmod(file, 0o755);
  }
  const target = path.join(root, 'installed');
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, TEST_FIXTURE_ARCHIVE: archive, AGENTUSAGE_INSTALL_DIR: target, AGENTUSAGE_NO_OPEN: '1' };
  return { root, target, env };
}
const run = env => spawnSync('/bin/bash', [installer], { env, encoding: 'utf8' });

test('installer installs to an isolated directory and starts the dashboard', async t => {
  const { root, target, env } = await setup(t);
  const result = run(env);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  await access(path.join(target, 'app', 'scripts', 'manage.mjs'));
  assert.match(result.stdout, /started fixture dashboard/);
  assert.deepEqual((await readdir(root)).filter(name => name.startsWith('.agentusage-install-')), []);
});

test('installer refuses to replace an existing installation', async t => {
  const { target, env } = await setup(t);
  await mkdir(target); await writeFile(path.join(target, 'keep'), 'important');
  const result = run(env);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /already exists/);
  assert.equal(await readFile(path.join(target, 'keep'), 'utf8'), 'important');
});

test('failed downloads do not leave a partial installation', async t => {
  const { root, target, env } = await setup(t);
  env.TEST_FIXTURE_ARCHIVE = path.join(root, 'missing.tar.gz');
  const result = run(env);
  assert.notEqual(result.status, 0);
  await assert.rejects(access(target));
  assert.deepEqual((await readdir(root)).filter(name => name.startsWith('.agentusage-install-')), []);
});

test('older macOS without compatible Node reports the runtime requirement', async t => {
  const { root, target, env } = await setup(t);
  for (const [name, contents] of Object.entries({ node: '#!/bin/sh\nexit 1\n', sw_vers: '#!/bin/sh\nprintf "12.6.0\\n"\n' })) {
    const file = path.join(root, 'bin', name); await writeFile(file, contents); await chmod(file, 0o755);
  }
  const result = run(env);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /macOS 13\.5 or later/);
  await assert.rejects(access(target));
});
