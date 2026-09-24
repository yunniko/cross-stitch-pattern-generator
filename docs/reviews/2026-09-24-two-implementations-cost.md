# Two implementations of one pipeline: what it costs, and the ways out

Date: 2026-09-24 · G-067 M1 · **For the Owner to decide. Nothing here is settled.**

The gate asked for in A1 now exists: CI builds the Rust sidecar, runs its tests, runs `compare:rust`, and runs the
whole e2e suite against the binary production uses. That closes the hole. It does not answer the question underneath
it, which is whether carrying two implementations at bit-exactness is still worth what it costs.

## What it buys

Measured today across the 102 parity cases: **median 3.1× faster**, range 2.0× to 22.9×. On the server, where
G-149's note puts a core at roughly a third of this machine's, that is the difference between a 1500-stitch
generation being tolerable and being abandoned. The case for the port was real and still is.

## What it costs

- **Every pipeline change is written twice**, in two languages, and must come out byte-identical. G-061 and G-062
  (Vivid, hue reservation) took five Rust files to mirror one TypeScript feature.
- **Bit-exactness, not equivalence.** Keeping float results identical required porting V8's own maths —
  `rust/cs-core/src/jsmath.rs` and `fdlibm.rs`, checked against 13.6M recorded vectors. That is a second, quieter
  implementation underneath the first.
- **The Rust side has almost no tests of its own**: 3 tests across 8,991 lines. Its correctness rests entirely on
  the TypeScript beside it and the parity harness between them. The TypeScript is not really a fallback; it is the
  specification.
- **CI is now ~2× the work**: the `rust` job took 6m33s against `check`'s 4m01s, in parallel, on a warm cache.

## The three ways out

1. **Keep both, as now.** The fallback stays a real fallback (`CS_JOB=0` still works), and the tax continues at
   roughly one extra language per pipeline feature. Honest, and the most expensive.
2. **Demote TypeScript to a reference.** It stops shipping — production has no fallback — and lives only to be the
   thing Rust is compared against in CI. Removes the "which one ran?" question entirely, and the `CS_JOB=0` escape
   hatch with it. Cheapest to reason about, riskiest the day the sidecar has a bad build.
3. **Relax byte-identity to a tolerance.** Parity becomes "within *n* stitches" rather than "the same hash". Kills
   the jsmath port and most of the mirroring pain — and kills D107's golden hashes, which are what currently makes a
   pipeline regression impossible to miss. Cheapest per feature, and the option that gives up the most.

## What I would do, and why it is still yours

**Option 1 until the tax is actually felt, then option 2.** The gate now makes option 1 safe, which it was not
yesterday — drift is caught on every push instead of never. The reason not to jump to 2 today is that nothing has
gone wrong with the sidecar in production, so removing the fallback would be trading a real safety net for a
maintenance saving nobody has asked for yet.

What would change my mind: a pipeline goal where mirroring into Rust takes longer than writing the feature did. That
is the signal that the port has stopped being a performance decision and become a tax, and the moment to pick 2.

I am not deciding this. It changes what ships to users and what happens on a bad build, which is Owner territory.
