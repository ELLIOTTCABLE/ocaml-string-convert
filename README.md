ocaml-string-convert
====================

This is a library to shim BuckleScript's string-handling when using native-OCaml string-manipulation libraries.

Background
----------

When using [BuckleScript][] to compile [OCaml][] source-code to JavaScript, no attempt is made to handle the runtime conversion of `string` values between the two semantic systems.

In particular, a `String` value in JavaScript is ([basically][mathiasbynens]) a UCS-2 *character array*. The closest you can get to "give me the thingie X thingies into the length of the string" is [`String::charCodeAt`][charCodeAt]; specifically, this function returns `N`th [UTF-16 *code unit*][code-unit] into the string.

Meanwhile, over in OCaml land, the type `string` (and the functions in the module [String][ocaml-string]) is, semantically, a dumb *byte array*. That is, when you ask the OCaml compiler for `a_string.[0]`, you don't get the first character of the string, or even a Unicode-aware codepoint or grapheme; instead, you get the first *byte* of (what OCaml believes to be) a series of opaque bytes.

Unfortunately, BuckleScript compiles the latter syntax (`a_string.[0]`) into the former semantic (`a_string.charCodeAt(0)`); this only makes sense within the very limited range of the ASCII-compatible bytes; that is, between 0-127.

Let's experiment with the following small program. It'll take an input string on the command-line, extract the first ... character? byte? and then tell us about it.

```ocaml
(* str_test.ml *)
let first_char_info s =
   let c = s.[0] in
   "Code: " ^ string_of_int (Char.code c) |> print_endline;
   "String: " ^ String.make 1 c |> print_endline

(* Change the "1" to a "2" to execute this with Node.js. Annoyingly. *)
let () = first_char_info Sys.argv.(1)
```

The above works, both when compiled via the traditional OCaml toolchain, and when compiled to JavaScript and executed with Node.js ... but *only* when the entire string is within the ASCII range:

```text
$ bsc str_test.ml
$ node str_test.js hello
Code: 104
String: h

$ ocaml str_test.ml hello
Code: 104
String: h
```

Let's try the same thing with an non-ASCII, international string:

```text
$ node str_test.js جمل
Code: 1580
String: ج

$ ocaml str_test.ml جمل
Code: 216
String: ?
```

Ruh-roh. The problem here comes from this series of exchanges:

1. The value `s` in the above program comes in as a UTF-8 encoded string; that's what the shell is passing along to the program in [`Sys.argv`][Sys.argv].

2. Node.js understands and expects this; and converts the incoming value into its internal format, UCS-2; this means that `s.charCodeAt(0)` is going to be the first UCS code-point of that input string *as encoded in UCS-2*. That is to say, `"ج"`, integer value 1580.

3. An OCaml program, unaware that it's being compiled via BuckleScript, expects `string` values arising from UTF-8 input (like `s`) to be addressed *bytewise*; that is, they'd expect `s.[0]` to yield "\xD8" (216) and `s.[1]` to yield "\xAC" (172), the two bytes of the *UTF-8 encoding* of the codepoint ‘ج’.

