// npm-check-updates policy for dep-upgrades-check.sh.
//
// NCU_TARGET=minor keeps each dependency within its major version; latest
// crosses majors. Other versions must be 3 days old, so a compromised release
// is likely pulled before it can merge automatically.
//
// app/ pins nitro to a nitro-nightly build. That package also holds stale
// 3.1.0 and 4.0.0 nightlies that sort above current builds, so any semver
// target or cooldown fallback would pick one. Follow its latest dist-tag.
const isNightly = (name) => name === "nitro-nightly";

module.exports = {
  target: (name) => (isNightly(name) ? "@latest" : (process.env.NCU_TARGET ?? "latest")),
  cooldown: (name) => (isNightly(name) ? 0 : 3),
};
