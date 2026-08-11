# Rebuild the client-facing .docx guides from their markdown sources.
#
#   powershell -File scripts/build-client-docx.ps1
#
# Two steps, because there is no pandoc on this machine:
#   1. markdown -> styled HTML via `marked`  (scripts/md-to-html.mjs)
#   2. HTML -> .docx by having Word open and re-save it   (this file)
#
# Step 2 needs Word installed. Step 1 needs Node; if Node is missing, render the
# HTML in a container instead and then run this script with -SkipHtml:
#
#   docker run --rm -v "//c/path/to/repo:/app" -w /app node:22-alpine sh -c `
#     "mkdir -p /tmp/m && cd /tmp/m && npm i marked@15 && cd /app && `
#      node /app/scripts/md-to-html.mjs docs/X.md docs/_x.html 'Title'"

param([switch]$SkipHtml)

$ErrorActionPreference = "Stop"
$repo = Split-Path $PSScriptRoot -Parent
$docs = Join-Path $repo "docs"

$guides = @(
  @{ md = "CLIENT_TESTING_NEW_CHANGES_HINGLISH"; title = "Naye Changes - Testing Guide" },
  @{ md = "CLIENT_TESTING_HINGLISH";             title = "Vehicle Finance - Client Testing Guide" }
)

if (-not $SkipHtml) {
  foreach ($g in $guides) {
    $md   = Join-Path $docs "$($g.md).md"
    $html = Join-Path $docs "_$($g.md).html"
    & node (Join-Path $PSScriptRoot "md-to-html.mjs") $md $html $g.title
    if ($LASTEXITCODE -ne 0) { throw "markdown -> html failed for $($g.md)" }
  }
}

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  foreach ($g in $guides) {
    $html = Join-Path $docs "_$($g.md).html"
    $docx = Join-Path $docs "$($g.md).docx"
    if (-not (Test-Path $html)) { throw "missing $html - run without -SkipHtml" }
    if (Test-Path $docx) { Remove-Item $docx -Force }

    $doc = $word.Documents.Open($html, [ref]$false, [ref]$false)
    $doc.SaveAs([ref]$docx, [ref]16)      # 16 = wdFormatDocumentDefault (.docx)
    $doc.Close([ref]0)
    Write-Output "built $($g.md).docx"

    Remove-Item $html -Force
  }
} finally {
  $word.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}
