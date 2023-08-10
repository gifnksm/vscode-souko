import * as path from "path";
import Mocha from "mocha";
import { glob } from "glob";

export function run(): Promise<void> {
  // Create the mocha test
  const mocha = new Mocha({
    ui: "tdd",
    color: true,
  });

  const testsRoot = path.resolve(__dirname, "..");

  return new Promise((c, e) => {
    const testFiles = new glob.Glob("**/**.test.js", { cwd: testsRoot });
    const testFilesStream = testFiles.stream();

    testFilesStream.on("data", (file) => {
      mocha.addFile(path.resolve(testsRoot, file));
    });
    testFilesStream.on("error", (err) => {
      e(err);
    });
    testFilesStream.on("end", () => {
      try {
        mocha.run((failures) => {
          if (failures > 0) {
            e(new Error(`${failures} tests failed.`));
          } else {
            c();
          }
        });
      } catch (err) {
        console.error(err);
        e(err);
      }
    });
  });
}
