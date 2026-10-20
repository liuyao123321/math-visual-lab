Option Explicit
Dim launcherShell, launcherFs, scriptDir, nodePath, command
Set launcherShell = CreateObject("WScript.Shell")
Set launcherFs = CreateObject("Scripting.FileSystemObject")
scriptDir = launcherFs.GetParentFolderName(WScript.ScriptFullName)
nodePath = "node.exe"
If WScript.Arguments.Count > 0 Then nodePath = WScript.Arguments(0)
command = Chr(34) & nodePath & Chr(34) & " " & Chr(34) & launcherFs.BuildPath(scriptDir, "start-local.mjs") & Chr(34)
If WScript.Arguments.Count > 1 Then command = command & " " & WScript.Arguments(1)
On Error Resume Next
launcherShell.Run command, 0, False
If Err.Number <> 0 Then
  launcherShell.Popup "Could not start Math Visual Lab. Check that Node.js is installed and the project has not moved.", 0, "Math Visual Lab", 16
  WScript.Quit 1
End If
