import assert from "assert"

type Nominal<Ty, Discriminant> = Ty & { __discriminant: Discriminant }

type string_as_utf_8_buffer = Nominal<string, "encoding: UTF-8">

// `fast-text-encoding` pollutes the global namespace. The following is an attempt to circumvent that.
let textEncoder = undefined,
   textDecoder = undefined

if (typeof TextEncoder !== "undefined" || typeof TextDecoder !== "undefined") {
   textEncoder = TextEncoder
   textDecoder = TextDecoder
} else {
   // This is a horrible hack, but I don't know a better way to avoid polluting the global
   // namespace.
   const ctx = (1, eval)("this")

   require("fast-text-encoding")
   textEncoder = TextEncoder
   textDecoder = TextDecoder

   delete ctx.TextEncoder
   delete ctx.TextDecoder

   // FIXME: add an unassert build-step
   assert(typeof TextEncoder === "undefined")
   assert(typeof TextDecoder === "undefined")
}

assert(typeof textEncoder !== "undefined")
assert(typeof textDecoder !== "undefined")

// This function is intended to be called on JavaScript strings (possibly containing Unicode
// characters outside the ASCII range) that need to be passed to OCaml functions; it
// ‘double-encodes’ those strings such that they will be perceived by BuckleScript-compiled OCaml
// as UTF-8-encoded `char`-arrays.
//
// #### Rationale
//
// Required reading: Mathias Bynens' [JavaScript has a Unicode problem](https://mathiasbynens.be/notes/javascript-unicode) and then [JavaScript's internal character encoding](https://mathiasbynens.be/notes/javascript-encoding).
//
// BuckleScript, at least as of `4.0.6`, treats JavaScript primitive `String`s as, basically, uint
// `char`-arrays. At the boundaries of BuckleScript-compiled code, especially when the OCaml code
// treats `char`-arrays as UTF-8, we need to massage those back into valid JavaScript UCS-2
// strings. This function, paired with `fromFakeUTF8String`, handle these transformations.
//
// (See the README for more information.)
//
// #### Input
//
// This function takes one argument, a ‘standard’ JavaScript `String`; that is, one with Unicode
// characters outside the ASCII range (but still within the BMP!) encoded as single, 16-bit
// code-units; and [higher-plane characters][] encoded as UTF-16-style [surrogate pairs][].
//
// - Example, as a UCS-2 sequence of 16-bit code-units:
//
//   ```js
//   [102, 111, 111, 183, 98, 97, 114]
//   ```
//
// - Example, as typed into a UTF-8 JavaScript source-file:
//
//   ```js
//   "foo·bar"
//   ```
//
// #### Output
//
// An abomination. This produces a JavaScript `String` (that is still technically encoded as UCS-2,
// mind you!) *containing a series of UTF-8 bytes, as interpreted as UCS-2 codepoints*.
//
// - Example, as a UCS-2 sequence of 16-bit code-units:
//
//   ```js
//   [102, 111, 111, 194, 183, 98, 97, 114]
//   ```
//
// - Example, as typed into a UTF-8 JavaScript source-file:
//
//   ```js
//   "foo\xC2\xB7bar" // or "fooÂ·bar", if you're a heathen
//   ```
//
// See that in this example, the non-ASCII character U+00B7 “MIDDLE DOT”, which is one code-unit
// (literally `\u00B7`) in the original input-string, is encoded as *two* JavaScript / UCS-2
// code-units, `\xC2\xB7` — C2-B7 being the UTF-8 encoding of U+00B7.
//
// Finally, note that I mint a nominal type for the return-value of this function; I prefer to
// attempt to track encoding at the type-level if at all possible. It's trivial, though I'd assert
// a bad idea, to discard this additional information if it's giving you type-errors you don't care
// about:
//
// ```typescript
// let this_has_a_simple_type = toFakeUTF8String(some_input) as string
// ```
//
// [higher-plane characters]: <https://en.wikipedia.org/wiki/Plane_(Unicode)>
// [surrogate pairs]: <https://unicodebook.readthedocs.io/unicode_encodings.html#utf-16-surrogate-pairs>
//
//---
// FIXME: The original implementation of this was fast, but broken. Currently, I've resorted to
//        simply iterating over the *entire string* an extra time on *both* encoding and decoding,
//        which I hate and don't want to do ...
export function toFakeUTF8String(js_string: string): string_as_utf_8_buffer {
   const byte_arr = new textEncoder("utf-8").encode(js_string)

   let result = new String()
   for (var i = 0; i < byte_arr.length; i++) {
      // FIXME: I'm not clear on the performance of string-concatenation in JavaScript; all the
      //        references I find claim that it's not slower than a single join-operation, but that
      //        seems ... impossible? Oh well.
      result = result + String.fromCharCode(byte_arr[i])
   }

   return result as string_as_utf_8_buffer
}

// Given a double-encoded (effectively, mis-encoded) BuckleScript ‘string’ that's been manipulated
// as if it's a UTF-8 `char`-array, this function will decode (effectively, re-encode) that value
// into a functional, correct JavaScript (i.e. UCS-2) string. See {@link toFakeUTF8String} for
// in-depth details.
//
// Takes a `String`, containing a series of UTF-8 bytes encoded as Unicode codepoints (in
// JavaScript's standard UCS-2, that is); returns a standard JavaScript `String` with those Unicode
// scalars properly represented in UCS-2 code units, ready for standard JavaScript manipulation.
//
// Finally, if you're using TypeScript, this expects a value known at compile-time to contain UTF-8
// text; this is tracked in the type-system via the minted `string_as_utf_8_buffer` type. The
// best-practice usage would be to tag every stringish return-value from a BuckleScript module with
// this type:
//
// ```typescript
// import { toFakeUTF8String, fromFakeUTF8String } from 'ocaml-string-convert'
// import $AModule from './aModule.bs'
//
// let $yuck = $AModule.returns_a_string() as string_as_utf_8_buffer
// // ... manipulation ...
// let str = fromFakeUTF8String($yuck)
// ```
//
//---
// FIXME: This ends up iterating over the string *twice*. Not great; but I also don't have access
// to the internals of the UTF-8 decoder if it's built into the JavaScript engine, sooooo ... and
// this is becoming a mantra now ... forgive me. /=
export function fromFakeUTF8String(eldritch_horror: string_as_utf_8_buffer): string {
   const utf8_arr = new Uint8Array(eldritch_horror.length)
   for (var i = 0; i < eldritch_horror.length; i++) {
      utf8_arr[i] = eldritch_horror.charCodeAt(i)
   }

   return new textDecoder("utf-8").decode(utf8_arr)
}