tl;dr OCaml libraries expecting to operate UTF-8 byte-arrays (like [Sedlex][], [Menhir][], [Camomile][], any of [Daniel Bünzli's Unicode-handling libraries][dbunzli]) are going to break when compiled to JavaScript via BuckleScript and fed actual UTF-8 input.

[BuckleScript]: <https://bucklescript.github.io/>
[OCaml]: <https://ocaml.org/>
[mathiasbynens]: <https://mathiasbynens.be/notes/javascript-encoding>
[charCodeAt]: <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/charCodeAt>
[code-unit]: <https://www.unicode.org/faq/utf_bom.html#utf16-1>
[ocaml-string]: <https://caml.inria.fr/pub/docs/manual-ocaml/libref/String.html>
[Sys.argv]: <https://caml.inria.fr/pub/docs/manual-ocaml/libref/Sys.html#VALargv>
[Sedlex]: <https://github.com/ocaml-community/sedlex>
[Menhir]: <http://gallium.inria.fr/~fpottier/menhir/>
[Camomile]: <https://github.com/yoriyuki/Camomile/>
[dbunzli]: <https://erratique.ch/software>

Solution
--------

This library provides a shim for this behaviour. Unicode input to a JavaScript program can be fed through the functions provided by this library, which uses the [TextEncoder][] and [TextDecoder][] APIs (or the [fast-text-encoding][] npm module as a shim therefor) to transform the UCS-2 strings being passed around by JavaScript systems, into `TypedArray`s of UTF-8 bytes. These UTF-8 values will then be copied back into (now *malformed*, but predictably-malformed) JavaScript `String`s; these can be passed with impunity to UTF-8 handling OCaml functions, which will now function as expected.

**Note:** This package is not necessary for code written specifically for BuckleScript; just be aware of the BuckleScript-specific semantics of the `.[]` string-indexing operator. This package is only necessary if you're A. writing a library that's intended to be used *both* by native projects and JavaScript projects, or B. if you're using a native-targeting library from [opam][] and compiling it to JavaScript.

[TextEncoder]: <https://developer.mozilla.org/en-US/docs/Web/API/TextEncoder>
[TextDecoder]: <https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder>
[fast-text-encoding]: <https://github.com/samthor/fast-text-encoding>
[opam]: <https://opam.ocaml.org/>

Usage
-----

Install `ocaml-string-convert` with npm:

```sh
npm install --save ocaml-string-convert
```

Include it on the JavaScript side of your project:

```js
import {
   toFakeUTF8String,
   fromFakeUTF8String
} from 'ocaml-string-convert'
```

### `toFakeUTF8String(str)`

This function is intended to be called on JavaScript strings (possibly containing Unicode characters outside the ASCII range) that need to be passed to OCaml functions; it ‘double-encodes’ those strings such that they will be perceived by BuckleScript-compiled OCaml as UTF-8-encoded `char`-arrays.

#### Input

This function takes one argument, a ‘standard’ JavaScript `String`; that is, one with Unicode characters outside the ASCII range (but still within the BMP!) encoded as single, 16-bit code-units; and [higher-plane characters][] encoded as UTF-16-style [surrogate pairs][].

- Example, as a UCS-2 sequence of 16-bit code-units:

  ```js
  [102, 111, 111, 183, 98, 97, 114]
  ```

- Example, as typed into a UTF-8 JavaScript source-file:

  ```js
  "foo·bar"
  ```

#### Output

An abomination. This produces a JavaScript `String` (that is still technically encoded as UCS-2,
mind you!) *containing a series of UTF-8 bytes, as interpreted as UCS-2 codepoints*.

- Example, as a UCS-2 sequence of 16-bit code-units:

  ```js
  [102, 111, 111, 194, 183, 98, 97, 114]
  ```

- Example, as typed into a UTF-8 JavaScript source-file:

  ```js
  "foo\xC2\xB7bar" // or "fooÂ·bar", if you're a heathen
  ```

See that, in this example, the non-ASCII character U+00B7 “MIDDLE DOT”, which is one code-unit (literally `\u00B7`) in the original input-string, is encoded as *two* JavaScript / UCS-2 code-units, `\xC2\xB7` — C2-B7 being the UTF-8 encoding of U+00B7.

[higher-plane characters]: <https://en.wikipedia.org/wiki/Plane_(Unicode)>
[surrogate pairs]: <https://unicodebook.readthedocs.io/unicode_encodings.html#utf-16-surrogate-pairs>

### `fromFakeUTF8String(str)`

The inverse operation to the above.

Given a double-encoded (effectively, mis-encoded) BuckleScript ‘string’ that's been manipulated as if it's a UTF-8 `char`-array, this function will decode (effectively, re-encode) that value into a functional, correct JavaScript (i.e. UCS-2) string.

Takes a `String`, containing a series of UTF-8 bytes encoded as Unicode codepoints (in JavaScript's standard UCS-2, that is); returns a standard JavaScript `String` with those Unicode scalars properly represented in UCS-2 code units, ready for standard JavaScript manipulation.
