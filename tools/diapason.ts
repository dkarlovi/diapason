import { runCli } from "./diapason/commands.ts";
process.exitCode = await runCli(process.argv.slice(2));
