import { describe, expect, it } from "vitest";
import { VbaInterpreter } from "./interpreter";

describe("VbaInterpreter", () => {
  it("runs a Sub with declarations, a For loop, and Debug.Print", () => {
    const result = new VbaInterpreter().run(`
Sub Main()
  Dim total As Integer
  total = 0
  For i = 1 To 3
    total = total + i
  Next i
  Debug.Print total
End Sub
`);
    expect(result.output).toEqual(["6"]);
    expect(result.variables.TOTAL).toBe(6);
  });

  it("supports If/Else and string built-ins", () => {
    const result = new VbaInterpreter().run(`
Dim message
message = UCase("hello")
If Len(message) > 3 Then
  Print message
Else
  Print "short"
End If
`);
    expect(result.output).toEqual(["HELLO"]);
  });

  it("stops a non-terminating loop at the execution limit", () => {
    expect(() => new VbaInterpreter(100).run("Dim x\nWhile True\n x = 1\nWend")).toThrow(/step limit/);
  });

  it("rejects unknown functions", () => {
    expect(() => new VbaInterpreter().run('Print Shell("anything")')).toThrow(/Unsupported function/);
  });
});
