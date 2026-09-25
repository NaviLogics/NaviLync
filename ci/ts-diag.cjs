const path = require('path');
const root = process.cwd();

function pkgDir(pkg, fromDir) {
  try {
    return path.dirname(require.resolve(`${pkg}/package.json`, { paths: [fromDir] }));
  } catch (e) {
    return null;
  }
}

function show(label, pkg, fromDir) {
  const dir = pkgDir(pkg, fromDir);
  if (!dir) {
    console.log(`${label}: NOT RESOLVED`);
    return;
  }
  console.log(`${label}: ${require(path.join(dir, 'package.json')).version}  ${dir}`);
}

show('root typescript', 'typescript', root);
show('root vue-tsc', 'vue-tsc', root);

const vueTscDir = pkgDir('vue-tsc', root);
if (vueTscDir) {
  show('typescript as seen by vue-tsc', 'typescript', vueTscDir);
  show('@vue/language-core as seen by vue-tsc', '@vue/language-core', vueTscDir);
  show('@volar/typescript as seen by vue-tsc', '@volar/typescript', vueTscDir);
}
