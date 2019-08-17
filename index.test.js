let { toFakeUTF8String, fromBSUTF8String, fromFakeUTF8String } = require("./index.js")

it("encodes without throwing", () => {
   expect(() => toFakeUTF8String("Hello, world!")).not.toThrow()
})

it("round-trips a Unicode string", () => {
   const source = "foo·bar"
   const fake_string = toFakeUTF8String(source)
   const result = fromFakeUTF8String(fake_string)
   expect(result).toEqual(source)
})

it("fixes a slightly mis-encoded BuckleScript string", () => {
   const broken = "fooÂ·bar"
   const result = fromBSUTF8String(broken)
   expect(result).toEqual("foo·bar")
})

it("fixes another badly mis-encoded BuckleScript string", () => {
   const broken = "\xd8\xac\xd9\x85\xd9\x84"
   const result = fromBSUTF8String(broken)
   expect(result).toEqual("جمل")
})
