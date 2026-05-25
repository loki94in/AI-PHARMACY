# AI Pharmacy Utility MCPB

A general-purpose utility MCP (Model Context Protocol) server bundled as an MCPB for use with Claude Desktop. Provides local filesystem access, process information, and system utilities.

## Features

- **Filesystem Operations**: List directories, read files, get file information
- **System Information**: Get platform, hardware, memory, and uptime details
- **Process Information**: List running processes (Windows, Linux, macOS)
- **Secure Access**: Path containment checks to prevent escaping the configured root directory
- **Cross-platform**: Built for Windows, Linux, and macOS

## Tools

### Filesystem Tools
- `list_directory` - List contents of a directory within the configured root
- `read_file` - Read contents of a file within the configured root  
- `get_file_info` - Get metadata information for a file or directory

### System Tools
- `get_system_info` - Get system information and statistics
- `current_directory` - Get current working directory and configured root

### Process Tools
- `list_processes` - List running processes (Windows tasklist equivalent)

## Installation

1. Install Node.js dependencies:
   ```bash
   npm install
   ```

2. Build the MCPB bundle:
   ```bash
   npx @anthropic-ai/mcpb pack
   ```

3. Install in Claude Desktop:
   - Drag the generated `ai-pharmacy-utility.mcpb` file onto Claude Desktop
   - Or use the MCPB installer in Claude Desktop settings

## Configuration

When installing, you'll be prompted to set:
- **Root Directory**: The root directory for filesystem operations (defaults to your home directory)

## Security

This MCPB implements security best practices:
- Path containment checks to prevent directory traversal attacks
- Read-only hints for appropriate tools
- Input validation using Zod schemas
- No shell command execution - uses array arguments only

## Development

To modify and rebuild:
```bash
# Make changes to source files
npm install  # if dependencies changed
npx @anthropic-ai/mcpb pack  # rebuild the MCPB
```

## Testing

You can test the server directly:
```bash
node server/index.js
```
Then connect to it using an MCP inspector or similar tool.