// The prebuilt better-sqlite3 13 binary for Linux links against glibc 2.34.
const LINUX_MINIMUM = 'glibc 2.34 or newer (Ubuntu 22.04, Debian 12, Fedora 35, RHEL 9 or later)';
const NATIVE_LOAD_FAILURE = /GLIBC_[0-9.]+|ERR_DLOPEN_FAILED|wrong ELF class|incompatible architecture|cannot open shared object|better_sqlite3\.node|vec0\.(so|dylib|dll)/;

function isNativeLoadFailure(error) {
  return NATIVE_LOAD_FAILURE.test(`${error?.code || ''} ${error?.message || ''}`);
}

function describeSearchIndexFailure(error, platform) {
  if (!error || !isNativeLoadFailure(error)) return null;
  const requirement = platform === 'linux' && /GLIBC_[0-9.]+/.test(String(error.message || ''))
    ? `Search needs ${LINUX_MINIMUM}.`
    : 'Search could not load its built-in database library on this computer.';
  return {
    kind: 'native-library',
    title: 'Search is off on this computer',
    body: `${requirement} Your notes still open, edit and save as usual; search, backlinks and related notes stay off until VispNote runs on a supported system.`,
  };
}

module.exports = { describeSearchIndexFailure };
