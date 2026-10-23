const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const env = { ...process.env };
env.FUNCTIONS_DISCOVERY_TIMEOUT ??= '60';
// Oracle's Windows javapath shim spawns a grandchild that can survive CLI shutdown.
// Prefer the actual JDK executable so the emulator runner owns the JVM it stops.
if (process.platform === 'win32') {
  const base = 'C:/Program Files/Java';
  const homes = [
    env.JAVA_HOME,
    ...(fs.existsSync(base)
      ? fs
          .readdirSync(base)
          .filter((name) => name.startsWith('jdk-'))
          .sort()
          .reverse()
          .map((name) => path.join(base, name))
      : []),
  ].filter(Boolean);
  const bin = homes
    .map((home) => (home.endsWith('bin') ? home : path.join(home, 'bin')))
    .find((folder) => fs.existsSync(path.join(folder, 'java.exe')));
  if (bin) {
    env.PATH = bin + path.delimiter + process.env.PATH;
    for (const key of Object.keys(env)) {
      if (key !== 'PATH' && key.toLowerCase() === 'path') delete env[key];
    }
  }
}
const child = spawn(
  process.execPath,
  [require.resolve('firebase-tools/lib/bin/firebase.js'), ...process.argv.slice(2)],
  { env, stdio: 'inherit' },
);
child.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
