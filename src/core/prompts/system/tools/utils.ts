// Import toPosix to ensure it's available
import "@utils/path"

// Helper function to convert path to posix format using the String prototype extension
export function toPosixPath(p: string): string {
	return p.toPosix()
}
