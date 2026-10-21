# Project-local Next ESLint fork

Exact upstream source: @next/eslint-plugin-next16.3.8, downloaded from its original registry tarball and authenticated against the existing lock SHA512 before extraction. Original56 file hashes are retained in the release preparation receipt. This fork is explicitly versioned16.3.8-cordova-native.1; it is not an official upstream release or upstream security patch.

Only changes: remove fast-glob dependency; replace its single root-directory utility require with the dependency-free Node24 native adapter; add that adapter, this disclosure and the upstream MIT license. All upstream rules, configs, rule severities, parser integration and other utilities remain byte-identical. The adapter supports only the original globSync(pattern,{onlyDirectories:true}) call and fails closed on unsupported options or excessive pattern nesting. It is not a general fast-glob replacement.

The project file dependency and scoped override direct all original Next config consumers to this same local fork. install-links=true makes npm pack file dependencies for reproducible clean installs; no node_modules file patching or audit omission is used. Actual braces/micromatch/fast-glob packages must be absent from the installed graph, and the audit still fails on affected packages. The expired waiver is unchanged and not renewed.

Before release, require full original-rule hash equivalence across TSX/TS/JS/MJS, actual internal-link lint enforcement, root-pattern/default/array tests, strict graph/audit checks, full lint/build/browser gates and hosted CI. Reassess/remove this local fork when a reviewed upstream dependency change permits it. Do not upgrade upstream by reusing this local version or weakening the consumer contract.
