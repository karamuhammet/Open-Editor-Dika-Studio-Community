# Backup helper — zip the source OUTSIDE the repo + tag git. Run before each phase.
# Usage:  powershell -ExecutionPolicy Bypass -File tools/snapshot.ps1 <label>
param([string]$Label = "snapshot")

$date = Get-Date -Format "yyyyMMdd-HHmmss"
$zip  = "D:\Cursor\cartcraft-$Label-$date.zip"

Compress-Archive -Path 'js','css','core','modules','tools','index.html','scripts','kb','tests','*.md' -DestinationPath $zip -Force
Write-Output "Zip: $zip"

try {
  git tag "snapshot/$Label/$date" 2>$null
  Write-Output "Git tag: snapshot/$Label/$date"
} catch {
  Write-Output "Git tag skipped (not a git repo or git unavailable)"
}
