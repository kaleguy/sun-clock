import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// Bump version in package.json
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const [major, minor, patch] = pkg.version.split('.').map(Number);
pkg.version = `${major}.${minor}.${patch + 1}`;
writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
console.log(`Version bumped to ${pkg.version}`);

// Sync version to Xcode project
const xcodeProj = join('ios', 'App', 'App.xcodeproj', 'project.pbxproj');
try {
  let pbx = readFileSync(xcodeProj, 'utf8');
  pbx = pbx.replace(/MARKETING_VERSION = .*;/g, `MARKETING_VERSION = ${pkg.version};`);
  pbx = pbx.replace(/CURRENT_PROJECT_VERSION = .*;/g, `CURRENT_PROJECT_VERSION = ${patch + 1};`);
  writeFileSync(xcodeProj, pbx);
  console.log(`Xcode version synced: ${pkg.version} (build ${patch + 1})`);
} catch {
  // iOS project may not exist yet
}
