import os from "os"
import osName from "os-name"
import { getShell } from "@utils/shell"
import "@utils/path" // Import to ensure toPosix is available

export function getSystemInfoSection(cwd: string): string {
	return `====

SYSTEM INFORMATION

Operating System: ${osName()}
Default Shell: ${getShell()}
Home Directory: ${os.homedir().toPosix()}
Current Working Directory: ${cwd.toPosix()}`
}
