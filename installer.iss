; =============================================================================
; Inno Setup Script — AI Pharmacy Desktop Installer (Electron edition)
; =============================================================================
; This script builds a ZERO-DEPENDENCY Windows installer.
; Everything needed to run the app (Electron runtime, Node.js, React frontend,
; SQLite database, all native modules) is bundled inside the installer.
;
; Prerequisites to BUILD this installer (only needed by the developer):
;   1. Inno Setup 6+ — https://jrsoftware.org/isinfo.php
;   2. Run:  npm run electron:win        (builds dist-release\AI Pharmacy Setup *.exe)
;      OR compile this .iss directly after placing the Electron win-unpacked
;      directory contents under win-unpacked\ next to this file.
;
; End-user experience: download one .exe → double-click → app is installed.
; No Node.js, no npm, no Python, no Redis, nothing else required.
; =============================================================================

#define AppName      "AI Pharmacy"
#define AppVersion   "0.1.0"
#define AppPublisher "AI Pharmacy Team"
#define AppExeName   "AI Pharmacy.exe"
#define AppId        "{{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}"

[Setup]
AppId={#AppId}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL=https://github.com/loki94in/ai-pharmacy
AppSupportURL=https://github.com/loki94in/ai-pharmacy/issues
AppUpdatesURL=https://github.com/loki94in/ai-pharmacy/releases

; Install per-user by default (no UAC elevation needed for data dir)
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog

; Output
OutputDir=dist-release
OutputBaseFilename=AI-Pharmacy-Setup-{#AppVersion}-win-x64
Compression=lzma2/max
SolidCompression=yes
DiskSpanning=no

; Appearance
WizardStyle=modern
WizardSizePercent=110

; Uninstaller
UninstallDisplayName={#AppName}
UninstallDisplayIcon={app}\{#AppExeName}
CreateUninstallRegKey=yes

; Minimum Windows version: Windows 10 (Electron 42 requirement)
MinVersion=10.0.17763

; Architecture — x64 only (Electron ships x64 binary)
ArchitecturesInstallIn64BitMode=x64compatible
ArchitecturesAllowed=x64compatible

; No license file required (remove comment to add one)
; LicenseFile=license.txt

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon";  Description: "Create a &desktop shortcut";  GroupDescription: "Shortcuts:"; Flags: checked
Name: "startmenu";    Description: "Create a &Start Menu shortcut"; GroupDescription: "Shortcuts:"; Flags: checked

; ===========================================================================
; [Files] — Source paths are the Electron win-unpacked build output.
;
; To produce win-unpacked/, run on Windows (or cross-compile):
;   npm run electron:win
; This creates: dist-release\win-unpacked\  (the full Electron app directory)
;
; Everything inside win-unpacked\ is the self-contained bundle:
;   AI Pharmacy.exe          ← Electron shell (replaces old PharmacyOS.exe)
;   resources\app\           ← all app code, frontend, node_modules
;   *.dll, *.pak, etc.       ← Chromium + V8 runtime files
; ===========================================================================

[Files]
; ── Electron runtime + all bundled app code (from npm run electron:win) ──────
Source: "dist-release\win-unpacked\*";    DestDir: "{app}";          Flags: ignoreversion recursesubdirs createallsubdirs

; ── Seed data (shipped SQLite schema / initial data) ─────────────────────────
; Copied to AppData on first launch by electron/main.cjs — not stored in {app}.
; We include data\ here only as reference; the main.cjs seeds from resources\app\data.

; ── Optional: README ─────────────────────────────────────────────────────────
Source: "README.md"; DestDir: "{app}"; Flags: ignoreversion isreadme; Check: FileExists(SourcePath + 'README.md')

[Icons]
; Start Menu
Name: "{group}\{#AppName}";                   Filename: "{app}\{#AppExeName}"; Tasks: startmenu
Name: "{group}\Uninstall {#AppName}";         Filename: "{uninstallexe}";       Tasks: startmenu

; Desktop
Name: "{autodesktop}\{#AppName}";             Filename: "{app}\{#AppExeName}"; Tasks: desktopicon

[Run]
; Launch the app after installation (optional, user can skip)
Filename: "{app}\{#AppExeName}";
  Description: "Launch {#AppName} now";
  Flags: nowait postinstall skipifsilent unchecked

[UninstallDelete]
; Remove user data directory on uninstall (optional — comment out to keep data)
; Type: filesandordirs; Name: "{localappdata}\ai-pharmacy"

; ===========================================================================
; [Code] — Pascal script for first-run setup and upgrade handling
; ===========================================================================
[Code]

// Check for a running instance before installing
function InitializeSetup(): Boolean;
var
  ResultCode: Integer;
begin
  Result := True;
  // Attempt to terminate any running instance gracefully
  Exec('taskkill.exe', '/F /IM "AI Pharmacy.exe" /T', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

// Ensure the user data directories exist on first run
// (electron/main.cjs does this at runtime, but belt-and-suspenders here)
procedure CreateUserDataDirs();
var
  DataDir: String;
begin
  DataDir := ExpandConstant('{localappdata}\ai-pharmacy');
  if not DirExists(DataDir) then
    CreateDir(DataDir);
  if not DirExists(DataDir + '\uploads') then
    CreateDir(DataDir + '\uploads');
  if not DirExists(DataDir + '\backup') then
    CreateDir(DataDir + '\backup');
  if not DirExists(DataDir + '\data') then
    CreateDir(DataDir + '\data');
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
    CreateUserDataDirs();
end;
