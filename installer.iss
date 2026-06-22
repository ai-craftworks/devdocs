; installer.iss
; Inno Setup script for building a Windows installer for DevDocs.
;
; Requires Inno Setup 6: https://jrsoftware.org/isdl.php
;
; Build steps:
;   1. pyinstaller devdocs.spec       (produces dist/DevDocs/)
;   2. Open this file in Inno Setup Compiler (or run via command line:
;      "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer.iss)
;   3. Output installer appears in dist_installer/DevDocs-Setup.exe

#define MyAppName "DevDocs"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "DevDocs"
#define MyAppExeName "DevDocs.exe"

[Setup]
AppId={{8F3E2C1A-9B4D-4E7F-A1C2-5D6E7F8A9B0C}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
OutputDir=dist_installer
OutputBaseFilename=DevDocs-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
PrivilegesRequired=lowest
; lowest privileges = no admin required, installs to user's AppData by default
; change DefaultDirName above to {userpf}\{#MyAppName} if you want a per-user install
; without admin rights at all

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional shortcuts:"

[Files]
Source: "dist\DevDocs\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; Only remove app files, NEVER touch the data folder if it's outside {app}.
; Since data/ lives inside {app}/data by default, warn the user before
; uninstalling if they have a database with content. Inno can't easily check
; file size here, so we just leave a note in the wizard text below.

[Messages]
ConfirmUninstall=Are you sure you want to completely remove {#MyAppName}?%n%nNote: this will also delete the 'data' folder inside the install directory, including your DevDocs database. Back up the 'data' folder first if you want to keep your projects.
