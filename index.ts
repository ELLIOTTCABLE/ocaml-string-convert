import assert from "assert"

type Nominal<Ty, Discriminant> = Ty & { __discriminant: Discriminant }

type ucs_2_string = Nominal<string, "UCS-2">
type fake_utf_8_string = Nominal<Uint8Array, "UTF-8"> & {
   charCodeAt(idx: number): number
}

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

function charCodeAt(this: fake_utf_8_string, n: number) {
   return this[n]
}

// This function is intended to be called on JavaScript strings, possibly containing higher-plane
// Unicode codepoints, that need to be passed to OCaml functions. It takes a `String`, and returns
// a `Uint8Array` shimmed with `String`-like accessors.
//
// Forgive me. — ELLIOTTCABLE
export function toFakeUTF8String(js_string: string): fake_utf_8_string {
   const byte_arr: fake_utf_8_string = new textEncoder("utf-8").encode(
      js_string as ucs_2_string,
   )

   byte_arr.charCodeAt = charCodeAt

   return byte_arr
}

// BuckleScript, at least as of `4.0.6`, uses JavaScript primitive `String`s as, basically, uint
// char-arrays. At the boundaries of BuckleScript-compiled code, we need to massage those back into
// valid JavaScript UCS-2 strings.
//
// This function is the other half of the above: it takes the broken `String` (not a `Uint8Array`,
// mind you!) returned by a UTF-8-manipulating OCaml function (this is going to be a UCS-2
// monstrosity of UTF-8-bytes-when-interpreted-as-UCS-2-code-units; when printed, they usually look
// something like `"Ø¬Ù Ù "`), re-interprets it as the UTF-8 that the OCaml program intended to
// produce, and encodes it *properly* into a JavaScript UCS-2 string.
//
//---
// FIXME: This ends up iterating over the string *twice*. Not great; but I also don't have access
// to the internals of the UTF-8 decoder if it's built into the JavaScript engine, sooooo ... and
// this is becoming a mantra now ... forgive me. /=
export function fromBSUTF8String(broken_string: string): string {
   const result = new Uint8Array(broken_string.length)
   for (var i = 0; i < broken_string.length; i++) {
      result[i] = broken_string.charCodeAt(i)
   }
   return fromFakeUTF8String(result as fake_utf_8_string)
}

// Finally, although you are unlikely to need it, this is offered for completeness: it produces the
// exact inverse of the transformation involved in `toFakeUTF8String()`; that is, given a
// well-formed `Uint8Array` of UTF-8 bytes, this produces a simple JavaScript `String`. This
// *should not* be called on values returned from UTF-8-manipulating OCaml functions; that's what
// `fromBuckleScriptUTF8String()` is for! This is simply a wrapper around the `TextDecoder` API.
export function fromFakeUTF8String(fake_string: fake_utf_8_string): string {
   return new textDecoder("utf-8").decode(fake_string)
}
