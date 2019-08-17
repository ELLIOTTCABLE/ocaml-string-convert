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

This library provides a shim for this behaviour. Unicode input to a JavaScript program can be fed through the functions provided by this library, which uses the [TextEncoder][] and [TextDecoder][] APIs (or the [fast-text-encoding][] npm module as a shim therefor) to transform the UCS-2 strings being passed around by JavaScript systems, into `TypedArray`s of UTF-8 bytes. These UTF-8 values are then shimmed with the JavaScript functions called by the BuckleScript runtime (such as `.charCodeAt()`), such that they *behave* as UTF-8 strings. They can be passed with impunity to UTF-8 handling OCaml functions, which will now function as expected.

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
   fromBSUTF8String,
   fromFakeUTF8String
} from 'ocaml-string-convert'
```

### `toFakeUTF8String(str)`

This function is intended to be called on JavaScript strings, possibly containing higher-plane Unicode codepoints, that need to be passed to OCaml functions. It takes a `String`, and returns a `Uint8Array` shimmed with `String`-like accessors.

### `fromBSUTF8String(str)`

This function is the other half of the above: it takes the broken `String` (not a `Uint8Array`, mind you!) returned by a UTF-8-manipulating OCaml function (this is going to be a UCS-2 monstrosity of UTF-8-bytes-when-interpreted-as-UCS-2-code-units; when printed, they usually look something like `"Ø¬Ù Ù "`), re-interprets it as the UTF-8 that the OCaml program intended to produce, and encodes it *properly* into a JavaScript UCS-2 string.

### `fromFakeUTF8String(str)`

Finally, although you are unlikely to need it, this is offered for completeness: it produces the exact inverse of the transformation involved in `toFakeUTF8String()`; that is, given a well-formed `Uint8Array` of UTF-8 bytes, this produces a simple JavaScript `String`. This *should not* be called on values returned from UTF-8-manipulating OCaml functions; that's what `fromBuckleScriptUTF8String()` is for! This is simply a wrapper around the `TextDecoder` API.
