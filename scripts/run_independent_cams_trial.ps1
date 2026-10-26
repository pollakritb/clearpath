# Runs only the isolated four-station test collector. No Supabase credentials
# are passed to the process or written to this local gitignored log.
$trialRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$trialOutput = Join-Path $trialRoot '.forecast-validation\independent-four-station'
$trialPython = Join-Path $trialRoot '.venv\Scripts\python.exe'
$trialLog = Join-Path $trialOutput 'collector-run.log'

New-Item -ItemType Directory -Path $trialOutput -Force | Out-Null
Set-Location -LiteralPath $trialRoot
"$(Get-Date -Format o) collector started" | Out-File -FilePath $trialLog -Append -Encoding utf8
& $trialPython -m scripts.collect_independent_cams_trial 2>&1 | Out-File -FilePath $trialLog -Append -Encoding utf8
$trialExitCode = $LASTEXITCODE
if ($trialExitCode -eq 0) {
    & $trialPython -m scripts.summarize_independent_cams_trial 2>&1 | Out-File -FilePath $trialLog -Append -Encoding utf8
    $trialExitCode = $LASTEXITCODE
}
"$(Get-Date -Format o) collector exited: $trialExitCode" | Out-File -FilePath $trialLog -Append -Encoding utf8
exit $trialExitCode
