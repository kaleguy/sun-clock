import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// Bump version in package.json
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const [major, minor, patch] = pkg.version.split('.').map(Number);
const newVersion = `${major}.${minor}.${patch + 1}`;
pkg.version = newVersion;
writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
console.log(`Version bumped to ${newVersion}`);

// Read current build number from Xcode project and increment
const xcodeProj = join('ios', 'App', 'App.xcodeproj', 'project.pbxproj');
let newBuild = patch + 1;
try {
  let pbx = readFileSync(xcodeProj, 'utf8');
  const match = pbx.match(/CURRENT_PROJECT_VERSION = (\d+);/);
  if (match) {
    newBuild = Math.max(parseInt(match[1]) + 1, newBuild);
  }
  pbx = pbx.replace(/MARKETING_VERSION = .*;/g, `MARKETING_VERSION = ${newVersion};`);
  pbx = pbx.replace(/CURRENT_PROJECT_VERSION = \d+;/g, `CURRENT_PROJECT_VERSION = ${newBuild};`);
  writeFileSync(xcodeProj, pbx);
  console.log(`iOS: ${newVersion} (build ${newBuild})`);
} catch {
  // iOS project may not exist yet
}

// Sync version to Android build.gradle
const gradleFile = join('android', 'app', 'build.gradle');
try {
  let gradle = readFileSync(gradleFile, 'utf8');
  gradle = gradle.replace(/versionCode \d+/, `versionCode ${newBuild}`);
  gradle = gradle.replace(/versionName ".*?"/, `versionName "${newVersion}"`);
  writeFileSync(gradleFile, gradle);
  console.log(`Android: ${newVersion} (versionCode ${newBuild})`);
} catch {
  // Android project may not exist yet
}
