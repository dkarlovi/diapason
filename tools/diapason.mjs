import { runCli } from "./diapason/commands.mjs";
process.exitCode = await runCli(process.argv.slice(2));
