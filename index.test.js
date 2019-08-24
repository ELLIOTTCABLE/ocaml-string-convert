let { toFakeUTF8String, fromBSUTF8String, fromFakeUTF8String } = require(".")

it("encodes without throwing", () => {
   expect(() => toFakeUTF8String("Hello, world!")).not.toThrow()
})

it("round-trips a Unicode string", () => {
   const source = "foo·bar"
   const fake_string = toFakeUTF8String(source)
   const result = fromFakeUTF8String(fake_string)
   expect(result).toEqual(source)
})

it("maintains string threequality", () => {
   const source1 = "foo·bar"
   const source2 = "foo·bar"
   const fake_string1 = toFakeUTF8String(source1)
   const fake_string2 = toFakeUTF8String(source2)
   expect(fake_string1 === fake_string2).toBe(true)
})

it("fixes a UTF-8-encoded string returned by BuckleScript", () => {
   const broken = "fooÂ·bar"
   const result = fromFakeUTF8String(broken)
   expect(result).toEqual("foo·bar")
})

it("fixes a more-extremely mis-encoded BuckleScript string", () => {
   const broken = "\xd8\xac\xd9\x85\xd9\x84"
   const result = fromFakeUTF8String(broken)
   expect(result).toEqual("جمل")
})
