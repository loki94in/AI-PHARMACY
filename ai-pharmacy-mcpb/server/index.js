const { McpServer } = require("@modelcontextprotocol/sdk");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk");
const { z } = require("zod");
const {
  readFile,
  readdir,
  stat,
  mkdir,
  writeFile,
  unlink,
  rmdir
} = require("fs/promises");
const { execFile } = require("child_process");
const { join, resolve, isAbsolute, relative } = require("path");
const { homedir, platform, arch, release, version, uptime, cpus, totalmem, freemem } = require("os");

// Configuration - ROOT_DIR comes from manifest's server.mcp_config.env
const ROOT_DIR = process.env.ROOT_DIR || join(homedir());

// Utility functions for security
function safeJoin(root, userPath) {
  // Handle empty or root paths
  if (!userPath || userPath === "." || userPath === "") {
    return root;
  }

  // Prevent absolute paths and path traversal
  if (isAbsolute(userPath)) {
    throw new Error("Absolute paths are not allowed");
  }

  const full = resolve(root, userPath);
  const rel = relative(root, full);

  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`Path escapes root: ${userPath}`);
  }

  return full;
}

// Initialize MCP Server
const server = new McpServer({
  name: "ai-pharmacy-utility",
  version: "1.0.0",
});

// Filesystem Tools
server.registerTool(
  "list_directory",
  {
    description: "List contents of a directory within the configured root",
    inputSchema: z.object({
      path: z.string().default(".").describe("Relative path from root directory")
    }),
    annotations: { readOnlyHint: true }
  },
  async ({ path }) => {
    try {
      const fullPath = safeJoin(ROOT_DIR, path);
      const entries = await readdir(fullPath, { withFileTypes: true });

      const list = [];
      for (const entry of entries) {
        const entryPath = join(path, entry.name);
        list.push({
          name: entry.name,
          path: entryPath,
          type: entry.isDirectory() ? "directory" : "file",
          size: entry.isFile() ? (await stat(join(fullPath, entry.name))).size : null,
          modified: entry.isFile() ? (await stat(join(fullPath, entry.name))).mtime : null
        });
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify(list, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

server.registerTool(
  "read_file",
  {
    description: "Read contents of a file within the configured root",
    inputSchema: z.object({
      path: z.string().describe("Relative path from root directory")
    }),
    annotations: { readOnlyHint: true }
  },
  async ({ path }) => {
    try {
      const fullPath = safeJoin(ROOT_DIR, path);
      const content = await readFile(fullPath, "utf8");

      return {
        content: [{
          type: "text",
          text: content
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

server.registerTool(
  "get_file_info",
  {
    description: "Get metadata information for a file or directory",
    inputSchema: z.object({
      path: z.string().describe("Relative path from root directory")
    }),
    annotations: { readOnlyHint: true }
  },
  async ({ path }) => {
    try {
      const fullPath = safeJoin(ROOT_DIR, path);
      const stats = await stat(fullPath);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            name: stats.name,
            path: path,
            type: stats.isDirectory() ? "directory" : "file",
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime,
            accessed: stats.atime,
            permissions: stats.mode.toString(8),
            isReadOnly: !(stats.mode & ParseInt('200', 8))
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// OS-level Tools
server.registerTool(
  "get_system_info",
  {
    description: "Get system information and statistics",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true }
  },
  async () => {
    try {
      const sysInfo = {
        platform: platform(),
        arch: arch(),
        release: release(),
        version: version(),
        hostname: require("os").hostname(),
        uptime: uptime(),
        loadavg: require("os").loadavg(),
        totalmem: totalmem(),
        freemem: freemem(),
        cpus: cpus().map(cpu => ({
          model: cpu.model,
          speed: cpu.speed,
          times: cpu.times
        })),
        userInfo: require("os").userInfo()
      };

      return {
        content: [{
          type: "text",
          text: JSON.stringify(sysInfo, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Process Tools
server.registerTool(
  "list_processes",
  {
    description: "List running processes",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true }
  },
  async () => {
    try {
      const currentPlatform = platform();

      if (currentPlatform === "win32") {
        // On Windows, use tasklist
        const { stdout, stderr } = await execFile("tasklist", ["/FO", "CSV", "/NH"]);
        if (stderr) throw new Error(stderr);

        // Parse CSV output
        const lines = stdout.trim().split('\n');
        const processes = [];

        for (const line of lines) {
          if (!line.trim()) continue;
          // Simple CSV parsing for tasklist output
          const match = line.match(/^"(.+?)",\s*(\d+),[^,]*,[^,]*,\s*([\d,]+ K)/);
          if (match) {
            processes.push({
              name: match[1],
              pid: parseInt(match[2]),
              memory: match[3]
            });
          }
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify(processes.slice(0, 20), null, 2) // Limit to 20 processes
          }]
        };
      } else if (currentPlatform === "linux" || currentPlatform === "darwin") {
        // On Linux/macOS, use ps command
        const { stdout, stderr } = await execFile("ps", ["aux"]);
        if (stderr) throw new Error(stderr);

        // Parse ps output (skip header line)
        const lines = stdout.trim().split('\n').slice(1);
        const processes = [];

        for (const line of lines) {
          if (!line.trim()) continue;
          // Parse ps aux output: USER PID %CPU %MEM VSZ RSS TTY STAT START TIME COMMAND
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 11) {
            // Reconstruct command from remaining parts (index 10 onwards)
            const commandParts = parts.slice(10);
            const command = commandParts.join(' ');

            processes.push({
              user: parts[0],
              pid: parseInt(parts[1]),
              cpu: parseFloat(parts[2]),
              mem: parseFloat(parts[3]),
              vsz: parts[4],
              rss: parts[5],
              tty: parts[6],
              stat: parts[7],
              start: parts[8],
              time: parts[9],
              command: command
            });
          }
        }

        // Sort by memory usage (RSS) descending and limit to 20
        processes.sort((a, b) => {
          // Convert RSS values (like "123456") to numbers for comparison
          const rssA = parseInt(a.rss) || 0;
          const rssB = parseInt(b.rss) || 0;
          return rssB - rssA;
        });

        return {
          content: [{
            type: "text",
            text: JSON.stringify(processes.slice(0, 20), null, 2)
          }]
        };
      } else {
        // Unsupported platform
        return {
          content: [{
            type: "text",
            text: `Process listing is not supported on platform: ${currentPlatform}`
          }]
        };
      }
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Utility Tools
server.registerTool(
  "current_directory",
  {
    description: "Get current working directory and configured root",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true }
  },
  async () => {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          configuredRoot: ROOT_DIR,
          currentWorkingDirectory: process.cwd(),
          platform: platform()
        }, null, 2)
      }]
    };
  }
);

// Start server
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("AI Pharmacy Utility MCP Server running on stdio");
}

runServer().catch(error => {
  console.error("Failed to start MCP server:", error);
  process.exit(1);
});